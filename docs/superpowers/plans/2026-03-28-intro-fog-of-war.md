# Intro Fog of War Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an atmospheric fog of war overlay to the intro sequence that reveals only the CEO room initially, then smoothly expands to reveal the full office as the dialogue progresses.

**Architecture:** A new `FogOfWar` engine class renders a canvas-based dark overlay with a radial gradient clear zone and drifting wisp particles. `OfficeScene` owns the fog instance and adds it to the world container. `IntroSequence` fires a new `onStepChange` callback that `useIntro` routes to both the fog system (step → radius) and camera (step → zoom target). The fog uses an offscreen `<canvas>` element (448×336px) to draw a radial gradient, converted to a PixiJS texture each frame.

**Tech Stack:** PixiJS 8, TypeScript, React, HTML Canvas 2D

---

### Task 1: Create FogOfWar engine class

**Files:**
- Create: `src/renderer/src/office/engine/FogOfWar.ts`

- [ ] **Step 1: Create the FogOfWar class with canvas-based fog rendering**

Create `src/renderer/src/office/engine/FogOfWar.ts`:

```typescript
import { Container, Sprite, Texture } from 'pixi.js';

interface WispState {
  sprite: Sprite;
  baseX: number;
  baseY: number;
  amplitude: number;
  frequency: number;
  phaseOffset: number;
  baseAlpha: number;
}

const FOG_COLOR = [10, 10, 20] as const; // #0a0a14
const FOG_ALPHA = 0.95;
const LERP_SPEED = 0.03;
const FADE_SPEED = 0.035;
const WISP_COUNT = 5;
const EDGE_SOFTNESS = 30; // px of gradient at clear zone edge

const CEO_ROOM_RADIUS = 80;

export class FogOfWar {
  readonly container: Container;

  private fogSprite: Sprite;
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogTexture: Texture;

  private wisps: WispState[] = [];
  private wispTexture: Texture;

  private clearCenterX: number;
  private clearCenterY: number;
  private currentRadius: number;
  private targetRadius: number;
  private fullMapRadius: number;

  private fadingOut = false;
  private destroyed = false;
  private time = 0;
  private lastDrawnRadius = -1;

  constructor(
    private mapWidth: number,
    private mapHeight: number,
    ceoRoomCenterX: number,
    ceoRoomCenterY: number,
  ) {
    this.clearCenterX = ceoRoomCenterX;
    this.clearCenterY = ceoRoomCenterY;

    // Radius needed to clear the farthest corner of the map from the CEO room
    this.fullMapRadius = Math.sqrt(
      Math.max(ceoRoomCenterX, mapWidth - ceoRoomCenterX) ** 2 +
      Math.max(ceoRoomCenterY, mapHeight - ceoRoomCenterY) ** 2,
    ) + EDGE_SOFTNESS;

    this.currentRadius = CEO_ROOM_RADIUS;
    this.targetRadius = CEO_ROOM_RADIUS;

    // Container setup
    this.container = new Container();
    this.container.label = 'fog-of-war';
    this.container.eventMode = 'none';

    // Offscreen canvas for fog overlay
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = mapWidth;
    this.fogCanvas.height = mapHeight;
    this.fogCtx = this.fogCanvas.getContext('2d')!;

    this.fogTexture = Texture.from(this.fogCanvas);
    this.fogSprite = new Sprite(this.fogTexture);
    this.container.addChild(this.fogSprite);

    // Wisp shared texture
    this.wispTexture = this.createWispTexture();
    this.createWisps();

    // Initial draw
    this.drawFog();
  }

  /** Called by OfficeScene when intro step changes. */
  setStep(step: number): void {
    if (this.destroyed) return;
    switch (step) {
      case 0:
      case 1:
        this.targetRadius = CEO_ROOM_RADIUS;
        break;
      case 2:
        this.targetRadius = this.fullMapRadius;
        break;
      case 3:
        // No fog change — chat highlight is in React UI
        break;
      case 4:
        this.fadingOut = true;
        break;
    }
  }

  /** Trigger immediate fade-out (used on skip). */
  skip(): void {
    if (this.destroyed) return;
    this.fadingOut = true;
  }

  /** Called every frame from OfficeScene's animation loop. */
  update(dt: number): void {
    if (this.destroyed) return;

    this.time += dt;

    // Animate radius toward target
    if (Math.abs(this.currentRadius - this.targetRadius) > 0.5) {
      this.currentRadius += (this.targetRadius - this.currentRadius) * LERP_SPEED;
    }

    // Fade out
    if (this.fadingOut) {
      this.container.alpha -= FADE_SPEED;
      if (this.container.alpha <= 0.01) {
        this.destroy();
        return;
      }
    }

    // Redraw fog canvas only when radius has visually changed
    const radiusChanged = Math.abs(this.currentRadius - this.lastDrawnRadius) > 0.3;
    if (radiusChanged) {
      this.drawFog();
      this.lastDrawnRadius = this.currentRadius;
    }

    // Animate wisps
    this.updateWisps();
  }

  /** Clean up all resources and remove from scene. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.parent?.removeChild(this.container);
    this.container.destroy({ children: true });
    this.fogTexture.destroy(true);
    this.wispTexture.destroy(true);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ── Private ────────────────────────────────────────────────────────

  private drawFog(): void {
    const ctx = this.fogCtx;
    const w = this.mapWidth;
    const h = this.mapHeight;
    const cx = this.clearCenterX;
    const cy = this.clearCenterY;
    const r = this.currentRadius;

    // Clear and fill with fog
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = `rgba(${FOG_COLOR[0]},${FOG_COLOR[1]},${FOG_COLOR[2]},${FOG_ALPHA})`;
    ctx.fillRect(0, 0, w, h);

    // Cut out clear zone with radial gradient
    ctx.globalCompositeOperation = 'destination-out';
    const innerR = Math.max(0, r - EDGE_SOFTNESS);
    const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Also fully clear the inner area (inside innerR)
    if (innerR > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Update PixiJS texture from canvas
    this.fogTexture.source.update();
  }

  private createWispTexture(): Texture {
    const size = 24;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(100, 120, 180, 0.25)');
    gradient.addColorStop(0.5, 'rgba(100, 120, 180, 0.1)');
    gradient.addColorStop(1, 'rgba(100, 120, 180, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(c);
  }

  private createWisps(): void {
    for (let i = 0; i < WISP_COUNT; i++) {
      // Position wisps in fogged areas (outside CEO room clear zone)
      let x: number, y: number;
      do {
        x = Math.random() * this.mapWidth;
        y = Math.random() * this.mapHeight;
      } while (this.distFromCenter(x, y) < CEO_ROOM_RADIUS + 30);

      const scale = 0.8 + Math.random() * 1.5;
      const sprite = new Sprite(this.wispTexture);
      sprite.anchor.set(0.5);
      sprite.scale.set(scale);
      sprite.x = x;
      sprite.y = y;
      sprite.alpha = 0.15 + Math.random() * 0.15;

      this.container.addChild(sprite);

      this.wisps.push({
        sprite,
        baseX: x,
        baseY: y,
        amplitude: 3 + Math.random() * 5,
        frequency: 0.008 + Math.random() * 0.007,
        phaseOffset: Math.random() * Math.PI * 2,
        baseAlpha: sprite.alpha,
      });
    }
  }

  private updateWisps(): void {
    for (const wisp of this.wisps) {
      // Sinusoidal drift
      const t = this.time * 1000; // convert to ms-like scale for frequency
      wisp.sprite.x = wisp.baseX + Math.sin(t * wisp.frequency + wisp.phaseOffset) * wisp.amplitude;
      wisp.sprite.y = wisp.baseY + Math.cos(t * wisp.frequency * 0.7 + wisp.phaseOffset) * wisp.amplitude * 0.6;

      // Alpha oscillation
      wisp.sprite.alpha = wisp.baseAlpha * (0.7 + 0.3 * Math.sin(t * wisp.frequency * 0.5 + wisp.phaseOffset));

      // Fade out wisps that are now inside the clear zone
      const dist = this.distFromCenter(wisp.sprite.x, wisp.sprite.y);
      if (dist < this.currentRadius - EDGE_SOFTNESS) {
        wisp.baseAlpha *= 0.95; // decay
        if (wisp.baseAlpha < 0.01) {
          wisp.sprite.visible = false;
        }
      }
    }
  }

  private distFromCenter(x: number, y: number): number {
    return Math.sqrt((x - this.clearCenterX) ** 2 + (y - this.clearCenterY) ** 2);
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd src/renderer && npx tsc --noEmit src/renderer/src/office/engine/FogOfWar.ts 2>&1 | head -20`

