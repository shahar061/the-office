# Mobile Chat Live Context Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface three live context signals on the mobile companion — waiting indicator (italic line under last bubble), activity indicator (footer strip in Chat + tool bubble on Office character), phase transition separators.

**Architecture:** All three flow through the existing `mobile-bridge` relay. Waiting is a new `SessionSnapshot.waiting?` field carried by a new `{ kind: 'waiting' }` patch variant. Activity is a new `CharacterSnapshot.currentTool?` populated by `SnapshotBuilder` from the `AgentEvent.message` field (via desktop's `extractToolTarget`) and rendered with the existing `Character.showToolBubble` on the Pixi canvas plus a new `<ActivityFooter>` DOM component on the Chat tab. Phase tags are stamped on each `ChatMessage.phase` at append time and interleaved with a new `<PhaseSeparator>` component.

**Tech Stack:** TypeScript, React 19, PixiJS 8, Zustand 5, vitest + @testing-library/react + jsdom.

---

## File Changes (preview)

Created:
- `src/mobile-renderer/activityVerb.ts`
- `src/mobile-renderer/ActivityFooter.tsx`
- `src/mobile-renderer/PhaseSeparator.tsx`
- `src/mobile-renderer/__tests__/activityVerb.test.ts`
- `src/mobile-renderer/__tests__/ActivityFooter.test.tsx`

Modified:
- `shared/types/session.ts` (add fields + patch variant)
- `shared/stores/session.store.ts` (handle `waiting` patch)
- `electron/mobile-bridge/snapshot-builder.ts` (preserve tool metadata, stamp phase, setWaiting, applyStatePatch, reset)
- `electron/mobile-bridge/__tests__/snapshot-builder.test.ts` (new assertions)
- `electron/mobile-bridge/event-forwarder.ts` (new `onAgentWaiting`)
- `electron/ipc/state.ts` (emit waiting on start; clear on rejectPendingQuestions)
- `electron/ipc/phase-handlers.ts` (clear waiting at both resolve sites)
- `src/mobile-renderer/ChatView.tsx` (interleave separator, pass isWaiting, mount ActivityFooter)
- `src/mobile-renderer/__tests__/ChatView.test.tsx` (new assertions)
- `src/mobile-renderer/MobileScene.ts` (drive `showToolBubble` from snapshot)
- `src/mobile-renderer/style.css` (footer + separator styles)

---

## Task 1: Extend types

**Files:**
- Modify: `shared/types/session.ts`

Adds `currentTool` to `CharacterSnapshot`, `phase` to `ChatMessage`, `waiting` to `SessionSnapshot`, and a new `{ kind: 'waiting' }` variant to `SessionStatePatch`. All additions are optional / nullable, so existing serialized snapshots deserialize forward-compatibly.

- [ ] **Step 1: Modify `shared/types/session.ts`**

Apply these edits to the file:

Update `ChatMessage`:

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentRole?: AgentRole;
  agentLabel?: string;
  text: string;
  timestamp: number;
  source?: 'mobile' | 'desktop';
  /**
   * Phase at the time this message was appended to the snapshot's chatTail.
   * Stamped by SnapshotBuilder.ingestChat. Used by the mobile renderer to
   * interleave phase-transition separators between consecutive messages
   * whose phase differs. Optional for forward-compatibility with old
   * serialized histories.
   */
  phase?: Phase;
}
```

Update `CharacterSnapshot`:

```ts
export interface CharacterSnapshot {
  agentId: string;
  agentRole: AgentRole;
  activity: CharacterActivity;
  /**
   * The tool this character is currently running, if any. Populated from
   * agent:tool:start events (cleared on tool:done / tool:clear / closed).
   * Drives the mobile Chat-tab ActivityFooter and the Pixi tool bubble
   * over the character sprite.
   */
  currentTool?: { toolName: string; target?: string };
}
```

Update `SessionSnapshot`:

```ts
export interface SessionSnapshot {
  sessionId: string;
  desktopName: string;
  phase: Phase;
  startedAt: number;
  activeAgentId: string | null;
  characters: CharacterSnapshot[];
  chatTail: ChatMessage[];  // capped at 50 messages
  sessionEnded: boolean;
  /**
   * Populated while an agent is blocked on AskUserQuestion.
   * Cleared when the user answers, the session resets, or the project
   * switches. Single-value by design — the current orchestrator only
   * has one question outstanding at a time.
   */
  waiting?: AgentWaitingPayload;
}
```

Update `SessionStatePatch`:

```ts
export type SessionStatePatch =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'activeAgent'; agentId: string | null }
  | { kind: 'ended'; ended: boolean }
  | { kind: 'waiting'; payload: AgentWaitingPayload | null };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — type additions are all optional / nullable. Some *existing* call sites that switch on `SessionStatePatch` will now warn about exhaustiveness; those are addressed in Task 2 (`snapshot-builder.ts`) and Task 5 (`session.store.ts`). If `tsc` surfaces unrelated errors, stop and surface them.

- [ ] **Step 3: Commit**

```bash
git add shared/types/session.ts
git commit -m "feat(types): add waiting snapshot field, currentTool, phase on message"
```

---

## Task 2: Preserve tool metadata + stamp phase + setWaiting in SnapshotBuilder

**Files:**
- Modify: `electron/mobile-bridge/snapshot-builder.ts`
- Modify: `electron/mobile-bridge/__tests__/snapshot-builder.test.ts`

The builder needs four logic changes: (1) preserve `currentTool` on `agent:tool:start`, clear on `tool:done`/`tool:clear`/`closed`, (2) stamp `phase` on appended chat, (3) add `setWaiting`, (4) extend `applyStatePatch` + `reset` for the new `waiting` field.

