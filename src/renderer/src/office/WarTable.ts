// src/renderer/src/office/WarTable.ts
import { Container, Graphics, Text } from 'pixi.js';
import type { ZoneRect } from './engine/TiledMapRenderer';
import type { WarTableVisualState, WarTableCard } from '../../../shared/types';

const TABLE_WIDTH = 48;
const TABLE_HEIGHT = 24;
const CARD_WIDTH = 12;
const CARD_HEIGHT = 7;
const CARD_GAP = 2;
const TASK_CARD_WIDTH = 8;
const TASK_CARD_HEIGHT = 5;

const MILESTONE_COLOR = 0x0ea5e9; // PM cyan
const TASK_COLOR = 0x8b5cf6;      // purple for task cards

const GLOW_REVIEW = 0x0ea5e9;     // cyan glow
const GLOW_COMPLETE = 0x22c55e;   // green glow

export class WarTable {
  readonly container: Container;
  private tableBase: Graphics;
  private cardLayer: Container;
  private glowGraphics: Graphics;
  private tooltip: Container;
  private visualState: WarTableVisualState = 'empty';
  private milestones: WarTableCard[] = [];
  private tasks: WarTableCard[] = [];
  private glowAlpha = 0;
  private glowDirection = 1;
  private tileSize: number;
  private onClick: () => void;