If there are PixiJS import issues, fix them. The key imports needed are `Container`, `Sprite`, `Texture` from `pixi.js`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/engine/FogOfWar.ts
git commit -m "feat: add FogOfWar engine class with canvas-based rendering"
```

---

### Task 2: Integrate FogOfWar into OfficeScene

**Files:**
- Modify: `src/renderer/src/office/OfficeScene.ts`

- [ ] **Step 1: Add FogOfWar import and instance field**

At the top of `OfficeScene.ts`, add the import:

```typescript
import { FogOfWar } from './engine/FogOfWar';
```

Add a field to the class (after `characterPopupSize`):

```typescript
private fog: FogOfWar | null = null;
```

- [ ] **Step 2: Create and add fog in `init()` after interactive objects**

After the line `this.worldContainer.addChild(this.interactiveObjects.container);` (line 150), add:

```typescript
    // Fog of war overlay (created but only activated during intro via setFogStep)
    const ceoZone = this.mapRenderer.getZone('ceo-room');
    if (ceoZone) {
      const mapPxW = this.mapRenderer.width * this.mapRenderer.tileSize;
      const mapPxH = this.mapRenderer.height * this.mapRenderer.tileSize;
      const centerX = (ceoZone.x + ceoZone.width / 2) * this.mapRenderer.tileSize;
      const centerY = (ceoZone.y + ceoZone.height / 2) * this.mapRenderer.tileSize;
      this.fog = new FogOfWar(mapPxW, mapPxH, centerX, centerY);
      this.worldContainer.addChild(this.fog.container);
    }
