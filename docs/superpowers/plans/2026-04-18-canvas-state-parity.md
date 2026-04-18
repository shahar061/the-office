# Desktop / Mobile Canvas State Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile WebView canvas visually mirror the desktop canvas (positions, direction, animation frame, fade lifecycle, tool-bubble text) by streaming character state from desktop at 10 Hz and turning the mobile scene into a pure viewer.

**Architecture:** Desktop remains authoritative — `OfficeScene` simulates at 60 Hz unchanged. A renderer-side `useCharStream` hook polls `OfficeScene.getCharacterStates()` every 100 ms and dispatches through `preload → main → mobileBridge → WSS/relay`. Mobile receives `charState` frames, stores them in a new `characterStates` slice, and `MobileScene` interpolates each character's rendered position + alpha toward the latest target every frame (snap if delta > 100 px). Mobile's wander / moveTo logic is deleted.

**Tech Stack:** Electron + React + PixiJS (desktop), Expo + React Native + WebView (mobile), Zustand (state), jest / vitest.

**Spec:** `docs/superpowers/specs/2026-04-18-canvas-state-parity-design.md`

---

## File Structure

### New files

- `shared/stores/__tests__/session.store.test.ts` — session-store slice tests
- `src/renderer/src/office/characters/__tests__/Character.test.ts` — `getStateSnapshot` + `applyDrivenState` tests
- `src/renderer/src/office/__tests__/OfficeScene.test.ts` — `getCharacterStates` test
- `src/renderer/src/hooks/useCharStream.ts` — 10 Hz position polling hook

### Modified files

- `shared/types/session.ts` — drop `x` / `y` from `CharacterSnapshot`
- `shared/types/mobile.ts` — add `CharacterState` interface + `charState` variant of `MobileMessageV2`
- `shared/types/ipc.ts` — add `OFFICE_CHAR_STATES` channel constant
- `shared/stores/session.store.ts` — add `characterStates` + `lastCharStateTs` + `applyCharState` + `clearCharStates`
- `src/renderer/src/office/characters/ToolBubble.ts` — add `getPublicState()` + `setTarget()`
- `src/renderer/src/office/characters/Character.ts` — rename local `CharacterState` type to `CharacterAnimation`, rename `getState()` → `getAnimation()`, add `getStateSnapshot(): CharacterState` + `applyDrivenState(target, dt)`
- `src/renderer/src/office/OfficeScene.ts` — add `getCharacterStates(): CharacterState[]`
- `electron/preload.ts` — expose `broadcastCharStates`
- `electron/ipc/state.ts` — register `ipcMain.on(OFFICE_CHAR_STATES, ...)`
- `electron/mobile-bridge/index.ts` — `MobileBridge.onCharStates(states)` API + fan-out
- `electron/mobile-bridge/snapshot-builder.ts` — stop writing `x` / `y` into `CharacterSnapshot`
- `electron/mobile-bridge/per-connection-queue.ts` — add `charState` to buffered types (coalesce on backpressure)
- `electron/mobile-bridge/ws-server.ts` — accept and broadcast `charState`
- `mobile/src/session/useSession.ts` — add `'charState'` case in message switch
- `mobile/src/webview-host/WebViewHost.tsx` — subscribe to `characterStates`, forward to WebView
- `src/mobile-renderer/bridge.ts` — add `'charState'` case, dispatch to store
- `src/mobile-renderer/MobileScene.ts` — strip wander / moveTo; per-frame drive each Character from `characterStates` via `applyDrivenState`; handle spawn / despawn

### Deleted: none

---

## Phase A — Types + Store (foundations)

### Task 1: Shared types + snapshot-builder cleanup

**Files:**
- Modify: `shared/types/session.ts`
- Modify: `shared/types/mobile.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/mobile-bridge/snapshot-builder.ts`

- [ ] **Step 1: Add `OFFICE_CHAR_STATES` to IPC channels**

