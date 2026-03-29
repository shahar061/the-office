# Intro Sequence Design Spec

## Overview

A Pokemon GBA-style introduction sequence that plays once when a new project is created. The CEO character welcomes the user, explains the 3 workflow phases (Imagine, War Room, Build) with corresponding PhaseTracker highlights, then hands off to the idle input state.

## Trigger & Lifecycle

The intro plays **once per new project**. A new `introSeen: boolean` field is added to `ProjectState` (persisted in project config). New projects start with `introSeen: false`. When the intro completes or is skipped, `markIntroSeen()` is called via IPC, setting `introSeen: true` and persisting it. Projects opened from "recent projects" that already have `introSeen: true` skip the intro entirely.

## Component: IntroSequence

A full-screen overlay rendered inside OfficeView when `phase === 'idle' && !projectState.introSeen`.

### Visual Structure

```
┌──────────────────────────────────────────────────────┐
│ Top bar (unchanged)                          [Skip]  │
├──────────────────────────────────────────────────────┤
│ PhaseTracker (intro mode — dimmed/highlighted)       │
├──────────────────────────────────────────────────────┤
│                                                      │
│          Semi-transparent dark overlay               │
│          (rgba(0,0,0,0.5) over canvas)               │
│                                                      │
│              [CEO character sprite]                  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ CEO                                            │  │
│  │ Dialogue text with typewriter effect...     ▼  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Overlay

A `position: absolute` div covering the main area (below PhaseTracker, above the chat panel and canvas). Background `rgba(0,0,0,0.5)`. Contains the CEO sprite and dialogue box. The chat panel and canvas remain mounted underneath but are not interactive during the intro.

### CEO Character Sprite

The existing CEO sprite from the character system (`ceo` agent role, mapped to one of the LimeZu sprite sheets). Rendered as a static pixel-art image (idle frame, facing down), centered horizontally, positioned above the dialogue box. Scaled up 3-4x from native 16x32 to be clearly visible (approximately 48-64px wide, 96-128px tall). Uses `image-rendering: pixelated` to preserve crisp pixel art.

### Dialogue Box

Styled as a GBA RPG text box:
- Background: `#1a1a2e`
- Border: `2px solid #3b82f6`
- Border radius: `8px`
- Positioned at the bottom of the overlay area, horizontally centered, max-width ~500px
- Padding: `12px 16px`

Contents:
- **Speaker label**: "CEO" in blue (`#3b82f6`), uppercase, 10px, bold, with letter-spacing
- **Dialogue text**: 12-13px, `#e2e8f0`, line-height 1.5. Text appears with a typewriter effect (~30ms per character)
- **Advance indicator**: Blinking `▼` in bottom-right corner, visible only after typewriter finishes. Uses CSS `step-end` animation for the classic RPG blink feel.

### Typewriter Effect

Text reveals character by character at ~30ms intervals. Clicking/pressing Enter/Space during the animation skips to showing the full text immediately. Once full text is shown, clicking/pressing Enter/Space advances to the next dialogue step.

### Skip Button

A small "Skip" text button in the top-right corner of the overlay. Clicking it immediately ends the intro (calls `markIntroSeen()` and unmounts). Styled subtly: 11px, `#64748b` color, no background, with hover brightening.

## Dialogue Steps

4 steps total, each with dialogue text and a PhaseTracker highlight effect:

### Step 1: Welcome
- **Text**: `Ah, a new project! *adjusts glasses*\nWelcome to The Office. I'm the CEO — and we've got quite the team here.`
- **PhaseTracker**: All steps visible but fully dimmed (opacity 0.3)

### Step 2: Imagine Phase
- **Text**: `First, we Imagine — that's where I sit down with the leadership team and figure out exactly what we're building.`
- **PhaseTracker**: Step 1 (Imagine) highlights with blue pulse and glow, steps 2-3 remain dimmed

### Step 3: War Room & Build
- **Text**: `Then the War Room turns it into a battle plan, and the engineers Build it. The whole team's had their coffee already.`
- **PhaseTracker**: Steps 2 (War Room) and 3 (Build) light up with amber and green glows respectively. Step 1 stays lit (no longer pulsing).

### Step 4: Handoff
- **Text**: `So, what would you like to build?`
- **PhaseTracker**: All highlights fade, tracker returns to normal dimmed state
- **On advance**: Calls `markIntroSeen()`, overlay fades out (0.3s), input field receives a brief blue glow/highlight, normal idle state resumes

## PhaseTracker Changes

### New prop: `highlightedPhases`

```typescript
interface PhaseTrackerProps {
  highlightedPhases?: Phase[] | null;
}
```

- `null` or `undefined` (default): Normal behavior — tracker hidden when idle, shows progress during phases
- `[]` (empty array): Tracker visible but all steps dimmed at opacity 0.3 (intro mode, no highlights yet)
- `['imagine']`: Imagine step highlighted with blue glow, others dimmed
- `['warroom', 'build']`: War Room and Build steps highlighted, others at normal opacity

### Visibility override

When `highlightedPhases` is provided (not `null`/`undefined`), the tracker renders even when `phase === 'idle'`. This is only used during the intro sequence.

### Highlight rendering

Highlighted steps get:
- Circle: filled with accent color + `box-shadow: 0 0 8px <color>40`
- Label: white text, bold
- Non-highlighted steps: `opacity: 0.3`

Accent colors per phase during highlighting:
- Imagine: `#3b82f6` (blue)
- War Room: `#f59e0b` (amber)
- Build: `#22c55e` (green)

## State Changes

### ProjectState addition

Add `introSeen: boolean` to `ProjectState` in `shared/types.ts`:

```typescript
export interface ProjectState {
  name: string;
  path: string;
  currentPhase: Phase;
  completedPhases: Phase[];
  interrupted: boolean;
  introSeen: boolean;  // NEW
}
```

Default: `false` for new projects. Existing projects without the field default to `true` (skip intro for projects created before this feature).

### New IPC channel

Add `MARK_INTRO_SEEN` to `IPC_CHANNELS` and `OfficeAPI`:

```typescript
// IPC_CHANNELS
MARK_INTRO_SEEN: 'office:mark-intro-seen',

// OfficeAPI
markIntroSeen(): Promise<void>;
```

The handler calls `projectManager.updateProjectState(path, { introSeen: true })`.

## Files

- **Create**: `src/renderer/src/components/OfficeView/IntroSequence.tsx` — the overlay component with dialogue state machine, typewriter effect, and skip button
- **Modify**: `src/renderer/src/components/OfficeView/PhaseTracker.tsx` — add `highlightedPhases` prop with highlight rendering and visibility override
- **Modify**: `src/renderer/src/components/OfficeView/OfficeView.tsx` — conditionally render IntroSequence overlay, pass highlightedPhases to PhaseTracker
- **Modify**: `shared/types.ts` — add `introSeen` to ProjectState, add IPC channel and API method
- **Modify**: `electron/main.ts` — add MARK_INTRO_SEEN IPC handler
- **Modify**: `electron/preload.ts` — expose markIntroSeen in bridge
- **Modify**: `electron/project/project-manager.ts` — default introSeen to false for new projects, true for existing

## Styling

All inline styles following existing codebase pattern. New CSS keyframes added to OfficeView's `<style>` block:

- `@keyframes blink-indicator` — step-end blink for the `▼` advance indicator
- Phase highlight glow animations reuse the existing `phase-pulse` keyframe where applicable
