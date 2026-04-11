import { Container } from 'pixi.js';

const ZOOM = 2.0;
const LERP = 0.08;
const IDLE_MS_BEFORE_CENTROID = 5_000;

interface Vec2 { x: number; y: number; }

export class PortraitCamera {
  private container: Container;
  private currentX = 0;
  private currentY = 0;
  private viewportW = 400;
  private viewportH = 600;
  private mapW = 640;
  private mapH = 480;
  private activeTarget: Vec2 | null = null;
  private phaseCentroid: Vec2 | null = null;
  private lastTargetUpdateAt = 0;
  private nowMs = 0;

  constructor(container: Container) {
    this.container = container;
  }

  getZoom(): number { return ZOOM; }
  getPosition(): Vec2 { return { x: this.currentX, y: this.currentY }; }

  setViewport(w: number, h: number): void { this.viewportW = w; this.viewportH = h; }
  setMapSize(w: number, h: number): void { this.mapW = w; this.mapH = h; }

  setActiveCharacter(pos: Vec2 | null): void {
    this.activeTarget = pos;
    if (pos) this.lastTargetUpdateAt = this.nowMs;
  }

  setPhaseCentroid(pos: Vec2 | null): void { this.phaseCentroid = pos; }

  tick(deltaMs: number): void {
    this.nowMs += deltaMs;

    const target = this.pickTarget();
    if (!target) return;

    this.currentX += (target.x - this.currentX) * LERP;
    this.currentY += (target.y - this.currentY) * LERP;

    // Clamp to map bounds — account for viewport/zoom
    const halfW = this.viewportW / (2 * ZOOM);
    const halfH = this.viewportH / (2 * ZOOM);
    if (this.currentX < halfW) this.currentX = halfW;
    if (this.currentX > this.mapW - halfW) this.currentX = Math.max(halfW, this.mapW - halfW);
    if (this.currentY < halfH) this.currentY = halfH;
    if (this.currentY > this.mapH - halfH) this.currentY = Math.max(halfH, this.mapH - halfH);

    // Apply to PIXI container
    this.container.position.set(
      this.viewportW / 2 - this.currentX * ZOOM,
      this.viewportH / 2 - this.currentY * ZOOM,
    );
    this.container.scale.set(ZOOM);
  }

  private pickTarget(): Vec2 | null {
    const idle = this.nowMs - this.lastTargetUpdateAt > IDLE_MS_BEFORE_CENTROID;
    if (!idle && this.activeTarget) return this.activeTarget;
    if (this.phaseCentroid) return this.phaseCentroid;
    return this.activeTarget;
  }
}