```

- [ ] **Step 3: Call fog.update() in the update loop**

In the `update()` method, after `this.interactiveObjects.update(dt);` add:

```typescript
    if (this.fog && !this.fog.isDestroyed()) {
      this.fog.update(dt);
    }
```

- [ ] **Step 4: Add public methods for fog control**

Add these methods to the `OfficeScene` class (after `onResize`):

```typescript
  setFogStep(step: number): void {
    this.fog?.setStep(step);
  }

  skipFog(): void {
    this.fog?.skip();
  }

  /** Remove fog entirely (for projects where intro was already seen). */
  removeFog(): void {
    if (this.fog && !this.fog.isDestroyed()) {
      this.fog.destroy();
    }
    this.fog = null;
  }
```

- [ ] **Step 5: Verify the file compiles**

Run: `cd "$(git rev-parse --show-toplevel)" && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/office/OfficeScene.ts
git commit -m "feat: integrate FogOfWar into OfficeScene world container"
```

---

### Task 3: Add onStepChange callback to IntroSequence

**Files:**
- Modify: `src/renderer/src/components/OfficeView/IntroSequence.tsx`

- [ ] **Step 1: Add onStepChange to IntroSequenceProps**

In `IntroSequenceProps` interface (line 37-41), add the new prop:

```typescript
interface IntroSequenceProps {
  onComplete: () => void;
  onHighlightChange: (phases: Phase[]) => void;
  onChatHighlightChange: (highlight: boolean) => void;
  onStepChange?: (step: number) => void;
}
```

- [ ] **Step 2: Destructure onStepChange and fire it on step changes**

Update the function signature to include `onStepChange`:

```typescript
export function IntroSequence({ onComplete, onHighlightChange, onChatHighlightChange, onStepChange }: IntroSequenceProps) {
```

Add a `useEffect` that fires `onStepChange` when the step changes. Place it right after the existing highlight `useEffect` (after line 57):

```typescript
  // Notify parent of step changes (for fog of war + camera coordination)
  useEffect(() => {
    onStepChange?.(stepIndex);
  }, [stepIndex, onStepChange]);
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd "$(git rev-parse --show-toplevel)" && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/OfficeView/IntroSequence.tsx
git commit -m "feat: add onStepChange callback to IntroSequence component"
```

---

### Task 4: Wire fog and camera coordination in useIntro and OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/useIntro.ts`
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Add handleStepChange to useIntro.ts**

In `useIntro.ts`, add a new callback after `handleChatHighlightChange` (after line 47):

```typescript
  const handleStepChange = useCallback((step: number) => {
    if (!officeScene) return;

    // Drive fog reveal
    officeScene.setFogStep(step);

    // Camera coordination: zoom out as fog expands
    if (step === 2) {
      // Smoothly zoom out from CEO close-up to show full office
      officeScene.getCamera().resetToPhase('imagine');
    }
  }, [officeScene]);
```

- [ ] **Step 2: Add fog skip + removal to handleIntroComplete**

In `handleIntroComplete`, add fog skip before `hideCharacter` call. Replace the existing `handleIntroComplete` callback:

```typescript
  const handleIntroComplete = useCallback(async () => {
    setIntroHighlights(null);
    setIntroChatHighlight(false);
    if (officeScene) {
      officeScene.skipFog();
      officeScene.hideCharacter('ceo');
      officeScene.getCamera().fitToScreen();
    }
    try {
      await window.office.markIntroSeen();
      if (projectState) {
        useProjectStore.getState().setProjectState({ ...projectState, introSeen: true });
      }
    } catch (err) {
      console.error('Failed to mark intro seen:', err);
    }
  }, [projectState, officeScene]);
```

- [ ] **Step 3: Remove fog when intro was already seen**

In `setupIntroScene`, add fog removal for projects that already saw the intro. Update the callback:

```typescript
  const setupIntroScene = useCallback((scene: OfficeScene) => {
    setOfficeScene(scene);
    if (showIntroRef.current) {
      scene.getCamera().snapTo(72, 104, 3.5);
      scene.showCharacter('ceo');
      const ceo = scene.getCharacter('ceo');
      if (ceo) {
        const desk = ceo.getDeskTile();
        ceo.repositionTo(desk.x, desk.y);
      }
    } else {
      // No intro — remove fog immediately so it doesn't render at all
      scene.removeFog();
    }
  }, []);
```

- [ ] **Step 4: Add handleStepChange to the return value of useIntro**

Update the return statement to include the new handler:

```typescript
  return {
    showIntro,
    introHighlights,
    introChatHighlight,
    officeScene,
    handleIntroComplete,
    handleHighlightChange,
    handleChatHighlightChange,
    handleStepChange,
    setupIntroScene,
  };
```

- [ ] **Step 5: Pass onStepChange through OfficeView.tsx**

In `OfficeView.tsx`, destructure `handleStepChange` from `useIntro`:

```typescript
  const {
    showIntro,
    introHighlights,
    introChatHighlight,
    officeScene,
    handleIntroComplete,
    handleHighlightChange,
    handleChatHighlightChange,
    handleStepChange,
    setupIntroScene,
  } = useIntro(projectState, phase);
```

Then pass it to `IntroSequence` (around line 308-313):

```tsx
          {showIntro && (
            <IntroSequence
              onComplete={handleIntroComplete}
              onHighlightChange={handleHighlightChange}
              onChatHighlightChange={handleChatHighlightChange}
              onStepChange={handleStepChange}
            />
          )}
```

- [ ] **Step 6: Verify the full project compiles**

Run: `cd "$(git rev-parse --show-toplevel)" && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/OfficeView/useIntro.ts src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: wire fog of war + camera coordination to intro sequence"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server and create a new project**

Run: `npm run dev` (or the project's dev command)

Create a new project so `introSeen` is `false` and the intro sequence triggers.

- [ ] **Step 2: Verify fog behavior through each intro step**

Walk through the intro sequence and verify:
- Step 0: Only the CEO room is visible through the fog. Wisps drift in the fogged areas.
- Step 1: No change — fog stays the same.
- Step 2: Fog smoothly expands outward from CEO room, revealing the entire office. Camera zooms out in parallel.
- Step 3: No fog change (chat panel highlights in React UI).
- Step 4: Fog quickly fades to transparent and is removed from the scene.

- [ ] **Step 3: Verify skip behavior**

Restart the intro (reset `introSeen` or create another project). Click "Skip" at various points:
- Skip during step 0: fog fades out smoothly.
- Skip during step 2 (mid-expansion): fog fades from current state without jumping.
- Skip during step 4: no visible difference (already fading).

- [ ] **Step 4: Verify no fog for existing projects**

Open an existing project where `introSeen` is `true`. Verify:
- No fog is visible at any point.
- No fog container exists in the scene graph (check via console if needed).

- [ ] **Step 5: Fix any visual issues found during testing**

Adjust constants as needed:
- `CEO_ROOM_RADIUS` — increase if CEO room edges are clipped
- `EDGE_SOFTNESS` — increase for softer gradient, decrease for harder edge
- `LERP_SPEED` — increase for faster expansion, decrease for slower
- `FADE_SPEED` — increase for faster fade-out
- `WISP_COUNT` — add or remove wisps for density preference