  constructor(zone: ZoneRect, tileSize: number, onClick: () => void) {
    this.tileSize = tileSize;
    this.onClick = onClick;
    this.container = new Container();
    this.container.label = 'war-table';

    // Position at zone center
    const centerX = (zone.x + zone.width / 2) * tileSize - TABLE_WIDTH / 2;
    const centerY = (zone.y + zone.height / 2) * tileSize - TABLE_HEIGHT / 2;
    this.container.x = centerX;
    this.container.y = centerY;

    // Table base
    this.tableBase = new Graphics();
    this.drawTableBase(0.6);
    this.container.addChild(this.tableBase);

    // Card layer (on top of table)
    this.cardLayer = new Container();
    this.cardLayer.x = 4;
    this.cardLayer.y = 3;
    this.container.addChild(this.cardLayer);

    // Glow outline (behind table, drawn larger)
    this.glowGraphics = new Graphics();
    this.glowGraphics.visible = false;
    this.container.addChildAt(this.glowGraphics, 0);

    // Tooltip
    this.tooltip = this.createTooltip();
    this.tooltip.visible = false;
    this.container.addChild(this.tooltip);

    // Interaction (disabled by default)
    this.container.eventMode = 'none';
    this.container.cursor = 'default';
    this.container.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= TABLE_WIDTH && y >= 0 && y <= TABLE_HEIGHT };
    this.container.on('pointertap', () => this.onClick());
    this.container.on('pointerover', () => { this.tooltip.visible = true; });
    this.container.on('pointerout', () => { this.tooltip.visible = false; });
  }

  private drawTableBase(alpha: number): void {
    this.tableBase.clear();
    this.tableBase.roundRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT, 2);
    this.tableBase.fill({ color: 0x4a3728, alpha });
    this.tableBase.stroke({ color: 0x3a2a1a, width: 1 });
  }

  private createTooltip(): Container {
    const tooltip = new Container();
    const text = new Text({
      text: 'War Table',
      style: { fontSize: 8, fill: '#0ea5e9', fontFamily: 'monospace' },
    });
    const padX = 4;
    const padY = 2;
    const bg = new Graphics();
    bg.roundRect(0, 0, text.width + padX * 2, text.height + padY * 2, 2);
    bg.fill({ color: 0x1a1a2e });
    bg.stroke({ color: 0x0ea5e9, width: 1 });
    text.x = padX;
    text.y = padY;
    tooltip.addChild(bg, text);
    tooltip.x = TABLE_WIDTH / 2 - (text.width + padX * 2) / 2;
    tooltip.y = -text.height - padY * 2 - 4;
    return tooltip;
  }

  private drawGlow(color: number): void {
    this.glowGraphics.clear();
    this.glowGraphics.roundRect(-3, -3, TABLE_WIDTH + 6, TABLE_HEIGHT + 6, 4);
    this.glowGraphics.stroke({ color, width: 2, alpha: 0.6 });
  }

  setState(state: WarTableVisualState): void {
    this.visualState = state;

    switch (state) {
      case 'empty':
        this.drawTableBase(0.6);
        this.container.eventMode = 'none';
        this.container.cursor = 'default';
        this.glowGraphics.visible = false;
        break;
      case 'growing':
      case 'expanding':
        this.drawTableBase(1.0);
        this.container.eventMode = 'none';
        this.container.cursor = 'default';
        this.glowGraphics.visible = false;
        break;
      case 'review':
        this.drawTableBase(1.0);
        this.container.eventMode = 'static';
        this.container.cursor = 'pointer';
        this.drawGlow(GLOW_REVIEW);
        this.glowGraphics.visible = true;
        this.glowAlpha = 0.3;
        break;
      case 'complete':
        this.drawTableBase(1.0);
        this.container.eventMode = 'static';
        this.container.cursor = 'pointer';
        this.drawGlow(GLOW_COMPLETE);
        this.glowGraphics.visible = true;
        this.glowAlpha = 0.3;
        break;
      case 'persisted':
        this.drawTableBase(1.0);
        this.container.eventMode = 'static';
        this.container.cursor = 'pointer';
        this.glowGraphics.visible = false;
        break;
    }
  }

  addCard(card: WarTableCard): void {
    if (card.type === 'milestone') {
      this.milestones.push(card);
    } else {
      this.tasks.push(card);
    }
    this.redrawCards();
  }

  private redrawCards(): void {
    this.cardLayer.removeChildren();

    let x = 0;
    let y = 0;

    // Draw milestones
    for (const _m of this.milestones) {
      const card = new Graphics();
      card.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 1);
      card.fill({ color: MILESTONE_COLOR });
      card.x = x;
      card.y = y;
      this.cardLayer.addChild(card);
      x += CARD_WIDTH + CARD_GAP;
      if (x + CARD_WIDTH > TABLE_WIDTH - 8) {
        x = 0;
        y += CARD_HEIGHT + CARD_GAP;
      }
    }

    // Draw tasks (smaller, below milestones)
    if (this.tasks.length > 0 && this.milestones.length > 0) {
      x = 0;
      y += CARD_HEIGHT + CARD_GAP;
    }
    for (const _t of this.tasks) {
      const card = new Graphics();
      card.roundRect(0, 0, TASK_CARD_WIDTH, TASK_CARD_HEIGHT, 1);
      card.fill({ color: TASK_COLOR });
      card.x = x;
      card.y = y;
      this.cardLayer.addChild(card);
      x += TASK_CARD_WIDTH + CARD_GAP;
      if (x + TASK_CARD_WIDTH > TABLE_WIDTH - 8) {
        x = 0;
        y += TASK_CARD_HEIGHT + CARD_GAP;
      }
    }
  }

  /** Get the tile position of the war table center (for character pathfinding). */
  getTableTile(): { x: number; y: number } {
    const px = this.container.x + TABLE_WIDTH / 2;
    const py = this.container.y + TABLE_HEIGHT / 2;
    return {
      x: Math.floor(px / this.tileSize),
      y: Math.floor(py / this.tileSize),
    };
  }

  /** Get pixel center of the war table (for camera targeting). */
  getPixelCenter(): { x: number; y: number } {
    return {
      x: this.container.x + TABLE_WIDTH / 2,
      y: this.container.y + TABLE_HEIGHT / 2,
    };
  }

  update(dt: number): void {
    // Pulse glow during review and complete states
    if (this.visualState === 'review' || this.visualState === 'complete') {
      this.glowAlpha += this.glowDirection * dt * 0.8;
      if (this.glowAlpha >= 0.7) { this.glowAlpha = 0.7; this.glowDirection = -1; }
      if (this.glowAlpha <= 0.3) { this.glowAlpha = 0.3; this.glowDirection = 1; }
      this.glowGraphics.alpha = this.glowAlpha;
    }
  }

  reset(): void {
    this.milestones = [];
    this.tasks = [];
    this.cardLayer.removeChildren();
    this.setState('empty');
  }
}
