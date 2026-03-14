import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps');

const ROOM_BUILDER = {
  name: 'room-builder',
  image: '../tilesets/room-builder.png',
  imagewidth: 272,
  imageheight: 368,
  tilewidth: 16,
  tileheight: 16,
  columns: 17,
  tilecount: 391,
  firstgid: 1,
  margin: 0,
  spacing: 0,
};

const INTERIORS = {
  name: 'interiors',
  image: '../tilesets/interiors.png',
  imagewidth: 256,
  imageheight: 1424,
  tilewidth: 16,
  tileheight: 16,
  columns: 16,
  tilecount: 1424,
  firstgid: 392,
  margin: 0,
  spacing: 0,
};

function rb(row: number, col: number): number {
  return row * ROOM_BUILDER.columns + col + ROOM_BUILDER.firstgid;
}

function int(row: number, col: number): number {
  return row * INTERIORS.columns + col + INTERIORS.firstgid;
}

interface MapConfig {
  width: number;
  height: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: unknown[];
    visible?: boolean;
  }[];
}

function buildTmj(config: MapConfig): object {
  return {
    compressionlevel: -1,
    height: config.height,
    width: config.width,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.0',
    type: 'map',
    version: '1.10',
    nextlayerid: config.layers.length + 1,
    nextobjectid: 100,
    tilesets: [ROOM_BUILDER, INTERIORS],
    layers: config.layers.map((l, i) => ({
      id: i + 1,
      name: l.name,
      type: l.type,
      visible: l.visible ?? true,
      opacity: 1,
      x: 0,
      y: 0,
      ...(l.type === 'tilelayer'
        ? {
            width: config.width,
            height: config.height,
            data: l.data,
          }
        : {
            draworder: 'topdown',
            objects: l.objects,
          }),
    })),
  };
}

function writeMap(filename: string, tmj: object): void {
  writeFileSync(join(MAPS_DIR, filename), JSON.stringify(tmj, null, 2));
  console.log(`Wrote ${filename}`);
}

