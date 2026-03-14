import { describe, it, expect } from 'vitest';
import { findPath } from '../../../../src/renderer/src/office/engine/pathfinding';

function makeWalkableGrid(tiles: number[][]): { width: number; height: number; isWalkable(x: number, y: number): boolean } {
  return {
    width: tiles[0].length,
    height: tiles.length,
    isWalkable(x: number, y: number): boolean {
      if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[0].length) return false;
      return tiles[y][x] === 0;
    },
  };
}

const TILES = [
  [1, 1, 1, 1, 1, 1],
  [1, 0, 0, 1, 0, 1],
  [1, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1],
];

describe('findPath (BFS)', () => {
  const map = makeWalkableGrid(TILES);

  it('finds direct path between adjacent tiles', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 2, y: 1 });
    expect(path).toEqual([{ x: 2, y: 1 }]);
  });

  it('finds path around walls', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 4, y: 1 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 1 });
  });

  it('returns null when no path exists', () => {
    const blockedMap = makeWalkableGrid([
      [1, 1, 1, 1],
      [1, 0, 1, 0],
      [1, 1, 1, 1],
    ]);
    const path = findPath(blockedMap, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(path).toBeNull();
  });

  it('returns empty array when start equals goal', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 1, y: 1 });
    expect(path).toEqual([]);
  });

  it('does not include start position in path', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 2, y: 2 });
    expect(path).not.toBeNull();
    expect(path![0]).not.toEqual({ x: 1, y: 1 });
  });
});
