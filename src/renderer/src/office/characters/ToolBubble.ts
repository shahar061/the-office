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

const PADDING_X = 4;
const PADDING_Y = 2;
const CORNER_RADIUS = 6;
const MAX_WIDTH = 100;
const BG_COLOR = 0x000000;
const BG_ALPHA = 0.75;
const TEXT_COLOR = '#e0e0e0';
const FONT_SIZE = 7;
const OFFSET_Y = -36; // 32px sprite height + 4px gap, relative to anchor(0.5, 1)
const FADE_IN_DURATION = 0.15;
const FADE_OUT_DURATION = 0.3;
const LINGER_DURATION = 2.0;

type BubbleState = 'hidden' | 'fading-in' | 'visible' | 'lingering' | 'fading-out';

export function toolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] ?? DEFAULT_ICON;
}

export class ToolBubble {
  readonly container: Container;
  private bg: Graphics;
  private label: Text;
  private state: BubbleState = 'hidden';
  private fadeElapsed = 0;
  private lingerElapsed = 0;
  private bgW = 0;
  private bgH = 0;

  constructor() {
    this.container = new Container();
    this.container.zIndex = 10000;
    this.container.alpha = 0;
    this.container.visible = false;

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

    this.container.addChild(this.bg, this.label);
  }

  show(icon: string, target: string): void {
    const displayText = target ? `${icon} ${target}` : icon;
    this.label.text = displayText;

    // Truncate if too wide
    if (this.label.width > MAX_WIDTH - PADDING_X * 2) {
      let truncated = displayText;
      let iterations = 0;
      while (truncated.length > 3 && this.label.width > MAX_WIDTH - PADDING_X * 2 && iterations++ < 50) {
        truncated = truncated.slice(0, -2) + '…';
        this.label.text = truncated;
      }
    }

    // Redraw background to fit text
    this.bgW = Math.min(this.label.width + PADDING_X * 2, MAX_WIDTH);
    this.bgH = this.label.height + PADDING_Y * 2;
    this.bg.clear();
    this.bg.roundRect(0, 0, this.bgW, this.bgH, CORNER_RADIUS);
    this.bg.fill({ color: BG_COLOR, alpha: BG_ALPHA });

    if (this.state === 'hidden' || this.state === 'fading-out') {
      // Start fade in
      this.state = 'fading-in';
      this.fadeElapsed = 0;
      this.container.visible = true;
    } else {
      // Already visible or lingering — just update content, stay visible
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

  /** Position bubble centered above a character at world coordinates (px, py). */
  setPosition(px: number, py: number): void {
    this.container.x = px - this.bgW / 2;
    this.container.y = py + OFFSET_Y - this.bgH;
  }

  hide(): void {
    this.state = 'hidden';
    this.container.alpha = 0;
    this.container.visible = false;
  }

  update(dt: number): void {
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
}
