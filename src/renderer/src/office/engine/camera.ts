import { Container } from 'pixi.js';

export interface CameraTarget {
  x: number;
  y: number;
  zoom: number;
}

const PHASE_TARGETS: Record<string, CameraTarget> = {
  imagine: { x: 80, y: 96, zoom: 2.5 },
  warroom: { x: 256, y: 160, zoom: 2.0 },
  build: { x: 320, y: 192, zoom: 1.5 },
};

const LERP_SPEED = 0.04;

export class Camera {
  private container: Container;
  private currentX = 320;
  private currentY = 192;
  private currentZoom = 1.5;
  private targetX = 320;
  private targetY = 192;
  private targetZoom = 1.5;
  private viewWidth = 960;
  private viewHeight = 800;
  private manualOverride = false;

  constructor(container: Container) {
    this.container = container;
  }

  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  focusOnPhase(phase: string): void {
    if (this.manualOverride) return;
    const target = PHASE_TARGETS[phase];
    if (target) {
      this.targetX = target.x;
      this.targetY = target.y;
      this.targetZoom = target.zoom;
    }
  }

  panTo(x: number, y: number): void {
    this.manualOverride = true;
    this.targetX = x;
    this.targetY = y;
  }

  setZoom(zoom: number): void {
    this.manualOverride = true;
    this.targetZoom = Math.max(0.5, Math.min(4, zoom));
  }

  resetToPhase(phase: string): void {
    this.manualOverride = false;
    this.focusOnPhase(phase);
  }

  update(): void {
    this.currentX += (this.targetX - this.currentX) * LERP_SPEED;
    this.currentY += (this.targetY - this.currentY) * LERP_SPEED;
    this.currentZoom += (this.targetZoom - this.currentZoom) * LERP_SPEED;

    this.container.scale.set(this.currentZoom);
    this.container.x = this.viewWidth / 2 - this.currentX * this.currentZoom;
    this.container.y = this.viewHeight / 2 - this.currentY * this.currentZoom;
  }
}