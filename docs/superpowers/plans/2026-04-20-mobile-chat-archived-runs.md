# Mobile Chat Archived Runs + Uncapped History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the mobile chat tab to parity with desktop's history surface — uncap the live `chatTail`, and render archived runs as collapsible buttons above the current-run content.

**Architecture:** Zero new wire message types. `SessionSnapshot` gains `archivedRuns?: ArchivedRun[]`, `SessionStatePatch` gains `{kind:'archivedRuns', runs, resetTail}`. Desktop's `ChatHistoryStore` gets a `computeArchivedRuns(phase)` helper (mirror of `chat.store.loadHistory` logic). A new `refreshMobileArchivedRuns(resetTail)` in `state.ts` fires at three triggers: phase change, new run, project open. Mobile adds `ArchivedRunsList` rendered above the flat tail. `ArchivedRun` type moves from desktop-only `chat.store.ts` to shared `shared/types/session.ts`.

**Tech Stack:** TypeScript, React 19, Zustand, vitest + @testing-library/react + jsdom.

---

## File Changes (preview)

Created:
- `src/mobile-renderer/ArchivedRunsList.tsx`
- `src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx`
- `electron/mobile-bridge/__tests__/event-forwarder.test.ts`

Modified:
- `shared/types/session.ts` (add `ArchivedRun`, extend `SessionSnapshot`, extend `SessionStatePatch`)
- `src/renderer/src/stores/chat.store.ts` (delete local `ArchivedRun`, import from shared)
- `src/renderer/src/components/OfficeView/ChatPanel.tsx` (update import path for `ArchivedRun`)
- `electron/project/chat-history-store.ts` (add `computeArchivedRuns`)
- `tests/electron/project/chat-history-store.test.ts` (new cases)
- `electron/mobile-bridge/snapshot-builder.ts` (field, setter, patch case, reset, uncap)
- `electron/mobile-bridge/__tests__/snapshot-builder.test.ts` (new cases)
- `electron/mobile-bridge/event-forwarder.ts` (new `onArchivedRuns` hook)
- `electron/mobile-bridge/index.ts` (expose `onArchivedRuns` on `MobileBridge` facade)
- `shared/stores/session.store.ts` (handle `archivedRuns` patch, drop cap)
- `shared/stores/__tests__/session.store.test.ts` (new cases)
- `src/mobile-renderer/ChatView.tsx` (prepend `<ArchivedRunsList>`, update empty-state)
- `src/mobile-renderer/__tests__/ChatView.test.tsx` (new cases)
- `src/mobile-renderer/style.css` (archived-runs CSS block)
- `electron/ipc/state.ts` (new `refreshMobileArchivedRuns` helper; hook into `setCurrentChatPhase`, `setCurrentChatRunNumber`, `resetSessionState`)
- `electron/ipc/project-handlers.ts` (call `refreshMobileArchivedRuns(false)` at project-open end)

---

## Task 1: Move `ArchivedRun` to shared types + extend `SessionSnapshot` & `SessionStatePatch`

**Files:**
- Modify: `shared/types/session.ts`
- Modify: `src/renderer/src/stores/chat.store.ts`
- Modify: `src/renderer/src/components/OfficeView/ChatPanel.tsx`

Three additive edits. No test changes yet — the type moves and field additions have no runtime behaviour; downstream tasks exercise them.

- [ ] **Step 1: Extend `shared/types/session.ts`**

Open `shared/types/session.ts`. Add the `ArchivedRun` interface below the existing `AgentWaitingPayload` block (around line 60, after `AgentWaitingPayload`):

```ts
export interface ArchivedRun {
  agentRole: AgentRole;
  runNumber: number;
  messages: ChatMessage[];
  /** Timestamp of the first message in this run — used for sort + display date. */
  timestamp: number;
}
```

Extend `SessionSnapshot` (its existing body, around the end of the interface):

```ts
export interface SessionSnapshot {
  sessionId: string;
  desktopName: string;
  phase: Phase;
  startedAt: number;
  activeAgentId: string | null;
  characters: CharacterSnapshot[];
  chatTail: ChatMessage[];  // no longer capped — archived runs hold older material
  sessionEnded: boolean;
  waiting?: AgentWaitingPayload;
  /**
   * Older completed runs within the current phase. Populated on project open
   * and refreshed on phase transitions and new runs. Mobile renders these as
   * collapsible buttons above the flat chatTail. Optional for forward
   * compatibility with old persisted snapshots.
   */
  archivedRuns?: ArchivedRun[];
}
```

Extend `SessionStatePatch`:

```ts
export type SessionStatePatch =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'activeAgent'; agentId: string | null }
  | { kind: 'ended'; ended: boolean }
  | { kind: 'waiting'; payload: AgentWaitingPayload | null }
  | { kind: 'archivedRuns'; runs: ArchivedRun[]; resetTail: boolean };
```

The `chatTail` comment update is optional — leave the existing comment if preferred; the cap removal happens in Task 3.