`extractToolTarget` is a pure string-manipulation helper in `src/renderer/src/utils.ts` that reads `event.message`. It's UI-layer code today but has no browser deps — we move it to `shared/core/extract-tool-target.ts` so both the main-process builder and the renderer can use the same implementation.

### Step 1: Write failing tests for tool metadata, phase stamp, setWaiting

- [ ] **Step 1: Add the new test cases**

Append these cases to `electron/mobile-bridge/__tests__/snapshot-builder.test.ts` inside the existing `describe('SnapshotBuilder', ...)` block, just before the closing `});`:

```ts
  // ── currentTool preservation ──

  it('populates currentTool on agent:tool:start with target extracted from message', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1',
      message: '/Users/x/foo.ts',
    }));
    expect(builder.getSnapshot().characters[0].currentTool).toEqual({
      toolName: 'Read', target: 'foo.ts',
    });
  });

  it('clears currentTool on agent:tool:done', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1', message: 'foo.ts',
    }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:done', agentId: 'a1', toolId: 't1' }));
    expect(builder.getSnapshot().characters[0].currentTool).toBeUndefined();
  });

  it('clears currentTool on agent:tool:clear', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1', message: 'foo.ts',
    }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:clear', agentId: 'a1' }));
    expect(builder.getSnapshot().characters[0].currentTool).toBeUndefined();
  });

  it('does NOT populate currentTool for AskUserQuestion tool', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'AskUserQuestion', toolId: 't1',
    }));
    expect(builder.getSnapshot().characters[0].currentTool).toBeUndefined();
  });

  // ── chat phase stamping ──

  it('stamps phase on each appended chat message from the current snapshot phase', () => {
    builder.applyStatePatch({ kind: 'phase', phase: 'warroom' });
    builder.ingestChat([mkChat('m1', 'hi')]);
    expect(builder.getSnapshot().chatTail[0].phase).toBe('warroom');
  });

  it('preserves an already-tagged phase on incoming chat', () => {
    builder.applyStatePatch({ kind: 'phase', phase: 'warroom' });
    builder.ingestChat([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1, phase: 'imagine' }]);
    expect(builder.getSnapshot().chatTail[0].phase).toBe('imagine');
  });

  // ── waiting state ──

  it('setWaiting populates and clears snapshot.waiting', () => {
    const payload = { sessionId: 's1', agentRole: 'ceo' as const, questions: [] };
    builder.setWaiting(payload);
    expect(builder.getSnapshot().waiting).toEqual(payload);
    builder.setWaiting(null);
    expect(builder.getSnapshot().waiting).toBeUndefined();
  });

  it('applyStatePatch waiting sets and clears snapshot.waiting', () => {
    const payload = { sessionId: 's1', agentRole: 'ceo' as const, questions: [] };
    builder.applyStatePatch({ kind: 'waiting', payload });
    expect(builder.getSnapshot().waiting).toEqual(payload);
    builder.applyStatePatch({ kind: 'waiting', payload: null });
    expect(builder.getSnapshot().waiting).toBeUndefined();
  });

  it('reset clears waiting', () => {
    builder.setWaiting({ sessionId: 's1', agentRole: 'ceo', questions: [] });
    builder.reset();
    expect(builder.getSnapshot().waiting).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: The 9 new tests fail (`setWaiting is not a function`, `waiting is undefined`, `currentTool is undefined`, etc.) while the existing 9 tests still pass.

### Step 3: Move `extractToolTarget` to `shared/core/`

- [ ] **Step 3: Create `shared/core/extract-tool-target.ts`**

Create `shared/core/extract-tool-target.ts`:

```ts
// shared/core/extract-tool-target.ts — Pure helper that turns an AgentEvent
// into a short, user-facing target string (e.g. "foo.ts" for Read).
// Kept in shared/core/ so both the main-process SnapshotBuilder and the
// desktop renderer can use the same implementation.

import type { AgentEvent } from '../types';

export function extractToolTarget(event: AgentEvent): string {
  const tool = event.toolName ?? '';
  const msg = event.message ?? '';

  if (!msg) return tool || 'Working';

  const FILE_TOOLS = ['Read', 'Write', 'Edit'];
  if (FILE_TOOLS.includes(tool)) {
    const segments = msg.split('/');
    return segments[segments.length - 1] || msg;
  }

  if (tool === 'Bash') {
    const trimmed = msg.trim();
    return trimmed.length > 40 ? trimmed.slice(0, 40) + '\u2026' : trimmed;
  }

  if (tool === 'Grep' || tool === 'Glob') {
    return msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg;
  }

  // Fallback: show tool name or truncated message
  return tool || (msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg);
}
```

- [ ] **Step 4: Re-export from renderer utils to preserve desktop call sites**

Edit `src/renderer/src/utils.ts`. Find the existing `export function extractToolTarget(...)` (lines 31–54) and replace it with a re-export. Add this import at the top of the file:

```ts
export { extractToolTarget } from '../../../shared/core/extract-tool-target';
```

Then delete the old inline implementation (lines 31–54). Leave all other helpers (`agentDisplayName`, `formatTime`, etc.) untouched.

### Step 5: Update `SnapshotBuilder`

- [ ] **Step 5: Rewrite `electron/mobile-bridge/snapshot-builder.ts`**

Replace the file with:

```ts
import type {
  AgentEvent,
  AgentWaitingPayload,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
  CharacterSnapshot,
  Phase,
} from '../../shared/types';
import { classifyActivity } from '../../shared/core/event-reducer';
import { extractToolTarget } from '../../shared/core/extract-tool-target';

const CHAT_TAIL_CAP = 50;

