# Phase Restart — Clickable Phase Tracker

## Problem

Users cannot restart a completed or in-progress phase from the phase tracker. The only way to redo work is through retry buttons on failed phases. Users need a way to click on any completed or active phase to restart it, clearing all subsequent progress.

## Solution

Make phase tracker steps clickable. Clicking a completed or active phase opens a confirmation modal showing what will be lost. On confirm, the system interrupts any running orchestrator, cleans artifacts, resets state (including `session.yaml`), and restarts the target phase.

---

## 1. Clickable Phase Steps

Phase circles in `PhaseTracker` become clickable for **completed** and **active** phases. Upcoming/idle phases remain inert.

**Visual changes:**
- `cursor: pointer` on hover for clickable phases
- Subtle `filter: brightness(1.2)` on hover
- No change to normal appearance — hover is the only affordance

**Click behavior:**
- Opens `PhaseRestartModal` with the clicked phase as target
- Existing "Continue to War Room" / "Retry" action buttons remain unchanged

---

## 2. PhaseRestartModal Component

New component at `src/renderer/src/components/OfficeView/PhaseRestartModal.tsx`, styled like `PlanOverlay` — centered overlay with backdrop blur on dark semi-transparent backdrop.

**Props:**
```typescript
interface PhaseRestartModalProps {
  targetPhase: Phase;
  originalIdea?: string;       // pre-filled for imagine restarts
  onConfirm: (userIdea?: string) => void;
  onCancel: () => void;
}
```

**Layout:**
- **Header:** "Restart {Phase Name}?" with amber/warning-colored dot
- **Impact section:** "The following will be cleared:" with list of:
  - Artifact filenames that will be deleted (e.g., `01-vision-brief.md`, `plan.md`, `tasks.yaml`)
  - Phases that will be reset with their current status (e.g., "War Room (completed)", "Build (active)")
  - "`session.yaml` will be reset"
- **Imagine-only section:** Editable `<textarea>` pre-filled with the original idea from chat history. User can edit or keep as-is.
- **Footer:** "Cancel" button (ghost style) + "Restart" button (amber/warning — destructive action)

**Behavior:**
- Escape or backdrop click = cancel (does NOT auto-confirm like PlanOverlay)
- Impact list computed from `completedPhases`, `currentPhase`, and artifact existence

**Artifact mapping for impact display:**

| Restarting | Artifacts cleared | session.yaml |
|------------|-------------------|--------------|
| Imagine | `01-vision-brief.md`, `02-prd.md`, `03-market-analysis.md`, `04-system-design.md`, `plan.md`, `tasks.yaml` | Deleted (recreated by agent-organizer) |
| War Room | `plan.md`, `tasks.yaml` | Fields reset (`current_phase`, `completed_phases`) |
| Build | (no docs/office artifacts) | Fields reset (`current_phase`, `completed_phases`) |

---

## 3. Backend — Restart Phase IPC

### New Types

```typescript
// shared/types.ts
interface RestartPhasePayload {
  targetPhase: Phase;
  userIdea?: string;  // only for imagine
}
```

### New IPC Channel

```typescript
RESTART_PHASE: 'office:restart-phase'
```

### Handler Flow (phase-handlers.ts)

1. **Interrupt active phase** — if an orchestrator is running, call `activeAbort()` and mark the current phase as interrupted via `phaseMachine.markInterrupted()`
2. **Clean artifacts** — call `ArtifactStore.clearFrom(phase)`:
   - `clearFrom('imagine')` → deletes all imagine docs + `plan.md` + `tasks.yaml`
   - `clearFrom('warroom')` → deletes `plan.md`, `tasks.yaml`
   - `clearFrom('build')` → no artifact files to delete
