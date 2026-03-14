# Office & Lobby Visual Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace small basic tile maps with larger polished maps using Modern tiles_Free, and add auto-zoom camera so both screens always fill the viewport.

**Architecture:** Copy new tileset PNGs (same dimensions as old → same firstgid config). Write a TypeScript map generator script that outputs .tmj files. Add min-zoom + bounds clamping to the Camera class. Update LobbyScene with auto-zoom.

**Tech Stack:** PixiJS v8, TypeScript, Tiled .tmj format, tsx (script runner)

---

## Chunk 1: Infrastructure — Tilesets, Camera, Scene Integration

### Task 1: Copy New Tilesets and License

**Files:**
- Replace: `src/renderer/src/assets/tilesets/room-builder.png`
- Replace: `src/renderer/src/assets/tilesets/interiors.png`
- Replace: `src/renderer/src/assets/tilesets/LIMEZUASSETS-LICENSE.txt`

- [ ] **Step 1: Copy tileset files**

```bash
cp ~/Downloads/Modern\ tiles_Free/Interiors_free/16x16/Room_Builder_free_16x16.png \
   src/renderer/src/assets/tilesets/room-builder.png

cp ~/Downloads/Modern\ tiles_Free/Interiors_free/16x16/Interiors_free_16x16.png \
   src/renderer/src/assets/tilesets/interiors.png
```

- [ ] **Step 2: Copy license file**

```bash
cp ~/Downloads/Modern\ tiles_Free/LICENSE.txt \
   src/renderer/src/assets/tilesets/LIMEZUASSETS-LICENSE.txt
```

- [ ] **Step 3: Verify tileset dimensions match old ones**

```bash
sips -g pixelWidth -g pixelHeight src/renderer/src/assets/tilesets/room-builder.png src/renderer/src/assets/tilesets/interiors.png
```