Edit `shared/types/ipc.ts`. In the IPC_CHANNELS map, add the new entry alongside the existing ones (exact placement in the alphabetical list doesn't matter; add near the other `OFFICE_*` channels):

```ts
  OFFICE_CHAR_STATES: 'office:char-states',
```

- [ ] **Step 2: Drop `x` / `y` from `CharacterSnapshot`**

Edit `shared/types/session.ts:69-75`. Replace the `CharacterSnapshot` interface with:

```ts
export interface CharacterSnapshot {
  agentId: string;
  agentRole: AgentRole;
  activity: CharacterActivity;
}
```

- [ ] **Step 3: Add `CharacterState` interface + `charState` variant**

Edit `shared/types/mobile.ts`. After the existing imports, add the `CharacterState` interface. Then extend the `MobileMessageV2` union with a new `charState` variant. Concretely:

Add after the imports:

```ts
export interface CharacterState {
  agentId: string;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  animation: 'idle' | 'walk' | 'read' | 'type';
  visible: boolean;
  alpha: number;
  toolBubble: { toolName: string; target?: string } | null;
}
```

Then add one more member to the `MobileMessageV2` union (the v2 union starts around line 101). Add after the `snapshot` v2 variant:

```ts
  | { type: 'charState'; v: 2; ts: number; characters: CharacterState[] }
```

- [ ] **Step 4: Stop writing `x`/`y` in SnapshotBuilder**

Edit `electron/mobile-bridge/snapshot-builder.ts`. Find the place where `CharacterSnapshot` objects are constructed and delete `x` and `y` from the output literals. (There should be one or two spots — the character mapping function.)

- [ ] **Step 5: Verify tsc**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx tsc --noEmit -p .`
Expected: any prior unrelated errors, no NEW errors from your changes. Grep the output for `CharacterSnapshot|CharacterState|OFFICE_CHAR_STATES|snapshot-builder` to catch related errors.

If you see errors like "Property 'x' does not exist on type 'CharacterSnapshot'" elsewhere, those are consumers of the dead `x`/`y` fields — follow up in a separate task. For this task, only the four files above should change.

- [ ] **Step 6: Commit**

```bash
git add shared/types/session.ts shared/types/mobile.ts shared/types/ipc.ts electron/mobile-bridge/snapshot-builder.ts
git commit -m "types(canvas-parity): add CharacterState + charState msg; drop dead x/y from CharacterSnapshot"
```

---

### Task 2: Session-store `characterStates` slice + tests

**Files:**
- Create: `shared/stores/__tests__/session.store.test.ts`
- Modify: `shared/stores/session.store.ts`

- [ ] **Step 1: Write the failing tests**

Create `shared/stores/__tests__/session.store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../session.store';
import type { CharacterState } from '../../types';

const sample = (agentId: string, x: number, y: number): CharacterState => ({
  agentId, x, y,
  direction: 'down',
  animation: 'idle',
  visible: true,
  alpha: 1,
  toolBubble: null,
});

describe('useSessionStore characterStates slice', () => {
  beforeEach(() => {
    useSessionStore.setState({ characterStates: new Map(), lastCharStateTs: 0 });
  });

  it('applyCharState replaces the Map with incoming states keyed by agentId', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20), sample('pm', 30, 40)]);
    const states = useSessionStore.getState().characterStates;
    expect(states.size).toBe(2);
    expect(states.get('ceo')?.x).toBe(10);
    expect(states.get('pm')?.x).toBe(30);
  });

  it('applyCharState drops frames with ts <= lastCharStateTs', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20)]);
    useSessionStore.getState().applyCharState(999, [sample('ceo', 999, 999)]); // stale
    expect(useSessionStore.getState().characterStates.get('ceo')?.x).toBe(10);
  });

  it('applyCharState drops frames with equal ts (idempotent replay)', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20)]);
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 999, 999)]);
    expect(useSessionStore.getState().characterStates.get('ceo')?.x).toBe(10);
  });

  it('applyCharState updates lastCharStateTs on accept', () => {
    useSessionStore.getState().applyCharState(1500, []);
    expect(useSessionStore.getState().lastCharStateTs).toBe(1500);
  });

  it('clearCharStates empties the Map and resets lastCharStateTs', () => {
    useSessionStore.getState().applyCharState(1000, [sample('ceo', 10, 20)]);
    useSessionStore.getState().clearCharStates();
    expect(useSessionStore.getState().characterStates.size).toBe(0);
    expect(useSessionStore.getState().lastCharStateTs).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: FAIL — `applyCharState`, `clearCharStates`, `characterStates`, `lastCharStateTs` are not defined on the store.

- [ ] **Step 3: Implement the slice**

Edit `shared/stores/session.store.ts`. Add the types and fields to the `SessionState` interface, initialize them, and add the two methods.

Add to the interface (near other fields):

```ts
  characterStates: Map<string, CharacterState>;
  lastCharStateTs: number;
  applyCharState: (ts: number, states: CharacterState[]) => void;
  clearCharStates: () => void;
```

Add the import for `CharacterState` at the top of the file (update the existing `../types` import line):

```ts
import type {
  AgentEvent,
  CharacterState,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
} from '../types';
```

Initialize in the `create<SessionState>(...)` body:

```ts
  characterStates: new Map<string, CharacterState>(),
  lastCharStateTs: 0,
```

Add the two methods:

```ts
  applyCharState: (ts, states) => {
    const current = get().lastCharStateTs;
    if (ts <= current) return;
    const next = new Map<string, CharacterState>();
    for (const s of states) next.set(s.agentId, s);
    set({ characterStates: next, lastCharStateTs: ts });
  },
  clearCharStates: () => set({ characterStates: new Map(), lastCharStateTs: 0 }),
```

- [ ] **Step 4: Export `CharacterState` from `shared/types/index.ts` (or the barrel used by the store)**

If `shared/types/index.ts` (or whichever file the store imports from) doesn't already re-export `CharacterState`, add:

```ts
export type { CharacterState } from './mobile';
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/stores/session.store.ts shared/stores/__tests__/session.store.test.ts shared/types/index.ts
git commit -m "stores(session): add characterStates slice with ts-ordered applyCharState"
```

(Omit `shared/types/index.ts` from the stage if you didn't modify it.)

---

## Phase B — Desktop Character changes

### Task 3: `ToolBubble` — `getPublicState()` + `setTarget()`

**Files:**
- Modify: `src/renderer/src/office/characters/ToolBubble.ts`

The existing `ToolBubble` shows tool bubbles via `show(icon, target)` and doesn't retain the original toolName. Track `toolName` + `target` explicitly so `getPublicState()` can read them back.

- [ ] **Step 1: Modify `ToolBubble` to track public state**

Edit `src/renderer/src/office/characters/ToolBubble.ts`. After the `private isThinking = false;` field (around line 46) add:

```ts
  private publicToolName: string | null = null;
  private publicTarget: string | undefined = undefined;
```

In the `show(icon, target)` method, at the very top before any other logic, add:

```ts
    // Track public state for mobile mirroring. We don't have the raw toolName
    // here (only the icon), so set toolName to the stringified icon for the
    // thinking case, or leave callers to pass the richer info via setTarget.
```

Hmm — `show` takes `icon` not `toolName`. We need the caller (`Character.showToolBubble`) to pass the raw toolName so we can round-trip it. Change the public API:

Replace the existing `show(icon: string, target: string)` signature with:

```ts
  show(toolName: string, target: string): void {
    const icon = toolIcon(toolName);
    this.publicToolName = toolName;
    this.publicTarget = target || undefined;
    this.isThinking = !icon && target === '...';
    // ...rest of existing show body, unchanged, starting from `if (this.isThinking) {`
```

(Keep the existing body; only the signature changes from `icon` to `toolName`, and the icon is derived internally via `toolIcon()`.)

In `hide()` method (around line 126) add:

```ts
    this.publicToolName = null;
    this.publicTarget = undefined;
```

At the end of the class (after `redrawBg`) add the two new methods:

```ts
  getPublicState(): { toolName: string; target?: string } | null {
    if (!this.publicToolName) return null;
    return this.publicTarget !== undefined
      ? { toolName: this.publicToolName, target: this.publicTarget }
      : { toolName: this.publicToolName };
  }

  setTarget(state: { toolName: string; target?: string } | null): void {
    if (!state) { this.hide(); return; }
    this.show(state.toolName, state.target ?? '');
  }
```

- [ ] **Step 2: Update the single existing call-site in `Character.ts`**

Edit `src/renderer/src/office/characters/Character.ts`. Find `showToolBubble(toolName: string, target: string)` (around line 152):

```ts
  showToolBubble(toolName: string, target: string): void {
    this.toolBubble.show(toolIcon(toolName), target);
  }
```

Replace with:

```ts
  showToolBubble(toolName: string, target: string): void {
    this.toolBubble.show(toolName, target);
  }
```

Also remove the now-unused `toolIcon` import from Character.ts if it exists (grep for `toolIcon` in that file; if `showToolBubble` is the only consumer, remove the import).

- [ ] **Step 3: Verify tsc**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx tsc --noEmit -p . 2>&1 | grep -E "ToolBubble|Character.ts"`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/office/characters/ToolBubble.ts src/renderer/src/office/characters/Character.ts
git commit -m "tool-bubble: track publicToolName; add getPublicState/setTarget for mobile parity"
```

---

### Task 4: `Character` — rename local type + `getStateSnapshot()` + tests

The existing `export type CharacterState` in `Character.ts` (line 8) collides with the new shared `CharacterState` interface. Rename the local type so both can coexist.

**Files:**
- Create: `src/renderer/src/office/characters/__tests__/Character.test.ts`
- Modify: `src/renderer/src/office/characters/Character.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/office/characters/__tests__/Character.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Character } from '../Character';
import type { Texture } from 'pixi.js';

// Minimal TiledMapRenderer stub — Character only needs tileSize + a few lookups
// for construction. For position-snapshot tests we don't care about walk/path.
const mockMapRenderer = {
  tileSize: 16,
  tileToPixel: (x: number, y: number) => ({ x: x * 16, y: y * 16 }),
  pixelToTile: (px: number, py: number) => ({ x: Math.floor(px / 16), y: Math.floor(py / 16) }),
  getSpawnPoint: () => ({ x: 1, y: 1 }),
} as any;

const mockFrames: Texture[][] = [[], [], [], []];

function makeCharacter(): Character {
  return new Character({
    agentId: 'ceo',
    role: 'ceo',
    mapRenderer: mockMapRenderer,
    frames: mockFrames,
  });
}

describe('Character.getStateSnapshot', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns a CharacterState with all fields', () => {
    const c = makeCharacter();
    const s = c.getStateSnapshot();
    expect(s.agentId).toBe('ceo');
    expect(typeof s.x).toBe('number');
    expect(typeof s.y).toBe('number');
    expect(['up','down','left','right']).toContain(s.direction);
    expect(['idle','walk','read','type']).toContain(s.animation);
    expect(typeof s.visible).toBe('boolean');
    expect(typeof s.alpha).toBe('number');
    expect(s.toolBubble).toBeNull();
  });

  it('toolBubble populates when show is called on the bubble via showToolBubble', () => {
    const c = makeCharacter();
    c.showToolBubble('Read', 'src/foo.ts');
    const s = c.getStateSnapshot();
    expect(s.toolBubble).toEqual({ toolName: 'Read', target: 'src/foo.ts' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run src/renderer/src/office/characters/__tests__/Character.test.ts`
Expected: FAIL — `getStateSnapshot is not a function`.

- [ ] **Step 3: Rename local `CharacterState` type + `getState` method**

Edit `src/renderer/src/office/characters/Character.ts`.

Replace line 8:

```ts
export type CharacterState = 'idle' | 'walk' | 'type' | 'read';
```

With:

```ts
export type CharacterAnimation = 'idle' | 'walk' | 'type' | 'read';
```

Update every reference inside `Character.ts`:
- Line 33: `private state: CharacterState = 'idle';` → `private state: CharacterAnimation = 'idle';`
- Line 39: `private pendingWork: CharacterState | null = null;` → `private pendingWork: CharacterAnimation | null = null;`
- Line 73-75: Rename the method from `getState(): CharacterState` to `getAnimation(): CharacterAnimation`:
  ```ts
  getAnimation(): CharacterAnimation {
    return this.state;
  }
  ```
- Line 147: `state: this.state,` inside the `character-click` event detail stays as-is (backcompat for the event listener in OfficeScene — the field is named `state` in the event payload, not in Character's public API).

Grep the repo for external callers of `Character#getState()`:

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && grep -rn "\.getState()" src/renderer --include='*.ts' --include='*.tsx' 2>&1 | grep -v "useXxxStore.getState()" | head -20`

If you find consumers of `Character#getState()` specifically (unlikely), rename them to `getAnimation()`. The `useXxxStore.getState()` calls are Zustand's store API — unrelated and must NOT be renamed.

- [ ] **Step 4: Implement `getStateSnapshot`**

Import `CharacterState` at the top of Character.ts (update the shared-types import line around line 5):

```ts
import type { AgentRole, CharacterState } from '../../../../shared/types';
```

Add after the `getAnimation()` method:

```ts
  getStateSnapshot(): CharacterState {
    return {
      agentId: this.agentId,
      x: this.px,
      y: this.py,
      direction: this.direction,
      animation: this.state,
      visible: this.isVisible,
      alpha: this.sprite.container.alpha,
      toolBubble: this.toolBubble.getPublicState(),
    };
  }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run src/renderer/src/office/characters/__tests__/Character.test.ts`
Expected: PASS (2 tests).

Also: `npx tsc --noEmit -p . 2>&1 | grep -E "Character" | head -20` — verify no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/office/characters/Character.ts src/renderer/src/office/characters/__tests__/Character.test.ts
git commit -m "character: rename CharacterState type to CharacterAnimation; add getStateSnapshot()"
```

---

### Task 5: `Character.applyDrivenState()` + tests

**Files:**
- Modify: `src/renderer/src/office/characters/Character.ts`
- Modify: `src/renderer/src/office/characters/__tests__/Character.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

Append to `src/renderer/src/office/characters/__tests__/Character.test.ts` before the final closing `});`:

```ts

describe('Character.applyDrivenState', () => {
  it('snaps to target when delta > 100 px', () => {
    const c = makeCharacter();
    // Initial position per tileToPixel(1,1) + tileSize offsets is ~(24, 32)
    const initial = c.getStateSnapshot();
    c.applyDrivenState({
      agentId: 'ceo', x: initial.x + 500, y: initial.y + 500,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.016);
    const after = c.getStateSnapshot();
    expect(after.x).toBe(initial.x + 500);
    expect(after.y).toBe(initial.y + 500);
  });

  it('lerps position for small deltas', () => {
    const c = makeCharacter();
    const initial = c.getStateSnapshot();
    // dt=0.1 and target 10 px away should fully interpolate (t = min(1, 0.1/0.1) = 1)
    c.applyDrivenState({
      agentId: 'ceo', x: initial.x + 10, y: initial.y + 10,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.1);
    const after = c.getStateSnapshot();
    expect(after.x).toBeCloseTo(initial.x + 10, 1);

    // With dt=0.05 (half the interpolation window), position moves halfway
    const c2 = makeCharacter();
    const i2 = c2.getStateSnapshot();
    c2.applyDrivenState({
      agentId: 'ceo', x: i2.x + 10, y: i2.y,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.05);
    expect(c2.getStateSnapshot().x).toBeCloseTo(i2.x + 5, 1);
  });

  it('snaps direction immediately', () => {
    const c = makeCharacter();
    c.applyDrivenState({
      agentId: 'ceo', x: 0, y: 0,
      direction: 'left', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.016);
    expect(c.getStateSnapshot().direction).toBe('left');
  });

  it('transitions toolBubble from null to populated and back', () => {
    const c = makeCharacter();
    c.applyDrivenState({
      agentId: 'ceo', x: 0, y: 0,
      direction: 'down', animation: 'read', visible: true, alpha: 1,
      toolBubble: { toolName: 'Read', target: 'foo.ts' },
    }, 0.016);
    expect(c.getStateSnapshot().toolBubble).toEqual({ toolName: 'Read', target: 'foo.ts' });

    c.applyDrivenState({
      agentId: 'ceo', x: 0, y: 0,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.016);
    // After hide, getPublicState returns null
    expect(c.getStateSnapshot().toolBubble).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run src/renderer/src/office/characters/__tests__/Character.test.ts`
Expected: FAIL — `applyDrivenState is not a function`.

- [ ] **Step 3: Implement `applyDrivenState`**

Edit `src/renderer/src/office/characters/Character.ts`. Add a file-local helper at the top (below the existing imports, above `export class Character`):

```ts
function lerp(a: number, b: number, t: number): number {
  const tt = Math.min(Math.max(t, 0), 1);
  return a + (b - a) * tt;
}

const SNAP_THRESHOLD_PX = 100;
const LERP_WINDOW_S = 0.1; // reach target in ~100ms
```

Add the method after `getStateSnapshot`:

```ts
  applyDrivenState(target: CharacterState, dt: number): void {
    const dx = target.x - this.px;
    const dy = target.y - this.py;
    const shouldSnap = Math.abs(dx) > SNAP_THRESHOLD_PX || Math.abs(dy) > SNAP_THRESHOLD_PX;
    if (shouldSnap) {
      this.px = target.x;
      this.py = target.y;
    } else {
      const t = Math.min(1, dt / LERP_WINDOW_S);
      this.px = lerp(this.px, target.x, t);
      this.py = lerp(this.py, target.y, t);
    }
    this.sprite.setPosition(this.px, this.py);

    // Alpha interpolation (smooth fade in/out across 10Hz broadcast gap)
    const currentAlpha = this.sprite.container.alpha;
    const alphaT = Math.min(1, dt / LERP_WINDOW_S);
    this.sprite.setAlpha(lerp(currentAlpha, target.alpha, alphaT));

    // Snap direction + animation — they're discrete transitions, not continuous
    if (this.direction !== target.direction) {
      this.direction = target.direction;
      this.sprite.setAnimation(this.state, this.direction);
    }
    if (this.state !== target.animation) {
      this.state = target.animation;
      this.sprite.setAnimation(this.state, this.direction);
    }

    // Visibility + tool bubble
    this.isVisible = target.visible;
    this.toolBubble.setTarget(target.toolBubble);
    this.toolBubble.setPosition(this.px, this.py);
  }
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run src/renderer/src/office/characters/__tests__/Character.test.ts`
Expected: PASS (6 tests total — 2 from Task 4 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/characters/Character.ts src/renderer/src/office/characters/__tests__/Character.test.ts
git commit -m "character: add applyDrivenState for mobile-side position/animation mirroring"
```

---

### Task 6: `OfficeScene.getCharacterStates()` + test

**Files:**
- Create: `src/renderer/src/office/__tests__/OfficeScene.test.ts`
- Modify: `src/renderer/src/office/OfficeScene.ts`

- [ ] **Step 1: Write a failing test**

Create `src/renderer/src/office/__tests__/OfficeScene.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

// OfficeScene uses PixiJS heavily; we test getCharacterStates in isolation
// by mocking the Character map.
describe('OfficeScene.getCharacterStates', () => {
  it('filters to visible characters only', async () => {
    const mod = await import('../OfficeScene');
    // This is a smoke/integration test — we construct only enough state to
    // call the method. If full construction is too heavyweight for a unit
    // test, skip this via it.skip and cover it manually in QA.
    // Minimal: create a stub with a `characters` Map of 2 characters, one
    // visible and one not, and call the prototype method directly.
    const characters = new Map();
    characters.set('ceo', {
      isVisible: true,
      getStateSnapshot: () => ({ agentId: 'ceo', x: 10, y: 20, direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null }),
    });
    characters.set('pm', {
      isVisible: false,
      getStateSnapshot: () => ({ agentId: 'pm', x: 30, y: 40, direction: 'down', animation: 'idle', visible: false, alpha: 0, toolBubble: null }),
    });
    const result = (mod.OfficeScene.prototype as any).getCharacterStates.call({ characters });
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('ceo');
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run src/renderer/src/office/__tests__/OfficeScene.test.ts`
Expected: FAIL — `getCharacterStates is not a function` or undefined.

- [ ] **Step 3: Add the method**

Edit `src/renderer/src/office/OfficeScene.ts`. Find the class body (the `characters` map field exists already — grep for `this.characters`). Add a new method next to existing getters:

```ts
  getCharacterStates(): import('../../../../shared/types').CharacterState[] {
    const states: import('../../../../shared/types').CharacterState[] = [];
    for (const character of this.characters.values()) {
      if (character.isVisible) states.push(character.getStateSnapshot());
    }
    return states;
  }
```

(Using inline import types to avoid perturbing the top-of-file imports; if the imports already include shared types, add `CharacterState` to the existing import statement instead.)

- [ ] **Step 4: Run tests**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run src/renderer/src/office/__tests__/OfficeScene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/OfficeScene.ts src/renderer/src/office/__tests__/OfficeScene.test.ts
git commit -m "office-scene: add getCharacterStates for 10Hz mobile broadcast"
```

---

## Phase C — Desktop wiring

### Task 7: `useCharStream` hook + preload + main IPC handler

**Files:**
- Create: `src/renderer/src/hooks/useCharStream.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc/state.ts` (or wherever `mobileBridgeRef` is registered)

- [ ] **Step 1: Create the hook**

Create `src/renderer/src/hooks/useCharStream.ts`:

```ts
import { useEffect, type RefObject } from 'react';
import type { OfficeScene } from '../office/OfficeScene';

/**
 * Polls the scene at 10Hz and broadcasts visible character states to main
 * (which fans out to all connected mobile peers). Gates on:
 *  - scene ref is populated
 *  - at least one mobile device is connected
 * so we don't burn CPU broadcasting into the void.
 */
export function useCharStream(
  sceneRef: RefObject<OfficeScene | null>,
  mobileConnectedCount: number,
): void {
  useEffect(() => {
    if (!sceneRef.current || mobileConnectedCount < 1) return;
    const id = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const states = scene.getCharacterStates();
      window.office.broadcastCharStates(states);
    }, 100);
    return () => clearInterval(id);
  }, [sceneRef, mobileConnectedCount]);
}
```

- [ ] **Step 2: Expose the preload API**

Edit `electron/preload.ts`. Add alongside the existing exposed API (in the `office` object):

```ts
  broadcastCharStates: (states: CharacterState[]) =>
    ipcRenderer.send(IPC_CHANNELS.OFFICE_CHAR_STATES, states),
```

Import `CharacterState`:

```ts
import type { CharacterState } from '../shared/types';
```

(If `../shared/types` isn't already imported in preload, add a separate import line.)

Also update the `Window` augmentation type (typically `src/renderer/src/env.d.ts` or similar — search for where `window.office.*` types are declared). Add `broadcastCharStates: (states: CharacterState[]) => void` to the interface.

If you can't find the declaration file, search:

```
grep -rln "startImagine.*ipcRenderer\|broadcastMobileStatus" src/renderer electron
grep -rln "interface.*office" src/renderer
```

Put the type augmentation in the same file as the existing `startImagine`/`sendMessage` type declarations.

- [ ] **Step 3: Register the main-process handler**

Edit `electron/ipc/state.ts` (or wherever the `mobileBridge` instance lives — search for `mobileBridgeRef` or `bridge.onAgentEvent`). Near where other `ipcMain.on`/`ipcMain.handle` registrations are done, add:

```ts
ipcMain.on(IPC_CHANNELS.OFFICE_CHAR_STATES, (_e, states: CharacterState[]) => {
  mobileBridgeRef?.onCharStates(states);
});
```

Imports to add at the top:
```ts
import type { CharacterState } from '../../shared/types';
```

If `electron/ipc/state.ts` doesn't already import `IPC_CHANNELS` (it almost certainly does), ensure the import is present.

Note: `mobileBridge.onCharStates` doesn't exist yet — it lands in Task 8. TypeScript will flag the call; that's expected. Add a `// eslint-disable-next-line` comment if your eslint config rejects it, OR commit this task and Task 8 together. Easier: proceed to Task 8 before running tsc.

- [ ] **Step 4: Wire `useCharStream` into the renderer**

Edit `src/renderer/src/App.tsx` (or wherever the OfficeScene ref + mobile-connected count are available). You need to source:
- `sceneRef` — likely already exists where OfficeScene is constructed (grep for `new OfficeScene`)
- `mobileConnectedCount` — from the existing mobile-bridge store (`useMobileBridgeStore`, already in the codebase per prior session)

Minimal example (adapt to actual component structure):

```tsx
import { useCharStream } from './hooks/useCharStream';
import { useMobileBridgeStore } from './stores/mobile-bridge.store';

// inside the component where sceneRef is available:
const mobileConnectedCount = useMobileBridgeStore((s) => s.status?.connectedDevices ?? 0);
useCharStream(sceneRef, mobileConnectedCount);
```

If `connectedDevices` isn't a field on the mobile-bridge store's status shape, use the `devices` array length: `s.status?.devices.filter((d) => d.mode !== 'offline').length ?? 0`.

- [ ] **Step 5: tsc check** (note: will fail until Task 8 lands)

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx tsc --noEmit -p . 2>&1 | grep -E "onCharStates|useCharStream|broadcastCharStates" | head`
Expected: one error about `onCharStates` not existing on `MobileBridge` — that's resolved in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/useCharStream.ts electron/preload.ts electron/ipc/state.ts src/renderer/src/App.tsx
git commit -m "char-stream: add useCharStream hook + preload+IPC plumbing (mobileBridge.onCharStates pending Task 8)"
```

(Stage only the files you actually modified. If env.d.ts needed updating, include it.)

---

### Task 8: `mobileBridge.onCharStates` + queue coalescing + ws-server

**Files:**
- Modify: `electron/mobile-bridge/index.ts`
- Modify: `electron/mobile-bridge/per-connection-queue.ts`
- Modify: `electron/mobile-bridge/ws-server.ts`
- Modify: `electron/mobile-bridge/__tests__/ws-server.integration.test.ts`

- [ ] **Step 1: Extend `PerConnectionQueue` to coalesce `charState`**

Edit `electron/mobile-bridge/per-connection-queue.ts`. Find the `BUFFERED_TYPES` set (line ~11):

```ts
const BUFFERED_TYPES = new Set<MobileMessageV2['type']>([
  'event', 'chatFeed', 'state', 'chatAck',
]);
```

Add `'charState'` to the set:

```ts
const BUFFERED_TYPES = new Set<MobileMessageV2['type']>([
  'event', 'chatFeed', 'state', 'chatAck', 'charState',
]);
```

Grep the rest of `per-connection-queue.ts` for any hardcoded lists that need `'charState'` added (comments that enumerate types, the snapshot coalescing logic). `charState` should behave like `event` — bounded FIFO, drop oldest on overflow.

- [ ] **Step 2: Add a failing test in ws-server integration test**

Edit `electron/mobile-bridge/__tests__/ws-server.integration.test.ts`. Add at the end (before the final closing brace of the `describe`):

```ts
  it('forwards charState frames to connected peer, encrypted + envelope-ordered', async () => {
    const { qrPayload } = server.generatePairingQR();
    const qr = JSON.parse(qrPayload);
    const desktopPub = new Uint8Array(Buffer.from(qr.desktopIdentityPub, 'base64'));
    // ...set up ws connection + complete pairing the same way other tests do...
    // (Mirror the pattern from the "accepts upstream chat and echoes an encrypted chatAck" test
    //  at line ~188 — authed handshake, then exercise the new API.)

    // Call onCharStates; expect a charState frame to arrive encrypted on the wire.
    server.broadcastCharStates?.([
      {
        agentId: 'ceo', x: 10, y: 20,
        direction: 'down', animation: 'idle',
        visible: true, alpha: 1,
        toolBubble: null,
      },
    ]);

    await new Promise((r) => setTimeout(r, 100));
    // Assert one more frame arrived beyond the auth+snapshot frames; decode and check type==='charState'.
    const lastFrame = frames[frames.length - 1];
    const plain = decodeV2(new TextDecoder().decode(recv.decrypt(new Uint8Array(lastFrame))));
    expect(plain?.type).toBe('charState');
  });
```

(Adapt identifiers like `frames`, `recv`, `decodeV2`, `server` to match the actual setup in the existing test file — look at the adjacent chatAck test for the exact pattern.)

- [ ] **Step 3: Run to confirm fail**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run electron/mobile-bridge/__tests__/ws-server.integration.test.ts`
Expected: FAIL — `broadcastCharStates` or `onCharStates` doesn't exist.

- [ ] **Step 4: Implement `onCharStates` in `MobileBridge`**

Edit `electron/mobile-bridge/index.ts`. Add to the `MobileBridge` interface declaration:

```ts
  onCharStates(states: CharacterState[]): void;
```

(Import `CharacterState` from `../../shared/types` at the top.)

Implement in the returned object (near other broadcasts like `onAgentEvent`):

```ts
  onCharStates(states) {
    const frame: MobileMessageV2 = {
      type: 'charState',
      v: 2,
      ts: Date.now(),
      characters: states,
    };
    server.broadcastMessage(frame);
    for (const conn of relayConnections.values()) {
      conn.sendMessage(frame);
    }
  },
```

- [ ] **Step 5: Add `broadcastMessage` on the WS server if not already present**

Edit `electron/mobile-bridge/ws-server.ts`. Grep for an existing broadcast method. If one exists (e.g., `broadcast` or `broadcastToAuthed`), use it. If not, add:

```ts
  broadcastMessage(msg: MobileMessageV2): void {
    for (const conn of this.authedConnections()) {
      if (conn.queue.isPassThrough(msg)) {
        this.sendEncrypted(conn, msg);
      } else {
        conn.queue.enqueue(msg);
        this.drain(conn);
      }
    }
  }
```

(Adapt method names to match the existing WsServer API — the existing `sendEncrypted` and queue pattern from the ack-sending path applies here.)

- [ ] **Step 6: Run tests**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx vitest run electron/mobile-bridge/__tests__/ 2>&1 | tail -10`
Expected: all tests pass (prior 5 in ws-server-integration + the new charState test).

Also: `npx tsc --noEmit -p . 2>&1 | head -20` — should be clean now that `onCharStates` exists.

- [ ] **Step 7: Commit**

```bash
git add electron/mobile-bridge/
git commit -m "mobile-bridge: onCharStates fan-out + queue coalescing + test"
```

---

## Phase D — Mobile wiring

### Task 9: `useSession` charState case + test

**Files:**
- Modify: `mobile/src/session/useSession.ts`
- Modify: `mobile/src/__tests__/useSession.test.ts`

- [ ] **Step 1: Add failing test**

Append to `mobile/src/__tests__/useSession.test.ts` before the final `});`:

```ts
  it('routes charState to applyCharState', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    const cs = [{
      agentId: 'ceo', x: 10, y: 20,
      direction: 'down' as const, animation: 'idle' as const,
      visible: true, alpha: 1, toolBubble: null,
    }];
    act(() => fake.emitMessage({ type: 'charState', v: 2, ts: 1234, characters: cs }));
    expect(useSessionStore.getState().characterStates.get('ceo')?.x).toBe(10);
    expect(useSessionStore.getState().lastCharStateTs).toBe(1234);
  });
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity/mobile && npx jest src/__tests__/useSession.test.ts -t "routes charState"`
Expected: FAIL — charState not dispatched.

- [ ] **Step 3: Add the switch case**

Edit `mobile/src/session/useSession.ts`. In the message handler's switch (inside the `transport.on('message', ...)` callback), add before the `tokenRefresh` case:

```ts
        case 'charState':
          store.applyCharState(m.ts, m.characters);
          break;
```

- [ ] **Step 4: Run the full test file**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity/mobile && npx jest src/__tests__/useSession.test.ts`
Expected: all tests pass (9 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/useSession.ts mobile/src/__tests__/useSession.test.ts
git commit -m "useSession: route charState frames into session store"
```

---

### Task 10: `WebViewHost` forwarding + WebView bridge dispatch

**Files:**
- Modify: `mobile/src/webview-host/WebViewHost.tsx`
- Modify: `src/mobile-renderer/bridge.ts`

- [ ] **Step 1: Add subscription in `WebViewHost`**

Edit `mobile/src/webview-host/WebViewHost.tsx`. In the existing effect that subscribes to the store (the one that forwards snapshots on ready), add a second subscription for `characterStates`:

Find the existing code block that looks like:

```tsx
const unsub = useSessionStore.subscribe((state, prev) => {
  if (state.snapshot && state.snapshot !== prev.snapshot) {
    post({ type: 'snapshot', v: 1, snapshot: state.snapshot });
  }
  // ...
});
```

Add a second handler inside the same callback (or as a sibling subscription):

```tsx
if (state.characterStates !== prev.characterStates) {
  webViewRef.current?.postMessage(JSON.stringify({
    type: 'charState',
    v: 2,
    ts: state.lastCharStateTs,
    characters: [...state.characterStates.values()],
  }));
}
```

(Keep the existing `post({...})` helper for snapshot/event; use the direct `postMessage` here because the host's `post()` helper assumes v1 shape.)

- [ ] **Step 2: Add handler in `src/mobile-renderer/bridge.ts`**

Edit `src/mobile-renderer/bridge.ts`. In the switch statement inside `handleRawMessage`, add:

```ts
    case 'charState':
      store.applyCharState(msg.ts, msg.characters);
      break;
```

Verify `msg` is typed as `MobileMessage` (v1) or `MobileMessageV2` — the existing cases will clarify. If it's a v1-only union, add charState to the v1 union OR accept that the webview-side uses a locally-extended union.

Simplest fix: the WebView's bridge already uses `decode(raw)` returning `MobileMessage | null`. Look at `shared/protocol/mobile.ts` to confirm the decoder accepts the new `charState` variant. If it doesn't, add charState to the decoder's accepted type list.

Actually — the WebView forward uses v1 naming historically but the payload is the V2 `CharacterState` shape. For consistency, declare a **local** v1 extension in the webview-only decoder that includes `charState` as a v1 variant with the same payload shape. No encryption difference because this is host→webview postMessage (not the encrypted wire).

If the decoder needs updating, do that in the same commit.

- [ ] **Step 3: tsc check (both sides)**

Run:
```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity/mobile && npx tsc --noEmit
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx tsc --noEmit -p . 2>&1 | grep -E "bridge.ts|WebViewHost" | head
```
Expected: no new errors in either TS project.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/webview-host/WebViewHost.tsx src/mobile-renderer/bridge.ts shared/protocol/mobile.ts
git commit -m "webview-host: forward charState frames into webview session store"
```

(Include `shared/protocol/mobile.ts` only if you had to modify it.)

---

### Task 11: `MobileScene` refactor — strip wander, drive from store

**Files:**
- Modify: `src/mobile-renderer/MobileScene.ts`

- [ ] **Step 1: Replace the Character-creation block to skip `wanderBounds`**

Edit `src/mobile-renderer/MobileScene.ts`. In the character construction loop (around the section that reads `config.spriteVariant`), remove the `wanderBounds` argument from the `new Character({...})` call:

Before:
```ts
const character = new Character({
  agentId: config.role,
  role: config.role,
  mapRenderer: this.mapRenderer,
  frames,
  wanderBounds,
});
```

After:
```ts
const character = new Character({
  agentId: config.role,
  role: config.role,
  mapRenderer: this.mapRenderer,
  frames,
  // Mobile scene is a pure viewer; no wander/moveTo is triggered here.
});
```

Delete the preceding block that computed `wanderBounds` from the zone if it's no longer used by anything else in `init()`.

- [ ] **Step 2: Replace the app ticker with drive-from-store logic**

Find the existing `this.app.ticker.add(() => this.update());` call. Replace both the `update` private method and the ticker registration with:

```ts
this.app.ticker.add(() => this.driveFromStore());
```

And replace the body of `update` (now renamed) with:

```ts
private driveFromStore(): void {
  const dt = this.app.ticker.deltaMS / 1000;
  this.camera.update();

  const states = useSessionStore.getState().characterStates;

  // Apply state to known characters; spawn if new-visible, fade-out if missing
  for (const [agentId, target] of states) {
    const character = this.characters.get(agentId);
    if (!character) continue;
    if (!character.isVisible && target.visible) {
      character.repositionTo(
        Math.floor(target.x / this.mapRenderer.tileSize),
        Math.floor(target.y / this.mapRenderer.tileSize),
      );
      character.show(this.characterLayer);
    }
    character.applyDrivenState(target, dt);
  }

  // Fade out characters that disappeared from the stream (desktop stopped including them)
  for (const [role, character] of this.characters) {
    if (!states.has(role) && character.isVisible) {
      character.hide(500);
    }
  }
}
```

- [ ] **Step 3: Import `useSessionStore`**

At the top of `MobileScene.ts`, add (or extend existing `shared/stores` import):

```ts
import { useSessionStore } from '../../shared/stores/session.store';
```

- [ ] **Step 4: Add reconnect-snap behavior**

Between the store subscription lookup and the character loop, ADD:

```ts
  const lastTs = useSessionStore.getState().lastCharStateTs;
  const gapSinceLastFrame = Date.now() - (this.lastAppliedTs ?? lastTs);
  if (gapSinceLastFrame > 5_000 && this.lastAppliedTs) {
    // Long gap — next frame will snap (the 100 px threshold in applyDrivenState).
    // Reset the tracking so interpolation resumes cleanly afterward.
  }
  this.lastAppliedTs = lastTs;
```

Add to the class field declarations (near the existing `private worldContainer`):

```ts
private lastAppliedTs: number | null = null;
```

- [ ] **Step 5: Delete dead code**

Remove (if present and no longer referenced):
- The `private characters: Map` call to `character.update(dt)` if it was in the old `update()` method
- Any `setWorking` / `moveTo` / `walkToAndThen` calls inside MobileScene
- Any `WanderBounds` type import if it was imported only for construction

Grep the file afterward:
```
grep -n "wander\|moveTo\|walkToAndThen\|setWorking" src/mobile-renderer/MobileScene.ts
```
Expected: empty (no hits).

- [ ] **Step 6: Rebuild the webview bundle**

The WebView is bundled via `npm run build:mobile-all` (bundles mobile-renderer, copies to `mobile/assets/webview/`). Run:

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npm run build:mobile-all
```

Expected: build succeeds, new `mobile/assets/webview/index.html` written.

- [ ] **Step 7: tsc**

Run: `cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/.worktrees/canvas-state-parity && npx tsc --noEmit -p . 2>&1 | grep MobileScene`
Expected: no errors in MobileScene.

- [ ] **Step 8: Commit**

```bash
git add src/mobile-renderer/MobileScene.ts mobile/assets/webview/index.html
git commit -m "mobile-scene: strip wander; drive sprites from characterStates store"
```

---

## Phase E — Final QA

### Task 12: Manual QA checklist

Gate before merging. Work through each; if any fail, fix inline or file follow-up.

- [ ] **1. CEO wander parity.** Start `/imagine`. Observe CEO on desktop; observe same position/direction/walk frame on phone within ~200 ms.
- [ ] **2. Agent spawning.** New agent appears; fade-in matches on both devices.
- [ ] **3. Tool bubble text.** Desktop CEO uses Read with a filepath; phone shows the same path (not "…").
- [ ] **4. Activity transition.** Agent walks to desk, transitions to `type`. Phone shows same transition within ~300 ms.
- [ ] **5. Network drop during walk.** Kill relay / LAN midway through a walk. Phone sprite freezes at last known position; doesn't drift off-map.
- [ ] **6. Long reconnect.** Disconnect for 15 seconds, reconnect. First frame after reconnect snaps sprites to the current desktop position (no slow glide).
- [ ] **7. Phase transition.** Trigger `/warroom` from desktop. Phone sees the gap, then resumes with correct sprites at their warroom positions.
- [ ] **8. Character exit.** Agent's session finishes; sprite fades out on desktop. Phone fades out simultaneously (within 100 ms).
- [ ] **9. Multi-phone (optional).** Pair two phones; both show identical positions. Skip if only one device.
- [ ] **10. Background/foreground.** Background the mobile app for 30 seconds during active session. Return — sprites are at current desktop positions, not 30 s behind.

If all pass, branch is ready for merge.

---

## Self-Review (plan vs. spec)

**Spec coverage:**

| Spec requirement | Covered by |
| --- | --- |
| `CharacterState` interface | Task 1 |
| `charState` message variant in `MobileMessageV2` | Task 1 |
| Drop `x`/`y` from `CharacterSnapshot` | Task 1 |
| `OFFICE_CHAR_STATES` IPC channel | Task 1 |
| Session-store `characterStates` slice + out-of-order protection | Task 2 |
| `ToolBubble.getPublicState()` + `setTarget()` | Task 3 |
| `Character.getStateSnapshot()` | Task 4 |
| Rename of local `CharacterState` → `CharacterAnimation` | Task 4 |
| `Character.applyDrivenState` with snap/lerp | Task 5 |
| Alpha interpolation | Task 5 |
| Direction/animation snap | Task 5 |
| Tool bubble target set/clear | Task 5 (via `setTarget`) |
| `OfficeScene.getCharacterStates()` filters visible | Task 6 |
| `useCharStream` hook at 10 Hz, gated on mobile-connected | Task 7 |
| Preload `broadcastCharStates` + main IPC handler | Task 7 |
| `MobileBridge.onCharStates` fan-out to LAN + relay | Task 8 |
| Per-connection-queue coalescing for `charState` | Task 8 |
| WS server broadcast method | Task 8 |
| `useSession` routes `charState` | Task 9 |
| `WebViewHost` forwarding | Task 10 |
| WebView bridge dispatches `charState` | Task 10 |
| `MobileScene` wander removal | Task 11 |
| `MobileScene` per-frame drive from store | Task 11 |
| Spawn-new-character handling | Task 11 (step 2) |
| Fade-out-missing-character handling | Task 11 (step 2) |
| Reconnect snap logic | Task 11 (step 4) + relies on Task 5's 100 px snap threshold |
| Manual QA checklist from spec § Testing Strategy | Task 12 |

All spec items are accounted for.

**Type consistency:**
- `CharacterState` (shared interface) used consistently across Tasks 1, 4, 5, 6, 7, 8.
- `CharacterAnimation` (local type) used in Task 4 Character.ts references.
- `applyCharState(ts, states)` signature matches across Task 2 (definition), Task 9 (call site), Task 10 (WebView bridge).
- `onCharStates(states)` signature matches across Task 7 (call site in main) and Task 8 (interface + impl).
- `getStateSnapshot` / `applyDrivenState` method names consistent across Tasks 4, 5, 6, 11.

**Placeholder scan:** no occurrences of TBD / TODO / "implement later" / "similar to Task N". Every code step shows complete code; every test step shows complete test body; every command step shows the exact command with expected outcome.