export class SnapshotBuilder {
  private sessionId = 'current';
  private desktopName: string;
  private phase: Phase = 'idle';
  private startedAt: number = Date.now();
  private activeAgentId: string | null = null;
  private characters = new Map<string, CharacterSnapshot>();
  private chatTail: ChatMessage[] = [];
  private sessionEnded = false;
  private waiting: AgentWaitingPayload | null = null;

  constructor(desktopName: string) {
    this.desktopName = desktopName;
  }

  getSnapshot(): SessionSnapshot {
    const snap: SessionSnapshot = {
      sessionId: this.sessionId,
      desktopName: this.desktopName,
      phase: this.phase,
      startedAt: this.startedAt,
      activeAgentId: this.activeAgentId,
      characters: Array.from(this.characters.values()),
      chatTail: [...this.chatTail],
      sessionEnded: this.sessionEnded,
    };
    if (this.waiting) snap.waiting = this.waiting;
    return snap;
  }

  ingestEvent(event: AgentEvent): void {
    const result = classifyActivity(event);
    if (result === null) return;

    if ('removed' in result) {
      this.characters.delete(event.agentId);
      if (this.activeAgentId === event.agentId) this.activeAgentId = null;
      return;
    }

    this.ensureCharacter(event);
    const c = this.characters.get(event.agentId);
    if (!c) return;
    c.activity = result.activity;

    // Preserve / clear currentTool based on tool lifecycle. AskUserQuestion
    // is filtered because it's the mechanism behind the waiting indicator,
    // not a user-visible "running a tool" action.
    if (event.type === 'agent:tool:start' && event.toolName !== 'AskUserQuestion') {
      c.currentTool = {
        toolName: event.toolName ?? 'Tool',
        target: extractToolTarget(event) || undefined,
      };
    } else if (
      event.type === 'agent:tool:done' ||
      event.type === 'agent:tool:clear'
    ) {
      c.currentTool = undefined;
    }

    this.characters.set(event.agentId, c);

    if (event.type === 'agent:tool:start') {
      this.activeAgentId = event.agentId;
    }
  }

  ingestChat(messages: ChatMessage[]): void {
    const stamped = messages.map((m) => ({ ...m, phase: m.phase ?? this.phase }));
    this.chatTail = [...this.chatTail, ...stamped];
    if (this.chatTail.length > CHAT_TAIL_CAP) {
      this.chatTail = this.chatTail.slice(this.chatTail.length - CHAT_TAIL_CAP);
    }
  }

  setWaiting(payload: AgentWaitingPayload | null): void {
    this.waiting = payload;
  }

