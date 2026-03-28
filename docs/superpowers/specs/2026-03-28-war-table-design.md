# War Table — War Room Phase Interactive Redesign

## Problem

The War Room phase feels dull compared to the Imagine phase. Imagine has interactive artifacts, agent Q&A, animated characters reading/writing, and a dramatic intro sequence. War Room has two agents running autonomously for ~2 minutes with no user interaction, no character animations, and no clickable objects. It feels like a loading screen.

## Solution: The War Table

A physical strategy table in the center of the open-work-area that becomes the focal point of the War Room phase. Agents visibly gather intel from Imagine artifacts, pin milestone and task cards to the table, and the user reviews the plan through a clickable overlay with a feedback mechanism.

## Phase Flow

### Act 1 — The PM Gathers Intel (~30-60s)

1. Phase starts. Camera follows the PM as they walk to the boardroom.
2. PM visits each Imagine artifact location (vision brief, PRD, market analysis, system design), playing the reading animation at each for 2-3 seconds. This mirrors the actual agent reading those files.
3. PM walks to the war table in the open-work-area. Camera pans to center on the table at 1.2x zoom.
4. PM plays writing animation at the table. Milestone cards appear one by one as `plan.md` is written.

### Act 2 — The Review Gate (user-paced)

4. PM finishes. PM steps back from the table. The table starts pulsing with a cyan glow.
5. A system message appears in chat: "The Project Manager has drafted a plan. Click the war table to review."
6. User clicks the table to open the Plan Overlay.
7. User can approve ("Looks good") or type redirect feedback (e.g., "prioritize the API over the UI").
8. Feedback is injected into the Team Lead's system prompt as additional context.

### Act 3 — The Team Lead Breaks It Down (~60-90s)

9. Team Lead walks to the war table, reads the plan (reading animation).
10. Team Lead plays writing animation. Task cards fan out beneath their parent milestone cards as `tasks.yaml` is written.

### Act 4 — Final Review (user-paced, non-blocking)

11. Table pulses green. User can click to review the task breakdown.
12. This review is non-blocking — "Continue to Build" appears in chat regardless.
13. User reviews if they want to, or proceeds directly.

## The War Table Object

### Map Integration

- New interactive object in the Tiled map, positioned in the center of the open-work-area zone.
- Rendered using the same InteractiveObjects system as artifacts.
- Named `war-table` in the interactive-objects layer.

### Visual States

| State | Appearance | Trigger |
|-------|-----------|---------|
| **Empty** | Table with no cards, 60% opacity, non-interactive | Before War Room phase or when no plan exists |
| **Growing** | Milestone cards appear one by one with pin animation (drop in, slight bounce) | PM is writing `plan.md` |
| **Review** | All milestone cards visible, table has pulsing cyan glow, cursor: pointer | PM finishes, awaiting user review |
| **Expanding** | Task cards fan out beneath milestone cards | Team Lead is writing `tasks.yaml` |
| **Complete** | Full card hierarchy visible, pulsing green glow | Team Lead finishes |
| **Persisted** | Full card hierarchy visible, no glow, clickable to review plan/tasks | During Build phase (war table remains as reference) |

### Card Types

#### Milestone Cards (PM creates)