- [ ] **Step 2: Delete local `ArchivedRun` in `chat.store.ts`, import from shared**

Open `src/renderer/src/stores/chat.store.ts`. Delete lines 4–9 (the local `export interface ArchivedRun { … }` block). Update the existing import at line 2:

```ts
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion, PhaseHistory, ArchivedRun } from '@shared/types';
```

The rest of the file (the `ChatStore` interface uses `archivedRuns: ArchivedRun[]`, and `loadHistory` constructs `ArchivedRun` objects) continues to compile unchanged because the shape is identical.

- [ ] **Step 3: Update `ChatPanel.tsx` import**

Open `src/renderer/src/components/OfficeView/ChatPanel.tsx`. Line 3:

```ts
import type { ArchivedRun } from '../../stores/chat.store';
```

Change to:

```ts
import type { ArchivedRun } from '@shared/types';
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "ArchivedRun|session\.ts|chat\.store|ChatPanel" | head -20`
Expected: No new errors referencing the moved type. If `tsc` flags anything else, it's pre-existing.

- [ ] **Step 5: Commit**

```bash
git add shared/types/session.ts \
        src/renderer/src/stores/chat.store.ts \
        src/renderer/src/components/OfficeView/ChatPanel.tsx
git commit -m "feat(types): move ArchivedRun to shared; add archivedRuns to SessionSnapshot + patch"
```

---

## Task 2: Add `computeArchivedRuns` to `ChatHistoryStore`

**Files:**
- Modify: `electron/project/chat-history-store.ts`
- Modify: `tests/electron/project/chat-history-store.test.ts`

TDD: write 4 failing tests, then the method.

- [ ] **Step 1: Add failing tests**

Open `tests/electron/project/chat-history-store.test.ts`. Append this block at the end of the top-level `describe('ChatHistoryStore', …)` block, before the closing `});`:

```ts
  describe('computeArchivedRuns', () => {
    it('returns empty when each role has only 1 run', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'only run', timestamp: 100 }));
      store.flush();
      expect(store.computeArchivedRuns('imagine')).toEqual([]);
    });

    it('excludes the latest run per role; includes earlier runs', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'run 1 msg', timestamp: 100 }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'run 2 msg', timestamp: 200 }));
      store.flush();
      const archived = store.computeArchivedRuns('imagine');
      expect(archived).toHaveLength(1);
      expect(archived[0].runNumber).toBe(1);
      expect(archived[0].agentRole).toBe('ceo');
      expect(archived[0].messages[0].text).toBe('run 1 msg');
      expect(archived[0].timestamp).toBe(100);
    });

    it('returns multiple archived runs sorted by timestamp ascending', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'ceo run 1', timestamp: 300 }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'ceo run 2', timestamp: 500 }));
      store.appendMessage('imagine', 'market-researcher', 1, makeMsg({
        text: 'mr run 1', agentRole: 'market-researcher', timestamp: 100,
      }));
      store.appendMessage('imagine', 'market-researcher', 2, makeMsg({
        text: 'mr run 2', agentRole: 'market-researcher', timestamp: 600,
      }));
      store.flush();
      const archived = store.computeArchivedRuns('imagine');
      expect(archived).toHaveLength(2);
      // mr run 1 timestamp=100 before ceo run 1 timestamp=300
      expect(archived[0].agentRole).toBe('market-researcher');
      expect(archived[0].runNumber).toBe(1);
      expect(archived[1].agentRole).toBe('ceo');
      expect(archived[1].runNumber).toBe(1);
    });

    it('skips runs with empty messages arrays', () => {
      // Only populate later runs; getPhaseHistory already omits zero-message files
      // by not reading them, so this test guards the shape: if an empty run
      // sneaks into the input, computeArchivedRuns still filters it.
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'run 2', timestamp: 200 }));
      store.flush();
      expect(store.computeArchivedRuns('imagine')).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/electron/project/chat-history-store.test.ts`
Expected: 4 new FAILs with `store.computeArchivedRuns is not a function` or similar. Existing tests still pass.

- [ ] **Step 3: Implement `computeArchivedRuns`**

Open `electron/project/chat-history-store.ts`. Add the import for `ArchivedRun` at the top (inside the existing `import type {...} from '../../shared/types'` block if present, else new line):

```ts
import type { ArchivedRun } from '../../shared/types';
```

Add the method inside the `ChatHistoryStore` class, directly after `getPhaseHistory` (which ends around line 200):

