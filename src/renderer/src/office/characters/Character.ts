import { Graphics, Texture } from 'pixi.js';
import { CharacterSprite, type Direction, type AnimState } from './CharacterSprite';
import { findPath } from '../engine/pathfinding';
import type { TiledMapRenderer } from '../engine/TiledMapRenderer';
import { AGENT_COLORS, type AgentRole, type CharacterState } from '@shared/types';
import { ToolBubble } from './ToolBubble';

export type CharacterAnimation = 'idle' | 'walk' | 'type' | 'read';

function lerp(a: number, b: number, t: number): number {
  const tt = Math.min(Math.max(t, 0), 1);
  return a + (b - a) * tt;
}

const SNAP_THRESHOLD_PX = 100;
const LERP_WINDOW_S = 0.1; // reach target in ~100ms

const SPEED = 48;

interface WanderBounds {
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
}

interface CharacterOptions {
  agentId: string;
  role: AgentRole;
  mapRenderer: TiledMapRenderer;
  frames: Texture[][];
  wanderBounds?: WanderBounds;
  deskOverride?: { x: number; y: number };
}

export class Character {
  readonly agentId: string;
  readonly role: AgentRole;
  readonly sprite: CharacterSprite;

  private state: CharacterAnimation = 'idle';
  private mapRenderer: TiledMapRenderer;
  private deskTile: { x: number; y: number };
  private px: number;
  private py: number;
  private path: { x: number; y: number }[] = [];
  private pendingWork: CharacterAnimation | null = null;
  private direction: Direction = 'down';
  private idleTimer = 0;
  private idleWanderDelay = 3 + Math.random() * 5;
  private wanderBounds: WanderBounds | null = null;

  private arrivalCallback: (() => void) | null = null;
  public isVisible: boolean = false;
  private fadeDirection: 'in' | 'out' | null = null;
  private fadeDuration: number = 0;
  private fadeElapsed: number = 0;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private toolBubble: ToolBubble;
  private workGlow: Graphics;
  private workGlowElapsed = 0;

  constructor(options: CharacterOptions) {
    this.agentId = options.agentId;
    this.role = options.role;
    this.mapRenderer = options.mapRenderer;
    this.sprite = new CharacterSprite(options.frames);

    // Look up desk position from spawn points (or use explicit override for clones)
    this.deskTile = options.deskOverride
      ?? this.mapRenderer.getSpawnPoint('desk-' + options.role)
      ?? { x: 1, y: 1 };

    this.wanderBounds = options.wanderBounds ?? null;

    const pos = this.mapRenderer.tileToPixel(this.deskTile.x, this.deskTile.y);
    this.px = pos.x + this.mapRenderer.tileSize / 2;
    this.py = pos.y + this.mapRenderer.tileSize;
    this.sprite.setPosition(this.px, this.py);
    this.toolBubble = new ToolBubble();

    // Soft pulsing halo shown behind the sprite while the character is
    // typing/reading — gives the user a clear "this agent is working" cue
    // even when no tool bubble is visible (e.g. during long writes).
    const haloColor = parseInt((AGENT_COLORS[options.role] ?? '#a5b4fc').slice(1), 16);
    this.workGlow = new Graphics();
    this.workGlow.circle(0, 0, 18);
    this.workGlow.fill({ color: haloColor, alpha: 1 });
    this.workGlow.alpha = 0;
    this.workGlow.eventMode = 'none';
  }

  getAnimation(): CharacterAnimation {
    return this.state;
  }

  getStateSnapshot(): CharacterState {
    return {
      agentId: this.agentId,
      x: this.px,
      y: this.py,
      direction: this.direction,
      animation: this.state,
      visible: this.isVisible,
      alpha: this.sprite.container.alpha,
      toolBubble: this.toolBubble.getPublicState(),
    };
  }

  applyDrivenState(target: CharacterState, dt: number): void {
    const dx = target.x - this.px;
    const dy = target.y - this.py;
    const shouldSnap = Math.abs(dx) > SNAP_THRESHOLD_PX || Math.abs(dy) > SNAP_THRESHOLD_PX;
    if (shouldSnap) {
      this.px = target.x;
      this.py = target.y;
    } else {
      const t = Math.min(1, dt / LERP_WINDOW_S);
      this.px = lerp(this.px, target.x, t);
      this.py = lerp(this.py, target.y, t);
    }
    this.sprite.setPosition(this.px, this.py);

    // Alpha interpolation
    const currentAlpha = this.sprite.container.alpha;
    const alphaT = Math.min(1, dt / LERP_WINDOW_S);
    this.sprite.setAlpha(lerp(currentAlpha, target.alpha, alphaT));

    // Snap direction + animation — they're discrete transitions
    if (this.direction !== target.direction) {
      this.direction = target.direction;
      this.sprite.setAnimation(this.state, this.direction);
    }
    if (this.state !== target.animation) {
      this.state = target.animation;
      this.sprite.setAnimation(this.state, this.direction);
    }

    // Visibility + tool bubble
    this.isVisible = target.visible;
    this.toolBubble.setTarget(target.toolBubble);
    this.toolBubble.setPosition(this.px, this.py);
  }