function generateOfficeMap(): void {
  const W = 60;
  const H = 40;
  const floor = new Array(W * H).fill(0);
  const walls = new Array(W * H).fill(0);
  const furnitureBelow = new Array(W * H).fill(0);
  const furnitureAbove = new Array(W * H).fill(0);
  const collision = new Array(W * H).fill(0);

  const set = (layer: number[], x: number, y: number, tile: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) layer[y * W + x] = tile;
  };

  const fillRect = (
    layer: number[],
    x: number,
    y: number,
    w: number,
    h: number,
    tile: number,
  ) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        set(layer, x + dx, y + dy, tile);
      }
    }
  };

  // Placeholder: Fill with dark wood floor
  fillRect(floor, 0, 0, W, H, rb(5, 0));

  // Placeholder: Outer walls
  for (let x = 0; x < W; x++) {
    set(walls, x, 0, rb(0, 0));
    set(walls, x, H - 1, rb(0, 0));
    set(collision, x, 0, 1);
    set(collision, x, H - 1, 1);
  }
  for (let y = 0; y < H; y++) {
    set(walls, 0, y, rb(0, 0));
    set(walls, W - 1, y, rb(0, 0));
    set(collision, 0, y, 1);
    set(collision, W - 1, y, 1);
  }

  const spawnPoints = [
    { name: 'desk-ceo', x: 4 * 16, y: 5 * 16 },
    { name: 'desk-product-manager', x: 8 * 16, y: 5 * 16 },
    { name: 'desk-market-researcher', x: 4 * 16, y: 9 * 16 },
    { name: 'desk-chief-architect', x: 8 * 16, y: 9 * 16 },
    { name: 'desk-agent-organizer', x: 20 * 16, y: 5 * 16 },
    { name: 'desk-project-manager', x: 24 * 16, y: 5 * 16 },
    { name: 'desk-team-lead', x: 28 * 16, y: 5 * 16 },
    { name: 'desk-backend-engineer', x: 32 * 16, y: 5 * 16 },
    { name: 'desk-frontend-engineer', x: 36 * 16, y: 5 * 16 },
    { name: 'desk-mobile-developer', x: 40 * 16, y: 5 * 16 },
    { name: 'desk-ui-ux-expert', x: 44 * 16, y: 5 * 16 },
    { name: 'desk-data-engineer', x: 20 * 16, y: 14 * 16 },
    { name: 'desk-devops', x: 24 * 16, y: 14 * 16 },
    { name: 'desk-automation-developer', x: 28 * 16, y: 14 * 16 },
    { name: 'desk-freelancer', x: 6 * 16, y: 30 * 16 },
  ];

  const zones = [
    { name: 'boardroom', x: 16, y: 16, width: 15 * 16, height: 13 * 16 },
    {
      name: 'open-work-area',
      x: 18 * 16,
      y: 16,
      width: 40 * 16,
      height: 25 * 16,
    },
    {
      name: 'break-room',
      x: 16,
      y: 26 * 16,
      width: 15 * 16,
      height: 12 * 16,
    },
  ];

  const tmj = buildTmj({
    width: W,
    height: H,
    layers: [
      { name: 'floor', type: 'tilelayer', data: floor },
      { name: 'walls', type: 'tilelayer', data: walls },
      { name: 'furniture-below', type: 'tilelayer', data: furnitureBelow },
      { name: 'furniture-above', type: 'tilelayer', data: furnitureAbove },
      { name: 'collision', type: 'tilelayer', data: collision, visible: false },
      {
        name: 'spawn-points',
        type: 'objectgroup',
        objects: spawnPoints.map((sp, i) => ({
          id: i + 1,
          name: sp.name,
          x: sp.x,
          y: sp.y,
          width: 0,
          height: 0,
        })),
      },
      {
        name: 'zones',
        type: 'objectgroup',
        objects: zones.map((z, i) => ({
          id: 50 + i,
          name: z.name,
          x: z.x,
          y: z.y,
          width: z.width,
          height: z.height,
        })),
      },
    ],
  });

  writeMap('office.tmj', tmj);
}

function generateLobbyMap(): void {
  const W = 30;
  const H = 20;
  const floor = new Array(W * H).fill(0);
  const walls = new Array(W * H).fill(0);
  const furnitureBelow = new Array(W * H).fill(0);
  const furnitureAbove = new Array(W * H).fill(0);
  const collision = new Array(W * H).fill(0);

  const set = (layer: number[], x: number, y: number, tile: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) layer[y * W + x] = tile;
  };

  const fillRect = (
    layer: number[],
    x: number,
    y: number,
    w: number,
    h: number,
    tile: number,
  ) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        set(layer, x + dx, y + dy, tile);
      }
    }
  };

  // Placeholder: Dark wood floor
  fillRect(floor, 0, 0, W, H, rb(5, 0));

  // Placeholder: Outer walls
  for (let x = 0; x < W; x++) {
    set(walls, x, 0, rb(0, 0));
    set(walls, x, H - 1, rb(0, 0));
    set(collision, x, 0, 1);
    set(collision, x, H - 1, 1);
  }
  for (let y = 0; y < H; y++) {
    set(walls, 0, y, rb(0, 0));
    set(walls, W - 1, y, rb(0, 0));
    set(collision, 0, y, 1);
    set(collision, W - 1, y, 1);
  }

  const tmj = buildTmj({
    width: W,
    height: H,
    layers: [
      { name: 'floor', type: 'tilelayer', data: floor },
      { name: 'walls', type: 'tilelayer', data: walls },
      { name: 'furniture-below', type: 'tilelayer', data: furnitureBelow },
      { name: 'furniture-above', type: 'tilelayer', data: furnitureAbove },
      { name: 'collision', type: 'tilelayer', data: collision, visible: false },
    ],
  });

  writeMap('lobby.tmj', tmj);
}

generateOfficeMap();
generateLobbyMap();
console.log('Done! Maps generated.');
