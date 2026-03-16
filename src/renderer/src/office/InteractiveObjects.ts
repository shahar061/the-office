import { Container, Graphics, Text } from 'pixi.js';
import type { ZoneRect } from './engine/TiledMapRenderer';
import { AGENT_COLORS, type AgentRole } from '../../../../shared/types';

interface InteractiveObjectConfig {
  name: string;
  label: string;
  agentRole: AgentRole;
  rect: ZoneRect;
}

interface HitboxState {
  config: InteractiveObjectConfig;
  hitbox: Graphics;
  glowFrame: Graphics;
  tooltip: Container;
  available: boolean;
  hovered: boolean;
  glowAlpha: number;
  glowDirection: number;
}

const ARTIFACT_MAP: Record<string, { label: string; agentRole: AgentRole }> = {
  'artifact-vision-brief': { label: 'Vision Brief', agentRole: 'ceo' },
  'artifact-prd': { label: 'PRD', agentRole: 'product-manager' },
  'artifact-market-analysis': { label: 'Market Analysis', agentRole: 'market-researcher' },
  'artifact-system-design': { label: 'System Design', agentRole: 'chief-architect' },
};

export class InteractiveObjects {
  readonly container: Container;
  private states: Map<string, HitboxState> = new Map();
  private tileSize: number;
  private onClick: (artifactKey: string) => void;

  constructor(
    interactiveRects: Map<string, ZoneRect>,
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

      const config: InteractiveObjectConfig = { name, label: info.label, agentRole: info.agentRole, rect };
      const state = this.createHitbox(config);
      this.states.set(name, state);
    }
  }

  private createHitbox(config: InteractiveObjectConfig): HitboxState {
    const { rect } = config;
    const color = AGENT_COLORS[config.agentRole];
    const colorNum = parseInt(color.slice(1), 16);

    const px = rect.x * this.tileSize;
    const py = rect.y * this.tileSize;
    const pw = rect.width * this.tileSize;
    const ph = rect.height * this.tileSize;

    // Invisible hitbox
    const hitbox = new Graphics();
    hitbox.rect(px, py, pw, ph);
    hitbox.fill({ color: 0x000000, alpha: 0.001 });
    hitbox.eventMode = 'none';
    hitbox.cursor = 'default';
    this.container.addChild(hitbox);

    // Glow frame (hidden by default)
    const glowFrame = new Graphics();
    glowFrame.setStrokeStyle({ width: 2, color: colorNum });
    glowFrame.rect(px - 1, py - 1, pw + 2, ph + 2);
    glowFrame.stroke();
    glowFrame.alpha = 0;
    this.container.addChild(glowFrame);

    // Tooltip (hidden by default)
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
    tooltip.x = px + pw / 2 - tooltipW / 2;
    tooltip.y = py - tooltipH - 4;
    this.container.addChild(tooltip);

    // Events
    hitbox.on('pointerover', () => this.onHover(config.name, true));
    hitbox.on('pointerout', () => this.onHover(config.name, false));
    hitbox.on('pointertap', () => {
      const key = config.name.replace('artifact-', '');
      this.onClick(key);
    });

    return {
      config,
      hitbox,
      glowFrame,
      tooltip,
      available: false,
      hovered: false,
      glowAlpha: 0.4,
      glowDirection: 1,
    };
  }

  private onHover(name: string, hovered: boolean): void {
    const state = this.states.get(name);
    if (!state || !state.available) return;
    state.hovered = hovered;
    state.tooltip.visible = hovered;
    if (!hovered) {
      state.glowFrame.alpha = 0;
    }
  }

  setAvailable(objectName: string, available: boolean): void {
    const state = this.states.get(objectName);
    if (!state) return;
    state.available = available;
    state.hitbox.eventMode = available ? 'static' : 'none';
    state.hitbox.cursor = available ? 'pointer' : 'default';
    if (!available) {
      state.tooltip.visible = false;
      state.glowFrame.alpha = 0;
      state.hovered = false;
    }
  }

  update(dt: number): void {
    for (const state of this.states.values()) {
      if (state.hovered && state.available) {
        // Pulse glow between 0.4 and 0.8
        state.glowAlpha += state.glowDirection * dt * 0.8;
        if (state.glowAlpha >= 0.8) { state.glowAlpha = 0.8; state.glowDirection = -1; }
        if (state.glowAlpha <= 0.4) { state.glowAlpha = 0.4; state.glowDirection = 1; }
        state.glowFrame.alpha = state.glowAlpha;
      }
    }
  }
}
