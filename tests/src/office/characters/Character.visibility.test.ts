import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Character } from '../../../../src/renderer/src/office/characters/Character';

vi.mock('../../../../src/renderer/src/office/characters/CharacterSprite', () => ({
  CharacterSprite: class MockSprite {
    container = {
      x: 0, y: 0, alpha: 1, zIndex: 0,
      destroy: vi.fn(),
      parent: null as any,
    };
    setAnimation = vi.fn();
    setPosition = vi.fn();
    setAlpha = vi.fn((a: number) => { this.container.alpha = a; });
    destroy = vi.fn();
  },
}));

const mockMapRenderer = {
  width: 10, height: 10, tileSize: 16,
  isWalkable: () => true,
  tileToPixel: (tx: number, ty: number) => ({ x: tx * 16, y: ty * 16 }),
  pixelToTile: (px: number, py: number) => ({ x: Math.floor(px / 16), y: Math.floor(py / 16) }),
  getSpawnPoint: (name: string) => name === 'desk-backend-engineer' ? { x: 5, y: 5 } : undefined,
  getZone: () => undefined,
} as any;

function createCharacter(): Character {
  return new Character({
    agentId: 'agent-1',
    role: 'backend-engineer',
    mapRenderer: mockMapRenderer,
    frames: [[]] as any,
  });
}

describe('Character visibility lifecycle', () => {
  let character: Character;

  beforeEach(() => {
    vi.useFakeTimers();
    character = createCharacter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts not visible', () => {
    expect(character.isVisible).toBe(false);
  });

  it('show() makes character visible with alpha 0', () => {
    const parent = { addChild: vi.fn() } as any;
    character.show(parent);
    expect(character.isVisible).toBe(true);
    expect(character.sprite.container.alpha).toBe(0);
    expect(parent.addChild).toHaveBeenCalledWith(character.sprite.container);
  });

  it('fade-in completes after 0.5s of updates', () => {
    const parent = { addChild: vi.fn() } as any;
    character.show(parent);
    // Simulate 0.5s of updates at 60fps
    for (let i = 0; i < 30; i++) {
      character.update(1 / 60);
    }
    expect(character.sprite.container.alpha).toBeCloseTo(1, 1);
  });

  it('hide() triggers fade-out after delay', () => {
    const parent = { addChild: vi.fn(), removeChild: vi.fn() } as any;
    character.show(parent);
    // Complete fade-in
    for (let i = 0; i < 60; i++) character.update(1 / 60);

    character.hide(1000); // 1s delay
    // Before delay: still visible
    expect(character.isVisible).toBe(true);

    // Advance past delay
    vi.advanceTimersByTime(1000);

    // Simulate 1s of fade-out updates
    for (let i = 0; i < 60; i++) character.update(1 / 60);
    expect(character.isVisible).toBe(false);
  });

  it('getDeskTile() returns the desk tile position', () => {
    expect(character.getDeskTile()).toEqual({ x: 5, y: 5 });
  });

  it('repositionTo() moves sprite to given tile', () => {
    character.repositionTo(3, 4);
    expect(character.sprite.setPosition).toHaveBeenCalledWith(
      3 * 16 + 8,  // tileX * tileSize + tileSize/2
      4 * 16 + 16, // tileY * tileSize + tileSize
    );
  });

  it('does not wander when not visible', () => {
    // Constructor calls setPosition once during init. Clear that call.
    (character.sprite.setPosition as any).mockClear();
    // Character starts invisible. Simulate many seconds of idle time.
    for (let i = 0; i < 600; i++) character.update(1 / 60); // 10 seconds
    // Should still be at original position (no wandering)
    expect(character.getState()).toBe('idle');
    expect(character.sprite.setPosition).not.toHaveBeenCalled();
  });

  it('show() cancels pending hide timer', () => {
    const parent = { addChild: vi.fn(), removeChild: vi.fn() } as any;
    character.show(parent);
    for (let i = 0; i < 60; i++) character.update(1 / 60); // complete fade-in

    character.hide(3000);
    // Before timer fires, show again
    vi.advanceTimersByTime(1000);
    character.show(parent);

    // Advance past original hide delay
    vi.advanceTimersByTime(3000);
    // Should still be visible (hide was cancelled)
    expect(character.isVisible).toBe(true);
  });
});
