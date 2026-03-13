import { describe, it, expect } from 'vitest';
import { findPath } from '../../../../src/renderer/src/office/engine/pathfinding';
import { TileMap } from '../../../../src/renderer/src/office/engine/tilemap';

const LAYOUT = {
  width: 6,
  height: 5,
  tileSize: 16,
  tiles: [
    [1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 0, 1],
    [1, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1],
  ],
};

describe('findPath (BFS)', () => {
  const map = new TileMap(LAYOUT);

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
    const blockedMap = new TileMap({
      width: 4, height: 3, tileSize: 16,
      tiles: [
        [1, 1, 1, 1],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
      ],
    });
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