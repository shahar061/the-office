# Phase Tracker Design Spec

## Overview

Add a phase tracker strip to the OfficeView that shows workflow progress across the three main phases (Imagine, War Room, Build), displays current status, and provides a continue/retry button to advance or recover.

## Placement

A dedicated horizontal strip (~36px) below the existing top bar, spanning full width. The strip is hidden when the project phase is `idle` (before any phase has started). It appears once the first phase begins and remains visible through completion.

## Visual Structure

Three steps connected by horizontal lines:

```
[1 Imagine] ——— [2 War Room] ——— [3 Build]        [Continue to War Room →]
```

Each step consists of:
- **Circle** (22px diameter): displays step number (1/2/3) or a checkmark when completed
- **Label**: phase name next to the circle
- **Status text**: shown only for the active phase (e.g., "active", "completing"), styled as italic gray

Connector lines (32px wide, 2px thick) between steps indicate progress.

## Step States

| State | Circle | Label | Connector (before this step) |
|-------|--------|-------|------------------------------|
| Completed | Green background, white checkmark | Green text | Filled (green/blue) |
| Active | Blue background, white number, pulsing box-shadow | White text, bold | Filled (blue) |
| Upcoming | Transparent, gray border, gray number | Gray text | Gray |
| Failed | Red background, white number | Red text | Unchanged |
| Interrupted | Red background, white number | Red text | Unchanged |

The active phase circle has a CSS `box-shadow` pulse animation (2s ease-in-out infinite) for visual emphasis.

## Action Button

A single action button on the right side of the strip. What it shows depends on state:

| Condition | Button Label | Action |
|-----------|-------------|--------|
| Imagine completed | "Continue to War Room" | `window.office.startWarroom()` |
| War Room completed | "Continue to Build" | `window.office.startBuild(defaultConfig)` |
| War Room failed/interrupted | "Retry War Room" | `window.office.startWarroom()` |
| Build failed/interrupted | "Retry Build" | `window.office.startBuild(defaultConfig)` |
| Phase is active/starting/completing | No button | — |
| All phases complete | No button | — |
| Imagine failed/interrupted | No button | User retypes idea in chat input |

**Default BuildConfig** used when starting build:
```typescript
{
  modelPreset: 'default',
  retryLimit: 2,
  permissionMode: 'auto-all',
}
```

The button shows "Starting..." with disabled state while the IPC call is in flight.

## Retry Scope

Retry is available for War Room and Build phases only. The Imagine phase requires user input (the idea text), so on imagine failure the user naturally re-enters their idea via the chat input. War Room and Build take no user input, making a retry button straightforward.

## Data Sources

The component reads from `useProjectStore`:
- `projectState.currentPhase` — which phase is current (`Phase` type)
- `projectState.completedPhases` — array of completed phases
- `currentPhase.status` — status of the active phase (`'starting' | 'active' | 'completing' | 'completed' | 'failed' | 'interrupted'`)

No new state or stores needed.

## Component Structure

Single new file: `src/renderer/src/components/OfficeView/PhaseTracker.tsx`

Integrated into `OfficeView.tsx` between the top bar `<div>` and the main area `<div>`. The existing `phaseIndicator` text in the top bar can remain as-is (it provides a compact fallback) or be removed — keeping it is simpler and harmless.

## Styling

Inline styles following the existing pattern in OfficeView (no CSS modules or external stylesheets). One CSS `@keyframes` animation for the active phase pulse, added to the existing `<style>` block in OfficeView.

Color palette matches the existing dark theme:
- Background: `#0d0d1a` (matches top bar)
- Border: `#1e1e2e`
- Green (completed): `#22c55e`
- Blue (active): `#3b82f6`
- Gray (upcoming): `#4b5563` / `#333`
- Red (failed): `#ef4444`
- Button: `#3b82f6` background, white text