```ts
  /**
   * Compute archived-run metadata for a phase. Excludes the latest run per
   * agent role — those messages are the live content in the snapshot's
   * chatTail. Returns sorted ascending by first-message timestamp.
   */
  computeArchivedRuns(phase: Phase): ArchivedRun[] {
    const history = this.getPhaseHistory(phase);
    const archived: ArchivedRun[] = [];
    for (const entry of history) {
      if (entry.runs.length <= 1) continue;
      for (let i = 0; i < entry.runs.length - 1; i++) {
        const run = entry.runs[i];
        if (run.messages.length === 0) continue;
        archived.push({
          agentRole: entry.agentRole,
          runNumber: run.runNumber,
          messages: run.messages,
          timestamp: run.messages[0].timestamp,
        });
      }
    }
    archived.sort((a, b) => a.timestamp - b.timestamp);
    return archived;
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/electron/project/chat-history-store.test.ts`
Expected: All existing tests + 4 new cases pass.

- [ ] **Step 5: Commit**

```bash
git add electron/project/chat-history-store.ts tests/electron/project/chat-history-store.test.ts
git commit -m "feat(chat-history-store): add computeArchivedRuns"
```

---

## Task 3: Update `SnapshotBuilder` — archivedRuns field + uncap

**Files:**
- Modify: `electron/mobile-bridge/snapshot-builder.ts`
- Modify: `electron/mobile-bridge/__tests__/snapshot-builder.test.ts`

TDD: extend test suite with 5 new cases, then the implementation.

- [ ] **Step 1: Append new test cases**

Open `electron/mobile-bridge/__tests__/snapshot-builder.test.ts`. Append inside the existing `describe('SnapshotBuilder', …)` block, before the closing `});`:

```ts
  // ── archivedRuns ──

  it('setArchivedRuns populates snapshot.archivedRuns; empty omits the field', () => {
    const runs: ArchivedRun[] = [
      { agentRole: 'ceo', runNumber: 1, messages: [mkChat('m1', 'a')], timestamp: 100 },
    ];
    builder.setArchivedRuns(runs);
    expect(builder.getSnapshot().archivedRuns).toEqual(runs);
    builder.setArchivedRuns([]);
    expect(builder.getSnapshot().archivedRuns).toBeUndefined();
  });

  it('applyStatePatch archivedRuns with resetTail:true replaces runs AND clears chatTail', () => {
    builder.ingestChat([mkChat('m1', 'live1'), mkChat('m2', 'live2')]);
    const runs: ArchivedRun[] = [
      { agentRole: 'ceo', runNumber: 1, messages: [mkChat('old', 'old')], timestamp: 50 },
    ];
    builder.applyStatePatch({ kind: 'archivedRuns', runs, resetTail: true });
    const snap = builder.getSnapshot();
    expect(snap.archivedRuns).toEqual(runs);
    expect(snap.chatTail).toEqual([]);
  });

  it('applyStatePatch archivedRuns with resetTail:false replaces runs but keeps chatTail', () => {
    builder.ingestChat([mkChat('m1', 'live1')]);
    const runs: ArchivedRun[] = [
      { agentRole: 'ceo', runNumber: 1, messages: [mkChat('old', 'old')], timestamp: 50 },
    ];
    builder.applyStatePatch({ kind: 'archivedRuns', runs, resetTail: false });
    const snap = builder.getSnapshot();
    expect(snap.archivedRuns).toEqual(runs);
    expect(snap.chatTail).toHaveLength(1);
  });

  it('reset clears archivedRuns', () => {
    builder.setArchivedRuns([
      { agentRole: 'ceo', runNumber: 1, messages: [mkChat('m', 'x')], timestamp: 1 },
    ]);
    builder.reset();
    expect(builder.getSnapshot().archivedRuns).toBeUndefined();
  });

  it('ingestChat no longer caps at 50 — tail holds 60 messages', () => {
    for (let i = 0; i < 60; i++) builder.ingestChat([mkChat(`m${i}`, `hi${i}`)]);
    expect(builder.getSnapshot().chatTail).toHaveLength(60);
  });
```

Add the import at the top of the file (inside the existing `shared/types` import block):

```ts
import type { AgentEvent, ChatMessage, ArchivedRun } from '../../../shared/types';
```

