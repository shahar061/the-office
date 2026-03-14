import { Texture } from 'pixi.js';
import { CharacterSprite, type Direction, type AnimState } from './CharacterSprite';
import { findPath } from '../engine/pathfinding';
import type { TiledMapRenderer } from '../engine/TiledMapRenderer';
import type { AgentRole } from '../../../../shared/types';

export type CharacterState = 'idle' | 'walk' | 'type' | 'read';

const SPEED = 48;

interface CharacterOptions {
  agentId: string;
  role: AgentRole;
  mapRenderer: TiledMapRenderer;
  frames: Texture[][];
}

export class Character {
  readonly agentId: string;
  readonly role: AgentRole;
  readonly sprite: CharacterSprite;

  private state: CharacterState = 'idle';
  private mapRenderer: TiledMapRenderer;
  private deskTile: { x: number; y: number };
  private px: number;
  private py: number;
  private path: { x: number; y: number }[] = [];
  private pendingWork: CharacterState | null = null;
  private direction: Direction = 'down';
  private idleTimer = 0;
  private idleWanderDelay = 3 + Math.random() * 5;

  constructor(options: CharacterOptions) {
    this.agentId = options.agentId;
    this.role = options.role;
    this.mapRenderer = options.mapRenderer;
    this.sprite = new CharacterSprite(options.frames);

    // Look up desk position from spawn points
    const spawnPoint = this.mapRenderer.getSpawnPoint('desk-' + options.role);
    this.deskTile = spawnPoint ?? { x: 1, y: 1 };

    const pos = this.mapRenderer.tileToPixel(this.deskTile.x, this.deskTile.y);
    this.px = pos.x + this.mapRenderer.tileSize / 2;
    this.py = pos.y + this.mapRenderer.tileSize;
    this.sprite.setPosition(this.px, this.py);
  }

  getState(): CharacterState {
    return this.state;
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

  setWorking(workType: 'type' | 'read'): void {
    const currentTile = this.getTilePosition();
    if (currentTile.x === this.deskTile.x && currentTile.y === this.deskTile.y) {
      this.state = workType;
      this.sprite.setAnimation(workType, 'down');
    } else {
      this.pendingWork = workType;
      this.moveTo(this.deskTile);
    }
  }

  setIdle(): void {
    this.state = 'idle';
    this.pendingWork = null;
    this.path = [];
    this.idleTimer = 0;
    this.idleWanderDelay = 3 + Math.random() * 5;
    this.sprite.setAnimation('idle', this.direction);
  }

  update(dt: number): void {
    if (this.state === 'walk') {
      this.updateWalk(dt);
    } else if (this.state === 'idle') {
      this.updateIdle(dt);
    }
    // Y-sort: characters closer to bottom render in front
    this.sprite.container.zIndex = this.py;
  }

  private updateWalk(dt: number): void {
    if (this.path.length === 0) {
      if (this.pendingWork) {
        this.state = this.pendingWork;
        this.pendingWork = null;
        this.sprite.setAnimation(this.state as AnimState, 'down');
      } else {
        this.setIdle();
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
      if (this.mapRenderer.isWalkable(tx, ty)) {
        this.moveTo({ x: tx, y: ty });
        return;
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
