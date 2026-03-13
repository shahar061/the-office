import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Character, CharacterState } from '../../../../src/renderer/src/office/characters/Character';
import { TileMap } from '../../../../src/renderer/src/office/engine/tilemap';

vi.mock('../../../../src/renderer/src/office/characters/CharacterSprite', () => ({
  CharacterSprite: class MockSprite {
    container = { x: 0, y: 0, alpha: 1, destroy: vi.fn() };
    setAnimation = vi.fn();
    setPosition = vi.fn();
    setAlpha = vi.fn();
    destroy = vi.fn();
  },
}));

const LAYOUT = {
  width: 10, height: 10, tileSize: 16,
  tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
};
LAYOUT.tiles[0] = Array(10).fill(1);
LAYOUT.tiles[9] = Array(10).fill(1);
for (let y = 0; y < 10; y++) { LAYOUT.tiles[y][0] = 1; LAYOUT.tiles[y][9] = 1; }

describe('Character', () => {
  let tileMap: TileMap;
  let character: Character;

  beforeEach(() => {
    tileMap = new TileMap(LAYOUT);
    character = new Character({
      agentId: 'agent-1',
      role: 'backend-engineer',
      deskTile: { x: 5, y: 5 },
      tileMap,
      spriteSheet: null as any,
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
    character.moveTo({ x: 7, y: 5 });
    const startPos = character.getPixelPosition();
    for (let i = 0; i < 60; i++) {
      character.update(1 / 60);
    }
    const endPos = character.getPixelPosition();
    expect(endPos.x).toBeGreaterThan(startPos.x);
  });
});