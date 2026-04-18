import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Character } from '../Character';

vi.mock('../CharacterSprite', () => ({
  CharacterSprite: class MockSprite {
    container = { x: 0, y: 0, alpha: 1, zIndex: 0, destroy: vi.fn() };
    setAnimation = vi.fn();
    setPosition = vi.fn();
    setAlpha = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('../ToolBubble', () => ({
  ToolBubble: class MockToolBubble {
    container = { x: 0, y: 0, alpha: 0, zIndex: 0, destroy: vi.fn() };
    private _publicState: { toolName: string; target?: string } | null = null;
    show = vi.fn((toolName: string, target: string) => {
      this._publicState = { toolName, target };
    });
    startLinger = vi.fn();
    hide = vi.fn();
    update = vi.fn();
    destroy = vi.fn();
    setPosition = vi.fn();
    getPublicState = vi.fn(() => this._publicState);
    setTarget = vi.fn();
  },
}));

const mockMapRenderer = {
  tileSize: 16,
  tileToPixel: (x: number, y: number) => ({ x: x * 16, y: y * 16 }),
  pixelToTile: (px: number, py: number) => ({ x: Math.floor(px / 16), y: Math.floor(py / 16) }),
  getSpawnPoint: () => ({ x: 1, y: 1 }),
} as any;

function makeCharacter(): Character {
  return new Character({
    agentId: 'ceo',
    role: 'ceo',
    mapRenderer: mockMapRenderer,
    frames: [[]] as any,
  });
}

describe('Character.getStateSnapshot', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns a CharacterState with all fields', () => {
    const c = makeCharacter();
    const s = c.getStateSnapshot();
    expect(s.agentId).toBe('ceo');
    expect(typeof s.x).toBe('number');
    expect(typeof s.y).toBe('number');
    expect(['up', 'down', 'left', 'right']).toContain(s.direction);
    expect(['idle', 'walk', 'read', 'type']).toContain(s.animation);
    expect(typeof s.visible).toBe('boolean');
    expect(typeof s.alpha).toBe('number');
    expect(s.toolBubble).toBeNull();
  });

  it('toolBubble populates when showToolBubble is called', () => {
    const c = makeCharacter();
    c.showToolBubble('Read', 'src/foo.ts');
    const s = c.getStateSnapshot();
    expect(s.toolBubble).toEqual({ toolName: 'Read', target: 'src/foo.ts' });
  });
});
