# Pixel Art Graphics Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace procedurally-drawn colored rectangles with proper pixel art using the LimeZu "Modern Interiors" tileset and Tiled JSON maps, achieving a Pokemon Gen 4/5 visual style.

**Architecture:** A `TiledMapRenderer` class replaces the existing `TileMap`, parsing Tiled JSON into multi-layered PixiJS sprite containers with depth sorting. Character sprites load from the LimeZu pack via a `SpriteAdapter`. Maps are authored as Tiled JSON with named layers (floor, walls, furniture-below, furniture-above, collision) and object layers (spawn-points, zones).

**Tech Stack:** PixiJS 8, Tiled JSON format, LimeZu Modern Interiors tileset, Vitest (for parser/logic tests)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/src/office/engine/TiledMapRenderer.ts` | Parse Tiled JSON, create sprite layers, expose walkability grid, spawn points, zones |
| `src/renderer/src/office/characters/SpriteAdapter.ts` | Map LimeZu character spritesheets to the frame format CharacterSprite expects |
| `src/renderer/src/assets/tilesets/modern-interiors.png` | LimeZu tileset spritesheet |
| `src/renderer/src/assets/maps/office.tmj` | Tiled JSON for office map |
| `src/renderer/src/assets/maps/lobby.tmj` | Tiled JSON for lobby map |
| `maps/office.tmx` | Tiled source file for office (design-time) |
| `maps/lobby.tmx` | Tiled source file for lobby (design-time) |
| `maps/tilesets/modern-interiors.tsx` | Tiled tileset definition (design-time) |
| `tests/src/office/engine/TiledMapRenderer.test.ts` | Unit tests for Tiled JSON parsing |
| `tests/src/office/characters/SpriteAdapter.test.ts` | Unit tests for sprite frame mapping |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/src/office/OfficeScene.ts` | Replace Graphics drawing with TiledMapRenderer |
| `src/renderer/src/office/OfficeCanvas.tsx` | Await async scene initialization |
| `src/renderer/src/lobby/LobbyScene.ts` | Replace Graphics drawing with TiledMapRenderer |
| `src/renderer/src/lobby/LobbyCanvas.tsx` | Await async scene initialization |
| `src/renderer/src/office/characters/Character.ts` | Use TiledMapRenderer instead of TileMap, Y-sort zIndex |
| `src/renderer/src/office/characters/CharacterSprite.ts` | Accept Texture[][] from SpriteAdapter |
| `src/renderer/src/office/characters/agents.config.ts` | Remove hardcoded deskTile, add spriteVariant, update idleZone values |
| `src/renderer/src/office/engine/pathfinding.ts` | Accept Walkable interface instead of TileMap |
| `src/renderer/src/office/engine/camera.ts` | Read zone boundaries for phase targets |
| `tests/src/office/engine/pathfinding.test.ts` | Update to use Walkable mock instead of TileMap |
| `tests/src/office/characters/Character.test.ts` | Update for new constructor signature (TiledMapRenderer + frames) |

### Removed Files
| File | Reason |
|------|--------|
| `src/renderer/src/office/engine/tilemap.ts` | Replaced by TiledMapRenderer |
| `src/renderer/src/assets/office-layout.json` | Replaced by Tiled JSON |
| `src/renderer/src/assets/lobby-layout.json` | Replaced by Tiled JSON |
| `tests/src/office/engine/tilemap.test.ts` | Tests for removed TileMap class |

### Notes
- `Whiteboard.ts` and `PresentationScreen.ts` are referenced in the design spec as needing dynamic positioning from Tiled coordinates, but neither file exists yet — they are deferred to a future task.
- When exporting maps from Tiled, use the "Embed Tilesets" option so tileset metadata is inline in the JSON (not an external `.tsj` reference). The `TiledMapRenderer` parser expects embedded tilesets.

---

## Chunk 1: Foundation — TiledMapRenderer

**Note:** Vitest is already configured (`vitest.config.ts` exists, `tests/**/*.test.ts` pattern). All new test files go under `tests/` to match the established convention.

### Task 1: Define TiledMapRenderer types and interface

**Files:**
- Create: `src/renderer/src/office/engine/TiledMapRenderer.ts`

This task creates the class with type definitions and the public interface, but no implementation yet. The implementation comes after tests.

- [ ] **Step 1: Create TiledMapRenderer with types and empty methods**

Create `src/renderer/src/office/engine/TiledMapRenderer.ts`:

```typescript
import { Container, Sprite, Texture, Rectangle } from 'pixi.js'

// --- Tiled JSON Types ---

export interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
  tilesets: TiledTilesetRef[]
}

export interface TiledLayer {
  name: string
  type: 'tilelayer' | 'objectgroup'
  data?: number[] // flat array for tile layers (row-major)
  objects?: TiledObject[] // for object layers
  width?: number
  height?: number
  visible?: boolean
}

export interface TiledObject {
  name: string
  x: number
  y: number
  width?: number
  height?: number
}

export interface TiledTilesetRef {
  firstgid: number
  image: string
  imagewidth: number
  imageheight: number
  tilewidth: number
  tileheight: number
  columns: number
  tilecount: number
}

// --- Renderer output types ---

export interface ZoneRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

// --- Tile layer names we expect in every map ---

const TILE_LAYERS = ['floor', 'walls', 'furniture-below', 'furniture-above'] as const
const COLLISION_LAYER = 'collision'
const SPAWN_POINTS_LAYER = 'spawn-points'
const ZONES_LAYER = 'zones'

export class TiledMapRenderer {
  readonly width: number
  readonly height: number
  readonly tileSize: number

  private walkabilityGrid: boolean[][] = []
  private spawnPoints: Map<string, Point> = new Map()
  private zones: Map<string, ZoneRect> = new Map()
  private layerContainers: Map<string, Container> = new Map()
  private characterContainer: Container
  private rootContainer: Container

  constructor(private mapData: TiledMap, private tilesetTexture: Texture) {
    this.width = mapData.width
    this.height = mapData.height
    this.tileSize = mapData.tilewidth
    this.rootContainer = new Container()
    this.characterContainer = new Container()
    this.characterContainer.sortableChildren = true

    this.parseCollisionLayer()
    this.parseSpawnPoints()
    this.parseZones()
    this.buildTileLayers()
  }

  /** Root container to add to the scene */
  getContainer(): Container {
    return this.rootContainer
  }

  /** Container for characters — inserted between furniture-below and furniture-above */
  getCharacterContainer(): Container {
    return this.characterContainer
  }

  /** Check if a tile coordinate is walkable */
  isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false
    return this.walkabilityGrid[ty][tx]
  }

  /** Convert tile coords to pixel coords (top-left of tile) */
  tileToPixel(tx: number, ty: number): Point {
    return { x: tx * this.tileSize, y: ty * this.tileSize }
  }

  /** Convert pixel coords to tile coords */
  pixelToTile(px: number, py: number): Point {
    return {
      x: Math.floor(px / this.tileSize),
      y: Math.floor(py / this.tileSize),
    }
  }

  /** Get spawn point by name (e.g. "desk-ceo") */
  getSpawnPoint(name: string): Point | undefined {
    return this.spawnPoints.get(name)
  }

  /** Get all spawn points */
  getAllSpawnPoints(): Map<string, Point> {
    return this.spawnPoints
  }

  /** Get zone rectangle by name */
  getZone(name: string): ZoneRect | undefined {
    return this.zones.get(name)
  }

  /** Get all zones */
  getAllZones(): Map<string, ZoneRect> {
    return this.zones
  }

  // --- Private parsing methods (implemented in next tasks) ---

  private parseCollisionLayer(): void {
    const layer = this.findLayer(COLLISION_LAYER, 'tilelayer')
    this.walkabilityGrid = Array.from({ length: this.height }, () =>
      Array(this.width).fill(true),
    )
    if (!layer?.data) return
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tileId = layer.data[y * this.width + x]
        if (tileId !== 0) {
          this.walkabilityGrid[y][x] = false
        }
      }
    }
  }

  private parseSpawnPoints(): void {
    const layer = this.findLayer(SPAWN_POINTS_LAYER, 'objectgroup')
    if (!layer?.objects) return
    for (const obj of layer.objects) {
      this.spawnPoints.set(obj.name, {
        x: Math.floor(obj.x / this.tileSize),
        y: Math.floor(obj.y / this.tileSize),
      })
    }
  }

  private parseZones(): void {
    const layer = this.findLayer(ZONES_LAYER, 'objectgroup')
    if (!layer?.objects) return
    for (const obj of layer.objects) {
      this.zones.set(obj.name, {
        x: Math.floor(obj.x / this.tileSize),
        y: Math.floor(obj.y / this.tileSize),
        width: Math.floor((obj.width ?? 0) / this.tileSize),
        height: Math.floor((obj.height ?? 0) / this.tileSize),
      })
    }
  }

  private buildTileLayers(): void {
    const tileset = this.mapData.tilesets[0]
    if (!tileset) return

    for (const layerName of TILE_LAYERS) {
      const layer = this.findLayer(layerName, 'tilelayer')
      const container = new Container()
      container.label = layerName

      if (layer?.data) {
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const rawTileId = layer.data[y * this.width + x]
            if (rawTileId === 0) continue // empty tile

            const localId = rawTileId - tileset.firstgid
            const tilesetColumns = tileset.columns
            const srcX = (localId % tilesetColumns) * tileset.tilewidth
            const srcY = Math.floor(localId / tilesetColumns) * tileset.tileheight

            const frame = new Rectangle(srcX, srcY, tileset.tilewidth, tileset.tileheight)
            const texture = new Texture({ source: this.tilesetTexture.source, frame })
            const sprite = new Sprite(texture)
            sprite.x = x * this.tileSize
            sprite.y = y * this.tileSize
            container.addChild(sprite)
          }
        }
      }

      this.layerContainers.set(layerName, container)

      this.rootContainer.addChild(container)
      // Insert character container between furniture-below and furniture-above
      if (layerName === 'furniture-below') {
        this.rootContainer.addChild(this.characterContainer)
      }
    }
  }

  private findLayer(name: string, type: 'tilelayer' | 'objectgroup'): TiledLayer | undefined {
    return this.mapData.layers.find((l) => l.name === name && l.type === type)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/office/engine/TiledMapRenderer.ts
git commit -m "feat: add TiledMapRenderer class with Tiled JSON parsing"
```

---

### Task 2: Write TiledMapRenderer tests

**Files:**
- Create: `tests/src/office/engine/TiledMapRenderer.test.ts`

These tests verify parsing logic without PixiJS rendering (mock Texture).

- [ ] **Step 1: Write tests for collision, spawn points, zones, and tile coordinate conversion**

