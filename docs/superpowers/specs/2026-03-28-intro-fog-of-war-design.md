# Intro Fog of War Design Spec

## Overview

A fog of war system that covers the office map during the intro sequence, revealing only the CEO room initially. As the CEO's dialogue progresses, the fog smoothly expands outward to reveal each zone, creating an atmospheric guided tour of the office. Uses drifting fog wisps for texture and a radial expansion animation for reveals.

## Visual Design

### Fog Base

A full-map dark overlay (`#0a0a14`, ~95% opacity) rendered as a PixiJS container sitting above all tile layers and characters in the world container. The overlay uses a mask to cut out the visible (clear) zone.

### Clear Zone

A radial gradient mask centered on the CEO room. The clear zone has soft edges — not a hard cutoff — transitioning from fully transparent at center to fully opaque fog over ~20-30px. A subtle warm radial glow (`rgba(59, 130, 246, 0.06)`) sits inside the clear zone to draw the eye.

### Fog Wisps

4-6 lightweight PixiJS Sprites scattered in the fogged areas:
- Small, soft circular shapes with low alpha (0.1-0.3)
- Slow drift animation: gentle x/y sinusoidal movement + alpha oscillation
- Speed: ~8-12 second full cycles, staggered start times
- As the clear zone expands and reaches a wisp, it fades out over ~0.5s and is removed

### Rendering Order

```
World Container
├── Tilemap Layers (floor, walls, furniture-below)
├── Character Container
├── furniture-above
├── Interactive Objects Container
└── FogOfWar Container        ← NEW (on top of everything in world space)
    ├── Dark overlay sprite (masked)
    └── Wisp sprites (4-6)
```

The fog is in world space so it scrolls/zooms with the camera naturally.

## Reveal Sequence

The fog state is driven by the intro dialogue step. The `IntroSequence` component already tracks the current step (0-4). A new callback passes the step index to `OfficeScene`, which forwards it to the `FogOfWar` instance.

| Step | Dialogue Summary | Fog Behavior |
|------|-----------------|--------------|
| 0 | "Welcome to The Office..." | Only CEO room visible. Fog covers everything else. |
| 1 | "First, we Imagine..." | No change — still in CEO room context. |
| 2 | "War Room...battle plan...engineers Build it." | Radial expansion from CEO room outward to reveal boardroom + open work area (~1.5s smooth LERP). |
| 3 | "Over there is where we chat." | No fog change — chat highlight is React UI layer. |
| 4 | "So, what would you like to build?" | Quick fade-out: all fog alpha → 0 over ~0.7s. |
| Skip | (any time) | Same quick fade-out as step 4. |

### Expansion Animation

The clear zone is defined by a mask radius (or ellipse radii). On step 2, the target radius LERPs from the initial CEO-room-sized value to a value large enough to encompass the full map. Uses the same LERP approach as the Camera class (per-frame interpolation at ~0.04 speed), providing a ~1.5s smooth expansion.

### Final Fade-Out

On step 4 or skip: the entire fog container's alpha LERPs from 1 to 0 over ~0.7s (~42 frames at 60fps). Once alpha reaches 0, the fog container is destroyed and removed from the scene graph.

## Implementation

### New File: `src/renderer/src/office/engine/FogOfWar.ts`

```typescript
class FogOfWar {
  private container: Container;       // Parent container added to world
  private darkOverlay: Sprite;        // Full-map dark fill
  private mask: Graphics;             // Radial gradient mask for clear zone
  private wisps: Sprite[];            // Fog wisp particles
  private clearCenter: Point;         // Center of the clear zone (CEO room center)
  private currentRadius: number;      // Current mask radius (animated)
  private targetRadius: number;       // Target mask radius
  private fadingOut: boolean;         // True during final fade-out
  private destroyed: boolean;         // Cleanup flag

  constructor(mapWidth: number, mapHeight: number, ceoRoomCenter: Point);
  setStep(step: number): void;        // Called by OfficeScene when intro step changes
  skip(): void;                       // Trigger immediate fade-out
  update(): void;                     // Called per frame from OfficeScene.update()
  destroy(): void;                    // Remove from scene graph, clean up
}
```

### Key Methods