(Merge with the existing import if one already exists — add `ArchivedRun,` alphabetically.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: 5 new FAILs; the 60-messages test may surface as "tail has 50, expected 60" (cap still in place); the setArchivedRuns test shows "builder.setArchivedRuns is not a function"; etc.

One existing test in this file — `'chat tail caps at 50 messages'` — will BECOME INVALID once the cap is removed. Delete or update that test:

```ts
  // DELETE the existing cap test — replaced by "no longer caps at 50"
  // it('chat tail caps at 50 messages', () => { … });
```

- [ ] **Step 3: Update `SnapshotBuilder`**

Open `electron/mobile-bridge/snapshot-builder.ts`. Apply three changes:

1. Add the field declaration + import. Inside the existing top-of-file shared-types import, add `ArchivedRun`:

```ts
import type {
  AgentEvent,
  AgentWaitingPayload,
  ArchivedRun,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
  CharacterSnapshot,
  Phase,
} from '../../shared/types';
```

Inside the class, add the field alongside the other private fields (after `private waiting: AgentWaitingPayload | null = null;`):

```ts
  private archivedRuns: ArchivedRun[] = [];
```

2. Replace `getSnapshot()` to conditionally include `archivedRuns`:

```ts
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
    if (this.archivedRuns.length > 0) snap.archivedRuns = [...this.archivedRuns];
    return snap;
  }
```

3. Add `setArchivedRuns`, extend `applyStatePatch`, drop the cap in `ingestChat`, extend `reset`:

```ts
  setArchivedRuns(runs: ArchivedRun[]): void {
    this.archivedRuns = runs;
  }

  ingestChat(messages: ChatMessage[]): void {
    const stamped = messages.map((m) => ({ ...m, phase: m.phase ?? this.phase }));
    this.chatTail = [...this.chatTail, ...stamped];
    // CAP REMOVED — tail grows with the current run; older runs live in archivedRuns
  }

  applyStatePatch(patch: SessionStatePatch): void {
    switch (patch.kind) {
      case 'phase': this.phase = patch.phase; break;
      case 'activeAgent': this.activeAgentId = patch.agentId; break;
      case 'ended': this.sessionEnded = patch.ended; break;
      case 'waiting': this.waiting = patch.payload; break;
      case 'archivedRuns':
        this.archivedRuns = patch.runs;
        if (patch.resetTail) this.chatTail = [];
        break;
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.activeAgentId = null;
    this.characters.clear();
    this.chatTail = [];
    this.sessionEnded = false;
    this.waiting = null;
    this.archivedRuns = [];
    this.startedAt = Date.now();
  }
```

Also delete the `const CHAT_TAIL_CAP = 50;` line at the top of the file (and any remaining reference to it).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: All existing (post-deletion) tests + 5 new cases pass.

- [ ] **Step 5: Commit**

```bash
git add electron/mobile-bridge/snapshot-builder.ts electron/mobile-bridge/__tests__/snapshot-builder.test.ts
git commit -m "feat(snapshot-builder): track archivedRuns, drop chatTail cap"
```

---

## Task 4: `EventForwarder.onArchivedRuns` + expose on `MobileBridge`

**Files:**
- Create: `electron/mobile-bridge/__tests__/event-forwarder.test.ts`
- Modify: `electron/mobile-bridge/event-forwarder.ts`
- Modify: `electron/mobile-bridge/index.ts`

TDD: one test first, then implementation.

- [ ] **Step 1: Write failing test**

Create `electron/mobile-bridge/__tests__/event-forwarder.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventForwarder } from '../event-forwarder';
import { SnapshotBuilder } from '../snapshot-builder';
import type { ArchivedRun, MobileMessageV2 } from '../../../shared/types';

describe('EventForwarder', () => {
  let broadcaster: { broadcastToAuthenticated: ReturnType<typeof vi.fn> };
  let snapshots: SnapshotBuilder;
  let forwarder: EventForwarder;

  beforeEach(() => {
    broadcaster = { broadcastToAuthenticated: vi.fn() };
    snapshots = new SnapshotBuilder('Test Desktop');
    forwarder = new EventForwarder(snapshots, broadcaster);
  });

  describe('onArchivedRuns', () => {
    it('applies the state patch to the SnapshotBuilder AND broadcasts the same shape', () => {
      const runs: ArchivedRun[] = [
        { agentRole: 'ceo', runNumber: 1, messages: [], timestamp: 100 },
      ];
      // Seed some chat so resetTail effect is observable
      snapshots.ingestChat([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }]);

      forwarder.onArchivedRuns(runs, true);

      expect(snapshots.getSnapshot().archivedRuns).toEqual(runs);
      expect(snapshots.getSnapshot().chatTail).toEqual([]);
      expect(broadcaster.broadcastToAuthenticated).toHaveBeenCalledWith({
        type: 'state',
        v: 2,
        patch: { kind: 'archivedRuns', runs, resetTail: true },
      } satisfies MobileMessageV2);
    });

    it('resetTail:false keeps chatTail intact', () => {
      const runs: ArchivedRun[] = [];
      snapshots.ingestChat([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }]);
      forwarder.onArchivedRuns(runs, false);
      expect(snapshots.getSnapshot().chatTail).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run electron/mobile-bridge/__tests__/event-forwarder.test.ts`
Expected: FAIL — "forwarder.onArchivedRuns is not a function".

- [ ] **Step 3: Implement `onArchivedRuns`**

Open `electron/mobile-bridge/event-forwarder.ts`. Add `ArchivedRun` to the import at top:

```ts
import type {
  AgentEvent,
  AgentWaitingPayload,
  ArchivedRun,
  ChatMessage,
  MobileMessageV2,
  SessionStatePatch,
} from '../../shared/types';
```

Add the new hook inside the `EventForwarder` class, alongside the existing `on*` properties:

```ts
  onArchivedRuns = (runs: ArchivedRun[], resetTail: boolean): void => {
    try {
      this.snapshots.applyStatePatch({ kind: 'archivedRuns', runs, resetTail });
      this.broadcaster.broadcastToAuthenticated({
        type: 'state', v: 2, patch: { kind: 'archivedRuns', runs, resetTail },
      });
    } catch (err) {
      console.warn('[mobile-bridge] onArchivedRuns failed:', err);
    }
  };
```

- [ ] **Step 4: Expose on the `MobileBridge` facade**

Open `electron/mobile-bridge/index.ts`. Two edits:

(a) Add `ArchivedRun` to the top `import type { ... }` block alongside the existing types (alphabetically inside `'../../shared/types'`).

(b) In the `MobileBridge` interface, add a line after `onAgentWaiting(…): void;` (the sub-project 2 addition):

```ts
  onArchivedRuns(runs: ArchivedRun[], resetTail: boolean): void;
```

(c) In the factory's returned object, after `onAgentWaiting: forwarder.onAgentWaiting,`:

```ts
    onArchivedRuns: forwarder.onArchivedRuns,
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/event-forwarder.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "event-forwarder|mobile-bridge/index" | head -10`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add electron/mobile-bridge/event-forwarder.ts \
        electron/mobile-bridge/__tests__/event-forwarder.test.ts \
        electron/mobile-bridge/index.ts
git commit -m "feat(mobile-bridge): add onArchivedRuns hook"
```

---

## Task 5: Handle `archivedRuns` patch in mobile session store + drop cap

**Files:**
- Modify: `shared/stores/session.store.ts`
- Modify: `shared/stores/__tests__/session.store.test.ts`

TDD: 3 new tests, then implementation.

- [ ] **Step 1: Append new tests**

Open `shared/stores/__tests__/session.store.test.ts`. Append inside the existing `describe('session.store applyStatePatch', …)` block, before the closing `});`:

```ts
  it('archivedRuns patch with resetTail:true updates both archivedRuns and clears chatTail', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE,
        chatTail: [{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }],
      },
    });
    const runs: import('../../types').ArchivedRun[] = [
      { agentRole: 'ceo', runNumber: 1, messages: [], timestamp: 100 },
    ];
    useSessionStore.getState().applyStatePatch({
      kind: 'archivedRuns', runs, resetTail: true,
    });
    const snap = useSessionStore.getState().snapshot!;
    expect(snap.archivedRuns).toEqual(runs);
    expect(snap.chatTail).toEqual([]);
  });

  it('archivedRuns patch with resetTail:false keeps chatTail', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE,
        chatTail: [{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }],
      },
    });
    useSessionStore.getState().applyStatePatch({
      kind: 'archivedRuns', runs: [], resetTail: false,
    });
    const snap = useSessionStore.getState().snapshot!;
    expect(snap.chatTail).toHaveLength(1);
  });
});

