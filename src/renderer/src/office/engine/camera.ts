import { Container } from 'pixi.js';
import type { ZoneRect } from './TiledMapRenderer';

export interface CameraTarget {
  x: number;
  y: number;
  zoom: number;
}

const PHASE_ZOOM: Record<string, number> = {
  imagine: 2.5,
  warroom: 2.0,
  build: 1.5,
};

const LERP_SPEED = 0.04;

export class Camera {
  private container: Container;
  private phaseTargets: Record<string, CameraTarget>;
  private currentX = 320;
  private currentY = 192;
  private currentZoom = 1.5;
  private targetX = 320;
  private targetY = 192;
  private targetZoom = 1.5;
  private viewWidth = 960;
  private viewHeight = 800;
  private manualOverride = false;
  private mapWidth = 960;
  private mapHeight = 640;

  constructor(container: Container, zones?: Map<string, ZoneRect>) {
    this.container = container;
    this.phaseTargets = this.buildPhaseTargets(zones);
  }

  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  private getMinZoom(): number {
    if (this.viewWidth === 0 || this.viewHeight === 0) return 1;
    return Math.max(this.viewWidth / this.mapWidth, this.viewHeight / this.mapHeight);
  }

  private buildPhaseTargets(zones?: Map<string, ZoneRect>): Record<string, CameraTarget> {
    const fallback = { x: this.mapWidth / 2, y: this.mapHeight / 2, zoom: 1.5 };
    if (!zones) return { imagine: fallback, warroom: fallback, build: fallback };

    const targets: Record<string, CameraTarget> = {};

    // imagine → boardroom zone center
    const boardroom = zones.get('boardroom');
    if (boardroom) {
      targets.imagine = {
        x: (boardroom.x + boardroom.width / 2) * 16,
        y: (boardroom.y + boardroom.height / 2) * 16,
        zoom: PHASE_ZOOM.imagine,
      };
    } else {
      targets.imagine = fallback;
    }

    // warroom → open-work-area zone center
    const openArea = zones.get('open-work-area');
    if (openArea) {
      targets.warroom = {
        x: (openArea.x + openArea.width / 2) * 16,
        y: (openArea.y + openArea.height / 2) * 16,
        zoom: PHASE_ZOOM.warroom,
      };
    } else {
      targets.warroom = fallback;
    }

    // build → full map center (zoom out)
    // Use a broader view — average of all zone centers or use the open area
    if (openArea) {
      targets.build = {
        x: (openArea.x + openArea.width / 2) * 16,
        y: (openArea.y + openArea.height / 2) * 16,
        zoom: PHASE_ZOOM.build,
      };
    } else {
      targets.build = fallback;
    }

    return targets;
  }

  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  focusOnPhase(phase: string): void {
    if (this.manualOverride) return;
    const target = this.phaseTargets[phase];
    if (target) {
      this.targetX = target.x;
      this.targetY = target.y;
      this.targetZoom = Math.max(target.zoom, this.getMinZoom());
    }
  }

  panTo(x: number, y: number): void {
    this.manualOverride = true;
    this.targetX = x;
    this.targetY = y;
  }

  setZoom(zoom: number): void {
    this.manualOverride = true;
    this.targetZoom = Math.max(this.getMinZoom(), Math.min(4, zoom));
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

    // Clamp to map bounds — no empty space beyond edges
    const minX = this.viewWidth - this.mapWidth * this.currentZoom;
    const minY = this.viewHeight - this.mapHeight * this.currentZoom;
    this.container.x = Math.min(0, Math.max(minX, this.container.x));
    this.container.y = Math.min(0, Math.max(minY, this.container.y));
  }
}
