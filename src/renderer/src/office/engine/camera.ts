import { Container } from 'pixi.js';
import type { ZoneRect } from './TiledMapRenderer';

export interface CameraTarget {
  x: number;
  y: number;
  zoom: number;
}

const PHASE_ZOOM: Record<string, number> = {
  imagine: 1.5,
  warroom: 1.2,
  build: 1.0,
};

const LERP_SPEED = 0.04;

export class Camera {
  private container: Container;
  private phaseTargets: Record<string, CameraTarget>;
  private currentX = 320;
  private currentY = 240;
  private currentZoom = 1.0;
  private targetX = 320;
  private targetY = 240;
  private targetZoom = 1.0;
  private viewWidth = 960;
  private viewHeight = 800;
  private manualOverride = false;
  private mapWidth = 640;
  private mapHeight = 480;
  private nudgeOffsetX: number = 0;
  private nudgeOffsetY: number = 0;
  private nudgeElapsed: number = 0;
  private nudgeDuration: number = 0;
  private nudgeStrength: number = 0.3;

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
    return Math.min(this.viewWidth / this.mapWidth, this.viewHeight / this.mapHeight);
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

  getWorldX(): number { return this.currentX; }
  getWorldY(): number { return this.currentY; }
  getZoom(): number { return this.currentZoom; }
  getViewWidth(): number { return this.viewWidth; }
  getViewHeight(): number { return this.viewHeight; }

  /** Actual visible world-space bounds after map-edge clamping. */
  getVisibleBounds(): { left: number; right: number; top: number; bottom: number } {
    const cx = this.container.x;
    const cy = this.container.y;
    const z = this.currentZoom || 1;
    return {
      left: -cx / z,
      top: -cy / z,
      right: (this.viewWidth - cx) / z,
      bottom: (this.viewHeight - cy) / z,
    };
  }

  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    // Ensure zoom stays at least the minimum to fill the viewport
    const minZoom = this.getMinZoom();
    if (this.targetZoom < minZoom) {
      this.targetZoom = minZoom;
    }
  }

  /**
   * Focus on the target zone for a phase. The zoom is at least
   * getMinZoom() so the map always fills the viewport.
   */
  focusOnPhase(phase: string): void {
    if (this.manualOverride) return;
    const target = this.phaseTargets[phase];
    const minZoom = this.getMinZoom();
    if (target) {
      this.targetX = target.x;
      this.targetY = target.y;
      this.targetZoom = Math.max(target.zoom, minZoom);
    } else {
      // Default: center map, fit to screen
      this.targetX = this.mapWidth / 2;
      this.targetY = this.mapHeight / 2;
      this.targetZoom = minZoom;
    }
  }

  /**
   * Fit the entire map to the current viewport.
   */
  fitToScreen(): void {
    this.manualOverride = false;
    this.targetX = this.mapWidth / 2;
    this.targetY = this.mapHeight / 2;
    this.targetZoom = this.getMinZoom();
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

  /** Instantly snap to a position + zoom (no LERP animation). */
  snapTo(x: number, y: number, zoom: number): void {
    this.manualOverride = true;
    this.targetX = x;
    this.targetY = y;
    this.currentX = x;
    this.currentY = y;
    const z = Math.max(this.getMinZoom(), Math.min(4, zoom));
    this.targetZoom = z;
    this.currentZoom = z;
  }

  resetToPhase(phase: string): void {
    this.manualOverride = false;
    this.focusOnPhase(phase);
  }

  nudgeToward(worldX: number, worldY: number, duration: number = 1500): void {
    if (this.manualOverride) return;
    const dx = worldX - this.targetX;
    const dy = worldY - this.targetY;
    this.nudgeOffsetX = dx * this.nudgeStrength;
    this.nudgeOffsetY = dy * this.nudgeStrength;
    this.nudgeElapsed = 0;
    this.nudgeDuration = duration / 1000;
  }

  update(): void {
    this.currentX += (this.targetX - this.currentX) * LERP_SPEED;
    this.currentY += (this.targetY - this.currentY) * LERP_SPEED;
    this.currentZoom += (this.targetZoom - this.currentZoom) * LERP_SPEED;

    // Apply and decay nudge offset
    if (this.nudgeDuration > 0) {
      this.nudgeElapsed += 1 / 60;
      const t = Math.min(this.nudgeElapsed / this.nudgeDuration, 1);
      const ease = 1 - t;
      this.currentX += this.nudgeOffsetX * ease;
      this.currentY += this.nudgeOffsetY * ease;
      if (t >= 1) {
        this.nudgeDuration = 0;
        this.nudgeOffsetX = 0;
        this.nudgeOffsetY = 0;
      }
    }

    this.container.scale.set(this.currentZoom);
    this.container.x = this.viewWidth / 2 - this.currentX * this.currentZoom;
    this.container.y = this.viewHeight / 2 - this.currentY * this.currentZoom;

    // Clamp to map bounds — center if map is smaller than viewport
    const scaledW = this.mapWidth * this.currentZoom;
    const scaledH = this.mapHeight * this.currentZoom;
    if (scaledW <= this.viewWidth) {
      this.container.x = (this.viewWidth - scaledW) / 2;
    } else {
      const minX = this.viewWidth - scaledW;
      this.container.x = Math.min(0, Math.max(minX, this.container.x));
    }
    if (scaledH <= this.viewHeight) {
      this.container.y = (this.viewHeight - scaledH) / 2;
    } else {
      const minY = this.viewHeight - scaledH;
      this.container.y = Math.min(0, Math.max(minY, this.container.y));
    }
  }
}
