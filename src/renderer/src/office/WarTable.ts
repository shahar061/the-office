import { Container, Graphics, Polygon, Text } from 'pixi.js';
import { OutlineFilter } from 'pixi-filters';
import type { PolygonObject } from './engine/TiledMapRenderer';
import type { WarTableVisualState } from '../../../shared/types';

const GLOW_REVIEW = 0x0ea5e9;
const GLOW_COMPLETE = 0x22c55e;
const WAR_TABLE_COLOR = '#0ea5e9';
const WAR_TABLE_COLOR_NUM = 0x0ea5e9;

export class WarTable {
  readonly container: Container;
  private group: Container;
  private outlineFilter: OutlineFilter;
  private tooltip: Container;
  private visualState: WarTableVisualState = 'empty';
  private glowAlpha = 0;
  private glowDirection = 1;
  private tileSize: number;
  private polyObj: PolygonObject;

  constructor(
    group: Container,
    polyObj: PolygonObject,
    tileSize: number,
    onClick: () => void,
  ) {
    this.tileSize = tileSize;
    this.polyObj = polyObj;
    this.group = group;
    this.container = new Container();
    this.container.label = 'war-table';

    this.container.addChild(group);

    // Outline filter for glow (hidden by default)
    this.outlineFilter = new OutlineFilter({
      thickness: 2,
      color: GLOW_REVIEW,
      alpha: 0,
      quality: 0.5,
    });
    group.filters = [this.outlineFilter];

    // Hit area from polygon — points are relative to object origin,
    // but the group is positioned at rect origin. Offset accordingly.
    const offsetX = this.polyObj.originX - polyObj.rect.x * tileSize;
    const offsetY = this.polyObj.originY - polyObj.rect.y * tileSize;
    const flatPoints: number[] = [];
    for (const pt of polyObj.polygonPoints) {
      flatPoints.push(pt.x + offsetX, pt.y + offsetY);
    }
    group.hitArea = new Polygon(flatPoints);

    // Tooltip
    this.tooltip = this.createTooltip();
    this.tooltip.visible = false;
    this.container.addChild(this.tooltip);

    // Disabled by default
    group.eventMode = 'none';
    group.cursor = 'default';

    group.on('pointertap', () => onClick());
    group.on('pointerover', () => { this.tooltip.visible = true; this.outlineFilter.alpha = 1; });
    group.on('pointerout', () => { this.tooltip.visible = false; this.outlineFilter.alpha = 0; });
  }

  private createTooltip(): Container {
    const tooltip = new Container();
    const text = new Text({
      text: 'War Room',
      style: { fontSize: 9, fill: WAR_TABLE_COLOR, fontFamily: 'monospace' },
    });
    const padX = 6;
    const padY = 3;
    const bg = new Graphics();
    bg.setStrokeStyle({ width: 1, color: WAR_TABLE_COLOR_NUM });
    bg.roundRect(0, 0, text.width + padX * 2, text.height + padY * 2, 3);
    bg.fill({ color: 0x1a1a2e });
    bg.stroke();
    text.x = padX;
    text.y = padY;
    tooltip.addChild(bg, text);

    // Position centered above the group
    const groupW = this.polyObj.rect.width * this.tileSize;
    const tooltipW = text.width + padX * 2;
    const tooltipH = text.height + padY * 2;
    tooltip.x = this.group.x + groupW / 2 - tooltipW / 2;
    tooltip.y = this.group.y - tooltipH - 4;
    return tooltip;
  }

  setState(state: WarTableVisualState): void {
    this.visualState = state;

    switch (state) {
      case 'empty':
        this.group.eventMode = 'none';
        this.group.cursor = 'default';
        this.outlineFilter.alpha = 0;
        this.tooltip.visible = false;
        break;
      case 'growing':
      case 'expanding':
        this.group.eventMode = 'none';
        this.group.cursor = 'default';
        this.outlineFilter.alpha = 0;
        break;
      case 'review':
        this.group.eventMode = 'static';
        this.group.cursor = 'pointer';
        this.outlineFilter.color = GLOW_REVIEW;
        this.glowAlpha = 0.3;
        break;
      case 'complete':
        this.group.eventMode = 'static';
        this.group.cursor = 'pointer';
        this.outlineFilter.color = GLOW_COMPLETE;
        this.glowAlpha = 0.3;
        break;
      case 'persisted':
        this.group.eventMode = 'static';
        this.group.cursor = 'pointer';
        this.outlineFilter.alpha = 0;
        break;
    }
  }

  /** Get the tile position of the war table center (for character pathfinding). */
  getTableTile(): { x: number; y: number } {
    const rect = this.polyObj.rect;
    return {
      x: rect.x + Math.floor(rect.width / 2),
      y: rect.y + Math.floor(rect.height / 2),
    };
  }

  /** Get pixel center of the war table (for camera targeting). */
  getPixelCenter(): { x: number; y: number } {
    const rect = this.polyObj.rect;
    return {
      x: (rect.x + rect.width / 2) * this.tileSize,
      y: (rect.y + rect.height / 2) * this.tileSize,
    };
  }

  update(dt: number): void {
    if (this.visualState === 'review' || this.visualState === 'complete') {
      this.glowAlpha += this.glowDirection * dt * 0.8;
      if (this.glowAlpha >= 0.7) { this.glowAlpha = 0.7; this.glowDirection = -1; }
      if (this.glowAlpha <= 0.3) { this.glowAlpha = 0.3; this.glowDirection = 1; }
      this.outlineFilter.alpha = this.glowAlpha;
    }
  }

  reset(): void {
    this.setState('empty');
  }
}
