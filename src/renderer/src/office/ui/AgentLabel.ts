import { Container, Text, TextStyle } from 'pixi.js';

export class AgentLabel {
  readonly container: Container;
  private nameText: Text;
  private toolText: Text;

  constructor(name: string, color: string) {
    this.container = new Container();

    this.nameText = new Text({
      text: name,
      style: new TextStyle({
        fontSize: 7,
        fill: color,
        fontFamily: 'monospace',
        align: 'center',
      }),
    });
    this.nameText.anchor.set(0.5, 0);
    this.container.addChild(this.nameText);

    this.toolText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 6,
        fill: '#9ca3af',
        fontFamily: 'monospace',
        align: 'center',
      }),
    });
    this.toolText.anchor.set(0.5, 0);
    this.toolText.y = 10;
    this.container.addChild(this.toolText);
  }

  setTool(toolName: string | null): void {
    this.toolText.text = toolName ?? '';
  }

  setDimmed(dimmed: boolean): void {
    this.container.alpha = dimmed ? 0.4 : 1;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}