3. **Reset session.yaml** — for imagine restart: delete entirely (agent-organizer recreates it on next run). For warroom/build restart: reset `current_phase` and `completed_phases` fields in the YAML
4. **Update ProjectState** — remove cleared phases from `completedPhases`, set `currentPhase` to target, persist to `.the-office/config.json`
5. **Broadcast renderer reset** — emit `PHASE_RESTART` event so renderer clears war table store, kanban, and chat from the restarted phase onward
6. **Start target phase** — invoke the existing IPC start handlers (`START_IMAGINE`, `START_WARROOM`, `START_BUILD`) which create a fresh `PhaseMachine` from the now-cleaned `ProjectState`. This reuses all existing orchestration logic without duplication.

---

## 4. PhaseMachine Changes

### Generalized Backward Transitions

Replace the `BACKWARD_TO_IMAGINE`-only logic with general backward support:

```typescript
const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];

// In transition():
const isBackward = PHASE_ORDER.indexOf(target) < PHASE_ORDER.indexOf(from)
                   && target !== 'idle';
```

Backward to `idle` remains invalid.

### New Method: clearCompletedFrom

```typescript
clearCompletedFrom(phase: Phase): void {
  const idx = PHASE_ORDER.indexOf(phase);
  for (const p of PHASE_ORDER.slice(idx)) {
    this._completedPhases.delete(p);
  }
}
```

### Test Updates

Add to `phase-machine.test.ts`:
- Backward transition `build` -> `warroom` (newly allowed)
- Backward transition `complete` -> `warroom` (newly allowed)
- `clearCompletedFrom('warroom')` clears warroom, build, complete
- `clearCompletedFrom('imagine')` clears all phases
- Backward to `idle` still throws

---

## 5. Preload & Renderer Wiring

### OfficeAPI Addition (shared/types.ts)

```typescript
restartPhase(payload: RestartPhasePayload): Promise<void>;
```

### Preload Bridge (electron/preload.ts)

Expose `restartPhase` via `contextBridge.exposeInMainWorld`.

### PhaseTracker Component Changes

- Add `onClick` handler to each completed/active phase circle
- New state: `restartTarget: Phase | null` — when set, renders `PhaseRestartModal`
- On modal open for Imagine: fetch original idea via `window.office.getChatHistory('imagine')`, find first user-role message in ceo run
- On confirm: call `window.office.restartPhase({ targetPhase, userIdea })`, close modal

### New IPC Event: PHASE_RESTART

```typescript
PHASE_RESTART: 'office:phase-restart'
```

Broadcast by main process after cleanup. Renderer listeners clear:
- War table store → reset to empty state
- Chat store → clear messages from restarted phase onward
- Kanban store → reset if build is cleared
- Project store → `completedPhases` updated via the subsequent `PHASE_CHANGE` event

### ArtifactStore Addition

```typescript
clearFrom(phase: Phase): void
```

Deletes all artifact files belonging to the given phase and all subsequent phases. Uses `fs.unlinkSync` with existence checks.

---

## File Changes Summary

| File | Change |
|------|--------|
| `shared/types.ts` | Add `RestartPhasePayload`, `RESTART_PHASE` + `PHASE_RESTART` IPC channels, `restartPhase` to `OfficeAPI` |
| `electron/orchestrator/phase-machine.ts` | Generalize backward transitions, add `clearCompletedFrom()`, export `PHASE_ORDER` |
| `electron/project/artifact-store.ts` | Add `clearFrom(phase)` method |
| `electron/ipc/phase-handlers.ts` | Add `RESTART_PHASE` handler with full cleanup + restart flow |
| `electron/preload.ts` | Expose `restartPhase` on context bridge |
| `src/renderer/src/components/OfficeView/PhaseRestartModal.tsx` | New component — confirmation modal with impact list |
| `src/renderer/src/components/OfficeView/PhaseTracker.tsx` | Make phases clickable, manage modal state, fetch original idea |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Listen for `PHASE_RESTART` to clear renderer stores |
| `tests/orchestrator/phase-machine.test.ts` | Add backward transition + clearCompletedFrom tests |
