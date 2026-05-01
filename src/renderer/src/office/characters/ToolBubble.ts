import { Container, Graphics, Text } from 'pixi.js';

const TOOL_ICONS: Record<string, string> = {
  Write: '>',
  Edit: '>',
  Read: '<',
  Bash: '$',
  Grep: '?',
  Glob: '?',
  Agent: '@',
};

const DEFAULT_ICON = '*';

const PADDING_X = 6;
const PADDING_Y = 3;
const CORNER_RADIUS = 4;
const MAX_WIDTH = 120;
const BG_COLOR = 0x000000;
const BG_ALPHA = 0.75;
const TEXT_COLOR = '#e0e0e0';
const FONT_SIZE = 10;
const RENDER_SCALE = 0.5; // Render at 2x then scale down for crispness
const OFFSET_Y = -36; // 32px sprite height + 4px gap
const FADE_IN_DURATION = 0.15;
const FADE_OUT_DURATION = 0.3;
const LINGER_DURATION = 2.0;
const DOTS_CYCLE_SPEED = 0.5; // seconds per dot change

type BubbleState = 'hidden' | 'fading-in' | 'visible' | 'lingering' | 'fading-out';

export function toolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] ?? DEFAULT_ICON;
}

export class ToolBubble {
  readonly container: Container;
  private inner: Container;
  private bg: Graphics;
  private label: Text;
  private state: BubbleState = 'hidden';
  private fadeElapsed = 0;
  private lingerElapsed = 0;
  private bgW = 0;
  private bgH = 0;
  private isThinking = false;
  private dotsElapsed = 0;
  private dotsPhase = 0;
  private publicToolName: string | null = null;
  private publicTarget: string | undefined = undefined;

  constructor() {
    this.container = new Container();
    this.container.zIndex = 10000;
    this.container.eventMode = 'none';
    this.container.alpha = 0;
    this.container.visible = false;

    // Inner container rendered at 2x, scaled down for crisp text
    this.inner = new Container();
    this.inner.scale.set(RENDER_SCALE);
    this.container.addChild(this.inner);

    this.bg = new Graphics();
    this.label = new Text({
      text: '',
      style: {
        fontSize: FONT_SIZE,
        fill: TEXT_COLOR,
        fontFamily: 'monospace',
      },
    });
    this.label.x = PADDING_X;
    this.label.y = PADDING_Y;

    this.inner.addChild(this.bg, this.label);
  }

  show(toolName: string, target: string): void {
    const icon = toolIcon(toolName);
    this.publicToolName = toolName;
    this.publicTarget = target || undefined;
    this.isThinking = !icon && target === '...';

    if (this.isThinking) {
      this.dotsElapsed = 0;
      this.dotsPhase = 0;
      this.label.text = '.';
    } else {
      const displayText = target ? `${icon} ${target}` : icon;
      this.label.text = displayText;

      // Truncate if too wide
      const maxTextW = MAX_WIDTH / RENDER_SCALE - PADDING_X * 2;
      if (this.label.width > maxTextW) {
        let truncated = displayText;
        let iterations = 0;
        while (truncated.length > 3 && this.label.width > maxTextW && iterations++ < 50) {
          truncated = truncated.slice(0, -2) + '…';
          this.label.text = truncated;
        }
      }
    }

    this.redrawBg();

    if (this.state === 'hidden' || this.state === 'fading-out') {
      this.state = 'fading-in';
      this.fadeElapsed = 0;
      this.container.visible = true;
    } else {
      this.state = 'visible';
      this.container.alpha = 1;
    }

    this.lingerElapsed = 0;
  }

  startLinger(): void {
    if (this.state === 'hidden') return;
    this.state = 'lingering';
    this.lingerElapsed = 0;
  }

  /** Position bubble centred horizontally above a character at world coordinates (px, py). */
  setPosition(px: number, py: number): void {
    const halfBubble = (this.bgW * RENDER_SCALE) / 2;
    this.container.x = px - halfBubble;
    this.container.y = py + OFFSET_Y - this.bgH * RENDER_SCALE;
  }

  hide(): void {
    this.state = 'hidden';
    this.isThinking = false;
    this.container.alpha = 0;
    this.container.visible = false;
    this.publicToolName = null;
    this.publicTarget = undefined;
  }

  update(dt: number): void {
    // Animate thinking dots
    if (this.isThinking && (this.state === 'visible' || this.state === 'fading-in')) {
      this.dotsElapsed += dt;
      const newPhase = Math.floor(this.dotsElapsed / DOTS_CYCLE_SPEED) % 3;
      if (newPhase !== this.dotsPhase) {
        this.dotsPhase = newPhase;
        const dots = ['.', '..', '...'];
        this.label.text = dots[this.dotsPhase];
        this.redrawBg();
      }
    }

    switch (this.state) {
      case 'fading-in': {
        this.fadeElapsed += dt;
        const t = Math.min(this.fadeElapsed / FADE_IN_DURATION, 1);
        this.container.alpha = t;
        if (t >= 1) this.state = 'visible';
        break;
      }
      case 'lingering': {
        this.lingerElapsed += dt;
        if (this.lingerElapsed >= LINGER_DURATION) {
          this.state = 'fading-out';
          this.fadeElapsed = 0;
        }
        break;
      }
      case 'fading-out': {
        this.fadeElapsed += dt;
        const t = Math.min(this.fadeElapsed / FADE_OUT_DURATION, 1);
        this.container.alpha = 1 - t;
        if (t >= 1) this.hide();
        break;
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private redrawBg(): void {
    this.bgW = Math.min(this.label.width + PADDING_X * 2, MAX_WIDTH / RENDER_SCALE);
    this.bgH = this.label.height + PADDING_Y * 2;
    this.bg.clear();
    this.bg.roundRect(0, 0, this.bgW, this.bgH, CORNER_RADIUS);
    this.bg.fill({ color: BG_COLOR, alpha: BG_ALPHA });
  }

  getPublicState(): { toolName: string; target?: string } | null {
    if (!this.publicToolName) return null;
    return this.publicTarget !== undefined
      ? { toolName: this.publicToolName, target: this.publicTarget }
      : { toolName: this.publicToolName };
  }

  setTarget(state: { toolName: string; target?: string } | null): void {
    if (!state) { this.hide(); return; }
    this.show(state.toolName, state.target ?? '');
  }
}