describe('session.store appendChat', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: { ...BASE }, pendingEvents: [] });
  });

  it('appendChat does not cap — 60 messages stay in chatTail', () => {
    const msgs = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`, role: 'user' as const, text: `hi${i}`, timestamp: i,
    }));
    useSessionStore.getState().appendChat(msgs);
    expect(useSessionStore.getState().snapshot!.chatTail).toHaveLength(60);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: 3 new FAILs — the archivedRuns cases don't have the reducer branch yet; the 60-messages case fails because the cap trims to 50.

- [ ] **Step 3: Update `shared/stores/session.store.ts`**

Open the file. Two edits:

(a) Drop the `CHAT_TAIL_CAP = 50` constant and the slice logic in `appendChat`:

```ts
  appendChat: (messages) => {
    const current = get().snapshot;
    if (!current) return;
    set({ snapshot: { ...current, chatTail: [...current.chatTail, ...messages] } });
  },
```

(Delete the `const CHAT_TAIL_CAP = 50;` line near the top of the file.)

(b) Add the `archivedRuns` case inside `applyStatePatch`'s switch (alongside the `waiting` case from sub-project 2):

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
      case 'archivedRuns': {
        const next: SessionSnapshot = { ...current, archivedRuns: patch.runs };
        if (patch.resetTail) next.chatTail = [];
        set({ snapshot: next });
        break;
      }
    }
  },
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: All existing + 3 new cases pass.

- [ ] **Step 5: Commit**

```bash
git add shared/stores/session.store.ts shared/stores/__tests__/session.store.test.ts
git commit -m "feat(session-store): handle archivedRuns patch; drop 50-message cap"
```

---

## Task 6: Create `ArchivedRunsList` component

**Files:**
- Create: `src/mobile-renderer/ArchivedRunsList.tsx`
- Create: `src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx`
- Modify: `src/mobile-renderer/style.css`

TDD: 4 tests, then component.

- [ ] **Step 1: Write failing tests**

Create `src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ChatMessage, ArchivedRun } from '../../../shared/types';

// Stub MessageBubble so we don't pull in react-markdown for this test.
vi.mock('../../renderer/src/components/OfficeView/MessageBubble', () => ({
  MessageBubble: ({ msg }: { msg: ChatMessage }) => (
    <div data-testid="inner-bubble">{msg.text}</div>
  ),
}));

import { ArchivedRunsList } from '../ArchivedRunsList';

function mkRun(partial: Partial<ArchivedRun> = {}): ArchivedRun {
  return {
    agentRole: 'ceo',
    runNumber: 1,
    messages: [{ id: 'm1', role: 'agent', text: 'hello', timestamp: 100 }],
    timestamp: 100,
    ...partial,
  };
}

describe('ArchivedRunsList', () => {
  it('returns null when runs is empty', () => {
    const { container } = render(<ArchivedRunsList runs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one collapsible header per run with role, number, count, date', () => {
    const runs = [
      mkRun({ runNumber: 1, agentRole: 'ceo', messages: [
        { id: 'm1', role: 'agent', text: 'a', timestamp: 100 },
        { id: 'm2', role: 'agent', text: 'b', timestamp: 110 },
      ] }),
    ];
    const { getByText } = render(<ArchivedRunsList runs={runs} />);
    // Role + run number
    expect(getByText(/Run 1/)).toBeTruthy();
    // Message count
    expect(getByText(/2 msgs/)).toBeTruthy();
  });

  it('clicking a header toggles the body visibility', () => {
    const runs = [mkRun({ runNumber: 7 })];
    const { getByText, queryAllByTestId } = render(<ArchivedRunsList runs={runs} />);
    expect(queryAllByTestId('inner-bubble')).toHaveLength(0);
    fireEvent.click(getByText(/Run 7/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(1);
    fireEvent.click(getByText(/Run 7/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(0);
  });

  it('multiple runs: expanding one does not affect the others', () => {
    const runs = [
      mkRun({ runNumber: 1, messages: [{ id: 'm1', role: 'agent', text: 'A', timestamp: 100 }] }),
      mkRun({ runNumber: 2, messages: [{ id: 'm2', role: 'agent', text: 'B', timestamp: 200 }] }),
    ];
    const { getByText, queryAllByTestId } = render(<ArchivedRunsList runs={runs} />);
    fireEvent.click(getByText(/Run 1/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(1);
    fireEvent.click(getByText(/Run 2/));
    expect(queryAllByTestId('inner-bubble')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx`
Expected: FAIL — "Cannot find module '../ArchivedRunsList'".

- [ ] **Step 3: Implement `ArchivedRunsList.tsx`**

Create `src/mobile-renderer/ArchivedRunsList.tsx`:

```tsx
import { useState } from 'react';
import type React from 'react';
import type { ArchivedRun } from '../../shared/types';
import { AGENT_COLORS } from '../../shared/types';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { agentDisplayName } from '../renderer/src/utils';

export function ArchivedRunsList({ runs }: { runs: ArchivedRun[] }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (runs.length === 0) return null;

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  return (
    <div className="archived-runs">
      {runs.map((run) => {
        const key = `${run.agentRole}-${run.runNumber}`;
        const isOpen = expanded.has(key);
        const color = AGENT_COLORS[run.agentRole] ?? '#999';
        const dateStr = new Date(run.timestamp).toLocaleDateString([], {
          month: 'short', day: 'numeric',
        });
        const count = run.messages.length;
        return (
          <div key={key} className="archived-run">
            <button className="archived-run-header" onClick={() => toggle(key)}>
              <span className="archived-run-caret">{isOpen ? '\u25BC' : '\u25B6'}</span>
              <span className="archived-run-label" style={{ color }}>
                Run {run.runNumber} — {agentDisplayName(run.agentRole)}
              </span>
              <span className="archived-run-meta">
                ({count} msg{count !== 1 ? 's' : ''}, {dateStr})
              </span>
            </button>
            {isOpen && (
              <div className="archived-run-body">
                {run.messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} isWaiting={false} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="archived-runs-divider" />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 5: Append CSS rules to `src/mobile-renderer/style.css`**

Append at the end of `src/mobile-renderer/style.css`:

```css
/* Archived runs — collapsible older runs within the current phase.
   Rendered above the current chatTail, matching desktop's ChatPanel. */
.archived-runs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 8px;
}
.archived-run-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: #141414;
  border: 1px solid #222;
  border-radius: 6px;
  color: var(--muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}
.archived-run-caret {
  color: #666;
  flex-shrink: 0;
}
.archived-run-label {
  font-weight: 600;
}
.archived-run-meta {
  color: #555;
  margin-left: auto;
}
.archived-run-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0;
  opacity: 0.7;
}
.archived-runs-divider {
  border-bottom: 1px solid #1f1f1f;
  margin: 4px 0 8px;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/mobile-renderer/ArchivedRunsList.tsx \
        src/mobile-renderer/__tests__/ArchivedRunsList.test.tsx \
        src/mobile-renderer/style.css
git commit -m "feat(mobile-renderer): add ArchivedRunsList component + styles"
```

---

## Task 7: Wire `ChatView` to render `ArchivedRunsList` + update empty-state

**Files:**
- Modify: `src/mobile-renderer/ChatView.tsx`
- Modify: `src/mobile-renderer/__tests__/ChatView.test.tsx`

TDD: 2 new tests, then impl update.

- [ ] **Step 1: Append new test cases to `ChatView.test.tsx`**

Open `src/mobile-renderer/__tests__/ChatView.test.tsx`. Append inside the existing `describe('ChatView', …)` block:

```ts
  it('renders ArchivedRunsList above the chatTail when snapshot.archivedRuns has entries', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [{ id: 'm1', role: 'user', text: 'hi', timestamp: 10 }],
        archivedRuns: [
          { agentRole: 'ceo', runNumber: 1,
            messages: [{ id: 'a1', role: 'agent', text: 'old', timestamp: 5 }], timestamp: 5 },
        ],
      },
    });
    const { container, getByText } = render(<ChatView />);
    const archivedEl = container.querySelector('.archived-runs');
    const chatList = container.querySelector('.chat-list');
    expect(archivedEl).not.toBeNull();
    expect(chatList).not.toBeNull();
    expect(getByText(/Run 1/)).toBeTruthy();
  });

  it('does NOT show empty-state when chatTail is empty but archivedRuns has entries', () => {
    useSessionStore.setState({
      snapshot: {
        ...BASE_SNAPSHOT,
        chatTail: [],
        archivedRuns: [
          { agentRole: 'ceo', runNumber: 1,
            messages: [{ id: 'a1', role: 'agent', text: 'old', timestamp: 5 }], timestamp: 5 },
        ],
      },
    });
    const { container, queryByText } = render(<ChatView />);
    expect(queryByText('No messages yet.')).toBeNull();
    expect(container.querySelector('.archived-runs')).not.toBeNull();
  });
```

Add a `vi.mock` for `ArchivedRunsList` immediately after the existing mocks at the top of the file:

```ts
vi.mock('../ArchivedRunsList', () => ({
  ArchivedRunsList: ({ runs }: { runs: { runNumber: number }[] }) => (
    runs.length === 0 ? null : (
      <div className="archived-runs">
        {runs.map((r) => (<span key={r.runNumber}>Run {r.runNumber}</span>))}
      </div>
    )
  ),
}));
```

This stub preserves the "returns null when empty, renders .archived-runs + run labels otherwise" shape without importing `MessageBubble`'s real dependency chain.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx`
Expected: 2 new FAILs — ArchivedRunsList not rendered; empty-state fires when archivedRuns has entries.

- [ ] **Step 3: Update `ChatView.tsx`**

Open `src/mobile-renderer/ChatView.tsx`. Three edits:

(a) Add the import at the top:

```tsx
import { ArchivedRunsList } from './ArchivedRunsList';
```

(b) Compute `archived` near the other snapshot-derived locals (alongside `messages`, `waiting`, `firstQuestion`, `showInteractive`):

```tsx
const archived = snapshot?.archivedRuns ?? [];
```

(c) Update the empty-state check to include `archived.length === 0`:

```tsx
if (messages.length === 0 && !waiting && archived.length === 0) {
  return <div className="chat-empty">No messages yet.</div>;
}
```

(d) Prepend `<ArchivedRunsList>` to the `rendered` array BEFORE the messages loop runs. The relevant section should look like:

```tsx
const rendered: React.ReactNode[] = [];
if (archived.length > 0) {
  rendered.push(<ArchivedRunsList key="archived-runs" runs={archived} />);
}
let prevPhase: Phase | undefined;
messages.forEach((m, i) => {
  // …existing phase-separator + bubble logic…
});
// …existing post-loop QuestionBubble logic…
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx`
Expected: All existing + 2 new cases pass.

- [ ] **Step 5: Run the full mobile-renderer suite**

Run: `npx vitest run src/mobile-renderer`
Expected: All tests pass across ChatView, ArchivedRunsList, ActivityFooter, activityVerb, sendAnswer, bridge.

- [ ] **Step 6: Commit**

```bash
git add src/mobile-renderer/ChatView.tsx src/mobile-renderer/__tests__/ChatView.test.tsx
git commit -m "feat(mobile-chat): render ArchivedRunsList above chatTail"
```

---

## Task 8: Wire desktop triggers + rebuild + full test + manual QA

**Files:**
- Modify: `electron/ipc/state.ts`
- Modify: `electron/ipc/project-handlers.ts`

No new automated tests for this task — the triggers are exercised by manual QA. The full vitest run guards against regressions in the code reached by unit tests.

- [ ] **Step 1: Add `refreshMobileArchivedRuns` helper to `state.ts`**

Open `electron/ipc/state.ts`. Near the other exported helpers (below `rejectPendingQuestions`, around line 290–295), add:

```ts
/**
 * Recompute the current phase's archived runs and push them to the mobile
 * bridge. `resetTail: true` clears the phone's chatTail (phase transition,
 * new run, project switch). `false` leaves it intact (project open with a
 * still-active run).
 *
 * No-op if the store or phase isn't ready yet — the first real trigger
 * after setup will fire the refresh.
 */
export function refreshMobileArchivedRuns(resetTail: boolean): void {
  if (!mobileBridge) return;
  if (!chatHistoryStore || !currentChatPhase) {
    mobileBridge.onArchivedRuns([], resetTail);
    return;
  }
  const runs = chatHistoryStore.computeArchivedRuns(currentChatPhase);
  mobileBridge.onArchivedRuns(runs, resetTail);
}
```

- [ ] **Step 2: Wire into `setCurrentChatPhase` and `setCurrentChatRunNumber`**

Same file. Find `setCurrentChatPhase` (line 172) and replace:

```ts
export function setCurrentChatPhase(phase: Phase | null): void {
  currentChatPhase = phase;
  refreshMobileArchivedRuns(true);
}
```

Find `setCurrentChatRunNumber` (line 180) and replace:

```ts
export function setCurrentChatRunNumber(n: number): void {
  currentChatRunNumber = n;
  if (n > 0) refreshMobileArchivedRuns(true);
}
```

- [ ] **Step 3: Wire into `resetSessionState`**

Same file. Find `resetSessionState` (around line 383). Inside the function body, add at the end (after the existing reset work):

```ts
  mobileBridge?.onArchivedRuns([], true);
```

- [ ] **Step 4: Call `refreshMobileArchivedRuns(false)` at end of `OPEN_PROJECT`**

Open `electron/ipc/project-handlers.ts`. Find the end of the successful `OPEN_PROJECT` handler path (after the "Restore persisted waiting question" block around line 171 and the "Restore persisted warroom plan review" block that follows it). Add:

```ts
      // Push initial archivedRuns to any connected mobile client. resetTail
      // false because sub-project 2's snapshot sync has already seeded the
      // tail with live content; we don't want to clobber it.
      refreshMobileArchivedRuns(false);
```

Add `refreshMobileArchivedRuns` to the existing `from './state'` import block:

```ts
import {
  // …existing imports…
  refreshMobileArchivedRuns,
} from './state';
```

- [ ] **Step 5: Typecheck + full tests**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "state\.ts|project-handlers" | head -10
npm test
```

Expected: No new type errors in either file. Full vitest suite passes.

- [ ] **Step 6: Rebuild the mobile WebView bundle**

Run: `npm run build:mobile-all`
Expected: build succeeds; the updated bundle is written to `mobile/assets/webview/index.html`.

- [ ] **Step 7: Run the mobile jest suite**

Run: `cd mobile && npx jest`
Expected: all jest suites pass (no changes in this task affect the RN-host side, but sanity-checking catches any accidental shared-types breakage).

- [ ] **Step 8: Commit**

```bash
git add electron/ipc/state.ts electron/ipc/project-handlers.ts mobile/assets/webview/index.html
git commit -m "feat(mobile-bridge): wire archived-runs triggers + rebuild bundle"
```

- [ ] **Step 9: Manual QA (human-run after merge) — skip in automated execution**

Follow the 4 manual QA scenarios from the spec:

1. **Multi-run imagine project** — open a project with multiple imagine runs; phone shows "Run 1 — CEO (3 msgs, Apr 18) ▶" buttons above the live tail; tap expands.
2. **New run mid-session** — abort + restart the current run on desktop; phone's tail clears; a new "Run N" button appears at the top.
3. **Phase transition** — advance from imagine to warroom; phone's chat replaces imagine's runs with warroom's (none initially); live tail shows only warroom content.
4. **Uncapped tail** — send 100+ messages in a single run; phone renders all of them.

Pass all four → sub-project 3b done.

---

## Notes for the implementer

- **Sub-project 3a must be merged first.** Tasks 3 and 5 both extend `applyStatePatch` switches that already include the `waiting` case from 3a. If main doesn't have that, the patch won't match the expected code shape.
- **Don't touch 3b non-goals.** No virtualization, no cross-phase archived runs, no search.
- **The `CHAT_TAIL_CAP` removal in Task 3 invalidates one existing snapshot-builder test** (`'chat tail caps at 50 messages'`). Delete that test; the replacement `'ingestChat no longer caps at 50'` is in the new test block. Do not try to keep both.
- **`ArchivedRun` move in Task 1 is a strict relocation**, not a rename or shape change. If any import site breaks in a later task, it's because the mover missed a file — grep `from '../../stores/chat.store'` and `from './chat.store'` in the renderer directory to find them.
- **Desktop rendering of archived runs is unchanged.** Task 6's `ArchivedRunsList` is mobile-only; desktop's inline rendering in `ChatPanel.tsx` continues to use `loadHistory` + `archivedRuns` from `chat.store.ts`. Both surfaces use the same `ArchivedRun` shape (now canonically in shared), but the rendering code is separate.
