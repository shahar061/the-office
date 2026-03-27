import { Container, Text, Graphics, Rectangle } from 'pixi.js';
import { OutlineFilter } from 'pixi-filters';
import type { ZoneRect } from './engine/TiledMapRenderer';
import { AGENT_COLORS, type AgentRole } from '../../../../shared/types';

interface InteractiveObjectConfig {
  name: string;
  label: string;
  agentRole: AgentRole;
  rect: ZoneRect;
}

interface ObjectState {
  config: InteractiveObjectConfig;
  group: Container;
  outlineFilter: OutlineFilter;
  tooltip: Container;
  available: boolean;
  hovered: boolean;
}

const ARTIFACT_MAP: Record<string, { label: string; agentRole: AgentRole }> = {
  'artifact-vision-brief': { label: 'Vision Brief', agentRole: 'ceo' },
  'artifact-prd': { label: 'PRD', agentRole: 'product-manager' },
  'artifact-market-analysis': { label: 'Market Analysis', agentRole: 'market-researcher' },
  'artifact-system-design': { label: 'System Design', agentRole: 'chief-architect' },
};

export class InteractiveObjects {
  readonly container: Container;
  private states: Map<string, ObjectState> = new Map();
  private tileSize: number;
  private onClick: (artifactKey: string) => void;

  constructor(
    interactiveRects: Map<string, ZoneRect>,
    extractedGroups: Map<string, Container>,
    tileSize: number,
    onClick: (artifactKey: string) => void,
  ) {
    this.container = new Container();
    this.container.label = 'interactive-objects';
    this.tileSize = tileSize;
    this.onClick = onClick;

    for (const [name, rect] of interactiveRects) {
      const info = ARTIFACT_MAP[name];
      if (!info) continue;

      const group = extractedGroups.get(name);
      if (!group) continue;

      const config: InteractiveObjectConfig = { name, label: info.label, agentRole: info.agentRole, rect };
      const state = this.setupObject(config, group);
      this.states.set(name, state);
    }
  }

  private setupObject(config: InteractiveObjectConfig, group: Container): ObjectState {
    const color = AGENT_COLORS[config.agentRole];
    const colorNum = parseInt(color.slice(1), 16);

    this.container.addChild(group);

    // Create outline filter (hidden by default via alpha 0)
    const outlineFilter = new OutlineFilter({
      thickness: 2,
      color: colorNum,
      alpha: 0,
      quality: 0.5,
    });
    group.filters = [outlineFilter];

    // Hit area covers the full multi-tile region (relative to container origin)
    const hitW = config.rect.width * this.tileSize;
    const hitH = config.rect.height * this.tileSize;
    group.hitArea = new Rectangle(0, 0, hitW, hitH);

    // Disabled until available
    group.eventMode = 'none';
    group.cursor = 'default';

    // Tooltip above the group
    const tooltip = this.createTooltip(config, group, color, colorNum);
    this.container.addChild(tooltip);

    // Events
    group.on('pointerover', () => this.onHover(config.name, true));
    group.on('pointerout', () => this.onHover(config.name, false));
    group.on('pointertap', () => {
      const key = config.name.replace('artifact-', '');
      this.onClick(key);
    });

    return {
      config,
      group,
      outlineFilter,
      tooltip,
      available: false,
      hovered: false,
    };
  }

  private createTooltip(
    config: InteractiveObjectConfig,
    group: Container,
    color: string,
    colorNum: number,
  ): Container {
    const tooltip = new Container();
    tooltip.visible = false;

    const tooltipText = new Text({
      text: config.label,
      style: { fontSize: 9, fill: color, fontFamily: 'monospace' },
    });
    const tooltipPadX = 6;
    const tooltipPadY = 3;
    const tooltipW = tooltipText.width + tooltipPadX * 2;
    const tooltipH = tooltipText.height + tooltipPadY * 2;

    const tooltipBg = new Graphics();
    tooltipBg.setStrokeStyle({ width: 1, color: colorNum });
    tooltipBg.roundRect(0, 0, tooltipW, tooltipH, 3);
    tooltipBg.fill({ color: 0x1a1a2e });
    tooltipBg.stroke();

    tooltipText.x = tooltipPadX;
    tooltipText.y = tooltipPadY;

    tooltip.addChild(tooltipBg, tooltipText);

    // Position centered above the full group width
    const groupW = config.rect.width * this.tileSize;
    tooltip.x = group.x + groupW / 2 - tooltipW / 2;
    tooltip.y = group.y - tooltipH - 4;

    return tooltip;
  }

  private onHover(name: string, hovered: boolean): void {
    const state = this.states.get(name);
    if (!state || !state.available) return;
    state.hovered = hovered;
    state.tooltip.visible = hovered;
    state.outlineFilter.alpha = hovered ? 1 : 0;
  }

  setAvailable(objectName: string, available: boolean): void {
    const state = this.states.get(objectName);
    if (!state) return;
    state.available = available;
    state.group.eventMode = available ? 'static' : 'none';
    state.group.cursor = available ? 'pointer' : 'default';
    if (!available) {
      state.tooltip.visible = false;
      state.outlineFilter.alpha = 0;
      state.hovered = false;
    }
  }

  update(_dt: number): void {
    // No-op for now
  }
}