Expected: room-builder 272×368, interiors 256×1424 (same as old — firstgid values unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/assets/tilesets/
git commit -m "chore: replace tilesets with Modern tiles_Free versions"
```

---

### Task 2: Add Auto-Zoom and Bounds Clamping to Camera

**Files:**
- Modify: `src/renderer/src/office/engine/camera.ts`

- [ ] **Step 1: Add map dimensions and minZoom to Camera**

Read `camera.ts` first. Add `mapWidth`, `mapHeight` properties. Add `setMapSize()` method. Add `getMinZoom()` computed helper (no change to `setViewSize()` needed — minZoom is computed on-the-fly from stored values). The key changes:

```typescript
// Add new properties after existing ones:
private mapWidth = 960;   // default to new office map size
private mapHeight = 640;

// Add new method:
setMapSize(width: number, height: number): void {
  this.mapWidth = width;
  this.mapHeight = height;
}

// Add private helper:
private getMinZoom(): number {
  if (this.viewWidth === 0 || this.viewHeight === 0) return 1;
  return Math.max(this.viewWidth / this.mapWidth, this.viewHeight / this.mapHeight);
}
```

- [ ] **Step 2: Clamp phase zoom to minZoom**

In `focusOnPhase()`, clamp `targetZoom`:

```typescript
focusOnPhase(phase: string): void {
  if (this.manualOverride) return;
  const target = this.phaseTargets[phase];
  if (target) {
    this.targetX = target.x;
    this.targetY = target.y;
    this.targetZoom = Math.max(target.zoom, this.getMinZoom());
  }
}
```

Also clamp in `resetToPhase()` the same way. And clamp `setZoom()`:

```typescript
setZoom(zoom: number): void {
  this.manualOverride = true;
  this.targetZoom = Math.max(this.getMinZoom(), Math.min(4, zoom));
}
```

- [ ] **Step 3: Add bounds clamping to update()**

After the existing lerp + transform code in `update()`, add bounds clamping:

```typescript
update(): void {
  this.currentX += (this.targetX - this.currentX) * LERP_SPEED;
  this.currentY += (this.targetY - this.currentY) * LERP_SPEED;
  this.currentZoom += (this.targetZoom - this.currentZoom) * LERP_SPEED;

  this.container.scale.set(this.currentZoom);
  this.container.x = this.viewWidth / 2 - this.currentX * this.currentZoom;
  this.container.y = this.viewHeight / 2 - this.currentY * this.currentZoom;

  // Clamp to map bounds — no empty space beyond edges
  const minX = this.viewWidth - this.mapWidth * this.currentZoom;
  const minY = this.viewHeight - this.mapHeight * this.currentZoom;
  this.container.x = Math.min(0, Math.max(minX, this.container.x));
  this.container.y = Math.min(0, Math.max(minY, this.container.y));
}
```

- [ ] **Step 4: Remove stale FALLBACK_TARGETS**

Delete the `FALLBACK_TARGETS` constant. In `buildPhaseTargets()`, if a zone is missing, use map center as fallback:

```typescript
// Replace each FALLBACK_TARGETS[phase] reference with:
{ x: this.mapWidth / 2, y: this.mapHeight / 2, zoom: PHASE_ZOOM[phase] ?? 1.5 }
```

Pass `mapWidth`/`mapHeight` to the constructor or set via `setMapSize()` before `buildPhaseTargets()` is called.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/engine/camera.ts
git commit -m "feat: add auto-zoom and bounds clamping to Camera"
```

---

### Task 3: Update OfficeScene and LobbyScene

**Files:**
- Modify: `src/renderer/src/office/OfficeScene.ts`
- Modify: `src/renderer/src/lobby/LobbyScene.ts`

- [ ] **Step 1: Pass map dimensions to Camera in OfficeScene**

Read `OfficeScene.ts`. After creating the Camera, pass map pixel dimensions:

```typescript
// After: this.camera = new Camera(this.worldContainer, this.mapRenderer.getAllZones());
this.camera.setMapSize(
  this.mapRenderer.width * this.mapRenderer.tileSize,
  this.mapRenderer.height * this.mapRenderer.tileSize,
);
```

- [ ] **Step 2: Update LobbyScene with auto-zoom**

Read `LobbyScene.ts`. Add a `viewWidth`/`viewHeight` store. Replace the fixed `zoom = 2.5` in `centerCamera()` with the auto-zoom formula using stored view dimensions (more reliable than `this.app.screen` which may have stale values on the same frame as resize):

```typescript
// Add properties:
private viewWidth = 800;
private viewHeight = 600;

private centerCamera(): void {
  const worldW = this.mapRenderer.width * this.mapRenderer.tileSize;
  const worldH = this.mapRenderer.height * this.mapRenderer.tileSize;
  const zoom = Math.max(
    this.viewWidth / worldW,
    this.viewHeight / worldH,
  );
  this.worldContainer.scale.set(zoom);
  this.worldContainer.x = this.viewWidth / 2 - (worldW * zoom) / 2;
  this.worldContainer.y = this.viewHeight / 2 - (worldH * zoom) / 2;

  // Clamp to map bounds
  const minX = this.viewWidth - worldW * zoom;
  const minY = this.viewHeight - worldH * zoom;
  this.worldContainer.x = Math.min(0, Math.max(minX, this.worldContainer.x));
  this.worldContainer.y = Math.min(0, Math.max(minY, this.worldContainer.y));
}
```

Also update `init()` to set initial view size before calling `centerCamera()`:
```typescript
// At end of init(), before centerCamera():
this.viewWidth = this.app.screen.width;
this.viewHeight = this.app.screen.height;
this.centerCamera();
```

- [ ] **Step 3: Update LobbyScene.onResize to accept and use dimensions**

```typescript
onResize(width: number, height: number): void {
  this.viewWidth = width;
  this.viewHeight = height;
  if (this.mapRenderer) {
    this.centerCamera();
  }
}
```

- [ ] **Step 4: Update LobbyCanvas.tsx caller**

Find where `scene.onResize()` is called (in `LobbyCanvas.tsx`) and pass dimensions:

```typescript
// Change from: scene?.onResize()
// To: scene?.onResize(container.clientWidth, container.clientHeight)
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/OfficeScene.ts src/renderer/src/lobby/LobbyScene.ts src/renderer/src/lobby/LobbyCanvas.tsx
git commit -m "feat: integrate auto-zoom in OfficeScene and LobbyScene"
```

---

## Chunk 2: Map Generator — Office and Lobby Maps

### Task 4: Map Generator Script Scaffolding

**Files:**
- Create: `scripts/generate-maps.ts`
- Modify: `package.json` (add script entry)

- [ ] **Step 1: Add tsx dev dependency and script entry**

```bash
npm install -D tsx
```

Add to `package.json` scripts:
```json
"generate-maps": "tsx scripts/generate-maps.ts"
```

- [ ] **Step 2: Create generator with tileset constants and TMJ helpers**

Create `scripts/generate-maps.ts` with:

1. **Tileset metadata constants** — dimensions, columns, firstgid values for both tilesets. These match the new PNGs (same size as old):

```typescript
const ROOM_BUILDER = {
  name: 'room-builder',
  image: '../tilesets/room-builder.png',
  imagewidth: 272, imageheight: 368,
  tilewidth: 16, tileheight: 16,
  columns: 17,
  tilecount: 391,
  firstgid: 1,
  margin: 0, spacing: 0,
};

const INTERIORS = {
  name: 'interiors',
  image: '../tilesets/interiors.png',
  imagewidth: 256, imageheight: 1424,
  tilewidth: 16, tileheight: 16,
  columns: 16,
  tilecount: 1424,
  firstgid: 392,
  margin: 0, spacing: 0,
};
```

2. **Tile ID helper** — converts tileset row/col to global tile ID:

```typescript
function rb(row: number, col: number): number {
  return row * ROOM_BUILDER.columns + col + ROOM_BUILDER.firstgid;
}
function int(row: number, col: number): number {
  return row * INTERIORS.columns + col + INTERIORS.firstgid;
}
```

3. **TMJ builder function** — creates valid Tiled JSON:

```typescript
interface MapConfig {
  width: number;
  height: number;
  layers: { name: string; type: string; data?: number[]; objects?: any[]; visible?: boolean }[];
  outputPath: string;
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
      x: 0, y: 0,
      ...(l.type === 'tilelayer' ? {
        width: config.width,
        height: config.height,
        data: l.data,
      } : {
        draworder: 'topdown',
        objects: l.objects,
      }),
    })),
  };
}
```

4. **File writer** — writes to `src/renderer/src/assets/maps/`. Note: `__dirname` is unavailable in ESM mode, use `import.meta.dirname` (Node 21+) or the `fileURLToPath` pattern:

```typescript
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'maps');

function writeMap(filename: string, tmj: object): void {
  writeFileSync(join(MAPS_DIR, filename), JSON.stringify(tmj, null, 2));
  console.log(`Wrote ${filename}`);
}
```

- [ ] **Step 3: Commit scaffolding**

```bash
git add scripts/generate-maps.ts package.json package-lock.json
git commit -m "feat: add map generator script scaffolding"
```

---

### Task 5: Generate Office Map

**Files:**
- Modify: `scripts/generate-maps.ts` (add office map generation)

This is the largest task. The implementer must examine the new tileset images to identify correct tile IDs. The approach:

- [ ] **Step 1: Identify tile IDs from the new tilesets**

Open both tileset PNGs and identify the tile IDs needed. Use the `rb(row, col)` and `int(row, col)` helpers. Key tiles to find:

**From room-builder.png (17 columns):**
- Dark wood floor tiles (multiple variants for visual variety)
- Wall tiles: top, bottom, left, right edges, corners (inner + outer)
- Wall fill / ceiling tiles
- Room border pieces

**From interiors.png (16 columns):**
- Desk (multi-tile: 3×2 or 2×2)
- Computer monitor (on desk)
- Office chair
- Bookshelf (multi-tile: 2×3 or similar)
- Couch / sofa
- Coffee table
- Plant / potted plant (several variants)
- Floor lamp
- Rug tiles
- Whiteboard
- Vending machine
- Window (on wall)
- Painting / wall art
- Door

To identify: read the tileset image visually, count row/col from top-left (0-indexed), use `rb(row, col)` or `int(row, col)`.

- [ ] **Step 2: Define tile ID constants**

Add named constants at the top of the generator:

```typescript
// Example — actual values depend on visual tileset inspection
const TILES = {
  // Floors (room-builder)
  DARK_WOOD_1: rb(5, 0),
  DARK_WOOD_2: rb(5, 1),
  // Walls
  WALL_TOP: rb(0, 0),
  WALL_LEFT: rb(1, 0),
  // ... etc for all needed tiles

  // Furniture (interiors)
  DESK_TL: int(2, 0),  // top-left of desk
  DESK_TR: int(2, 1),  // top-right
  // ... etc
};
```

- [ ] **Step 3: Write office floor plan layout function**

Create `generateOfficeMap()` that builds a 60×40 tile map:

```typescript
function generateOfficeMap(): void {
  const W = 60, H = 40;
  const floor = new Array(W * H).fill(0);
  const walls = new Array(W * H).fill(0);
  const furnitureBelow = new Array(W * H).fill(0);
  const furnitureAbove = new Array(W * H).fill(0);
  const collision = new Array(W * H).fill(0);

  // Helper to set tile at (x, y) in a layer
  const set = (layer: number[], x: number, y: number, tile: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) layer[y * W + x] = tile;
  };

  // Helper to fill rectangle
  const fillRect = (layer: number[], x: number, y: number, w: number, h: number, tile: number) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        set(layer, x + dx, y + dy, tile);
  };

  // 1. Fill entire floor with dark wood
  fillRect(floor, 0, 0, W, H, TILES.DARK_WOOD_1);

  // 2. Build outer walls (perimeter)
  // Top and bottom walls
  for (let x = 0; x < W; x++) {
    set(walls, x, 0, TILES.WALL_TOP);
    set(walls, x, H - 1, TILES.WALL_BOTTOM);
    set(collision, x, 0, 1);
    set(collision, x, H - 1, 1);
  }
  // Left and right walls
  for (let y = 0; y < H; y++) {
    set(walls, 0, y, TILES.WALL_LEFT);
    set(walls, W - 1, y, TILES.WALL_RIGHT);
    set(collision, 0, y, 1);
    set(collision, W - 1, y, 1);
  }

  // 3. Build room dividers (boardroom walls, break room walls)
  // Boardroom: top-left area, roughly tiles (1,1) to (16,14)
  // Add internal walls to separate rooms...

  // 4. Place furniture
  // Boardroom: meeting table (center), chairs around it
  // Open work area: 15 desks in rows with computers
  // Break room: couch, coffee table, vending machine
  // Corridor: plants, lamps

  // 5. Bookshelves along walls
  // Line top wall and side walls with bookshelves

  // 6. Decorations: plants, paintings, rugs, windows

  // Spawn points — ALL 15 agents (pixel coordinates matching desk positions)
  // Coordinates must be in pixels — TiledMapRenderer divides by tileSize internally.
  // Place each spawn at the chair position in front of their desk.
  // Leadership (boardroom area):
  // Coordination + Engineering (open-work-area, desks in rows):
  // Freelancer (break-room):
  const spawnPoints = [
    // Boardroom (leadership) — 4 agents around meeting table
    { name: 'desk-ceo', x: 4 * 16, y: 5 * 16 },
    { name: 'desk-product-manager', x: 8 * 16, y: 5 * 16 },
    { name: 'desk-market-researcher', x: 4 * 16, y: 9 * 16 },
    { name: 'desk-chief-architect', x: 8 * 16, y: 9 * 16 },
    // Open work area — row 1 (7 agents)
    { name: 'desk-agent-organizer', x: 20 * 16, y: 5 * 16 },
    { name: 'desk-project-manager', x: 24 * 16, y: 5 * 16 },
    { name: 'desk-team-lead', x: 28 * 16, y: 5 * 16 },
    { name: 'desk-backend-engineer', x: 32 * 16, y: 5 * 16 },
    { name: 'desk-frontend-engineer', x: 36 * 16, y: 5 * 16 },
    { name: 'desk-mobile-developer', x: 40 * 16, y: 5 * 16 },
    { name: 'desk-ui-ux-expert', x: 44 * 16, y: 5 * 16 },
    // Open work area — row 2 (3 agents)
    { name: 'desk-data-engineer', x: 20 * 16, y: 14 * 16 },
    { name: 'desk-devops', x: 24 * 16, y: 14 * 16 },
    { name: 'desk-automation-developer', x: 28 * 16, y: 14 * 16 },
    // Break room (freelancer)
    { name: 'desk-freelancer', x: 6 * 16, y: 30 * 16 },
  ];

  // Zones (pixel coordinates)
  const zones = [
    { name: 'boardroom', x: 16, y: 16, width: 15 * 16, height: 13 * 16 },
    { name: 'open-work-area', x: 18 * 16, y: 16, width: 40 * 16, height: 25 * 16 },
    { name: 'break-room', x: 16, y: 26 * 16, width: 15 * 16, height: 12 * 16 },
  ];

  const tmj = buildTmj({
    width: W, height: H,
    layers: [
      { name: 'floor', type: 'tilelayer', data: floor },
      { name: 'walls', type: 'tilelayer', data: walls },
      { name: 'furniture-below', type: 'tilelayer', data: furnitureBelow },
      { name: 'furniture-above', type: 'tilelayer', data: furnitureAbove },
      { name: 'collision', type: 'tilelayer', data: collision, visible: false },
      {
        name: 'spawn-points', type: 'objectgroup',
        objects: spawnPoints.map((sp, i) => ({ id: i + 1, name: sp.name, x: sp.x, y: sp.y, width: 0, height: 0 })),
      },
      {
        name: 'zones', type: 'objectgroup',
        objects: zones.map((z, i) => ({ id: 50 + i, name: z.name, x: z.x, y: z.y, width: z.width, height: z.height })),
      },
    ],
    outputPath: 'office.tmj',
  });

  writeMap('office.tmj', tmj);
}
```

The actual tile placement (steps 2-6 in the function comments) requires inspecting the tileset images to determine exact tile IDs. The implementer should:
1. Open `room-builder.png` — identify dark wood floor tiles, wall edge tiles, corner tiles
2. Open `interiors.png` — identify desk, chair, computer, bookshelf, plant, couch, lamp, whiteboard, vending machine, rug, painting, window, door tiles
3. Note multi-tile objects (desks are typically 3 tiles wide × 2 tall, bookshelves 2×3, etc.)
4. Fill in the constants and placement code

Reference the spec's layout: boardroom top-left, open work area center-right, break room bottom-left, corridor connecting them, bookshelves lining walls.

- [ ] **Step 4: Commit office map generator**

```bash
git add scripts/generate-maps.ts
git commit -m "feat: add office map layout to generator"
```

---

### Task 6: Generate Lobby Map

**Files:**
- Modify: `scripts/generate-maps.ts` (add lobby map generation)

- [ ] **Step 1: Write lobby floor plan layout function**

Add `generateLobbyMap()` to the same script. 30×20 tiles:

```typescript
function generateLobbyMap(): void {
  const W = 30, H = 20;
  const floor = new Array(W * H).fill(0);
  const walls = new Array(W * H).fill(0);
  const furnitureBelow = new Array(W * H).fill(0);
  const furnitureAbove = new Array(W * H).fill(0);
  const collision = new Array(W * H).fill(0);

  // Same helpers: set(), fillRect()

  // 1. Dark wood floor
  fillRect(floor, 0, 0, W, H, TILES.DARK_WOOD_1);

  // 2. Outer walls (perimeter)
  // Same pattern as office

  // 3. Reception desk (center area)
  // 4. Waiting area: couches, coffee table (left side)
  // 5. Bookshelves along top wall
  // 6. Plants in corners, paintings on walls

  const tmj = buildTmj({
    width: W, height: H,
    layers: [
      { name: 'floor', type: 'tilelayer', data: floor },
      { name: 'walls', type: 'tilelayer', data: walls },
      { name: 'furniture-below', type: 'tilelayer', data: furnitureBelow },
      { name: 'furniture-above', type: 'tilelayer', data: furnitureAbove },
      { name: 'collision', type: 'tilelayer', data: collision, visible: false },
    ],
    outputPath: 'lobby.tmj',
  });

  writeMap('lobby.tmj', tmj);
}
```

- [ ] **Step 2: Add main entry point**

```typescript
// At the bottom of generate-maps.ts:
generateOfficeMap();
generateLobbyMap();
console.log('Done! Maps generated.');
```

- [ ] **Step 3: Commit lobby generator**

```bash
git add scripts/generate-maps.ts
git commit -m "feat: add lobby map layout to generator"
```

---

### Task 7: Generate Maps, Build, and Verify

- [ ] **Step 1: Run the map generator**

```bash
npm run generate-maps
```

Expected: `Wrote office.tmj` and `Wrote lobby.tmj` printed to console.

- [ ] **Step 2: Verify generated maps are valid JSON**

```bash
node -e "const o = JSON.parse(require('fs').readFileSync('./src/renderer/src/assets/maps/office.tmj')); console.log(o.width + 'x' + o.height, o.layers.length + ' layers')"
node -e "const l = JSON.parse(require('fs').readFileSync('./src/renderer/src/assets/maps/lobby.tmj')); console.log(l.width + 'x' + l.height, l.layers.length + ' layers')"
```

Expected: `60x40 7 layers` and `30x20 5 layers`.

- [ ] **Step 3: Build the app**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Run dev and visually verify**

```bash
npm run dev
```

Check:
- Office screen: map fills the viewport, dark wood floors, bookshelves, desks visible, characters spawn at correct positions, camera zooms to boardroom on "imagine" phase
- Lobby screen: reception area fills viewport, scales properly on window resize
- Resize the window: both screens adapt without empty space

- [ ] **Step 5: Commit generated maps**

```bash
git add src/renderer/src/assets/maps/office.tmj src/renderer/src/assets/maps/lobby.tmj
git commit -m "feat: regenerate office and lobby maps (60x40 and 30x20)"
```

- [ ] **Step 6: Final commit with all changes**

If any tweaks were needed during verification, commit them:

```bash
git add -A
git commit -m "feat: complete office & lobby visual upgrade"
```