  applyStatePatch(patch: SessionStatePatch): void {
    switch (patch.kind) {
      case 'phase': this.phase = patch.phase; break;
      case 'activeAgent': this.activeAgentId = patch.agentId; break;
      case 'ended': this.sessionEnded = patch.ended; break;
      case 'waiting': this.waiting = patch.payload; break;
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.activeAgentId = null;
    this.characters.clear();
    this.chatTail = [];
    this.sessionEnded = false;
    this.waiting = null;
    this.startedAt = Date.now();
  }

  private ensureCharacter(event: AgentEvent): void {
    if (!this.characters.has(event.agentId)) {
      this.characters.set(event.agentId, {
        agentId: event.agentId,
        agentRole: event.agentRole,
        activity: 'idle',
      });
    }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: All 18 tests pass.

- [ ] **Step 7: Commit**

```bash
git add shared/core/extract-tool-target.ts src/renderer/src/utils.ts \
        electron/mobile-bridge/snapshot-builder.ts \
        electron/mobile-bridge/__tests__/snapshot-builder.test.ts
git commit -m "feat(snapshot-builder): preserve tool metadata, stamp message phase, track waiting"
```

---

## Task 3: Add `onAgentWaiting` to EventForwarder

**Files:**
- Modify: `electron/mobile-bridge/event-forwarder.ts`

Add an `onAgentWaiting` hook that updates `SnapshotBuilder.setWaiting` and broadcasts a `{ kind: 'waiting' }` patch to authenticated devices. Mirrors the shape of `onStatePatch`.

- [ ] **Step 1: Modify `electron/mobile-bridge/event-forwarder.ts`**

Replace the file with:

```ts
import type {
  AgentEvent,
  AgentWaitingPayload,
  ChatMessage,
  MobileMessageV2,
  SessionStatePatch,
} from '../../shared/types';
import { SnapshotBuilder } from './snapshot-builder';

export interface Broadcaster {
  broadcastToAuthenticated(msg: MobileMessageV2): void;
}

export class EventForwarder {
  constructor(
    private readonly snapshots: SnapshotBuilder,
    private readonly broadcaster: Broadcaster,
  ) {}

  onAgentEvent = (event: AgentEvent): void => {
    try {
      this.snapshots.ingestEvent(event);
      this.broadcaster.broadcastToAuthenticated({ type: 'event', v: 2, event });
    } catch (err) {
      console.warn('[mobile-bridge] onAgentEvent failed:', err);
    }
  };

  onChat = (messages: ChatMessage[]): void => {
    try {
      this.snapshots.ingestChat(messages);
      this.broadcaster.broadcastToAuthenticated({ type: 'chatFeed', v: 2, messages });
    } catch (err) {
      console.warn('[mobile-bridge] onChat failed:', err);
    }
  };

  onStatePatch = (patch: SessionStatePatch): void => {
    try {
      this.snapshots.applyStatePatch(patch);
      this.broadcaster.broadcastToAuthenticated({ type: 'state', v: 2, patch });
    } catch (err) {
      console.warn('[mobile-bridge] onStatePatch failed:', err);
    }
  };

  /**
   * Start / clear the waiting indicator. Called from desktop IPC:
   *   - `handleAgentWaiting` → `onAgentWaiting(payload)`
   *   - resolve / reject sites → `onAgentWaiting(null)`
   * Propagates to mobile via the same patch channel as `onStatePatch`.
   */
  onAgentWaiting = (payload: AgentWaitingPayload | null): void => {
    try {
      this.snapshots.setWaiting(payload);
      this.broadcaster.broadcastToAuthenticated({
        type: 'state', v: 2, patch: { kind: 'waiting', payload },
      });
    } catch (err) {
      console.warn('[mobile-bridge] onAgentWaiting failed:', err);
    }
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Any errors in `MobileBridge` / call sites that expose the forwarder must be resolved before moving on (likely just a type export widening — the `MobileBridge` class already has a public `onChat` / `onAgentEvent` signature).

- [ ] **Step 3: Expose `onAgentWaiting` on the `MobileBridge` interface**

`MobileBridge` is defined as an interface in `electron/mobile-bridge/index.ts` (starts around line 20). The factory returned object directly re-exports `forwarder.on*` methods. Two edits.

(a) In the `MobileBridge` interface definition, add a line after `onStatePatch(patch: SessionStatePatch): void;` (line 43):

```ts
  onAgentWaiting(payload: AgentWaitingPayload | null): void;
```

(b) Update the top-of-file `import type` to add `AgentWaitingPayload`. The existing line 1 reads:

```ts
import type { AgentEvent, ChatMessage, MobileMessageV2, PairedDevice, SessionStatePatch, CharacterState } from '../../shared/types';
```

Change to:

```ts
import type { AgentEvent, AgentWaitingPayload, ChatMessage, MobileMessageV2, PairedDevice, SessionStatePatch, CharacterState } from '../../shared/types';
```

(c) In the factory's returned object, after `onStatePatch: forwarder.onStatePatch,` (line 317), add:

```ts
    onAgentWaiting: forwarder.onAgentWaiting,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/mobile-bridge/event-forwarder.ts electron/mobile-bridge/index.ts
git commit -m "feat(mobile-bridge): add onAgentWaiting hook that broadcasts a waiting patch"
```

---

## Task 4: Wire the desktop waiting signal through the bridge

**Files:**
- Modify: `electron/ipc/state.ts` (two sites: `handleAgentWaiting`, `rejectPendingQuestions`)
- Modify: `electron/ipc/phase-handlers.ts` (two sites: `USER_RESPONSE` handler at line 757, `routeUserChat` at line 1189)

`handleAgentWaiting` is the start of waiting. It currently sends the IPC to the desktop renderer but doesn't notify the mobile bridge. Add `mobileBridge?.onAgentWaiting(payload)`. Wherever a `pendingQuestions` entry resolves / rejects / clears, add `mobileBridge?.onAgentWaiting(null)`.

- [ ] **Step 1: Emit waiting start from `handleAgentWaiting`**

Edit `electron/ipc/state.ts`. In `handleAgentWaiting` (starts at line 268), add the mobile bridge call right after `send(IPC_CHANNELS.AGENT_WAITING, payload);`:

```ts
export function handleAgentWaiting(agentRole: AgentRole, questions: AskQuestion[]): Promise<Record<string, string>> {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const sessionId = `session-${incrementSessionId()}`;
    pendingQuestions.set(sessionId, { resolve, reject, questions });

    const payload: AgentWaitingPayload = { sessionId, agentRole, questions };
    send(IPC_CHANNELS.AGENT_WAITING, payload);
    mobileBridge?.onAgentWaiting(payload);   // NEW

    // Persist so the question survives app restart
    if (currentProjectDir) {
      persistWaitingState(currentProjectDir, payload);
    }
  });
}
```

- [ ] **Step 2: Clear waiting when `rejectPendingQuestions` runs**

Same file. Replace the body of `rejectPendingQuestions` with:

```ts
export function rejectPendingQuestions(reason: string, clearPersistedState = false): void {
  for (const [, pending] of pendingQuestions) {
    pending.reject(new Error(reason));
  }
  pendingQuestions.clear();
  mobileBridge?.onAgentWaiting(null);   // NEW — always clear on reject

  if (clearPersistedState && currentProjectDir) clearWaitingState(currentProjectDir);
}
```

- [ ] **Step 3: Clear waiting at the USER_RESPONSE resolve site**

Edit `electron/ipc/phase-handlers.ts`. Locate the `IPC_CHANNELS.USER_RESPONSE` handler around line 723. Inside the `if (pending) { … }` block, **after** `pendingQuestions.delete(sessionId); pending.resolve(answers);` (line 757), add:

```ts
      pendingQuestions.delete(sessionId);
      pending.resolve(answers);
      mobileBridge?.onAgentWaiting(null);   // NEW
```

The `mobileBridge` symbol is NOT currently imported in `phase-handlers.ts`. Add it inside the existing `from './state'` block (ends at line 83). Insert this line inside that import block, e.g. right after `settingsStore,`:

```ts
  mobileBridge,
```

- [ ] **Step 4: Clear waiting at the `routeUserChat` resolve site**

Same file. Locate `routeUserChat` around line 1179. Inside the for-loop that iterates `pendingQuestions`, after `pending.resolve(answers); return 'answered';` (line 1189–1190), change that block to:

```ts
  // 1. Answer any pending AskUserQuestion.
  for (const [sessionId, pending] of pendingQuestions) {
    const key = pending.questions?.[0]?.question ?? body;
    const answers: Record<string, string> = { [key]: body };
    if (currentProjectDir) clearWaitingState(currentProjectDir);
    pendingQuestions.delete(sessionId);
    pending.resolve(answers);
    mobileBridge?.onAgentWaiting(null);   // NEW
    return 'answered';
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/state.ts electron/ipc/phase-handlers.ts
git commit -m "feat(ipc): emit waiting patch to mobile bridge at start/resolve/reject sites"
```

---

## Task 5: Handle `waiting` patch in the mobile session store

**Files:**
- Modify: `shared/stores/session.store.ts`

The mobile-side store currently ignores unknown patch kinds (falls through the `switch`). Add a `waiting` case that writes / deletes the `snapshot.waiting` field.

- [ ] **Step 1: Update `applyStatePatch` in `shared/stores/session.store.ts`**

Open `shared/stores/session.store.ts`. Replace the `applyStatePatch` body (lines 54–62) with:

```ts
  applyStatePatch: (patch) => {
    const current = get().snapshot;
    if (!current) return;
    switch (patch.kind) {
      case 'phase':       set({ snapshot: { ...current, phase: patch.phase } }); break;
      case 'activeAgent': set({ snapshot: { ...current, activeAgentId: patch.agentId } }); break;
      case 'ended':       set({ snapshot: { ...current, sessionEnded: patch.ended } }); break;
      case 'waiting': {
        if (patch.payload) {
          set({ snapshot: { ...current, waiting: patch.payload } });
        } else {
          const { waiting: _removed, ...rest } = current;
          set({ snapshot: rest as typeof current });
        }
        break;
      }
    }
  },
```

The `if/else` ensures that clearing sets the key to `undefined` via property omission rather than leaving `waiting: null` on the snapshot (the snapshot type has `waiting?:`, not `waiting: X | null`).

- [ ] **Step 2: Add a test for the new reducer case**

Create `shared/stores/__tests__/session.store.test.ts` if not present, or append to it. First check:

```bash
ls shared/stores/__tests__/ 2>/dev/null || echo "no tests dir"
```

If the directory exists with a `session.store.test.ts`, append the two tests below to the existing `describe` block. Otherwise create the file with:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../session.store';
import type { SessionSnapshot } from '../../types';

const BASE: SessionSnapshot = {
  sessionId: 's', desktopName: 'd', phase: 'idle', startedAt: 0,
  activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
};

describe('session.store applyStatePatch', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: { ...BASE }, pendingEvents: [] });
  });

  it('waiting patch with payload sets snapshot.waiting', () => {
    useSessionStore.getState().applyStatePatch({
      kind: 'waiting',
      payload: { sessionId: 's1', agentRole: 'ceo', questions: [] },
    });
    expect(useSessionStore.getState().snapshot?.waiting).toEqual({
      sessionId: 's1', agentRole: 'ceo', questions: [],
    });
  });

  it('waiting patch with null clears snapshot.waiting', () => {
    useSessionStore.setState({
      snapshot: { ...BASE, waiting: { sessionId: 's1', agentRole: 'ceo', questions: [] } },
    });
    useSessionStore.getState().applyStatePatch({ kind: 'waiting', payload: null });
    expect(useSessionStore.getState().snapshot?.waiting).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add shared/stores/session.store.ts shared/stores/__tests__/session.store.test.ts
git commit -m "feat(session-store): handle waiting state patch in mobile store"
```

---

## Task 6: Add `activityVerb`, `ActivityFooter`, `PhaseSeparator` (with tests)

**Files:**
- Create: `src/mobile-renderer/activityVerb.ts`
- Create: `src/mobile-renderer/__tests__/activityVerb.test.ts`
- Create: `src/mobile-renderer/ActivityFooter.tsx`
- Create: `src/mobile-renderer/__tests__/ActivityFooter.test.tsx`
- Create: `src/mobile-renderer/PhaseSeparator.tsx`
- Modify: `src/mobile-renderer/style.css`

### Step 1: activityVerb + test

- [ ] **Step 1: Write the failing test**

Create `src/mobile-renderer/__tests__/activityVerb.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toolVerb } from '../activityVerb';

describe('toolVerb', () => {
  it('maps read-style tools to "reading"', () => {
    expect(toolVerb('Read')).toBe('reading');
    expect(toolVerb('Grep')).toBe('reading');
    expect(toolVerb('Glob')).toBe('reading');
    expect(toolVerb('WebFetch')).toBe('reading');
    expect(toolVerb('WebSearch')).toBe('reading');
  });
  it('maps write/edit to "writing"', () => {
    expect(toolVerb('Write')).toBe('writing');
    expect(toolVerb('Edit')).toBe('writing');
  });
  it('maps Bash to "running"', () => {
    expect(toolVerb('Bash')).toBe('running');
  });
  it('maps Agent to "delegating"', () => {
    expect(toolVerb('Agent')).toBe('delegating');
  });
  it('falls back to "running" for unknown tools', () => {
    expect(toolVerb('FooBar')).toBe('running');
    expect(toolVerb('')).toBe('running');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/mobile-renderer/__tests__/activityVerb.test.ts`
Expected: FAIL — "Cannot find module '../activityVerb'".

- [ ] **Step 3: Implement `activityVerb.ts`**

Create `src/mobile-renderer/activityVerb.ts`:

```ts
// Maps tool names to gerund verbs used by the mobile ActivityFooter.
// Kept deliberately small — desktop's ActivityIndicator uses a richer
// per-tool visual timeline, which is out of scope for sub-project 2.

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
const WRITE_TOOLS = new Set(['Write', 'Edit']);

export function toolVerb(toolName: string): string {
  if (READ_TOOLS.has(toolName)) return 'reading';
  if (WRITE_TOOLS.has(toolName)) return 'writing';
  if (toolName === 'Bash') return 'running';
  if (toolName === 'Agent') return 'delegating';
  return 'running';
}

// Emoji matching the verb — used by the Pixi character tool-bubble label
// on the Office tab.
const READ_EMOJI = '\u{1F4D6}';   // 📖
const WRITE_EMOJI = '\u{270F}\u{FE0F}'; // ✏️
const BASH_EMOJI = '\u26A1';       // ⚡
const AGENT_EMOJI = '\u{1F91D}';   // 🤝
const DEFAULT_EMOJI = '\u{1F527}'; // 🔧

export function toolEmoji(toolName: string): string {
  if (READ_TOOLS.has(toolName)) return READ_EMOJI;
  if (WRITE_TOOLS.has(toolName)) return WRITE_EMOJI;
  if (toolName === 'Bash') return BASH_EMOJI;
  if (toolName === 'Agent') return AGENT_EMOJI;
  return DEFAULT_EMOJI;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/activityVerb.test.ts`
Expected: PASS — 5 tests.

### Step 5: ActivityFooter + test

- [ ] **Step 5: Write the failing test**

Create `src/mobile-renderer/__tests__/ActivityFooter.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useSessionStore } from '../../../shared/stores/session.store';
import type { SessionSnapshot } from '../../../shared/types';
import { ActivityFooter } from '../ActivityFooter';

const BASE: SessionSnapshot = {
  sessionId: 's', desktopName: 'd', phase: 'idle', startedAt: 0,
  activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
};

function setChars(chars: SessionSnapshot['characters']): void {
  useSessionStore.setState({ snapshot: { ...BASE, characters: chars } });
}

describe('ActivityFooter', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: null });
  });

  it('renders nothing when no snapshot', () => {
    const { container } = render(<ActivityFooter />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no character has currentTool', () => {
    setChars([
      { agentId: 'a1', agentRole: 'ceo', activity: 'idle' },
    ]);
    const { container } = render(<ActivityFooter />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "<Name> is reading foo.ts" when the first active character has a Read tool', () => {
    setChars([
      { agentId: 'a1', agentRole: 'backend-engineer', activity: 'reading',
        currentTool: { toolName: 'Read', target: 'foo.ts' } },
    ]);
    const { getByText } = render(<ActivityFooter />);
    expect(getByText(/is reading foo\.ts/i)).toBeTruthy();
  });

  it('renders without target if target is missing', () => {
    setChars([
      { agentId: 'a1', agentRole: 'backend-engineer', activity: 'typing',
        currentTool: { toolName: 'Bash' } },
    ]);
    const { container } = render(<ActivityFooter />);
    expect(container.textContent).toMatch(/is running\u2026?/);
    expect(container.textContent).not.toMatch(/undefined/);
  });

  it('shows the first active character when multiple have currentTool', () => {
    setChars([
      { agentId: 'a1', agentRole: 'backend-engineer', activity: 'reading',
        currentTool: { toolName: 'Read', target: 'foo.ts' } },
      { agentId: 'a2', agentRole: 'frontend-engineer', activity: 'typing',
        currentTool: { toolName: 'Write', target: 'bar.tsx' } },
    ]);
    const { getByText } = render(<ActivityFooter />);
    expect(getByText(/foo\.ts/)).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/mobile-renderer/__tests__/ActivityFooter.test.tsx`
Expected: FAIL — "Cannot find module '../ActivityFooter'".

- [ ] **Step 7: Implement `ActivityFooter.tsx`**

Create `src/mobile-renderer/ActivityFooter.tsx`:

```tsx
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { agentDisplayName } from '../renderer/src/utils';
import { toolVerb } from './activityVerb';

export function ActivityFooter(): React.JSX.Element | null {
  const snapshot = useSessionStore((s) => s.snapshot);
  if (!snapshot) return null;

  const active = snapshot.characters.find((c) => c.currentTool);
  if (!active || !active.currentTool) return null;

  const verb = toolVerb(active.currentTool.toolName);
  const target = active.currentTool.target;
  const name = agentDisplayName(active.agentRole);

  return (
    <div className="activity-footer" aria-live="polite">
      <span className="activity-dot" />
      <span className="activity-text">
        {name} is {verb}
        {target ? ` ${target}` : ''}
        {'\u2026'}
      </span>
    </div>
  );
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/ActivityFooter.test.tsx`
Expected: PASS — 5 tests.

### Step 9: PhaseSeparator (no tests — trivial)

- [ ] **Step 9: Implement `PhaseSeparator.tsx`**

Create `src/mobile-renderer/PhaseSeparator.tsx`:

```tsx
import type React from 'react';
import type { Phase } from '../../shared/types';

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

export function PhaseSeparator({ phase }: { phase: Phase }): React.JSX.Element {
  return (
    <div className="phase-separator" role="separator" aria-label={`Phase: ${PHASE_LABELS[phase]}`}>
      <span className="phase-separator-line" />
      <span className="phase-separator-label">{PHASE_LABELS[phase]}</span>
      <span className="phase-separator-line" />
    </div>
  );
}
```

PhaseSeparator's output is deterministic from the input prop; rendering is covered by the ChatView integration tests in Task 7.

### Step 10: Styles

- [ ] **Step 10: Append CSS rules to `src/mobile-renderer/style.css`**

Append this block at the end of `src/mobile-renderer/style.css`:

```css
/* Phase separator — interleaved between consecutive chat bubbles with
   different phase tags. Dim horizontal lines with a small uppercase label
   between them. */
.phase-separator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  margin: 4px 0;
}
.phase-separator-line {
  flex: 1;
  height: 1px;
  background: #2a2a2a;
}
.phase-separator-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

/* Activity footer — fixed strip above the tab bar showing the current
   running tool on the first active character. */
.activity-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(20, 20, 20, 0.92);
  border-top: 1px solid #222;
  font-size: 11px;
  color: var(--fg);
  backdrop-filter: blur(6px);
  z-index: 2;
}
.activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: activity-pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
.activity-text {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
@keyframes activity-pulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1; }
}

/* When the WebView is in landscape (fullscreen office canvas), hide the
   Chat-tab overlay so it can't stack over the canvas. */
@media (orientation: landscape) {
  .activity-footer { display: none; }
}
```

- [ ] **Step 11: Commit**

```bash
git add src/mobile-renderer/activityVerb.ts src/mobile-renderer/ActivityFooter.tsx \
        src/mobile-renderer/PhaseSeparator.tsx src/mobile-renderer/style.css \
        src/mobile-renderer/__tests__/activityVerb.test.ts \
        src/mobile-renderer/__tests__/ActivityFooter.test.tsx
git commit -m "feat(mobile-renderer): add ActivityFooter, PhaseSeparator, toolVerb helpers"
```

---

## Task 7: Refactor `ChatView.tsx` to interleave separators, thread `isWaiting`, mount `ActivityFooter`

**Files:**
- Modify: `src/mobile-renderer/ChatView.tsx`
- Modify: `src/mobile-renderer/__tests__/ChatView.test.tsx`

### Step 1: Extend existing tests

- [ ] **Step 1: Add four new test cases to `ChatView.test.tsx`**

Open `src/mobile-renderer/__tests__/ChatView.test.tsx`. Update the `vi.mock` block to capture the `isWaiting` prop:

```ts
vi.mock('../../renderer/src/components/OfficeView/MessageBubble', () => ({
  MessageBubble: ({ msg, isWaiting }: { msg: ChatMessage; isWaiting: boolean }) => (
    <div data-testid="mb" data-msg-id={msg.id} data-waiting={String(isWaiting)}>
      {msg.text}
    </div>
  ),
}));
```

Then append these four cases inside the existing `describe('ChatView', ...)` block, just before the closing `});`:

```ts
  it('passes isWaiting=true to the last bubble when snapshot.waiting is set', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [
          { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
          { id: 'm2', role: 'agent', text: 'yo', timestamp: 20 },
        ],
        waiting: { sessionId: 's1', agentRole: 'ceo', questions: [] },
      },
    });
    const { getAllByTestId } = render(<ChatView />);
    const bubbles = getAllByTestId('mb');
    expect(bubbles[0].getAttribute('data-waiting')).toBe('false');
    expect(bubbles[1].getAttribute('data-waiting')).toBe('true');
  });

  it('passes isWaiting=false to all bubbles when waiting is unset', () => {
    setSnapshot([{ id: 'm1', role: 'user', text: 'hi', timestamp: 10 }]);
    const { getAllByTestId } = render(<ChatView />);
    expect(getAllByTestId('mb')[0].getAttribute('data-waiting')).toBe('false');
  });

  it('renders a PhaseSeparator between two messages with different phase', () => {
    setSnapshot([
      { id: 'm1', role: 'user', text: 'a', timestamp: 10, phase: 'imagine' },
      { id: 'm2', role: 'agent', text: 'b', timestamp: 20, phase: 'warroom' },
    ]);
    const { container } = render(<ChatView />);
    const sep = container.querySelector('.phase-separator');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toContain('War Room');
  });

  it('does NOT render a separator above the very first message', () => {
    setSnapshot([
      { id: 'm1', role: 'user', text: 'a', timestamp: 10, phase: 'imagine' },
    ]);
    const { container } = render(<ChatView />);
    expect(container.querySelectorAll('.phase-separator')).toHaveLength(0);
  });

  it('keeps the empty-state branch when chatTail is empty and no waiting', () => {
    setSnapshot([]);
    const { getByText } = render(<ChatView />);
    expect(getByText('No messages yet.')).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx`
Expected: The 4 new tests fail (separator not found, isWaiting always false, etc.). The 3 original tests still pass.

### Step 3: Implement the ChatView refactor

- [ ] **Step 3: Rewrite `src/mobile-renderer/ChatView.tsx`**

Replace the file with:

```tsx
import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { PhaseSeparator } from './PhaseSeparator';
import { ActivityFooter } from './ActivityFooter';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = snapshot?.chatTail ?? [];
  const waiting = snapshot?.waiting ?? null;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, waiting]);

  if (messages.length === 0 && !waiting) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  const rendered: React.ReactNode[] = [];
  let prevPhase: string | undefined;
  messages.forEach((m, i) => {
    if (m.phase && prevPhase !== undefined && m.phase !== prevPhase) {
      rendered.push(<PhaseSeparator key={`sep-${m.id}`} phase={m.phase} />);
    }
    if (m.phase) prevPhase = m.phase;
    const isLast = i === messages.length - 1;
    rendered.push(
      <MessageBubble key={m.id} msg={m} isWaiting={isLast && !!waiting} />,
    );
  });

  return (
    <>
      <div className="chat-list" ref={listRef}>{rendered}</div>
      <ActivityFooter />
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx`
Expected: PASS — all 7 tests (3 original + 4 new).

- [ ] **Step 5: Run the full mobile-renderer test suite to guard regressions**

Run: `npx vitest run src/mobile-renderer`
Expected: All tests pass (ChatView, ActivityFooter, activityVerb, any others).

- [ ] **Step 6: Commit**

```bash
git add src/mobile-renderer/ChatView.tsx src/mobile-renderer/__tests__/ChatView.test.tsx
git commit -m "feat(mobile-chat): interleave phase separators, thread isWaiting, mount ActivityFooter"
```

---

## Task 8: Drive `Character.showToolBubble` on mobile from snapshot

**Files:**
- Modify: `src/mobile-renderer/MobileScene.ts`

Mobile's Office canvas already has a per-`Character` `ToolBubble` with `showToolBubble(toolName, target)` / `hideToolBubble()`. These render a small sprite-aligned bubble over the character — desktop's `useSceneSync` already uses them. Mobile just needs to drive them from `snapshot.characters[].currentTool`.

The bridge: `CharacterSnapshot.agentRole` (from main-process builder) matches `Character`'s keying in `MobileScene.characters: Map<string, Character>` where the key is the `AgentRole` string (see `MobileScene.ts:119`, `this.characters.set(config.role, character)`).

- [ ] **Step 1: Add a per-role tool cache field to `MobileScene`**

Open `src/mobile-renderer/MobileScene.ts`. Find the class-level field declarations (around line 31). Add this line right after the `characters` field:

```ts
  private lastToolByRole = new Map<string, string>();
```

The cache key is `agentRole`; the value is a short signature `${toolName}|${target ?? ''}` so we can detect transitions without deep-equals on frame time.

- [ ] **Step 2: Modify `MobileScene.driveFromStore`**

Same file. Locate `driveFromStore` (starts at line 137). Replace with:

```ts
  private driveFromStore(): void {
    const dt = this.app.ticker.deltaMS / 1000;
    this.camera.update();

    const state = useSessionStore.getState();
    const states = state.characterStates;
    const snapshotChars = state.snapshot?.characters ?? [];

    // Apply movement/animation state to known characters; spawn if new-visible.
    for (const [agentId, target] of states) {
      const character = this.characters.get(agentId);
      if (!character) continue;
      if (!character.isVisible && target.visible) {
        const tileX = Math.floor(target.x / this.mapRenderer.tileSize);
        const tileY = Math.floor(target.y / this.mapRenderer.tileSize);
        character.repositionTo(tileX, tileY);
        character.show(this.characterLayer);
      }
      character.applyDrivenState(target, dt);
    }

    // Fade out characters no longer in the stream.
    for (const [role, character] of this.characters) {
      if (!states.has(role) && character.isVisible) {
        character.hide(500);
      }
    }

    // Drive tool bubbles from snapshot.characters[].currentTool. We only
    // call showToolBubble / hideToolBubble on state transitions (tracked
    // via `lastToolByRole`) because ToolBubble.show() does non-trivial
    // redraw work and we don't want that on every frame.
    const currentByRole = new Map<string, string>();
    for (const snap of snapshotChars) {
      if (snap.currentTool) {
        const sig = `${snap.currentTool.toolName}|${snap.currentTool.target ?? ''}`;
        currentByRole.set(snap.agentRole, sig);
      }
    }
    // Show / update
    for (const [role, sig] of currentByRole) {
      const character = this.characters.get(role);
      if (!character) continue;
      if (this.lastToolByRole.get(role) !== sig) {
        const [toolName, target] = sig.split('|', 2);
        character.showToolBubble(toolName, target);
        this.lastToolByRole.set(role, sig);
      }
    }
    // Hide for roles that had a bubble but no longer have one.
    for (const [role] of this.lastToolByRole) {
      if (!currentByRole.has(role)) {
        const character = this.characters.get(role);
        character?.hideToolBubble();
        this.lastToolByRole.delete(role);
      }
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/mobile-renderer/MobileScene.ts
git commit -m "feat(mobile-office): show tool bubble over character from snapshot.currentTool"
```

---

## Task 9: Rebuild, sanity check, manual QA

**Files:** none directly modified; rebuild regenerates `mobile/assets/webview/index.html`.

- [ ] **Step 1: Rebuild the mobile WebView bundle**

Run: `npm run build:mobile-all`
Expected: Completes with no errors. Writes to `mobile/assets/webview/index.html`.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass. If any unrelated test fails, diagnose — the per-task commits above should each have been test-clean. Do not `--skip` or `--force`.

- [ ] **Step 3: Commit the rebuilt bundle**

```bash
git add mobile/assets/webview/index.html
git commit -m "chore(mobile): rebuild webview bundle with live context signals"
```

- [ ] **Step 4: Manual QA — exercise all 7 scenarios from the spec**

Follow the QA steps as a human:

1. **Waiting appears.** Pair phone → start /imagine on desktop → once any agent issues `AskUserQuestion`, confirm the phone's Chat tab shows the last bubble with an italic "Awaiting your response" line beneath it.
2. **Waiting clears.** Answer the question from desktop → italic line disappears on the phone.
3. **Activity appears in Chat footer.** Trigger an agent tool-heavy action (e.g. continue a phase so an engineer runs Read) → footer shows "{Name} is reading {file}".
4. **Activity appears in Office.** Same event → tool bubble appears over the character on the phone's Office tab.
5. **Activity clears.** Tool finishes → both indicators clear within one frame.
6. **Phase separator.** Cross a phase boundary mid-conversation → separator labeled with the new phase appears between bubbles bracketing the transition.
7. **Reconnect mid-wait.** While a question is outstanding on desktop, kill the phone app and reopen → waiting line appears on first paint (from snapshot sync), without a fresh `AGENT_WAITING` event.

If any scenario fails, stop and file a follow-up task rather than skipping. Pass all seven → sub-project 2 done.

---

## Notes for the implementer

- **Run the desktop app with a mobile device for Task 9.** If you don't have a pairable device available, at minimum exercise the `SnapshotBuilder` + `ChatView` tests and walk through the UI in the Vite mobile-renderer dev server (`npm run dev:mobile-renderer` serves the WebView bundle in a browser), seeding the store with test data. This won't exercise reconnect (item 7) but will cover items 1, 2, 5, 6.
- **Don't touch sub-project 3 scope.** No interactive QuestionBubble, no PhaseActionButton, no archived runs, no uncapped history. If a change feels like it's growing beyond one of the task's file lists, stop and raise it.
- **Type additions are nullable / optional** — existing serialized snapshots deserialize forward-compatibly. If typecheck surfaces an exhaustiveness error on `SessionStatePatch`, that's intended — fix the site to add the `waiting` case.