Create `tests/src/office/engine/TiledMapRenderer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pixi.js — we only test data parsing, not rendering
vi.mock('pixi.js', () => ({
  Container: class {
    children: unknown[] = []
    sortableChildren = false
    label = ''
    addChild(child: unknown) { this.children.push(child) }
  },
  Sprite: class {
    x = 0
    y = 0
    constructor() {}
  },
  Texture: class {
    source: unknown
    frame: unknown
    constructor(opts?: { source?: unknown; frame?: unknown }) {
      this.source = opts?.source
      this.frame = opts?.frame
    }
  },
  Rectangle: class {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  },
}))

import { TiledMapRenderer, type TiledMap } from '../../../../src/renderer/src/office/engine/TiledMapRenderer'
import { Texture } from 'pixi.js'

function makeMap(overrides: Partial<TiledMap> = {}): TiledMap {
  return {
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    layers: [],
    tilesets: [
      {
        firstgid: 1,
        image: 'tileset.png',
        imagewidth: 160,
        imageheight: 160,
        tilewidth: 16,
        tileheight: 16,
        columns: 10,
        tilecount: 100,
      },
    ],
    ...overrides,
  }
}

const mockTexture = new Texture()

describe('TiledMapRenderer', () => {
  describe('basic properties', () => {
    it('exposes width, height, tileSize from map data', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.width).toBe(4)
      expect(renderer.height).toBe(3)
      expect(renderer.tileSize).toBe(16)
    })
  })

  describe('tileToPixel / pixelToTile', () => {
    it('converts tile coords to pixel coords', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.tileToPixel(2, 3)).toEqual({ x: 32, y: 48 })
    })

    it('converts pixel coords to tile coords', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.pixelToTile(35, 50)).toEqual({ x: 2, y: 3 })
    })
  })

  describe('collision / walkability', () => {
    it('all tiles walkable when no collision layer exists', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.isWalkable(0, 0)).toBe(true)
      expect(renderer.isWalkable(3, 2)).toBe(true)
    })

    it('marks tiles with non-zero collision tile IDs as unwalkable', () => {
      const map = makeMap({
        layers: [
          {
            name: 'collision',
            type: 'tilelayer',
            // 4 wide x 3 tall = 12 entries. Tile ID 1 = blocked, 0 = open.
            data: [
              0, 1, 0, 0,
              0, 0, 0, 1,
              1, 0, 0, 0,
            ],
          },
        ],
      })
      const renderer = new TiledMapRenderer(map, mockTexture)
      expect(renderer.isWalkable(0, 0)).toBe(true)
      expect(renderer.isWalkable(1, 0)).toBe(false) // blocked
      expect(renderer.isWalkable(3, 1)).toBe(false) // blocked
      expect(renderer.isWalkable(0, 2)).toBe(false) // blocked
      expect(renderer.isWalkable(2, 2)).toBe(true)
    })

    it('out-of-bounds tiles are not walkable', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.isWalkable(-1, 0)).toBe(false)
      expect(renderer.isWalkable(0, -1)).toBe(false)
      expect(renderer.isWalkable(4, 0)).toBe(false)
      expect(renderer.isWalkable(0, 3)).toBe(false)
    })
  })

  describe('spawn points', () => {
    it('parses spawn points from object layer', () => {
      const map = makeMap({
        layers: [
          {
            name: 'spawn-points',
            type: 'objectgroup',
            objects: [
              { name: 'desk-ceo', x: 80, y: 128 },
              { name: 'desk-backend-engineer', x: 320, y: 96 },
            ],
          },
        ],
      })
      const renderer = new TiledMapRenderer(map, mockTexture)
      expect(renderer.getSpawnPoint('desk-ceo')).toEqual({ x: 5, y: 8 })
      expect(renderer.getSpawnPoint('desk-backend-engineer')).toEqual({ x: 20, y: 6 })
      expect(renderer.getSpawnPoint('nonexistent')).toBeUndefined()
    })

    it('returns empty map when no spawn-points layer', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.getAllSpawnPoints().size).toBe(0)
    })
  })

  describe('zones', () => {
    it('parses zone rectangles from object layer', () => {
      const map = makeMap({
        layers: [
          {
            name: 'zones',
            type: 'objectgroup',
            objects: [
              { name: 'boardroom', x: 16, y: 16, width: 160, height: 192 },
              { name: 'break-room', x: 416, y: 256, width: 192, height: 112 },
            ],
          },
        ],
      })
      const renderer = new TiledMapRenderer(map, mockTexture)
      expect(renderer.getZone('boardroom')).toEqual({ x: 1, y: 1, width: 10, height: 12 })
      expect(renderer.getZone('break-room')).toEqual({ x: 26, y: 16, width: 12, height: 7 })
      expect(renderer.getZone('nonexistent')).toBeUndefined()
    })
  })

  describe('tile layers', () => {
    it('creates containers in correct render order', () => {
      const map = makeMap({
        layers: [
          { name: 'floor', type: 'tilelayer', data: Array(12).fill(0) },
          { name: 'walls', type: 'tilelayer', data: Array(12).fill(0) },
          { name: 'furniture-below', type: 'tilelayer', data: Array(12).fill(0) },
          { name: 'furniture-above', type: 'tilelayer', data: Array(12).fill(0) },
        ],
      })
      const renderer = new TiledMapRenderer(map, mockTexture)
      const root = renderer.getContainer()
      const labels = root.children.map((c: any) => c.label || 'character')

      // floor, walls, furniture-below, character-container, furniture-above
      expect(labels).toEqual(['floor', 'walls', 'furniture-below', '', 'furniture-above'])
    })

    it('character container has sortableChildren enabled', () => {
      const renderer = new TiledMapRenderer(makeMap(), mockTexture)
      expect(renderer.getCharacterContainer().sortableChildren).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests pass. The implementation was written in Task 2 and these tests validate it.

- [ ] **Step 3: Commit**

```bash
git add tests/src/office/engine/TiledMapRenderer.test.ts
git commit -m "test: add TiledMapRenderer unit tests"
```

---

### Task 3: Set up asset directories and placeholder Tiled JSON maps

**Files:**
- Create: `src/renderer/src/assets/maps/office.tmj`
- Create: `src/renderer/src/assets/maps/lobby.tmj`

These are minimal but structurally complete Tiled JSON files. They use tile ID 1 for floor, 2 for walls, and include collision, spawn-points, and zones layers. The actual tile art comes when the tileset PNG is added later — for now these produce a working map with correct structure.

**Important:** The tile IDs in these files reference positions in the tileset spritesheet. Until the real tileset is added, the visual output will look wrong but the data layer (walkability, spawn points, zones) will be correct. This lets us verify the rendering pipeline end-to-end before worrying about art.

- [ ] **Step 1: Create asset directories**

```bash
mkdir -p src/renderer/src/assets/maps src/renderer/src/assets/tilesets
```

- [ ] **Step 2: Create office.tmj**

Create `src/renderer/src/assets/maps/office.tmj` — a 40x24 Tiled JSON with:
- `floor` tile layer: all tiles set to 1 (will reference first tileset tile)
- `walls` tile layer: border tiles set to 2, interior tiles 0
- `furniture-below` tile layer: empty (all 0s) — furniture placed after tileset
- `furniture-above` tile layer: empty (all 0s)
- `collision` tile layer: border + interior walls marked with 1
- `spawn-points` object layer: 15 desk spawn points matching `desk-<role>` convention
  - Leadership (boardroom zone): `desk-ceo` (5,8), `desk-product-manager` (5,10), `desk-market-researcher` (7,8), `desk-chief-architect` (7,10)
  - Coordination (open area left): `desk-agent-organizer` (14,8), `desk-project-manager` (14,10), `desk-team-lead` (14,12)
  - Engineering (open area right): `desk-backend-engineer` (24,6), `desk-frontend-engineer` (27,6), `desk-mobile-developer` (30,6), `desk-ui-ux-expert` (33,6), `desk-data-engineer` (24,10), `desk-devops` (27,10), `desk-automation-developer` (30,10), `desk-freelancer` (33,10)
- `zones` object layer: boardroom (1,1,10,12), open-work-area (12,1,26,22), break-room (26,16,12,7)

The spawn point coordinates are in pixels (tile * 16). The JSON structure follows Tiled's export format exactly.

```json
{
  "width": 40,
  "height": 24,
  "tilewidth": 16,
  "tileheight": 16,
  "orientation": "orthogonal",
  "renderorder": "right-down",
  "tilesets": [
    {
      "firstgid": 1,
      "image": "../../tilesets/modern-interiors.png",
      "imagewidth": 512,
      "imageheight": 512,
      "tilewidth": 16,
      "tileheight": 16,
      "columns": 32,
      "tilecount": 1024
    }
  ],
  "layers": [
    {
      "name": "floor",
      "type": "tilelayer",
      "width": 40,
      "height": 24,
      "data": "<<GENERATE: 960 entries. All set to 1 for placeholder floor>>"
    },
    {
      "name": "walls",
      "type": "tilelayer",
      "width": 40,
      "height": 24,
      "data": "<<GENERATE: 960 entries. Top/bottom rows and left/right columns set to 2. Boardroom interior walls (column 11, rows 1-12; row 13, columns 1-11). Break room walls (column 25, rows 16-23; row 15, columns 25-38). All other entries 0.>>"
    },
    {
      "name": "furniture-below",
      "type": "tilelayer",
      "width": 40,
      "height": 24,
      "data": "<<GENERATE: 960 entries, all 0>>"
    },
    {
      "name": "furniture-above",
      "type": "tilelayer",
      "width": 40,
      "height": 24,
      "data": "<<GENERATE: 960 entries, all 0>>"
    },
    {
      "name": "collision",
      "type": "tilelayer",
      "width": 40,
      "height": 24,
      "data": "<<GENERATE: 960 entries. Same pattern as walls — 1 where wall tiles are, 0 elsewhere. Add doorway gaps: boardroom door at (11,8) = 0, break room door at (25,19) = 0.>>"
    },
    {
      "name": "spawn-points",
      "type": "objectgroup",
      "objects": [
        { "name": "desk-ceo", "x": 80, "y": 128 },
        { "name": "desk-product-manager", "x": 80, "y": 160 },
        { "name": "desk-market-researcher", "x": 112, "y": 128 },
        { "name": "desk-chief-architect", "x": 112, "y": 160 },
        { "name": "desk-agent-organizer", "x": 224, "y": 128 },
        { "name": "desk-project-manager", "x": 224, "y": 160 },
        { "name": "desk-team-lead", "x": 224, "y": 192 },
        { "name": "desk-backend-engineer", "x": 384, "y": 96 },
        { "name": "desk-frontend-engineer", "x": 432, "y": 96 },
        { "name": "desk-mobile-developer", "x": 480, "y": 96 },
        { "name": "desk-ui-ux-expert", "x": 528, "y": 96 },
        { "name": "desk-data-engineer", "x": 384, "y": 160 },
        { "name": "desk-devops", "x": 432, "y": 160 },
        { "name": "desk-automation-developer", "x": 480, "y": 160 },
        { "name": "desk-freelancer", "x": 528, "y": 160 }
      ]
    },
    {
      "name": "zones",
      "type": "objectgroup",
      "objects": [
        { "name": "boardroom", "x": 16, "y": 16, "width": 160, "height": 192 },
        { "name": "open-work-area", "x": 192, "y": 16, "width": 416, "height": 352 },
        { "name": "break-room", "x": 416, "y": 256, "width": 192, "height": 112 }
      ]
    }
  ]
}
```

**Note for implementer:** The `data` arrays marked with `<<GENERATE>>` must be actual number arrays of exactly 960 entries (40*24). Write a small script or hand-construct them following the pattern described. The exact tile IDs will be updated when the real tileset is integrated — for now, use `1` for any placed tile and `0` for empty.

- [ ] **Step 3: Create lobby.tmj**

Create `src/renderer/src/assets/maps/lobby.tmj` — a 20x14 Tiled JSON with:
- `floor` tile layer: all interior tiles set to 1
- `walls` tile layer: border tiles set to 2
- `furniture-below` tile layer: empty
- `furniture-above` tile layer: empty
- `collision` tile layer: borders blocked
- `zones` object layer: lobby (1,1,18,12), reception (7,8,6,3)
- No spawn-points layer needed (lobby has no characters)

Same structure as office.tmj but simpler (280 entries per layer: 20*14).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/assets/maps/
git commit -m "feat: add placeholder Tiled JSON maps for office and lobby"
```

