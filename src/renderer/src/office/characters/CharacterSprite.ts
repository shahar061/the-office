import { AnimatedSprite, Container, Texture, Rectangle } from 'pixi.js';

export type Direction = 'down' | 'up' | 'right' | 'left';
export type AnimState = 'walk' | 'type' | 'read' | 'idle';

const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 32;
const COLS = 7;

const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

const ANIM_FRAMES: Record<AnimState, number[]> = {
  walk: [0, 1, 2, 1],
  type: [3, 4],
  read: [5, 6],
  idle: [0],
};

export class CharacterSprite {
  readonly container: Container;
  private sprite: AnimatedSprite;
  private baseTexture: Texture;
  private currentDirection: Direction = 'down';
  private currentAnim: AnimState = 'idle';
  private frameSpeed: number = 0.15;

  constructor(spriteSheet: Texture) {
    this.baseTexture = spriteSheet;
    this.container = new Container();

    const frames = this.getFrames('down', 'idle');
    this.sprite = new AnimatedSprite(frames);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.animationSpeed = this.frameSpeed;
    this.sprite.play();

    this.container.addChild(this.sprite);
  }

  private getFrames(direction: Direction, anim: AnimState): Texture[] {
    const row = DIRECTION_ROW[direction];
    const frameIndices = ANIM_FRAMES[anim];

    return frameIndices.map((col) => {
      const frame = new Rectangle(
        col * FRAME_WIDTH,
        row * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
      );
      const tex = new Texture({ source: this.baseTexture.source, frame });
      tex.source.scaleMode = 'nearest';
      return tex;
    });
  }

  setAnimation(anim: AnimState, direction: Direction): void {
    if (anim === this.currentAnim && direction === this.currentDirection) return;

    this.currentAnim = anim;
    this.currentDirection = direction;

    const frames = this.getFrames(direction, anim);
    this.sprite.textures = frames;

    this.sprite.scale.x = direction === 'left' ? -1 : 1;

    this.sprite.animationSpeed = anim === 'walk' ? 0.15 : 0.08;
    this.sprite.play();
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  setAlpha(alpha: number): void {
    this.container.alpha = alpha;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}