- Color: `#0ea5e9` (PM's cyan)
- Small rectangular tiles on the table surface
- Each represents a phase/milestone from `plan.md`
- Appear one at a time with a pin animation as the PM writes

#### Task Cards (Team Lead creates)

- Color: `#8b5cf6` (purple — Team Lead's color)
- Smaller than milestone cards
- Fan out beneath their parent milestone card
- Each represents a task from `tasks.yaml`

### Glow States

- **Cyan glow** (`rgba(14,165,233,0.4)`, pulsing opacity 0.3-0.7): Ready for user review after PM finishes
- **Green glow** (`rgba(34,197,94,0.4)`, pulsing opacity 0.3-0.7): Phase complete, ready for Build

## Agent Choreography

### Project Manager

1. **Walk to boardroom** — Pathfinds from desk to boardroom zone.
2. **Read artifacts** — Visits each artifact location (vision brief → PRD → market analysis → system design), plays reading animation at each for 2-3 seconds. Mirrors the actual agent reading those files.
3. **Walk to war table** — Pathfinds to the table in open-work-area.
4. **Pin cards** — Plays writing animation at table. Each time a new section is written to `plan.md`, a milestone card appears on the table.
5. **Step back** — Walks a few tiles away from the table when done, signaling it's the user's turn.

### Team Lead

6. **Walk to war table** — After review gate, pathfinds to the table.
7. **Read plan** — Plays reading animation at the table for a few seconds.
8. **Break down tasks** — Plays writing animation. Task cards fan out beneath milestone cards as `tasks.yaml` is written.
9. **Step back** — Walks away from table when done.

### Key Detail

The PM's boardroom visit creates a visual bridge between Imagine and War Room. The user watches their Imagine artifacts get consumed and transformed into a plan.

## The Review Gate

### Plan Overlay

- Opens when user clicks the glowing war table.
- Same shell as the Artifact Overlay (full-screen modal, markdown-rendered content).
- Shows the rendered contents of `plan.md`.
- Adds a **feedback bar** at the bottom:
  - **"Looks good"** button — approves the plan, triggers Team Lead to start.
  - **Text input** — type redirect notes (e.g., "split phase 2 into two phases").

### Feedback Flow

- "Looks good" → Team Lead starts immediately.
- Typed feedback → does NOT re-run the PM (too slow). Instead, feedback flows forward to the Team Lead's system prompt as additional context. The Team Lead incorporates it when breaking milestones into tasks.

### Second Review (Non-Blocking)

- When Team Lead finishes, table pulses green.
- User can click to review task breakdown.
- "Continue to Build" button appears in chat regardless — no blocking.

## Chat Panel Integration

### System Messages

| Timing | Message |
|--------|---------|
| Phase start | "War Room started — Project Manager is analyzing the Imagine artifacts..." |
| PM starts writing | "Project Manager is drafting the plan..." |
| Review gate | "Plan ready for review. Click the war table to review." |
| After approval | "Team Lead is breaking the plan into tasks..." |
| Phase complete | "Task breakdown complete. Review the war table or continue to Build." |

### Activity Indicator

The existing ActivityIndicator shows PM/Team Lead tool usage in real-time (Read, Write, Glob). No changes needed.

### Chat Input Bar

- Disabled/replaced by ActivityIndicator during agent work (existing behavior).
- Stays disabled during review gate (the table overlay is where the user acts).
- Re-enables only when phase completes and "Continue to Build" appears.

### What's NOT in Chat

- No question bubbles (the war table is the interaction point).
- No agent text messages (agents write to files, not chat).
- Review feedback is on the Plan Overlay, not in the chat input bar.

## Camera Behavior

- **Phase start** → Camera pans from current position to boardroom (following PM as they walk to read artifacts).
- **PM walks to table** → Camera pans to open-work-area, centering on the war table at 1.2x zoom (existing warroom zoom level).
- **Rest of phase** → Camera stays centered on the table. The table is the anchor, not the agents.
- **User override** → User can still pan/zoom manually (existing behavior). Auto-focus targets the table.

## Atmospheric Details

### Card Pin Animation

When milestone/task cards appear on the table, a subtle particle pop — a few pixel sprites scattering outward, fading out quickly. No new particle system needed, just a few temporary sprites.

### Table Glow Pulse

Review gate glow oscillates opacity between 0.3 and 0.7 to draw attention without being obnoxious.

### Milestone Shimmer

When the user approves and the Team Lead starts, milestone cards briefly shimmer before task cards begin fanning out.

### What's Intentionally Skipped

- No fog of war (that's Imagine's thing).
- No special lighting effects (keep it grounded).
- No sound (the app doesn't have audio).

## Implementation Scope

### New Components

- `WarTable.ts` — PixiJS interactive object for the war table, managing card rendering, glow states, and click handling.
- `PlanOverlay.tsx` — React overlay for reviewing the plan with feedback bar (extends ArtifactOverlay pattern).
- War table object added to the Tiled map (`office.tmj`).

### Modified Components

- `warroom.ts` — Add `onArtifactAvailable`-style callbacks for milestone/task card events. Add review gate (pause for user input between PM and Team Lead). Inject user feedback into Team Lead prompt.
- `phase-handlers.ts` — Handle new IPC channels for war table state changes and review gate.
- `useSceneSync.ts` — Watch war table state and sync to PixiJS scene.
- `InteractiveObjects.ts` — Support the war table as a new interactive object type.
- `camera.ts` — Add camera panning to follow PM from boardroom to table.
- `agents.config.ts` — Ensure PM and Team Lead have character configurations for animation.
- `shared/types.ts` — Add IPC channels for war table events.

### New IPC Channels

- `WAR_TABLE_CARD_ADDED` — A card was pinned to the table (milestone or task).
- `WAR_TABLE_REVIEW_READY` — PM finished, table is ready for review.
- `WAR_TABLE_REVIEW_RESPONSE` — User approved or sent feedback.
- `WAR_TABLE_COMPLETE` — Team Lead finished, phase is done.
