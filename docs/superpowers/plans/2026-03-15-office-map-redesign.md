# Office Map Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the office map using the new Office Tileset with a compact 40x30 layout featuring CEO room, boardroom, open space, kitchen, and entrance/reception.

**Architecture:** Replace the two-tileset system (room-builder + interiors) with the single `Office Tileset All 16x16.png`. Rewrite `generate-maps.ts` for the new layout. Update `OfficeScene.ts` to load one tileset. Add `ceo-room` and `entrance` zones.

**Tech Stack:** TypeScript, PixiJS, Tiled TMJ format

**Spec:** `docs/superpowers/specs/2026-03-15-office-map-redesign-design.md`

---

## Chunk 1: Setup — Tileset, Imports, Config

### Task 1: Copy new tileset into project

**Files:**
- Create: `src/renderer/src/assets/tilesets/office-tileset.png`

- [ ] **Step 1: Copy tileset file**

```bash
cp ~/Downloads/Office\ Tileset/Office\ Tileset\ All\ 16x16.png \
   src/renderer/src/assets/tilesets/office-tileset.png
```

- [ ] **Step 2: Verify the file**

```bash
ls -la src/renderer/src/assets/tilesets/office-tileset.png
```

Expected: file exists, ~20KB

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/assets/tilesets/office-tileset.png
git commit -m "chore: add Office Tileset 16x16 spritesheet"
```

---

### Task 2: Update OfficeScene.ts to load single tileset

**Files:**
- Modify: `src/renderer/src/office/OfficeScene.ts:8-9` (tileset imports)
- Modify: `src/renderer/src/office/OfficeScene.ts:38-51` (init method)

- [ ] **Step 1: Replace tileset imports**

Replace lines 8-9:
```typescript
// OLD:
import roomBuilderUrl from '../assets/tilesets/room-builder.png?url';
import interiorsUrl from '../assets/tilesets/interiors.png?url';

// NEW:
import officeTilesetUrl from '../assets/tilesets/office-tileset.png?url';
```

- [ ] **Step 2: Update init() tileset loading**

Replace the tileset loading block in `init()` (lines 40-51):
```typescript
// OLD:
const [roomBuilderTex, interiorsTex] = await Promise.all([
  Assets.load(roomBuilderUrl),
  Assets.load(interiorsUrl),
]);
roomBuilderTex.source.scaleMode = 'nearest';
interiorsTex.source.scaleMode = 'nearest';

this.mapRenderer = new TiledMapRenderer(
  officeMapData as any,
  [roomBuilderTex, interiorsTex],
);

// NEW:
const officeTilesetTex = await Assets.load(officeTilesetUrl);
officeTilesetTex.source.scaleMode = 'nearest';

this.mapRenderer = new TiledMapRenderer(
  officeMapData as any,
  [officeTilesetTex],
);
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/OfficeScene.ts
git commit -m "refactor: load single Office Tileset instead of two"
```

---

### Task 3: Update agent config with new zones

**Files:**
- Modify: `src/renderer/src/office/characters/agents.config.ts:9` (idleZone type)
- Modify: `src/renderer/src/office/characters/agents.config.ts:15` (CEO idleZone)

- [ ] **Step 1: Add new zone types and update CEO**

In `agents.config.ts`, update the `idleZone` type on line 9:
```typescript
// OLD:
idleZone: 'boardroom' | 'open-work-area' | 'break-room';

// NEW:
idleZone: 'boardroom' | 'open-work-area' | 'break-room' | 'ceo-room' | 'entrance';
```

Update CEO config (line 15):
```typescript
// OLD:
idleZone: 'boardroom',

// NEW:
idleZone: 'ceo-room',
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/office/characters/agents.config.ts
git commit -m "feat: add ceo-room and entrance zones, move CEO to private office"
```

---

## Chunk 2: Map Generator Rewrite

### Task 4: Rewrite generate-maps.ts

**Files:**
- Modify: `scripts/generate-maps.ts` (complete rewrite)

**Context:** The new tileset (`office-tileset.png`) is 256x512 pixels = 16 columns x 32 rows of 16x16 tiles (512 tiles total). Study the tileset image and the example designs in `~/Downloads/Office Tileset/Office Designs/` (especially Level 3.5 and Level 4) to understand how tiles compose into furniture and rooms.

**Map layout (40w x 30h):**

```
x: 0  1------7 8 9-----------38 39
y: 0  [ wall top (all)               ]
y: 1  [ wall face (all)              ]
y: 2  [ CEO Room  |  BOARDROOM       ]
      [ 7w x 9h   |  30w x 9h       ]
