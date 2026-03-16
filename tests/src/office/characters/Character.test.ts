import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Character, CharacterState } from '../../../../src/renderer/src/office/characters/Character';

vi.mock('../../../../src/renderer/src/office/characters/CharacterSprite', () => ({
  CharacterSprite: class MockSprite {
    container = { x: 0, y: 0, alpha: 1, zIndex: 0, destroy: vi.fn() };
    setAnimation = vi.fn();
    setPosition = vi.fn();
    setAlpha = vi.fn();
    destroy = vi.fn();
  },
}));

const tiles = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0));
tiles[0] = Array(10).fill(1);
tiles[9] = Array(10).fill(1);
for (let y = 0; y < 10; y++) { tiles[y][0] = 1; tiles[y][9] = 1; }

const mockMapRenderer = {
  width: 10, height: 10, tileSize: 16,
  isWalkable: (x: number, y: number) => {
    if (y < 0 || y >= 10 || x < 0 || x >= 10) return false;
    return tiles[y][x] === 0;
  },
  tileToPixel: (tx: number, ty: number) => ({ x: tx * 16, y: ty * 16 }),
  pixelToTile: (px: number, py: number) => ({ x: Math.floor(px / 16), y: Math.floor(py / 16) }),
  getSpawnPoint: (name: string) => name === 'desk-backend-engineer' ? { x: 5, y: 5 } : undefined,
  getZone: () => undefined,
} as any;

describe('Character', () => {
  let character: Character;

  function makeVisible(char: Character): void {
    (char as any).isVisible = true;
  }

  beforeEach(() => {
    character = new Character({
      agentId: 'agent-1',
      role: 'backend-engineer',
      mapRenderer: mockMapRenderer,
      frames: [[]] as any,
    });
  });

  it('starts in idle state at desk position', () => {
    expect(character.getState()).toBe('idle');
    expect(character.getTilePosition()).toEqual({ x: 5, y: 5 });
  });

  it('transitions to walk when given a target', () => {
    character.moveTo({ x: 7, y: 5 });
    expect(character.getState()).toBe('walk');
  });

  it('transitions to type when setWorking called with type', () => {
    character.setWorking('type');
    expect(['walk', 'type']).toContain(character.getState());
  });

  it('transitions to idle when setIdle called', () => {
    character.setWorking('type');
    character.setIdle();
    expect(character.getState()).toBe('idle');
  });

  it('advances along path on update', () => {
    makeVisible(character);
    character.moveTo({ x: 7, y: 5 });
    const startPos = character.getPixelPosition();
    for (let i = 0; i < 60; i++) {
      character.update(1 / 60);
    }
    const endPos = character.getPixelPosition();
    expect(endPos.x).toBeGreaterThan(startPos.x);
  });
});