  getTilePosition(): { x: number; y: number } {
    return this.mapRenderer.pixelToTile(this.px, this.py - 1);
  }

  getPixelPosition(): { x: number; y: number } {
    return { x: this.px, y: this.py };
  }

  moveTo(tile: { x: number; y: number }): void {
    const currentTile = this.getTilePosition();
    const path = findPath(this.mapRenderer, currentTile, tile);
    if (path && path.length > 0) {
      this.path = path;
      this.state = 'walk';
      this.sprite.setAnimation('walk', this.direction);
    }
  }

  walkToAndThen(tile: { x: number; y: number }, callback: () => void): void {
    this.arrivalCallback = callback;
    this.moveTo(tile);
  }

  setWorking(workType: 'type' | 'read'): void {
    const currentTile = this.getTilePosition();
    if (currentTile.x === this.deskTile.x && currentTile.y === this.deskTile.y) {
      this.state = workType;
      this.sprite.setAnimation(workType, this.workingDirection());
    } else {
      this.pendingWork = workType;
      this.moveTo(this.deskTile);
    }
  }

  private workingDirection(): Direction {
    // Per-role desk orientation overrides:
    //   - CEO's monitor sits below him, so he faces the camera (down)
    //   - Market researcher's monitor is to the left of her desk, so she faces left
    //   - All other agents default to facing up at their desks
    if (this.role === 'ceo') return 'down';
    if (this.role === 'market-researcher') return 'left';
    return 'up';
  }

  setIdle(): void {
    this.state = 'idle';
    this.pendingWork = null;
    this.path = [];
    this.idleTimer = 0;
    this.idleWanderDelay = 3 + Math.random() * 5;
    this.sprite.setAnimation('idle', this.direction);
  }

  getDeskTile(): { x: number; y: number } {
    return this.deskTile;
  }

  repositionTo(tx: number, ty: number): void {
    const pos = this.mapRenderer.tileToPixel(tx, ty);
    this.px = pos.x + this.mapRenderer.tileSize / 2;
    this.py = pos.y + this.mapRenderer.tileSize;
    this.sprite.setPosition(this.px, this.py);
  }

