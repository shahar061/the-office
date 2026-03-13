export enum TileType {
  Floor = 0,
  Wall = 1,
  Void = 2,
}

export interface TileMapLayout {
  width: number;
  height: number;
  tileSize: number;
  tiles: number[][];
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  private tiles: number[][];
  private walkable: boolean[][];

  constructor(layout: TileMapLayout) {
    this.width = layout.width;
    this.height = layout.height;
    this.tileSize = layout.tileSize;
    this.tiles = layout.tiles;
    this.walkable = this.buildWalkabilityGrid();
  }

  private buildWalkabilityGrid(): boolean[][] {
    return this.tiles.map((row) => row.map((tile) => tile === TileType.Floor));
  }

  getTile(x: number, y: number): TileType {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return TileType.Void;
    return this.tiles[y][x] as TileType;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.walkable[y][x];
  }

  tileToPixel(tileX: number, tileY: number): { x: number; y: number } {
    return { x: tileX * this.tileSize, y: tileY * this.tileSize };
  }

  pixelToTile(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor(px / this.tileSize), y: Math.floor(py / this.tileSize) };
  }
}