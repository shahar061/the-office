# War Room Intro Cinematic

## Problem

The War Room phase starts abruptly — the PM immediately begins reading artifacts with no context. The intro sequence (for new projects) has a cinematic with the CEO explaining the office, but there's no equivalent for the War Room. Users need a brief cinematic introduction when the War Room phase begins to understand what's about to happen.

## Solution

Add a cinematic intro sequence at the start of the War Room phase: the PM walks to the boardroom with fog of war and camera tracking, then a 3-step dialog (same style as the main intro) explains the phase. The dialog seamlessly transitions into the existing warroom orchestration flow.

---

## 1. Generalize IntroSequence Component

Refactor `IntroSequence` to accept configurable steps and speaker instead of hardcoding the CEO dialog.

**New props:**

```typescript
interface IntroSequenceProps {
  steps: DialogueStep[];
  speaker: string;
  speakerColor?: string;          // defaults to colors.accent
  onComplete: () => void;
  onHighlightChange: (phases: Phase[]) => void;
  onChatHighlightChange: (highlight: boolean) => void;
  onStepChange?: (step: number) => void;
}
```

The existing `DIALOGUE_STEPS` array and `"CEO"` label move out of the component to the call site. The `DialogueStep` interface, typewriter logic, skip button, keyboard handling, overlay styles, and dialog box styles remain identical — only the data source changes.

**Call sites:**
- **Main intro** (OfficeView): passes CEO steps, `speaker="CEO"`, default accent color
- **War Room intro** (OfficeView): passes PM steps, `speaker="Project Manager"`, `speakerColor={AGENT_COLORS['project-manager']}` (#14b8a6, teal)

Export `DialogueStep` type from the component for reuse.

---

## 2. War Room Intro Flow

The warroom intro is a two-phase cinematic that plays every time the War Room phase starts (including restarts).

### Phase 1 — PM Walk-In (before dialog appears)

1. **Fog activates** — FogOfWar created centered on PM's current position (at the entrance)
2. **PM appears** — shown at entrance, starts walking toward the boardroom zone center
3. **Camera zooms** — snaps to PM position at ~2.5x zoom, LERPs to follow the PM
4. **Fog tracks PM** — clear zone center updates each frame to follow the PM's pixel position
5. **PM arrives** — reaches boardroom, stops, faces down (idle pose)
6. **Dialog appears** — IntroSequence component mounts with PM steps

### Phase 2 — Dialog (3 steps)

| Step | Text | Highlights |
|------|------|------------|
| 1 | "Time to turn vision into action. I'm the Project Manager — I'll be leading the War Room phase." | `['warroom']` |
| 2 | "I'll review everything the leadership team created and write a battle plan. You'll get to review it before we move on." | `['imagine', 'warroom']` |
| 3 | "Then the Team Lead will break it into tasks for the engineers. Let's get started." | `['warroom', 'build']` |

### Transition Out (seamless into existing warroom flow)

1. Dialog disappears
2. Fog fades out (same 1200ms mechanism as main intro — `fog.skip()`)
3. Camera stays on PM — no zoom reset
4. PM immediately continues into the existing `pm-reading` choreography step
5. The warroom orchestrator resumes, having waited for the intro to complete

---

## 3. FogOfWar Changes

The FogOfWar currently hardcodes `clearCenterX`/`clearCenterY` to the CEO room and never updates them after construction. Two changes are needed:

### Configurable initial center

`createFog()` on OfficeScene gains an overload:
```typescript
createFog(): void                           // existing — CEO room center
createFog(centerX: number, centerY: number): void  // new — custom center
```

When called with coordinates, FogOfWar is created centered on those instead of the CEO room zone.

### Dynamic center tracking

New method on FogOfWar:
```typescript
setCenter(x: number, y: number): void
```

Updates `clearCenterX` and `clearCenterY` and forces a redraw on the next `update()`. Called each frame during PM walk-in to keep the clear zone tracking the PM.

OfficeScene exposes this as:
```typescript
setFogCenter(x: number, y: number): void
```

The existing intro is unaffected — it never calls `setFogCenter`.

---

## 4. Integration — Trigger and State Management

### Trigger

The warroom intro triggers at the start of `START_WARROOM`, before the orchestrator begins its work.

### Renderer state

A new `warRoomIntroActive` boolean in the project store (renderer-only, not persisted):
- Set to `true` when the `PHASE_CHANGE` event fires with `{ phase: 'warroom', status: 'active' }`
- Set to `false` when the dialog's `onComplete` fires

### OfficeView wiring

When `warRoomIntroActive` is true and the scene is ready:
1. Show PM character at entrance
2. Create fog centered on PM
3. Start camera tracking PM
4. PM walks to boardroom (via `character.moveTo()`)
5. Once PM arrives (detected by polling `character.getState() !== 'walk'` via `requestAnimationFrame`), mount `IntroSequence` with PM steps
6. On dialog complete: fog fades, `warRoomIntroActive` set to false

### Backend synchronization

The warroom orchestrator needs to wait for the intro to finish before starting its choreography. New IPC flow:

1. Renderer sets `warRoomIntroActive = true` on phase change
2. Backend's `handleStartWarroom()` sends a new choreography step `'intro-walk'` before `'pm-reading'`
3. Renderer plays the intro cinematic
4. When intro completes, renderer sends `WARROOM_INTRO_DONE` IPC event
5. Backend resumes with `'pm-reading'` choreography

**New IPC channel:**
```typescript
WARROOM_INTRO_DONE: 'office:warroom-intro-done'
```

**New choreography step:**
```typescript
'intro-walk'  // PM walks to boardroom with dialog
```

### useWarRoomIntro hook

A new hook `useWarRoomIntro` (similar to `useIntro`) manages the warroom intro lifecycle:
- Watches for phase change to warroom
- Sets up fog, camera, and PM walk
- Tracks PM position for fog centering (via `requestAnimationFrame`)
- Detects PM arrival at boardroom
- Controls when dialog mounts/unmounts
- Handles completion and IPC signaling

---

## 5. File Changes Summary

| File | Change |
|------|--------|
| `src/renderer/src/components/OfficeView/IntroSequence.tsx` | Accept `steps`, `speaker`, `speakerColor` as props. Export `DialogueStep`. Remove hardcoded steps/speaker. |
| `src/renderer/src/components/OfficeView/useIntro.ts` | Pass CEO steps and speaker to IntroSequence (moved from component) |
| `src/renderer/src/components/OfficeView/useWarRoomIntro.ts` | New hook — warroom intro lifecycle (fog, camera, PM walk, dialog, IPC) |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Wire `useWarRoomIntro`, render IntroSequence for warroom when active |
| `src/renderer/src/office/engine/FogOfWar.ts` | Add `setCenter(x, y)` method for dynamic center tracking |
| `src/renderer/src/office/OfficeScene.ts` | Add `createFog(centerX, centerY)` overload, add `setFogCenter(x, y)` |
| `src/renderer/src/stores/project.store.ts` | Add `warRoomIntroActive` boolean |
| `electron/orchestrator/warroom.ts` | Emit `'intro-walk'` step, wait for `WARROOM_INTRO_DONE` before proceeding |
| `electron/ipc/phase-handlers.ts` | Handle `WARROOM_INTRO_DONE` IPC to unblock orchestrator |
| `shared/types.ts` | Add `WARROOM_INTRO_DONE` IPC channel, add `'intro-walk'` to choreography step type |
| `electron/preload.ts` | Expose `warRoomIntroDone()` and update choreography type |