y:10  [           |                  ]
y:11  [ wall ------  wall ------- wall]
y:12  [ ......... corridor ......... ]
y:13  [      OPEN SPACE              ]
      [      38w x 9h                ]
      [  desks in 2 offset clusters  ]
y:21  [                              ]
y:22  [ wall ------  wall ------- wall]
y:23  [ KITCHEN    | ENTRANCE        ]
      [ 18w x 6h   | 19w x 6h       ]
y:28  [            |                 ]
y:29  [ wall bottom (all)            ]
```

- [ ] **Step 1: Study the tileset image and example designs**

Open `~/Downloads/Office Tileset/Office Tileset All 16x16.png` and the example designs in `~/Downloads/Office Tileset/Office Designs/`. The tileset is arranged as:

| Rows | Content |
|------|---------|
| 0-1 | Desks/tables (top half, bottom half) — each desk is 2w x 2h tiles |
| 2-3 | Couches/sofas (top, bottom) + cabinets |
| 4-5 | Wall and floor base colors (solid blocks) |
| 6-7 | Floor patterns (wood planks, tile patterns) |
| 8-9 | Bookshelves with colorful books (2w x 2h) |
| 10-11 | Doors, tall cabinets, vertical dividers |
| 12 | Chairs (red/maroon, different orientations) + small items |
| 13 | Counter/bench segments, standing books |
| 14 | Desktop items: monitors, laptops, folders |
| 15 | Tiny items: clocks, cups, phones |
| 16-17 | Large wall art (2w x 2h): picture frames, windows, TV/monitor |
| 18 | Small wall items, electronics |
| 19-20 | Potted plants |
| 21-22 | Rugs and floor mats |
| 23+ | Boxes, crates, packages |

Cross-reference with the Level 4 example design to identify:
- **Floor tile**: Blue-gray diamond pattern (rows 6-7 area)
- **Wall tile**: Cream/beige solid color (rows 4-5 area)
- **Desk tiles**: Brown wooden desks with items (rows 0-1)
- **Chair tiles**: Red/maroon chairs (row 12)
- **Conference table**: Uses desk/table variant tiles (rows 0-1)
- **Couch tiles**: Blue/teal sofas (rows 2-3)
- **TV/Monitor**: Dark screen 2x2 (rows 16-17)
- **Windows**: Light blue glass 2x2 (rows 16-17)
- **Plants**: Green pots (rows 19-20)
- **Bookshelves**: Colorful books 2x2 (rows 8-9)
- **Counter**: Long bench segments (row 13)
- **Clock**: Small circle (row 15)

- [ ] **Step 2: Rewrite generate-maps.ts with the new tileset and layout**

Replace the entire contents of `scripts/generate-maps.ts`. The script must:

1. Define the new tileset metadata (single tileset: `office-tileset.png`, 256x512, 16 cols, 32 rows, 512 tiles, firstgid=1)
2. Define tile constants `T` — map each needed tile to its `row * 16 + col + 1` ID. Use the tileset analysis from step 1.
3. Keep the existing helper functions (`makeLayer`, `set`, `fillRect`, `hLine`, `vLine`, `place2x2`)
4. Add new furniture placement helpers as needed (e.g., `placeCouch`, `placeCounter`)
5. Build the 40x30 layout:

**Floor layer:** Fill entire 40x30 with the blue-gray floor tile. Use a different floor variant for the kitchen area.

**Walls layer:**
- Outer walls: y=0 wall top (full width), y=1 wall face (full width), x=0 left wall (full height), x=39 right wall (full height), y=29 bottom wall (full width)
- CEO right wall: x=8, y=2-11 with door gap at y=7-8
- Top rooms bottom wall: y=11, x=0-39 with door gap at x=22-23 (boardroom door)
- Corridor: y=12 open (no wall)
- Bottom separator: y=22, x=0-39 with door gaps at x=10-11 (kitchen door) and x=28-29 (entrance door)
- Kitchen/entrance divider: x=19, y=22-29 with door gap at y=25-26
- Entrance door: x=39, y=26-27 (gap in outer right wall)

**Furniture-below layer:**
- CEO Room: desk (2x2) at x=2-3,y=4-5 + chair at x=2,y=6 + plant at x=6,y=9 + wall picture at x=5-6,y=2-3
- Boardroom: TV (2x2) at x=22-23,y=2-3 + windows at x=12-13,y=2-3 and x=32-33,y=2-3 + conference table (4 table units side by side, x=18-25,y=6-7) + 4 chairs above table at y=5 + 4 chairs below at y=8 + clock at x=36,y=3 + plant at x=37,y=9
- Open Space: 6 desks in 2 clusters of 3:
  - Cluster 1: desks at x=4-5/y=14-15, x=9-10/y=14-15, x=14-15/y=14-15 + chairs at y=16
  - Cluster 2: desks at x=22-23/y=18-19, x=27-28/y=18-19, x=32-33/y=18-19 + chairs at y=20
  - Plants at corners: x=1,y=13; x=38,y=13; x=1,y=21; x=38,y=21 + center plant x=19,y=16
  - Bookshelf at x=37-38,y=16-17
- Kitchen: counter (3 tiles) at x=2-4,y=23 + coffee machine at x=6,y=23 + water cooler at x=8,y=23 + table (2x2) at x=8-9,y=26-27 + 2 chairs + plant at x=17,y=27
- Entrance: reception counter (3 tiles) at x=33-35,y=24 + chair at x=34,y=25 + 2 couches (2x2 each) at x=22-23/y=26-27 and x=26-27/y=26-27 + side table at x=25,y=27 + plant at x=37,y=27

**Collision layer:** Mark all wall tiles + furniture tiles as collision (value 1).

**Spawn points (object layer):**
| Agent | Location | Rationale |
|-------|----------|-----------|
| ceo | x=4, y=7 | Near CEO desk |
| product-manager | x=19, y=8 | Boardroom, below table |
| market-researcher | x=22, y=8 | Boardroom, below table |
| chief-architect | x=25, y=8 | Boardroom, below table |
| agent-organizer | x=5, y=16 | Open space, cluster 1 |
| project-manager | x=10, y=16 | Open space, cluster 1 |
| team-lead | x=15, y=16 | Open space, cluster 1 |
| backend-engineer | x=23, y=20 | Open space, cluster 2 |
| frontend-engineer | x=28, y=20 | Open space, cluster 2 |
| mobile-developer | x=33, y=20 | Open space, cluster 2 |
| ui-ux-expert | x=20, y=16 | Open space, between clusters |
| data-engineer | x=25, y=16 | Open space, between clusters |
| devops | x=30, y=16 | Open space, right side |
| automation-developer | x=35, y=16 | Open space, right side |
| freelancer | x=10, y=25 | Kitchen area |

**Zones (object layer):**
| Zone | x (tiles) | y (tiles) | w (tiles) | h (tiles) |
|------|-----------|-----------|-----------|-----------|
| ceo-room | 1 | 2 | 7 | 9 |
| boardroom | 9 | 2 | 30 | 9 |
| open-work-area | 1 | 13 | 38 | 9 |
| break-room | 1 | 23 | 18 | 6 |
| entrance | 20 | 23 | 19 | 6 |

- [ ] **Step 3: Run the generation script**

```bash
npx tsx scripts/generate-maps.ts
```

Expected: `Wrote office.tmj` + `Done! Office map generated.`

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-maps.ts src/renderer/src/assets/maps/office.tmj
git commit -m "feat: redesign office map with new tileset and compact layout"
```

