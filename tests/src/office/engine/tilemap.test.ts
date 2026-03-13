import { describe, it, expect } from 'vitest';
import { TileMap, TileType } from '../../../../src/renderer/src/office/engine/tilemap';

const MINI_LAYOUT = {
  width: 4,
  height: 3,
  tileSize: 16,
  tiles: [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
  ],
};

describe('TileMap', () => {
  it('loads layout dimensions', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.width).toBe(4);
    expect(map.height).toBe(3);
    expect(map.tileSize).toBe(16);
  });

  it('returns correct tile type', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.getTile(0, 0)).toBe(TileType.Wall);
    expect(map.getTile(1, 1)).toBe(TileType.Floor);
  });

  it('returns Void for out-of-bounds', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.getTile(-1, 0)).toBe(TileType.Void);
    expect(map.getTile(10, 10)).toBe(TileType.Void);
  });

  it('builds walkability grid', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.isWalkable(1, 1)).toBe(true);
    expect(map.isWalkable(2, 1)).toBe(true);
    expect(map.isWalkable(0, 0)).toBe(false);
  });

  it('converts tile coords to pixel coords', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.tileToPixel(2, 1)).toEqual({ x: 32, y: 16 });
  });

  it('converts pixel coords to tile coords', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.pixelToTile(35, 20)).toEqual({ x: 2, y: 1 });
  });
});