---

### Task 4: Create a placeholder tileset image

**Files:**
- Create: `src/renderer/src/assets/tilesets/modern-interiors.png`

Until the real LimeZu tileset is downloaded, we need a placeholder image so the rendering pipeline works end-to-end.

- [ ] **Step 1: Generate a placeholder tileset PNG**

Create a simple 512x512 PNG with a grid of colored 16x16 squares. This can be done programmatically:

```bash
# Using node with canvas (or any method to create a simple PNG)
# The placeholder just needs to be a valid PNG at 512x512
# Tile 0 (index 0) = transparent, Tile 1 = dark floor color, Tile 2 = wall color
```

Alternative: create a minimal 32x32 PNG (2x2 tiles) with just two colors — one for floor, one for walls. The tileset reference in the TMJ files would need `imagewidth: 32, imageheight: 32, columns: 2, tilecount: 4`.

**Simplest approach:** Use any image editor or script to create a small placeholder. The exact content doesn't matter — it will be replaced with the real LimeZu tileset.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/tilesets/
git commit -m "chore: add placeholder tileset image"
```

---

## Chunk 2: Character System Updates

### Task 5: Create SpriteAdapter

**Files:**
- Create: `src/renderer/src/office/characters/SpriteAdapter.ts`
- Create: `tests/src/office/characters/SpriteAdapter.test.ts`

The SpriteAdapter extracts animation frames from LimeZu character spritesheets and produces the frame arrays CharacterSprite needs.

- [ ] **Step 1: Write SpriteAdapter tests**

Create `tests/src/office/characters/SpriteAdapter.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('pixi.js', () => ({
  Texture: class MockTexture {
    source: unknown
    frame: unknown
    static EMPTY = new (class MockTexture { source = null; frame = null })()
    constructor(opts?: { source?: unknown; frame?: unknown }) {
      this.source = opts?.source
      this.frame = opts?.frame
    }
  },
  Rectangle: class {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  },
}))

