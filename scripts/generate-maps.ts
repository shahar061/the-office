import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps');

// ── Tiled flip flags ─────────────────────────────────────────────────────────
const TILE_ID_MASK = 0x1fffffff;

function stripFlags(raw: number): number {
  return raw & TILE_ID_MASK;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TiledMap {
  width: number;
  height: number;
  layers: TiledLayer[];
  [key: string]: unknown;
}

interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: unknown[];
  [key: string]: unknown;
}

// ── Collision generation ─────────────────────────────────────────────────────

// Tile IDs that should NOT block movement (chairs, plants, small decor)
// These are from the office-tileset (firstgid=1):
//   289 = chair, 305 = chair variant/stool
const NON_BLOCKING_TILES = new Set([289, 305]);

function generateCollision(map: TiledMap): number[] {
  const W = map.width;
  const H = map.height;
  const collision = new Array(W * H).fill(0);

  const walls = map.layers.find(
    (l) => l.name === 'walls' && l.type === 'tilelayer',
  );
  const furnitureBelow = map.layers.find(
    (l) => l.name === 'furniture-below' && l.type === 'tilelayer',
  );

  // All wall tiles → collision
  if (walls?.data) {
    for (let i = 0; i < walls.data.length; i++) {
      if (stripFlags(walls.data[i]) !== 0) {
        collision[i] = 1;
      }
    }
  }

  // Furniture-below → collision (except non-blocking items)
  if (furnitureBelow?.data) {
    for (let i = 0; i < furnitureBelow.data.length; i++) {
      const tileId = stripFlags(furnitureBelow.data[i]);
      if (tileId !== 0 && !NON_BLOCKING_TILES.has(tileId)) {
        collision[i] = 1;
      }
    }
  }

  return collision;
}

// ── Visualization ────────────────────────────────────────────────────────────

function printCollision(collision: number[], W: number, H: number): void {
  console.log(`\nCollision map (${W}×${H}):`);
  console.log('  ' + Array.from({ length: W }, (_, i) => (i % 10).toString()).join(''));
  for (let y = 0; y < H; y++) {
    const row = collision.slice(y * W, (y + 1) * W);
    const display = row.map((v) => (v ? '█' : '·')).join('');
    console.log(`${y.toString().padStart(2)} ${display}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const mapPath = join(MAPS_DIR, 'office.tmj');
const map: TiledMap = JSON.parse(readFileSync(mapPath, 'utf-8'));

console.log(`Office map: ${map.width}×${map.height}`);

const newCollision = generateCollision(map);

// Update collision layer in-place
const collisionLayer = map.layers.find(
  (l) => l.name === 'collision' && l.type === 'tilelayer',
);
if (!collisionLayer) {
  console.error('No collision layer found in office.tmj!');
  process.exit(1);
}
collisionLayer.data = newCollision;

// Write back (compact JSON matching Tiled output style)
writeFileSync(mapPath, JSON.stringify(map));
console.log(`Updated collision layer in office.tmj`);

printCollision(newCollision, map.width, map.height);
console.log('\nDone!');
