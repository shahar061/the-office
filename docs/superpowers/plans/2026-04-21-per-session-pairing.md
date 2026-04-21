# Per-Session Pairing Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple permanent cryptographic trust from the ephemeral per-session live link, so the mobile companion only renders a live session while the desktop is inside a project; otherwise it shows an intentional idle screen.

**Architecture:** Add a `sessionActive` flag (plus `sessionId`/`projectName`/`projectRoot`) to `SessionSnapshot`. The desktop `SnapshotBuilder` gains a `setScope()` method that resets volatile state (chat tail, archived runs, waiting, characters) on every scope change, enforcing a fresh-reconnect contract. `MobileBridge.onSessionScopeChanged()` wires project open/close events from the main process to the bridge and broadcasts a fresh snapshot. Mobile `SessionScreen` branches internally on the snapshot's `sessionActive` flag, unmounting the WebView host in favour of a new `IdleScreen` when inactive.

**Tech Stack:** TypeScript, Electron main + renderer (React/Zustand), Expo mobile (React Native), Vitest for desktop/shared tests, Jest for mobile tests.

**Spec:** `docs/superpowers/specs/2026-04-21-per-session-pairing-design.md`

---

## File Structure

**Shared (types + stores used by desktop and mobile):**
- Modify: `shared/types/session.ts` — add `sessionActive`/`sessionId: string | null`/`projectName`/`projectRoot` to `SessionSnapshot`.
- No change: `shared/stores/session.store.ts` — `setSnapshot` already replaces the whole snapshot; the new fields flow through transparently. Add a test that proves it.

**Desktop bridge:**
- Modify: `electron/mobile-bridge/snapshot-builder.ts` — parameterize `sessionId`, add `setScope()`, clear volatile state on every scope change.
- Modify: `electron/mobile-bridge/index.ts` — add `onSessionScopeChanged()` method, broadcast a fresh snapshot on scope change, gate `getPairingQR()` while inactive.
- Modify: `electron/mobile-bridge/ws-server.ts` — expose a `broadcastSnapshot()` helper (or reuse an existing broadcast primitive) so the bridge can ship a full snapshot on scope changes.
- Test: `electron/mobile-bridge/__tests__/snapshot-builder.test.ts` — new `describe('setScope')` block.
- Test: `electron/mobile-bridge/__tests__/mobile-bridge.test.ts` — **new file** for `onSessionScopeChanged` + `getPairingQR` gating.

**Desktop main / IPC:**
- Modify: `shared/types/ipc.ts` — add `CLOSE_PROJECT` channel constant.
- Modify: `electron/preload.ts` — expose `closeProject()` on the `window.office` facade.
- Modify: `electron/ipc/state.ts` — `setCurrentProjectDir` emits `onSessionScopeChanged` to the bridge.
- Modify: `electron/ipc/project-handlers.ts` — register `CLOSE_PROJECT` handler; nothing else to wire because `setCurrentProjectDir` already covers open/create.

**Desktop renderer:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx` (line ~345) — back-button click calls `window.office.closeProject()` before setting `projectState` to `null`.
- Modify: `src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx` — disable Pair button when `projectState` is null; rename "Paired devices" → "Trusted devices".

**Mobile:**
- Create: `mobile/src/session/IdleScreen.tsx` — new idle screen component.
- Modify: `mobile/src/session/SessionScreen.tsx` — branch on snapshot `sessionActive` from `useSessionStore`.
- Modify: `mobile/src/session/useSession.ts` — expose a stable `sessionActive` boolean derived from the snapshot.
- Test: `mobile/src/__tests__/useSession.test.ts` — new test: `sessionActive` reflects snapshot.
- Test: `mobile/src/__tests__/SessionScreen.test.tsx` — **new file** for branch rendering.

---

## Task 1: Protocol — extend SessionSnapshot with scope fields

**Files:**
- Modify: `shared/types/session.ts:106-129`
- Test: `shared/stores/__tests__/session.store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `shared/stores/__tests__/session.store.test.ts`:

```ts
describe('session.store scope fields pass through setSnapshot', () => {
  it('preserves sessionActive=false, sessionId=null, projectName=undefined on a Lobby snapshot', () => {
    const snap: SessionSnapshot = {
      ...BASE,
      sessionActive: false,
      sessionId: null,
      projectName: undefined,
      projectRoot: undefined,
    };
    useSessionStore.getState().setSnapshot(snap);
    const result = useSessionStore.getState().snapshot!;
    expect(result.sessionActive).toBe(false);
    expect(result.sessionId).toBeNull();
    expect(result.projectName).toBeUndefined();
    expect(result.projectRoot).toBeUndefined();
  });

  it('preserves sessionActive=true with session metadata on an Office snapshot', () => {
    const snap: SessionSnapshot = {
      ...BASE,
      sessionActive: true,
      sessionId: '/Users/me/projects/foo',
      projectName: 'foo',
      projectRoot: '/Users/me/projects/foo',
    };
    useSessionStore.getState().setSnapshot(snap);
    const result = useSessionStore.getState().snapshot!;
    expect(result.sessionActive).toBe(true);
    expect(result.sessionId).toBe('/Users/me/projects/foo');
    expect(result.projectName).toBe('foo');
    expect(result.projectRoot).toBe('/Users/me/projects/foo');
  });
});
```

The existing `BASE` fixture at `shared/stores/__tests__/session.store.test.ts:52` must be updated to include `sessionActive` for TypeScript compilation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: FAIL — TypeScript error `Property 'sessionActive' does not exist on type 'SessionSnapshot'`.

- [ ] **Step 3: Update the type**

Edit `shared/types/session.ts` — replace the `SessionSnapshot` interface (currently at lines 106-129) with:

```ts
export interface SessionSnapshot {
  /**
   * True while the desktop is inside a session (Office screen); false while
   * in the Lobby / project picker. Added 2026-04-21 for per-session pairing
   * scope. The phone uses this flag to branch between IdleScreen and the
   * live session UI.
   */
  sessionActive: boolean;
  /** Opaque identifier for the current session; null when sessionActive=false. */
  sessionId: string | null;
  desktopName: string;
  /** Human-readable label for the phone's "Now connected to [X]" toast. */
  projectName?: string;
  /** Absolute path to the project; phone displays basename only. */
  projectRoot?: string;
  phase: Phase;
  startedAt: number;
  activeAgentId: string | null;
  characters: CharacterSnapshot[];
  chatTail: ChatMessage[];  // no longer capped — archived runs hold older material
  sessionEnded: boolean;
  waiting?: AgentWaitingPayload;
  archivedRuns?: ArchivedRun[];
}
```

Also update the `BASE` fixture in `shared/stores/__tests__/session.store.test.ts:52` to include `sessionActive: false` and `sessionId: 's'` (already present). Concretely, change line 53 from `sessionId: 's',` to:

```ts
sessionActive: false,
sessionId: 's',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: PASS — all tests in the file.

Run: `npx vitest run` once more across the repo to catch other suites whose fixtures compile-time depend on `SessionSnapshot`. Each failure must be fixed by adding `sessionActive` (defaulted to `false` unless the test explicitly describes an active session) and `sessionId` (use the existing string or `null`) to any inline `SessionSnapshot` literal the compiler complains about.

Expected final state: all vitest suites compile and pass.

- [ ] **Step 5: Commit**

```bash
git add shared/types/session.ts shared/stores/__tests__/session.store.test.ts
# Plus any test fixture files the compiler forced you to update.
git commit -m "feat(types): add sessionActive/sessionId/projectName to SessionSnapshot"
```

---

## Task 2: SnapshotBuilder — parameterize sessionId and add setScope()

**Files:**
- Modify: `electron/mobile-bridge/snapshot-builder.ts`
- Test: `electron/mobile-bridge/__tests__/snapshot-builder.test.ts`

**Intent:** `setScope()` is the single entry point for scope changes. It always resets volatile state (chatTail, archivedRuns, waiting, characters, activeAgentId, sessionEnded, phase, startedAt) and then sets the new scope fields. This enforces the "fresh reconnect" contract on both Lobby→Office and project-switch transitions.

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block near the end of `electron/mobile-bridge/__tests__/snapshot-builder.test.ts`:

```ts
describe('SnapshotBuilder.setScope', () => {
  it('initializes sessionActive=false, sessionId=null by default', () => {
    const snap = builder.getSnapshot();
    expect(snap.sessionActive).toBe(false);
    expect(snap.sessionId).toBeNull();
    expect(snap.projectName).toBeUndefined();
    expect(snap.projectRoot).toBeUndefined();
  });

  it('setScope({active:true, ...}) sets all scope fields', () => {
    builder.setScope({
      active: true,
      sessionId: '/tmp/p',
      projectName: 'p',
      projectRoot: '/tmp/p',
    });
    const snap = builder.getSnapshot();
    expect(snap.sessionActive).toBe(true);
    expect(snap.sessionId).toBe('/tmp/p');
    expect(snap.projectName).toBe('p');
    expect(snap.projectRoot).toBe('/tmp/p');
  });

  it('setScope({active:false}) clears sessionId/projectName/projectRoot', () => {
    builder.setScope({ active: true, sessionId: '/tmp/p', projectName: 'p', projectRoot: '/tmp/p' });
    builder.setScope({ active: false });
    const snap = builder.getSnapshot();
    expect(snap.sessionActive).toBe(false);
    expect(snap.sessionId).toBeNull();
    expect(snap.projectName).toBeUndefined();
    expect(snap.projectRoot).toBeUndefined();
  });

  it('setScope clears volatile state: chatTail, archivedRuns, waiting, characters, activeAgentId, sessionEnded, phase', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1' }));
    builder.ingestChat([mkChat('m1', 'live')]);
    builder.setWaiting({ sessionId: 's', agentRole: 'ceo', questions: [] });
    builder.setArchivedRuns([{ agentRole: 'ceo', runNumber: 1, messages: [mkChat('old', 'x')], timestamp: 1 }]);
    builder.applyStatePatch({ kind: 'phase', phase: 'warroom' });
    builder.applyStatePatch({ kind: 'ended', ended: true });

    builder.setScope({ active: false });

    const snap = builder.getSnapshot();
    expect(snap.chatTail).toEqual([]);
    expect(snap.archivedRuns).toBeUndefined();
    expect(snap.waiting).toBeUndefined();
    expect(snap.characters).toEqual([]);
    expect(snap.activeAgentId).toBeNull();
    expect(snap.sessionEnded).toBe(false);
    expect(snap.phase).toBe('idle');
  });

  it('setScope({active:true}) also clears volatile state from the prior session', () => {
    builder.setScope({ active: true, sessionId: '/tmp/a', projectName: 'a', projectRoot: '/tmp/a' });
    builder.ingestChat([mkChat('m1', 'in a')]);
    builder.setScope({ active: true, sessionId: '/tmp/b', projectName: 'b', projectRoot: '/tmp/b' });
    expect(builder.getSnapshot().chatTail).toEqual([]);
    expect(builder.getSnapshot().sessionId).toBe('/tmp/b');
  });

  it('setScope({active:true}) updates startedAt to now', () => {
    const before = Date.now();
    builder.setScope({ active: true, sessionId: '/tmp/x', projectName: 'x', projectRoot: '/tmp/x' });
    const after = Date.now();
    expect(builder.getSnapshot().startedAt).toBeGreaterThanOrEqual(before);
    expect(builder.getSnapshot().startedAt).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: FAIL — `setScope is not a function`, and the first test fails because `sessionActive`/`sessionId: null` aren't in the default snapshot.

- [ ] **Step 3: Implement**

Edit `electron/mobile-bridge/snapshot-builder.ts` — replace the whole file with:

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
import { classifyActivity } from '../../shared/core/event-reducer';
import { extractToolTarget } from '../../shared/core/extract-tool-target';

export interface ScopeActive {
  active: true;
  sessionId: string;
  projectName: string;
  projectRoot?: string;
}
export interface ScopeInactive {
  active: false;
}
export type Scope = ScopeActive | ScopeInactive;

export class SnapshotBuilder {
  private sessionActive = false;
  private sessionId: string | null = null;
  private projectName: string | undefined;
  private projectRoot: string | undefined;
  private desktopName: string;
  private phase: Phase = 'idle';
  private startedAt: number = Date.now();
  private activeAgentId: string | null = null;
  private characters = new Map<string, CharacterSnapshot>();
  private chatTail: ChatMessage[] = [];
  private sessionEnded = false;
  private waiting: AgentWaitingPayload | null = null;
  private archivedRuns: ArchivedRun[] = [];

  constructor(desktopName: string) {
    this.desktopName = desktopName;
  }

  getSnapshot(): SessionSnapshot {
    const snap: SessionSnapshot = {
      sessionActive: this.sessionActive,
      sessionId: this.sessionId,
      desktopName: this.desktopName,
      phase: this.phase,
      startedAt: this.startedAt,
      activeAgentId: this.activeAgentId,
      characters: Array.from(this.characters.values()),
      chatTail: [...this.chatTail],
      sessionEnded: this.sessionEnded,
    };
    if (this.projectName !== undefined) snap.projectName = this.projectName;
    if (this.projectRoot !== undefined) snap.projectRoot = this.projectRoot;
    if (this.waiting) snap.waiting = this.waiting;
    if (this.archivedRuns.length > 0) snap.archivedRuns = [...this.archivedRuns];
    return snap;
  }

  /**
   * Single entry point for scope transitions. Always resets volatile state
   * (chat tail, archived runs, waiting, characters, phase, etc.) so the next
   * snapshot the phone receives hydrates from a clean slate.
   */
  setScope(scope: Scope): void {
    // Reset volatile state regardless of direction — this is the "fresh
    // reconnect" contract from the spec.
    this.phase = 'idle';
    this.activeAgentId = null;
    this.characters.clear();
    this.chatTail = [];
    this.sessionEnded = false;
    this.waiting = null;
    this.archivedRuns = [];
    this.startedAt = Date.now();

    if (scope.active) {
      this.sessionActive = true;
      this.sessionId = scope.sessionId;
      this.projectName = scope.projectName;
      this.projectRoot = scope.projectRoot;
    } else {
      this.sessionActive = false;
      this.sessionId = null;
      this.projectName = undefined;
      this.projectRoot = undefined;
    }
  }

  isActive(): boolean {
    return this.sessionActive;
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

  setArchivedRuns(runs: ArchivedRun[]): void {
    this.archivedRuns = runs;
  }

  ingestChat(messages: ChatMessage[]): void {
    const stamped = messages.map((m) => ({ ...m, phase: m.phase ?? this.phase }));
    this.chatTail = [...this.chatTail, ...stamped];
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: PASS — all tests, including the original suite (the existing `'starts with empty snapshot'` test will need an updated expectation: add `expect(s.sessionActive).toBe(false)` and `expect(s.sessionId).toBeNull()` — do this edit now if the test still asserts a strict object shape).

- [ ] **Step 5: Commit**

```bash
git add electron/mobile-bridge/snapshot-builder.ts electron/mobile-bridge/__tests__/snapshot-builder.test.ts
git commit -m "feat(snapshot-builder): setScope with fresh-reconnect state reset"
```

---

## Task 3: MobileBridge.onSessionScopeChanged + broadcast fresh snapshot

**Files:**
- Modify: `electron/mobile-bridge/index.ts`
- Modify: `electron/mobile-bridge/ws-server.ts` (add a `broadcastSnapshot` method if one doesn't already exist)
- Test: `electron/mobile-bridge/__tests__/mobile-bridge.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `electron/mobile-bridge/__tests__/mobile-bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMobileBridge } from '../index';

function fakeSettings() {
  let state: any = { mobile: { enabled: true, port: 0, devices: [] } };
  return {
    get: () => state,
    update: (patch: any) => { state = { ...state, ...patch }; return state; },
  };
}

describe('MobileBridge.onSessionScopeChanged', () => {
  it('flips sessionActive in subsequent snapshots', async () => {
    const bridge = createMobileBridge({ settings: fakeSettings(), desktopName: 'Test' });
    await bridge.start();
    try {
      bridge.onSessionScopeChanged({
        active: true, sessionId: '/tmp/foo', projectName: 'foo', projectRoot: '/tmp/foo',
      });
      expect(bridge.__getSnapshotForTests().sessionActive).toBe(true);
      expect(bridge.__getSnapshotForTests().sessionId).toBe('/tmp/foo');
      expect(bridge.__getSnapshotForTests().projectName).toBe('foo');

      bridge.onSessionScopeChanged({ active: false });
      expect(bridge.__getSnapshotForTests().sessionActive).toBe(false);
      expect(bridge.__getSnapshotForTests().sessionId).toBeNull();
    } finally {
      await bridge.stop();
    }
  });
});

describe('MobileBridge.getPairingQR gating', () => {
  it('rejects when scope is inactive (default)', async () => {
    const bridge = createMobileBridge({ settings: fakeSettings(), desktopName: 'Test' });
    await bridge.start();
    try {
      await expect(bridge.getPairingQR()).rejects.toThrow(/project|session/i);
    } finally {
      await bridge.stop();
    }
  });

  it('resolves a QR when scope is active', async () => {
    const bridge = createMobileBridge({ settings: fakeSettings(), desktopName: 'Test' });
    await bridge.start();
    try {
      bridge.onSessionScopeChanged({
        active: true, sessionId: '/tmp/p', projectName: 'p', projectRoot: '/tmp/p',
      });
      const qr = await bridge.getPairingQR();
      expect(qr.qrPayload).toBeTruthy();
      expect(qr.expiresAt).toBeGreaterThan(Date.now());
    } finally {
      await bridge.stop();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/mobile-bridge/__tests__/mobile-bridge.test.ts`
Expected: FAIL — `onSessionScopeChanged is not a function` / `__getSnapshotForTests is not a function`.

- [ ] **Step 3: Implement on the bridge**

Edit `electron/mobile-bridge/index.ts`:

First, extend the `MobileBridge` interface (around lines 12-49) to add two new method signatures:

```ts
onSessionScopeChanged(scope:
  | { active: true; sessionId: string; projectName: string; projectRoot?: string }
  | { active: false }
): void;

/** Test-only: exposes the builder's current snapshot for assertions. */
__getSnapshotForTests(): import('../../shared/types').SessionSnapshot;
```

Next, change the `getPairingQR` method (around lines 208-241) to gate on scope:

```ts
async getPairingQR() {
  if (!snapshots.isActive()) {
    throw new Error('Open a project first to pair a phone');
  }
  stopRendezvous();
  // ... existing body unchanged
}
```

Finally, implement `onSessionScopeChanged` and `__getSnapshotForTests` at the end of the returned object (before the closing `};`), right after the existing `onPhoneChat(handler)` entry:

```ts
onSessionScopeChanged(scope) {
  snapshots.setScope(scope);
  const snap = snapshots.getSnapshot();
  // broadcastToAuthenticated already fans out to relay via onBroadcastToRelay,
  // so no manual relay loop is needed here (contrast onCharStates which uses
  // broadcastCharState that does NOT fan out to relay).
  server.broadcastToAuthenticated({ type: 'snapshot', v: 2, snapshot: snap });
  notifyChange();
},
__getSnapshotForTests() {
  return snapshots.getSnapshot();
},
```

`WsServer.broadcastToAuthenticated` is already public (see `electron/mobile-bridge/ws-server.ts:129`) — no visibility change needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/mobile-bridge.test.ts electron/mobile-bridge/__tests__/snapshot-builder.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add electron/mobile-bridge/index.ts electron/mobile-bridge/__tests__/mobile-bridge.test.ts
# Plus ws-server.ts if you had to make broadcastToAuthenticated public.
git commit -m "feat(mobile-bridge): onSessionScopeChanged + gate pairing on active scope"
```

---

## Task 4: Shared IPC — CLOSE_PROJECT channel + preload binding

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add the IPC channel constant**

Edit `shared/types/ipc.ts` — in the Projects section (around line 44-50), add:

```ts
CLOSE_PROJECT: 'office:close-project',
```

- [ ] **Step 2: Expose it on the preload facade**

Edit `electron/preload.ts` — in the Projects block (around lines 30-40), add:

```ts
closeProject: () => ipcRenderer.invoke(IPC_CHANNELS.CLOSE_PROJECT),
```

- [ ] **Step 3: Commit**

```bash
git add shared/types/ipc.ts electron/preload.ts
git commit -m "feat(ipc): add CLOSE_PROJECT channel"
```

---

## Task 5: Wire setCurrentProjectDir to emit scope changes

**Files:**
- Modify: `electron/ipc/state.ts:136-138`

**Intent:** `setCurrentProjectDir(dir | null)` is already called from OPEN_PROJECT, CREATE_PROJECT, and OPEN_DIRECTORY_AS_WORKSHOP. Hooking the scope emit there covers every open/create path with one change.

- [ ] **Step 1: Modify `setCurrentProjectDir`**

Edit `electron/ipc/state.ts` — replace the current `setCurrentProjectDir` function (lines 136-138):

```ts
export function setCurrentProjectDir(dir: string | null): void {
  currentProjectDir = dir;
  if (!mobileBridge) return;
  if (dir) {
    // `getProjectState` reads .the-office/config.json; returns a sensible
    // default if the file isn't there yet (e.g. mid-createProject before
    // the config is written). Fall back to path basename in that case.
    let projectName: string;
    try {
      projectName = projectManager.getProjectState(dir).name || path.basename(dir);
    } catch {
      projectName = path.basename(dir);
    }
    mobileBridge.onSessionScopeChanged({
      active: true,
      sessionId: dir,
      projectName,
      projectRoot: dir,
    });
  } else {
    mobileBridge.onSessionScopeChanged({ active: false });
  }
}
```

Add a `path` import at the top of the file if it's not already there:

```ts
import path from 'path';
```

- [ ] **Step 2: Sanity-check unaffected call sites**

Scan the file for other places that read `currentProjectDir` to confirm nothing relies on synchronous side-effects from the setter beyond mutating the state variable.

Run: `npx vitest run tests/` (integration suites) — these should still pass; nothing observable changes for the desktop-only paths because the bridge emit is a no-op when `mobileBridge` is null.

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/state.ts
git commit -m "feat(ipc-state): emit mobile scope change on project dir changes"
```

---

## Task 6: CLOSE_PROJECT handler

**Files:**
- Modify: `electron/ipc/project-handlers.ts`

- [ ] **Step 1: Register the handler**

Edit `electron/ipc/project-handlers.ts` — at the bottom of `initProjectHandlers()` (after the existing `SAVE_LAYOUTS` handler, just before the closing `}`), add:

```ts
ipcMain.handle(IPC_CHANNELS.CLOSE_PROJECT, async () => {
  // Intentionally does NOT call resetSessionState — if the user reopens the
  // same project, we want their desktop-side chat history, artifacts, etc.
  // to still be there. Only the mobile snapshot is reset, and that's driven
  // by setCurrentProjectDir(null) → bridge.onSessionScopeChanged({active:false}).
  setCurrentProjectDir(null);
  return { success: true };
});
```

- [ ] **Step 2: Verify nothing else was called**

Grep for `setCurrentProjectDir` across the whole repo to make sure there isn't a code path we missed:

Run: `rg "setCurrentProjectDir"` (use the Grep tool)
Expected: the 3 existing call sites inside `project-handlers.ts` + the new CLOSE_PROJECT handler + the setter definition in `state.ts`.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/project-handlers.ts
git commit -m "feat(project-handlers): handle CLOSE_PROJECT IPC"
```

---

## Task 7: Renderer OfficeView back-button wires through closeProject

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx:335-346`

- [ ] **Step 1: Update the back-button click handler**

Edit `src/renderer/src/components/OfficeView/OfficeView.tsx` — replace the click handler body (currently at line 335-346):

```tsx
onClick={async () => {
  const logText = useLogStore.getState().serializeUnflushed();
  if (logText) {
    await window.office.flushLogs(logText);
    useLogStore.getState().markFlushed();
  }
  useLogStore.getState().reset();
  useChatStore.getState().clearMessages();
  useArtifactStore.getState().reset();
  useWarTableStore.getState().reset();
  // Flip main-process scope to inactive so the mobile bridge broadcasts a
  // Lobby snapshot; the renderer transition to the picker happens after
  // the IPC acks so state is consistent when the picker mounts.
  await window.office.closeProject();
  useProjectStore.getState().setProjectState(null);
}}
```

- [ ] **Step 2: Manual verification**

This path is UI-driven; run the desktop dev server and verify the back button still works end-to-end. Type-check with:

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat(office-view): call closeProject IPC when returning to Lobby"
```

---

## Task 8: Renderer MobileSection — disable pair button in Lobby + rename copy

**Files:**
- Modify: `src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx`

- [ ] **Step 1: Update MobileSection**

Edit `src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx`:

1. Add imports at the top (alongside the existing imports, around line 1-4):

```ts
import { useProjectStore } from '../../../stores/project.store';
```

2. Inside the `MobileSection` component body (before the first `return`), read projectState:

```ts
const projectState = useProjectStore((s) => s.projectState);
const inSession = projectState !== null;
```

3. Replace the "Pair a phone" button (lines 59-64):

```tsx
{!pairing && (
  <button
    onClick={startPair}
    disabled={!inSession}
    title={!inSession ? 'Open a project first to pair a phone' : undefined}
    style={{
      background: inSession ? '#6366f1' : 'rgba(99,102,241,0.3)',
      color: '#fff',
      border: 'none',
      padding: '10px 18px',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: inSession ? 'pointer' : 'not-allowed',
    }}
  >
    Pair a phone
  </button>
)}
{!pairing && !inSession && (
  <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
    Open a project first to pair a phone.
  </div>
)}
```

4. Rename "Paired devices" → "Trusted devices" at line 80:

```tsx
}}>Trusted devices ({devices.length})</div>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx
git commit -m "feat(settings-mobile): gate pair button on active project + rename to Trusted"
```

---

## Task 9: Mobile — IdleScreen component

**Files:**
- Create: `mobile/src/session/IdleScreen.tsx`

- [ ] **Step 1: Create the component**

Create `mobile/src/session/IdleScreen.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TransportStatus } from '../transport/transport.interface';
import { colors, spacing, radius } from '../theme';

interface Props {
  desktopName: string;
  /** Current transport state — used to distinguish "desktop idle" from "desktop offline". */
  status: TransportStatus;
}

export function IdleScreen({ desktopName, status }: Props) {
  const offline = status.state !== 'connected';
  const body = offline
    ? `${desktopName} is offline.`
    : `Open a project on ${desktopName} to continue.`;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Waiting for {desktopName}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓ Trusted device</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.lg, textAlign: 'center' },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(99,102,241,0.15)',
    marginBottom: spacing.xl,
  },
  badgeText: { color: '#a5b4fc', fontSize: 13, fontWeight: '600' },
  body: { fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
});
```

Theme tokens used: `colors.bg`, `colors.text` (both exist in `mobile/src/theme/colors.ts`); `spacing.md`/`sm`/`lg`/`xl` and `radius.md` (all exist in `mobile/src/theme/spacing.ts`).

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit` (or the project's mobile-specific TS check, e.g. `npm -w mobile run type-check` if defined)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/session/IdleScreen.tsx
git commit -m "feat(mobile): add IdleScreen component"
```

---

## Task 10: Mobile — useSession exposes sessionActive

**Files:**
- Modify: `mobile/src/session/useSession.ts`
- Test: `mobile/src/__tests__/useSession.test.ts`

**Intent:** `useSession` currently owns the transport and exposes chat-send helpers. Expose a derived `sessionActive` boolean that comes from the latest snapshot. Default is `false` until a snapshot arrives.

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/__tests__/useSession.test.ts`:

```ts
it('sessionActive defaults to false until a snapshot arrives, then reflects snapshot.sessionActive', () => {
  const fake = makeFakeTransport();
  (createTransportForDevice as jest.Mock).mockReturnValue(fake);
  const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));

  expect(result.current.sessionActive).toBe(false);

  act(() => {
    fake.emitMessage({
      type: 'snapshot', v: 2,
      snapshot: {
        sessionActive: true,
        sessionId: '/tmp/p',
        desktopName: 'D',
        projectName: 'p',
        phase: 'idle',
        startedAt: 1,
        activeAgentId: null,
        characters: [],
        chatTail: [],
        sessionEnded: false,
      },
    });
  });
  expect(result.current.sessionActive).toBe(true);

  act(() => {
    fake.emitMessage({
      type: 'snapshot', v: 2,
      snapshot: {
        sessionActive: false,
        sessionId: null,
        desktopName: 'D',
        phase: 'idle',
        startedAt: 2,
        activeAgentId: null,
        characters: [],
        chatTail: [],
        sessionEnded: false,
      },
    });
  });
  expect(result.current.sessionActive).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts -t "sessionActive defaults"`
Expected: FAIL — `result.current.sessionActive` is `undefined`.

- [ ] **Step 3: Implement**

Edit `mobile/src/session/useSession.ts`:

1. Update the `UseSessionReturn` interface (around line 20-28) to add:

```ts
sessionActive: boolean;
```

2. At the top of the `useSession` function body, add a selector:

```ts
const sessionActive = useSessionStore((s) => s.snapshot?.sessionActive ?? false);
```

3. Add `sessionActive` to the returned object at the bottom:

```ts
return { status, sessionActive, draft, setDraft, sending, canSend, submit, sendChat };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/useSession.ts mobile/src/__tests__/useSession.test.ts
git commit -m "feat(mobile-useSession): expose sessionActive derived from snapshot"
```

---

## Task 11: Mobile — SessionScreen branches on sessionActive

**Files:**
- Modify: `mobile/src/session/SessionScreen.tsx`

**Intent:** When `sessionActive=false`, SessionScreen renders `IdleScreen` instead of the WebView + overlays. Unmounting the WebViewHost tree enforces the fresh-reconnect contract (no stale PixiJS state). Orientation management stays at the SessionScreen level so it applies in both modes.

- [ ] **Step 1: Update SessionScreen**

Edit `mobile/src/session/SessionScreen.tsx` — replace the whole file with:

```tsx
// mobile/src/session/SessionScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { IdleScreen } from './IdleScreen';
import { PortraitOverlays, PortraitComposer, type PortraitComposerHandle } from './PortraitLayout';
import { LandscapeLayout } from './LandscapeLayout';
import { lockOrientation, resetOrientation } from './orientation';
import { colors } from '../theme';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

type Mode = 'portrait' | 'landscape';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export function SessionScreen({ device, onPairingLost }: Props) {
  const session = useSession({ device, onPairingLost });
  const [mode, setMode] = useState<Mode>('portrait');
  const transitioningRef = useRef(false);
  const composerRef = useRef<PortraitComposerHandle>(null);
  const focusPendingRef = useRef(false);

  const changeMode = (next: Mode) => {
    if (transitioningRef.current || next === mode) return;
    transitioningRef.current = true;
    if (next === 'landscape') Keyboard.dismiss();
    if (next === 'portrait') focusPendingRef.current = true;
    setMode(next);
  };

  useEffect(() => {
    let cancelled = false;
    lockOrientation(mode).finally(() => {
      if (cancelled) return;
      transitioningRef.current = false;
      if (mode === 'portrait' && focusPendingRef.current) {
        focusPendingRef.current = false;
        requestAnimationFrame(() => composerRef.current?.focusInput());
      }
    });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => () => { resetOrientation().catch(() => {}); }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') lockOrientation(mode).catch(() => {});
    });
    return () => sub.remove();
  }, [mode]);

  // Lobby / idle: the bridge told us the desktop is not in a session. Unmount
  // the entire WebView + overlay tree so the next `sessionActive=true` hydrates
  // from scratch. Transport stays connected (useSession is still mounted)
  // so we receive the next snapshot without reconnecting.
  if (!session.sessionActive) {
    return (
      <IdleScreen
        desktopName={device.desktopName}
        status={session.status}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.canvasArea}>
        <WebViewHost onPhoneAnswer={session.sendChat} />
        {mode === 'portrait'
          ? <PortraitOverlays status={session.status} onExpand={() => changeMode('landscape')} />
          : <LandscapeLayout status={session.status} onOpenChat={() => changeMode('portrait')} />}
      </View>
      {mode === 'portrait' && <PortraitComposer ref={composerRef} session={session} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, flexDirection: 'column' },
  // flex:1 so the canvas area takes all remaining vertical space after the
  // composer (portrait) or all of it (landscape).
  canvasArea: { flex: 1, position: 'relative' },
});
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/session/SessionScreen.tsx
git commit -m "feat(mobile-session): branch to IdleScreen when sessionActive=false"
```

---

## Task 12: End-to-end validation

**Files:** None — manual QA.

- [ ] **Step 1: Run the full test suite**

Run: `npm test` (or `npx vitest run` + `cd mobile && npx jest`)
Expected: all existing and new tests pass.

- [ ] **Step 2: Run the desktop dev app**

Run: `npm run dev`

Walk through:
1. Launch → Lobby. Open Settings → Mobile. "Pair a phone" button is disabled with tooltip "Open a project first to pair a phone."
2. Open a recent project → Office view. Open Settings → Mobile. Button is enabled. Click it. QR is generated.
3. Cancel QR. Click back arrow (top-left of OfficeView) → Lobby. Button is disabled again.

- [ ] **Step 3: Run the mobile app against the dev desktop**

Run: `cd mobile && npx expo start`

Walk through (requires the desktop dev app running + a device already paired, or complete a fresh QR scan from inside a project as in Step 2 above):
1. With desktop in Office view → phone shows live session (WebView canvas + chat).
2. Click back arrow on desktop to return to Lobby → phone transitions to IdleScreen ("Waiting for [Desktop Name]" + "✓ Trusted device").
3. Re-enter the same project on desktop → phone re-mounts the WebView with a fresh empty chat tail and live state.
4. Switch to a different project on desktop → phone briefly shows Idle, then re-mounts WebView for the new project.
5. Kill the desktop app → phone IdleScreen copy switches to "[Desktop Name] is offline."

- [ ] **Step 4: Commit once the QA notes are captured**

Nothing to commit unless QA surfaced a bug; in that case, fix it and add a regression test before merging.

---

## Spec Coverage Checklist

| Spec requirement | Task(s) |
|---|---|
| `sessionActive`/`sessionId: string \| null`/`projectName`/`projectRoot` on `SessionSnapshot` | 1 |
| `SnapshotBuilder.setScope()` clears volatile state + applies new scope | 2 |
| `MobileBridge.onSessionScopeChanged()` method | 3 |
| Bridge broadcasts fresh snapshot on scope change | 3 |
| `getPairingQR()` gated by scope | 3 |
| Main process emits scope on project open/close | 5, 6 |
| CLOSE_PROJECT IPC channel + handler | 4, 6 |
| Renderer back-button triggers CLOSE_PROJECT | 7 |
| Renderer disables Pair button in Lobby | 8 |
| "Paired Devices" → "Trusted Devices" rename | 8 |
| Mobile IdleScreen component | 9 |
| Mobile `useSession.sessionActive` selector | 10 |
| Mobile SessionScreen branches on sessionActive | 11 |
| Transport stays up across idle↔live transitions | 11 (useSession mount lives above the branch) |
| WebViewHost unmounts on idle (fresh reconnect) | 11 |
| No migration action required | Implicit: DeviceStore + secure-store schemas unchanged |
| Defensive: `sessionActive=false` is authoritative regardless of `sessionId` | 11 (branch uses only `sessionActive`) |
| Transport disconnect vs. Lobby: idle only on `sessionActive=false` | 11 (branch is orthogonal to `session.status`) |
| Bridge still clears tail/runs/waiting on Lobby even for v1 devices | 2 (always clears; fields arrive for all clients) |