---

### Task 5: Visual verification and tile ID adjustment

**Files:**
- Possibly modify: `scripts/generate-maps.ts` (tile ID corrections)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Visual inspection checklist**

Check each area in the running app:
- [ ] Floor tiles render correctly (no black/missing tiles)
- [ ] Walls form clear room boundaries
- [ ] CEO room has desk, chair, plant, picture
- [ ] Boardroom has conference table, chairs, TV, windows, clock, plant
- [ ] Open space has 6 desks in 2 clusters with chairs and plants
- [ ] Kitchen has counter, coffee, water cooler, table, chairs, plant
- [ ] Entrance has reception counter, couches, plant, door opening
- [ ] Doors are walkable openings (no collision)
- [ ] Characters spawn in their correct zones
- [ ] Camera phases focus on correct zones (imagine→boardroom, build→open space)

- [ ] **Step 3: Fix any incorrect tile IDs**

If tiles look wrong (wrong furniture piece, wrong color, misaligned), update the tile constants in `generate-maps.ts` by cross-referencing with the tileset image. Re-run the script after each fix.

- [ ] **Step 4: Final commit**

```bash
git add scripts/generate-maps.ts src/renderer/src/assets/maps/office.tmj
git commit -m "fix: adjust tile IDs after visual verification"
```
