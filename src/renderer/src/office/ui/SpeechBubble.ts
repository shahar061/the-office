import { Container, Graphics, Text, TextStyle } from 'pixi.js';

const BUBBLE_COLORS: Record<string, number> = {
  working: 0xffffff,
  waiting: 0x4ade80,
  permission: 0xfb923c,
};

const AUTO_HIDE_MS = 5000;

export class SpeechBubble {
  readonly container: Container;
  private bg: Graphics;
  private text: Text;
  private hideTimer = 0;
  private visible = false;
  private pulsePhase = 0;

  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.text = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 8,
        fill: '#000000',
        fontFamily: 'monospace',
        wordWrap: true,
        wordWrapWidth: 80,
      }),
    });
    this.text.x = 6;
    this.text.y = 4;
    this.container.addChild(this.text);
  }

  show(message: string, type: 'working' | 'waiting' | 'permission'): void {
    this.text.text = message.length > 40 ? message.slice(0, 37) + '...' : message;
    this.drawBubble(BUBBLE_COLORS[type]);
    this.container.visible = true;
    this.visible = true;
    this.hideTimer = AUTO_HIDE_MS;
    this.pulsePhase = 0;
  }

  hide(): void {
    this.container.visible = false;
    this.visible = false;
  }

  update(dt: number): void {
    if (!this.visible) return;

    this.hideTimer -= dt * 1000;
    if (this.hideTimer <= 0) {
      this.hide();
      return;
    }

    this.pulsePhase += dt * 3;
    if (this.bg.tint === BUBBLE_COLORS.permission) {
      this.container.alpha = 0.7 + 0.3 * Math.sin(this.pulsePhase);
    }
  }

  private drawBubble(color: number): void {
    this.bg.clear();
    const w = Math.max(this.text.width + 12, 40);
    const h = this.text.height + 8;
    this.bg.roundRect(0, 0, w, h, 4);
    this.bg.fill(color);

    this.container.x = -w / 2;
    this.container.y = -h - 4;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}