  enableClick(): void {
    this.sprite.container.eventMode = 'static';
    this.sprite.container.cursor = 'pointer';
    this.sprite.container.on('pointertap', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('character-click', {
        detail: { role: this.role, agentId: this.agentId, state: this.state },
      }));
    });
  }

  showToolBubble(toolName: string, target: string): void {
    this.toolBubble.show(toolName, target);
  }

  hideToolBubble(): void {
    this.toolBubble.startLinger();
  }

  show(parent: import('pixi.js').Container): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.isVisible = true;
    this.sprite.setAlpha(0);
    parent.addChild(this.workGlow);
    parent.addChild(this.sprite.container);
    parent.addChild(this.toolBubble.container);
    this.enableClick();
    this.fadeDirection = 'in';
    this.fadeDuration = 0.5;
    this.fadeElapsed = 0;
  }

  hide(delay: number = 3000): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.fadeDirection = 'out';
      this.fadeDuration = 1.0;
      this.fadeElapsed = 0;
    }, delay);
  }

  update(dt: number): void {
    // Process fade animation even when not fully visible
    if (this.fadeDirection) {
      this.fadeElapsed += dt;
      const t = Math.min(this.fadeElapsed / this.fadeDuration, 1);
      const alpha = this.fadeDirection === 'in' ? t : 1 - t;
      this.sprite.setAlpha(alpha);
      if (t >= 1) {
        this.fadeDirection = null;
        if (alpha === 0) {
          this.isVisible = false;
          this.sprite.container.parent?.removeChild(this.sprite.container);
          this.toolBubble.hide();
          this.toolBubble.container.parent?.removeChild(this.toolBubble.container);
          this.workGlow.parent?.removeChild(this.workGlow);
        }
      }
    }

    this.toolBubble.update(dt);

    // Skip movement/idle logic when not visible
    if (!this.isVisible) return;

    if (this.state === 'walk') {
      this.updateWalk(dt);
    } else if (this.state === 'idle') {
      this.updateIdle(dt);
    }
    // Y-sort: characters closer to bottom render in front
    this.sprite.container.zIndex = this.py;
    // Bubble floats above all characters
    this.toolBubble.setPosition(this.px, this.py);
    this.toolBubble.container.zIndex = 100000;

    // Working halo: pulses while typing/reading; sits centred under the
    // sprite torso (a half tile above the character's feet) and renders
    // just below the sprite via zIndex.
    const isWorking = this.state === 'type' || this.state === 'read';
    const ts = this.mapRenderer.tileSize;
    this.workGlow.x = this.px;
    this.workGlow.y = this.py - ts / 2;
    this.workGlow.zIndex = this.py - 1;
    if (isWorking) {
      this.workGlowElapsed += dt;
      // Pulse alpha + scale at the active theme's halo cadence. Each
      // theme defines --halo-alpha-min / --halo-alpha-max / --halo-pulse-ms
      // on <html data-theme>; we read them per frame (cheap — getComputedStyle
      // on the documentElement is constant-time and cached by the browser
      // once theme stops changing). Falls back to the Dark defaults if a
      // var is missing.
      const cs = getComputedStyle(document.documentElement);
      const aMin = parseFloat(cs.getPropertyValue('--halo-alpha-min')) || 0.18;
      const aMax = parseFloat(cs.getPropertyValue('--halo-alpha-max')) || 0.45;
      const pulseMs = parseFloat(cs.getPropertyValue('--halo-pulse-ms')) || 1200;
      const halfPeriodSec = pulseMs / 2000;
      const phase = (Math.sin(this.workGlowElapsed * Math.PI / halfPeriodSec) + 1) / 2;
      const baseAlpha = aMin + (aMax - aMin) * phase;
      this.workGlow.alpha = baseAlpha * this.sprite.container.alpha;
      const scale = 0.95 + 0.15 * phase;
      this.workGlow.scale.set(scale);
    } else {
      this.workGlow.alpha = 0;
      this.workGlowElapsed = 0;
    }
  }

  private updateWalk(dt: number): void {
    if (this.path.length === 0) {
      if (this.pendingWork) {
        this.state = this.pendingWork;
        this.pendingWork = null;
        this.sprite.setAnimation(this.state as AnimState, this.workingDirection());
      } else {
        this.setIdle();
      }
      // Fire arrival callback after state transition
      if (this.arrivalCallback) {
        const cb = this.arrivalCallback;
        this.arrivalCallback = null;
        cb();
      }
      return;
    }

    const target = this.path[0];
    const targetPx = target.x * this.mapRenderer.tileSize + this.mapRenderer.tileSize / 2;
    const targetPy = target.y * this.mapRenderer.tileSize + this.mapRenderer.tileSize;

    const dx = targetPx - this.px;
    const dy = targetPy - this.py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      this.px = targetPx;
      this.py = targetPy;
      this.path.shift();
      return;
    }

    const step = Math.min(SPEED * dt, dist);
    this.px += (dx / dist) * step;
    this.py += (dy / dist) * step;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 'right' : 'left';
    } else {
      this.direction = dy > 0 ? 'down' : 'up';
    }

    this.sprite.setAnimation('walk', this.direction);
    this.sprite.setPosition(this.px, this.py);
  }

  private updateIdle(dt: number): void {
    this.idleTimer += dt;
    if (this.idleTimer >= this.idleWanderDelay) {
      this.idleTimer = 0;
      this.idleWanderDelay = 3 + Math.random() * 5;
      this.wanderToRandomTile();
    }
  }

  private wanderToRandomTile(): void {
    const current = this.getTilePosition();
    const range = 4;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = current.x + Math.floor(Math.random() * range * 2) - range;
      const ty = current.y + Math.floor(Math.random() * range * 2) - range;
      if (this.wanderBounds) {
        const { tileX, tileY, tileW, tileH } = this.wanderBounds;
        if (tx < tileX || tx >= tileX + tileW || ty < tileY || ty >= tileY + tileH) {
          continue;
        }
      }
      if (this.mapRenderer.isWalkable(tx, ty)) {
        this.moveTo({ x: tx, y: ty });
        return;
      }
    }
  }

  destroy(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.toolBubble.destroy();
    this.sprite.destroy();
    this.workGlow.destroy();
  }
}
