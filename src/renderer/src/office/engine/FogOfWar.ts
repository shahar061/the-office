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
const LERP_SPEED = 0.06;
const FADE_SPEED = 0.015;
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
      case 2:
      case 3:
      case 4:
        // Fog stays at CEO room radius throughout the intro.
        // The dramatic reveal (expand + fade) happens on skip()/completion.
        this.targetRadius = CEO_ROOM_RADIUS;
        break;
    }
  }

  /** Trigger reveal: expand clear zone to full map + fade out. */
  skip(): void {
    if (this.destroyed) return;
    this.targetRadius = this.fullMapRadius;
    this.fadingOut = true;
  }

  /** Update the clear zone center (for tracking a moving character). */
  setCenter(x: number, y: number): void {
    if (this.destroyed) return;
    this.clearCenterX = x;
    this.clearCenterY = y;
    // Force redraw on next update
    this.lastDrawnRadius = -1;
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
      let attempts = 0;
      do {
        x = Math.random() * this.mapWidth;
        y = Math.random() * this.mapHeight;
      } while (this.distFromCenter(x, y) < CEO_ROOM_RADIUS + 30 && ++attempts < 100);

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