**`constructor`**: Creates the container, dark overlay sprite (filled rectangle the size of the map), initial mask (small ellipse around CEO room center), and 4-6 wisp sprites at random positions in fogged areas.

**`setStep(step)`**: Updates `targetRadius` based on step:
- Steps 0-1: Small radius (~60px, enough for CEO room)
- Step 2: Large radius (enough to cover full map, e.g., `Math.max(mapWidth, mapHeight)`)
- Step 4: Triggers `fadingOut = true`

**`update()`**: Called every frame:
1. LERP `currentRadius` toward `targetRadius` (speed 0.04)
2. Redraw mask as radial gradient at `clearCenter` with `currentRadius`
3. Update wisp positions (sinusoidal drift) and alpha
4. If wisp is inside clear zone, fade it out
5. If `fadingOut`, LERP container alpha toward 0; when < 0.01, call `destroy()`

**`skip()`**: Sets `fadingOut = true` (same as step 4).

**`destroy()`**: Removes container from parent, destroys all child sprites, sets `destroyed = true`.

### Mask Technique

Use a `Graphics` object drawn as a radial pattern:
1. Draw a full-map filled rectangle in the mask color
2. Use `beginFill` with alpha 0 in a circle at `clearCenter` with `currentRadius`
3. Gradient effect achieved by drawing multiple concentric circles with decreasing alpha (5-8 rings stepping from alpha 0 at center to alpha 1 at edge)

This concentric-circles approach avoids custom shaders and works with PixiJS's built-in masking. The key requirement is soft edges on the clear zone.

### Integration Points

**`OfficeScene.ts`**:
- Import and instantiate `FogOfWar` after the tilemap is built
- Add fog container to world container (last child, on top)
- Call `fog.update()` in the animation loop
- Expose `setFogStep(step: number)` and `skipFog()` methods
- On fog destroy, null out the reference

**`IntroSequence.tsx`**:
- Add `onStepChange?: (step: number) => void` callback prop
- Call `onStepChange` whenever the dialogue step advances
- Add `onSkip` integration to also call fog skip

**`OfficeView.tsx`** (or parent wiring):
- Pass the `onStepChange` callback that calls `sceneRef.current.setFogStep(step)`
- Wire skip button to also trigger fog skip

### Wisp Sprite Creation

Each wisp is a simple circular texture (8-16px) created via `Graphics`:
- Draw a filled circle with very low alpha white/blue
- Apply a blur filter (radius 4-6px)
- Position randomly in fogged areas (outside CEO room zone)
- Each wisp stores its own drift parameters: amplitude (3-8px), frequency (0.008-0.015), phase offset (random)

## Edge Cases

- **Intro already seen**: `FogOfWar` is never instantiated. The `introSeen` check in `OfficeView` prevents both `IntroSequence` and fog from rendering.
- **Window resize during intro**: The dark overlay dimensions are set to map size (not viewport), so resizing only affects the camera framing, not the fog coverage.
- **Skip during expansion**: If the user skips while the fog is mid-expansion (step 2 animating), `fadingOut` takes over and fades everything from current state. No jump or glitch.
- **Performance**: 4-6 wisp sprites + 1 mask redraw per frame is negligible. The mask `Graphics` redraw is the most expensive operation but only involves drawing ~8 circles per frame.

## Camera Coordination

During the intro, the camera should be zoomed in on the CEO room (existing `focusOnPhase` targets the boardroom for "imagine" phase). For the intro specifically:
- Start with camera focused on CEO room zone center at ~2x zoom
- On step 2 (expansion), smoothly zoom out to ~1.2x while the fog expands
- On step 4 (fade-out), camera transitions to the normal idle position

This can be achieved by having `OfficeScene.setFogStep()` also call camera targeting methods, or by having the intro step callback trigger camera changes directly.

## Testing

- Verify fog renders on top of all map layers and characters
- Verify clear zone is correctly positioned over CEO room
- Verify step transitions produce smooth radial expansion
- Verify wisps fade out when clear zone reaches them
- Verify skip triggers clean fade-out from any state
- Verify fog container is fully destroyed after fade-out
- Verify no fog appears when `introSeen` is true
- Verify resize during intro doesn't break fog coverage