import { SpriteAdapter } from '../../../../src/renderer/src/office/characters/SpriteAdapter'
import { Texture } from 'pixi.js'

describe('SpriteAdapter', () => {
  it('produces 3 direction rows', () => {
    const frames = SpriteAdapter.extractFrames(Texture.EMPTY, { frameWidth: 16, frameHeight: 32, columns: 3, walkFrames: 3 })
    // down, up, right — 3 directions
    expect(frames.length).toBe(3)
  })

  it('each direction has 7 frame slots (walk*3, type*2, read*2)', () => {
    const frames = SpriteAdapter.extractFrames(Texture.EMPTY, { frameWidth: 16, frameHeight: 32, columns: 3, walkFrames: 3 })
    for (const row of frames) {
      expect(row.length).toBe(7)
    }
  })

  it('type and read frames reuse the idle frame (first walk frame)', () => {
    const frames = SpriteAdapter.extractFrames(Texture.EMPTY, { frameWidth: 16, frameHeight: 32, columns: 3, walkFrames: 3 })
    for (const row of frames) {
      // frames[3] (type1), frames[4] (type2), frames[5] (read1), frames[6] (read2)
      // should all be the same texture as frames[0] (idle/walk1)
      expect(row[3]).toBe(row[0])
      expect(row[4]).toBe(row[0])
      expect(row[5]).toBe(row[0])
      expect(row[6]).toBe(row[0])
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `SpriteAdapter` module not found.

- [ ] **Step 3: Implement SpriteAdapter**

Create `src/renderer/src/office/characters/SpriteAdapter.ts`:

```typescript
import { Texture, Rectangle } from 'pixi.js'

export interface SpriteSheetConfig {
  frameWidth: number   // pixel width of one frame (typically 16)
  frameHeight: number  // pixel height of one frame (typically 32)
  columns: number      // frames per row in the source sheet
  walkFrames: number   // number of walk frames per direction (typically 3)
}

/**
 * Maps LimeZu character spritesheets to the 7-column x 3-row frame layout
 * that CharacterSprite expects.
 *
 * LimeZu layout: 4 directions (down, left, right, up) each with N walk frames.
 * Output: 3 rows (down, up, right) each with 7 frames:
 *   [walk1, walk2, walk3, type1, type2, read1, read2]
 *
 * Type/read frames reuse the idle (first walk) frame since LimeZu doesn't
 * include desk animations.
 */
export class SpriteAdapter {
  /** Source rows to extract from LimeZu sheet: down=0, up=3, right=2 */
  private static readonly SOURCE_ROWS = [0, 3, 2]

  static extractFrames(sheetTexture: Texture, config: SpriteSheetConfig): Texture[][] {
    const { frameWidth, frameHeight, columns, walkFrames } = config
    const output: Texture[][] = []

    for (const srcRow of this.SOURCE_ROWS) {
      const frames: Texture[] = []

      // Extract walk frames (columns 0..walkFrames-1)
      for (let col = 0; col < walkFrames; col++) {
        const frame = new Rectangle(
          col * frameWidth,
          srcRow * frameHeight,
          frameWidth,
          frameHeight,
        )
        frames.push(new Texture({ source: sheetTexture.source, frame }))
      }

      // Pad to 3 walk frames if fewer
      while (frames.length < 3) {
        frames.push(frames[0])
      }

      // Type and read frames reuse idle (first walk frame)
      const idleFrame = frames[0]
      frames.push(idleFrame, idleFrame, idleFrame, idleFrame)

      output.push(frames)
    }

    return output
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All SpriteAdapter tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/characters/SpriteAdapter.ts tests/src/office/characters/SpriteAdapter.test.ts
git commit -m "feat: add SpriteAdapter for LimeZu character spritesheets"
```

---

### Task 6: Update CharacterSprite to accept Texture[][] from SpriteAdapter

**Files:**
- Modify: `src/renderer/src/office/characters/CharacterSprite.ts`

Currently CharacterSprite slices a single spritesheet texture into frames internally. Change it to accept pre-sliced `Texture[][]` frames from SpriteAdapter.

- [ ] **Step 1: Modify CharacterSprite constructor**

Replace the constructor and frame extraction logic. The current code:
- Takes a `Texture` (single spritesheet) in the constructor
- Internally slices it into frames using `Rectangle`
- Creates `AnimatedSprite` from those frames

Change to:
- Accept `Texture[][]` (3 rows of 7 frames each) — pre-extracted by SpriteAdapter
- Store frames directly
- Remove internal slicing logic

Read `src/renderer/src/office/characters/CharacterSprite.ts` first, then modify:

**Current constructor** (approximately):
```typescript
constructor(spriteSheet: Texture) {
  // ... slicing logic using Rectangle
}
```

**New constructor:**
```typescript
constructor(frames: Texture[][]) {
  // frames[0] = down (7 frames), frames[1] = up, frames[2] = right
  // Store directly, no slicing needed
}
```

Key changes:
1. Constructor takes `Texture[][]` instead of `Texture`
2. Remove all `Rectangle`-based frame extraction
3. Remove `FRAME_WIDTH`, `FRAME_HEIGHT`, `COLUMNS` constants (no longer slicing)
4. Keep all animation logic (`setAnimation`, `setDirection`, `update`) unchanged
5. Keep the left-direction flip logic (`scale.x = -1` for left) unchanged

- [ ] **Step 2: Verify the app still compiles**

```bash
npm run build 2>&1 | head -50
```

Expected: May show errors in files that construct CharacterSprite — those are fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/characters/CharacterSprite.ts
git commit -m "refactor: CharacterSprite accepts pre-extracted Texture[][] frames"
```

---

### Task 7: Update agents.config.ts — remove deskTile, add spriteVariant

**Files:**
- Modify: `src/renderer/src/office/characters/agents.config.ts`

- [ ] **Step 1: Read current agents.config.ts**

Read `src/renderer/src/office/characters/agents.config.ts` to see the exact structure.

- [ ] **Step 2: Modify config**

Changes:
1. Remove `deskTile: { x, y }` from every agent config entry
2. Add `spriteVariant: string` to every agent — this is the filename of the LimeZu character sprite to use (e.g., `'char_01'`, `'char_02'`, etc.)
3. Keep `displayName`, `color`, `group`, `idleZone` unchanged
4. Update the `AgentConfig` interface to reflect the change

Replace `deskTile` with `spriteVariant`. Use sequential variant names for now (`char_01` through `char_15`) — the actual filenames will be determined when the real tileset is integrated.

Update the `AgentConfig` interface:
```typescript
interface AgentConfig {
  role: AgentRole         // preserved from existing interface
  displayName: string
  color: string
  group: 'leadership' | 'coordination' | 'engineering'
  spriteVariant: string   // NEW — replaces deskTile
  idleZone: 'boardroom' | 'open-work-area' | 'break-room'  // updated zone names
}
```

Update the idle zone values to match the new Tiled zone names:
- `boardroom` → `boardroom` (unchanged)
- `coordination` → `open-work-area`
- `bullpen` → `open-work-area`
- `common` → `break-room`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/characters/agents.config.ts
git commit -m "refactor: replace deskTile with spriteVariant, update zone names"
```

---

### Task 8: Update Character.ts — use TiledMapRenderer, Y-sorting, spawn points

**Files:**
- Modify: `src/renderer/src/office/characters/Character.ts`

- [ ] **Step 1: Read current Character.ts**

Read `src/renderer/src/office/characters/Character.ts` to see the exact constructor and TileMap usage.

- [ ] **Step 2: Modify Character.ts**

Changes to the `CharacterOptions` interface:
```typescript
// Old:
interface CharacterOptions {
  agentId: string
  role: AgentRole
  deskTile: { x: number; y: number }
  tileMap: TileMap
  spriteSheet: Texture
}

// New:
interface CharacterOptions {
  agentId: string
  role: AgentRole
  mapRenderer: TiledMapRenderer
  frames: Texture[][]  // from SpriteAdapter.extractFrames()
}
```

Changes to constructor and methods:
1. Accept `TiledMapRenderer` instead of `TileMap` via `options.mapRenderer`
2. Accept `Texture[][]` via `options.frames` — pass to `new CharacterSprite(frames)` instead of `new CharacterSprite(spriteSheet)`
3. Look up desk position from spawn points: `mapRenderer.getSpawnPoint('desk-' + role)`
4. If no spawn point found, start at a random walkable tile in the agent's idle zone
5. In `update()`: set `this.sprite.container.zIndex = this.pixelY` for Y-sorting
6. Replace all `this.tileMap` references with `this.mapRenderer` (same method names: `isWalkable`, `tileToPixel`, `pixelToTile`, `tileSize`). Note: the existing code uses `this.tileMap.tileSize` directly in `updateWalk()` — these become `this.mapRenderer.tileSize`
7. Update imports: remove TileMap, import TiledMapRenderer

**Note for OfficeScene integration (Task 10):** When constructing Characters, the scene must call `SpriteAdapter.extractFrames(charTexture, config)` to produce the `frames` parameter before passing it to the Character constructor.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/characters/Character.ts
git commit -m "refactor: Character uses TiledMapRenderer with spawn points and Y-sort"
```

---

### Task 9: Update pathfinding.ts

**Files:**
- Modify: `src/renderer/src/office/engine/pathfinding.ts`

- [ ] **Step 1: Read current pathfinding.ts**

Read `src/renderer/src/office/engine/pathfinding.ts` to see how it uses TileMap.

- [ ] **Step 2: Modify pathfinding.ts**

Changes:
1. Replace `TileMap` parameter type with a minimal interface:
   ```typescript
   interface Walkable {
     width: number
     height: number
     isWalkable(x: number, y: number): boolean
   }
   ```
2. Change `findPath(map: TileMap, ...)` to `findPath(map: Walkable, ...)`
3. Remove TileMap import
4. No logic changes needed — BFS algorithm stays identical

This interface is satisfied by both the old TileMap and the new TiledMapRenderer.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/engine/pathfinding.ts
git commit -m "refactor: pathfinding accepts Walkable interface instead of TileMap"
```

---

### Task 10: Update existing tests for new interfaces

**Files:**
- Modify: `tests/src/office/engine/pathfinding.test.ts`
- Modify: `tests/src/office/characters/Character.test.ts`
- Remove: `tests/src/office/engine/tilemap.test.ts`

The interface changes in Tasks 8-9 break three existing test files. This task updates them.

- [ ] **Step 1: Update pathfinding.test.ts**

Replace the `TileMap` import and usage with a plain object that satisfies the `Walkable` interface:

```typescript
// Old:
import { TileMap } from '../../../../src/renderer/src/office/engine/tilemap';
const map = new TileMap(LAYOUT);

// New: inline mock satisfying Walkable interface
function makeWalkableGrid(tiles: number[][]): { width: number; height: number; isWalkable(x: number, y: number): boolean } {
  return {
    width: tiles[0].length,
    height: tiles.length,
    isWalkable(x: number, y: number): boolean {
      if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[0].length) return false
      return tiles[y][x] === 0
    },
  }
}
```

Replace all `new TileMap(LAYOUT)` with `makeWalkableGrid(LAYOUT.tiles)`. Remove the TileMap import. The test assertions should remain unchanged.

- [ ] **Step 2: Update Character.test.ts**

Update the mock and constructor call to match the new `CharacterOptions` interface:

```typescript
// Old:
import { TileMap } from '../../../../src/renderer/src/office/engine/tilemap';
character = new Character({
  agentId: 'agent-1',
  role: 'backend-engineer',
  deskTile: { x: 5, y: 5 },
  tileMap,
  spriteSheet: null as any,
});

// New: mock TiledMapRenderer with spawn points
const mockMapRenderer = {
  width: 10, height: 10, tileSize: 16,
  isWalkable: (x: number, y: number) => tiles[y]?.[x] === 0,
  tileToPixel: (tx: number, ty: number) => ({ x: tx * 16, y: ty * 16 }),
  pixelToTile: (px: number, py: number) => ({ x: Math.floor(px / 16), y: Math.floor(py / 16) }),
  getSpawnPoint: (name: string) => name === 'desk-backend-engineer' ? { x: 5, y: 5 } : undefined,
  getZone: () => undefined,
} as any;

character = new Character({
  agentId: 'agent-1',
  role: 'backend-engineer',
  mapRenderer: mockMapRenderer,
  frames: [[]] as any,
});
```

Remove TileMap import. Update assertions if needed (the state/position behavior should be the same).

- [ ] **Step 3: Remove tilemap.test.ts**

```bash
rm tests/src/office/engine/tilemap.test.ts
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass (including the updated pathfinding and Character tests, plus the new TiledMapRenderer and SpriteAdapter tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: update pathfinding and Character tests for new interfaces"
```

---

## Chunk 3: Scene Integration

### Task 11: Update OfficeScene.ts and OfficeCanvas.tsx

**Files:**
- Modify: `src/renderer/src/office/OfficeScene.ts`
- Modify: `src/renderer/src/office/OfficeCanvas.tsx`

This is the main integration task — replacing the colored-rectangle rendering with the tileset-based renderer.

- [ ] **Step 1: Read current OfficeScene.ts**

Read `src/renderer/src/office/OfficeScene.ts` to understand the full initialization flow.

- [ ] **Step 2: Rewrite OfficeScene to use TiledMapRenderer**

Key changes:
1. Remove `import { TileMap }` and `import officeLayout`
2. Add `import { TiledMapRenderer }` and import the Tiled JSON + tileset
3. In `init()`:
   - Load tileset texture via `Assets.load()` with `scaleMode: 'nearest'`
   - Load map JSON (import or fetch)
   - Create `TiledMapRenderer` instance
   - Add `renderer.getContainer()` to the world container (replaces the Graphics tile drawing loop)
   - Get `renderer.getCharacterContainer()` and use it as the character layer
4. Remove the `Graphics`-based floor/wall drawing loop entirely
5. Pass `TiledMapRenderer` to `Character` constructor instead of `TileMap`
6. Pass zone data to Camera for phase targets (see Task 12)

The structure becomes:
```typescript
async init() {
  // Load assets — use Vite import for correct path resolution in electron-vite
  // At top of file: import tilesetUrl from '../assets/tilesets/modern-interiors.png?url'
  // At top of file: import officeMapData from '../assets/maps/office.tmj'
  const tilesetTexture = await Assets.load(tilesetUrl)
  tilesetTexture.source.scaleMode = 'nearest'

  // Create renderer
  this.mapRenderer = new TiledMapRenderer(officeMapData, tilesetTexture)

  // Add to scene
  this.worldContainer.addChild(this.mapRenderer.getContainer())
  this.characterLayer = this.mapRenderer.getCharacterContainer()

  // Create characters using spawn points + SpriteAdapter
  // For each agent: load character sprite, extract frames, create Character
  this.createCharacters(this.mapRenderer)

  // Set up camera with zones from map
  this.camera = new Camera(this.worldContainer, this.mapRenderer.getAllZones())
}
```

**Important:** Since `init()` is now async, `OfficeCanvas.tsx` must `await` it and set the ref **after** init completes to avoid resize handlers touching a partially-initialized scene:

```typescript
// In OfficeCanvas.tsx useEffect:
const scene = new OfficeScene(app)
await scene.init()  // load assets, build tile layers
sceneRef.current = scene  // set AFTER init completes — avoids race with resize handler
```

- [ ] **Step 3: Verify the app runs**

```bash
npm run dev
```

Expected: The office scene renders with tileset sprites instead of colored rectangles. Characters appear at their spawn point positions. With the placeholder tileset, colors will look wrong but the structure should be correct.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/office/OfficeScene.ts src/renderer/src/office/OfficeCanvas.tsx
git commit -m "feat: OfficeScene renders via TiledMapRenderer"
```

---

### Task 12: Update Camera to use zone data

**Files:**
- Modify: `src/renderer/src/office/engine/camera.ts`

- [ ] **Step 1: Read current camera.ts**

Read `src/renderer/src/office/engine/camera.ts` to see the hardcoded PHASE_TARGETS.

- [ ] **Step 2: Modify Camera to accept zone data**

Changes:
1. Constructor signature changes to `constructor(container: Container, zones: Map<string, ZoneRect>)` — keeps the existing `container` parameter, adds `zones`
2. Phase targets are computed from zone centers instead of hardcoded:
   ```typescript
   // 'imagine' → boardroom zone center
   // 'warroom' → open-work-area zone center
   // 'build' → full map center (zoom out)
   ```
3. Zoom values stay hardcoded per phase (2.5, 2.0, 1.5) — these are aesthetic choices, not data-driven
4. Fall back to hardcoded values if a zone is missing (defensive)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/engine/camera.ts
git commit -m "refactor: Camera reads phase targets from zone data"
```

---

### Task 13: Update LobbyScene.ts and LobbyCanvas.tsx

**Files:**
- Modify: `src/renderer/src/lobby/LobbyScene.ts`
- Modify: `src/renderer/src/lobby/LobbyCanvas.tsx`

- [ ] **Step 1: Read current LobbyScene.ts**

Read `src/renderer/src/lobby/LobbyScene.ts` to see the full rendering code.

- [ ] **Step 2: Rewrite LobbyScene to use TiledMapRenderer**

Same pattern as OfficeScene but simpler:
1. Remove Graphics-based drawing (floor rectangles, reception desk shape)
2. Load lobby Tiled JSON + tileset (same `?url` import pattern as OfficeScene)
3. Create TiledMapRenderer, add container to scene
4. Keep the centered camera with 2.5x zoom
5. No character layer needed (lobby has no runtime characters)
6. Make init async, update `LobbyCanvas.tsx` to `await scene.init()` (same pattern as OfficeCanvas)

- [ ] **Step 3: Verify the lobby renders**

```bash
npm run dev
```

Expected: Lobby screen shows tileset-based rendering.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/lobby/LobbyScene.ts src/renderer/src/lobby/LobbyCanvas.tsx
git commit -m "feat: LobbyScene renders via TiledMapRenderer"
```

---

## Chunk 4: Cleanup

### Task 14: Remove old TileMap and layout files

**Files:**
- Remove: `src/renderer/src/office/engine/tilemap.ts`
- Remove: `src/renderer/src/assets/office-layout.json`
- Remove: `src/renderer/src/assets/lobby-layout.json`

- [ ] **Step 1: Verify no remaining imports of old files**

```bash
grep -r "tilemap" src/renderer/src/ --include="*.ts" --include="*.tsx" -l
grep -r "office-layout.json\|lobby-layout.json" src/renderer/src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No files should import the old modules. If any remain, fix them first.

- [ ] **Step 2: Remove files**

```bash
rm src/renderer/src/office/engine/tilemap.ts
rm src/renderer/src/assets/office-layout.json
rm src/renderer/src/assets/lobby-layout.json
```

- [ ] **Step 3: Verify build still passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Verify tests still pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old TileMap and static layout JSON files"
```

---

### Task 15: Download and integrate the real LimeZu tileset

**Files:**
- Replace: `src/renderer/src/assets/tilesets/modern-interiors.png`
- Update: `src/renderer/src/assets/maps/office.tmj` (tile IDs to match real tileset)
- Update: `src/renderer/src/assets/maps/lobby.tmj` (tile IDs to match real tileset)

This task requires **manual work** — downloading the tileset from itch.io and designing the maps in Tiled.

- [ ] **Step 1: Download LimeZu Modern Interiors pack**

Download from itch.io (free): search "LimeZu Modern Interiors". Extract the tileset PNG(s) and place the main tileset image at `src/renderer/src/assets/tilesets/modern-interiors.png`.

Update the tileset dimensions in both `.tmj` files to match the actual image dimensions (`imagewidth`, `imageheight`, `columns`, `tilecount`).

- [ ] **Step 2: Install Tiled map editor**

Download Tiled from https://www.mapeditor.org/ (free).

- [ ] **Step 3: Set up Tiled project**

```bash
mkdir -p maps/tilesets
```

1. Open Tiled
2. Create a new tileset: File → New Tileset → name "modern-interiors", image = the downloaded PNG, tile size 16x16
3. Save as `maps/tilesets/modern-interiors.tsx`
4. Copy the tileset PNG to `maps/tilesets/modern-interiors.png`

- [ ] **Step 4: Design the office map in Tiled**

Create `maps/office.tmx` with layers matching the spec:
- `floor`: Wood planks in open area, carpet in boardroom, tile in break room
- `walls`: Dark walls with baseboards, boardroom glass-wall style, break room walls, doorways
- `furniture-below`: Desk bases, chairs, rugs, couch, coffee machine, plants
- `furniture-above`: Desk tops with monitors, bookshelf tops, wall clock, whiteboard frame, pictures
- `collision`: Block walls, furniture that can't be walked through, leave doorways open
- `spawn-points`: 15 desk points matching furniture positions
- `zones`: boardroom, open-work-area, break-room rectangles

Export as JSON: File → Export As → `src/renderer/src/assets/maps/office.tmj`

- [ ] **Step 5: Design the lobby map in Tiled**

Create `maps/lobby.tmx`:
- `floor`: Light tile/marble floor
- `walls`: Dark walls with trim
- `furniture-below`: Reception desk base, bench, plants
- `furniture-above`: Sign/picture on wall, desk top
- `collision`: Walls and desk blocked
- `zones`: lobby, reception

Export as JSON: `src/renderer/src/assets/maps/lobby.tmj`

- [ ] **Step 6: Add character sprite variants**

From the LimeZu pack, select 15 distinct character sprite PNGs. Place them in `src/renderer/src/assets/characters/`. Update `SpriteAdapter` configuration if the actual spritesheet layout differs from the assumed format (check frame dimensions and direction row order).

Update `agents.config.ts` spriteVariant values to match the actual filenames.

- [ ] **Step 7: Verify everything renders correctly**

```bash
npm run dev
```

Expected: Both office and lobby scenes render with full pixel art. Characters appear as distinct sprites at their desk positions.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: integrate LimeZu tileset with designed office and lobby maps"
```

---

### Task 16: Final verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Run the app and verify visually**

```bash
npm run dev
```

Verify:
- Lobby shows polished pixel art with reception desk, plants, tile floor
- Clicking a session navigates to office
- Office shows hybrid layout: walled boardroom (carpet), open work area (wood), walled break room (tile)
- Characters appear at desks with distinct sprites
- Characters walk with proper animation when receiving tool events
- Depth sorting works: characters walk behind desk tops and bookshelf tops
- Camera phase transitions still work (imagine → warroom → build)
- Back to lobby button works, lobby renders correctly again
- Speech bubbles and agent labels still display correctly on characters

- [ ] **Step 3: Build for production**

```bash
npm run build
```

Expected: Production build succeeds.

- [ ] **Step 4: Commit any final fixes**

If any issues found during verification, fix and commit.
