# Pixel Art Graphics Overhaul Design

## Overview

Replace the current procedurally-drawn colored rectangles with proper pixel art graphics using the LimeZu "Modern Interiors" tileset and the Tiled map editor. The goal is to achieve a Pokemon Gen 4/5 style look — rich, detailed environments with multi-tile furniture, distinct room materials, and depth through layered rendering.

## Scope

- Office scene: full tileset-based rendering with hybrid room layout
- Lobby scene: simple polished tileset-based rendering
- Characters: generic sprites from the LimeZu pack (15 variants — one per agent role including freelancer)
- Out of scope: custom character art for the 15 unique agents (deferred to a future pass)

## Decisions

1. **Tileset:** LimeZu "Modern Interiors" (free, CC0) — includes floor tiles, wall tiles, office furniture, break room items, decorative objects, and generic office worker character sprites.
2. **Map editor:** Tiled (free, open-source) — industry standard for 2D tile-based games. Tilesets are designed for use with Tiled.
3. **Layout:** Hybrid — boardroom and break room are walled-off rooms with distinct floor materials. Main work area (coordination + engineering) is open-plan. Matches reference images.
4. **Lobby:** Simple and polished — reception desk, plants, seating, tile floor. The lobby is transient (pick a session, move on).
5. **Implementation:** Lightweight custom Tiled JSON parser for PixiJS. No heavy third-party library.

## Asset Pipeline

### Tiled Workflow

1. Import tileset PNG(s) into Tiled as tileset definitions (`.tsx`)
2. Design maps as `.tmx` files with multiple named layers
3. Export as Tiled JSON (`.tmj`) for runtime loading
4. Store exported JSON + tileset PNGs in renderer assets directory

### File Structure

```
maps/                              # Tiled source files (not loaded at runtime)
  tilesets/
    modern-interiors.tsx           # Tiled tileset definition
    modern-interiors.png           # Tileset spritesheet
  office.tmx                       # Tiled office map source
  lobby.tmx                        # Tiled lobby map source

src/renderer/src/assets/
  tilesets/
    modern-interiors.png           # Tileset spritesheet (copied or symlinked)
  maps/
    office.tmj                     # Exported Tiled JSON
    lobby.tmj                      # Exported Tiled JSON
```

The old `office-layout.json` and `lobby-layout.json` are removed after migration.

### Loading in PixiJS

- Load tileset PNGs via PixiJS `Assets.load()`
- Parse Tiled JSON to extract layers, tile positions, and tile-to-spritesheet coordinate mappings
- `TiledMapRenderer` class handles all of this

## Tilemap Renderer

### Layer System

Tiled maps use named layers rendered in order:

| Layer | Type | Purpose | Render Order |
|-------|------|---------|-------------|
| `floor` | Tile layer | Base floor tiles (wood, carpet, tile) | 0 (bottom) |
| `walls` | Tile layer | Walls, baseboards, trim, doorways | 1 |
| `furniture-below` | Tile layer | Furniture that characters walk in front of (desks, tables, rugs) | 2 |
| `characters` | (runtime) | Characters inserted here by the scene | 3 |
| `furniture-above` | Tile layer | Furniture tops that overlap characters for depth (bookshelf tops, wall-mounted items) | 4 |
| `collision` | Tile layer | Non-rendered layer marking unwalkable tiles. Filled tiles = blocked, empty = walkable. | (not rendered) |

This is how Pokemon-style games achieve depth — a character walking behind a desk has the desk top rendered on a layer above them.

**Furniture layer assignment guide:**

| Item | `furniture-below` | `furniture-above` |
|------|-------------------|-------------------|
| Desk base (legs, drawers) | X | |
| Desk top surface + monitor | | X |
| Chair | X | |
| Bookshelf (bottom half) | X | |
| Bookshelf (top half) | | X |
| Rug | X | |
| Conference table base | X | |
| Conference table top | | X |
| Wall-mounted items (clock, whiteboard, picture) | | X |
| Plants (floor-standing) | X | |
| Coffee machine, vending machine | X | |
| Couch | X | |

General rule: if a character could walk behind it and be partially occluded, the occluding part goes in `furniture-above`.

### TiledMapRenderer Class

- Parses Tiled JSON: reads `tilesets[]` for spritesheet coordinates, `layers[]` for tile placement
- For each tile layer, creates a PixiJS `Container` of `Sprite` objects positioned on the grid
- Containers are added to the scene in render order
- Exposes `getCharacterContainer()` returning a container between `furniture-below` and `furniture-above` with `sortableChildren = true` (required for PixiJS `zIndex`-based Y-sorting)
- Extracts the `collision` tile layer and converts it to a 2D boolean walkability grid
- Extracts the `spawn-points` object layer and returns a map of point names to tile coordinates
- Extracts the `zones` object layer and returns zone boundary rectangles (used for idle wandering and camera targets)
- All tileset textures are loaded with `scaleMode = 'nearest'` to preserve crisp pixel art

### Walkability

The `collision` layer in Tiled is a non-rendered tile layer. Any tile placed in this layer marks that position as unwalkable. Empty cells are walkable. The renderer converts this into a 2D boolean grid that the existing BFS pathfinding consumes. Replaces the current `0=floor, 1=wall, 2=void` tile value system.

### TileMap Replacement

The existing `TileMap` class is replaced by `TiledMapRenderer`. The key methods that consumers depend on are absorbed:

| Current `TileMap` method | Replacement |
|--------------------------|-------------|
| `isWalkable(x, y)` | `TiledMapRenderer.isWalkable(x, y)` — reads from collision grid |
| `tileToPixel(tx, ty)` | `TiledMapRenderer.tileToPixel(tx, ty)` — uses tileSize from Tiled JSON |
| `pixelToTile(px, py)` | `TiledMapRenderer.pixelToTile(px, py)` — uses tileSize from Tiled JSON |
| `width`, `height`, `tileSize` | Same properties exposed from Tiled JSON metadata |

`Character.ts` constructor changes from accepting a `TileMap` to accepting a `TiledMapRenderer`. `pathfinding.ts` changes its `isWalkable` function parameter to accept the `TiledMapRenderer` interface. The `tilemap.ts` file is removed entirely — `TiledMapRenderer` replaces it.

## Office Layout Design

Grid: 40x24 tiles at 16x16px (unchanged from current spec).

### Hybrid Room Layout

```
+--------------------------------------------------+
|                    BACK WALL                       |
|  +------------+                                   |
|  | BOARDROOM  |     +------------------------+    |
|  | (carpet)   |     |     KANBAN WHITEBOARD   |   |
|  |            |     +------------------------+    |
|  | conference |                                   |
|  | table +    |   OPEN WORK AREA (wood floor)     |
|  | chairs     |                                   |
|  | screen     |   Coordination    Engineering     |
|  |            |   3 desks         7 desks (2 rows)|
|  |   door     |   bookshelves     monitors        |
|  +------+-----+   plants          filing cabinets |
|                                                   |
|                              +------------------+ |
|                              |  BREAK ROOM      | |
|                              |  (tile floor)    | |
|                              |  coffee machine  | |
|                              |  vending machine | |
|                              |  couch + table   | |
|                              |  water cooler    | |
|                              |      door        | |
|                              +------------------+ |
+--------------------------------------------------+
```

### Zone Details

**Boardroom** (left, walled, carpet floor): Glass-wall feel via different wall tile style. Conference table (4x3 tiles), chairs around it, presentation screen on wall. Doorway to open area. Leadership agents sit here during `/imagine`.

**Open Work Area** (center + right, wood floor): No interior walls. Coordination desks (3) on the left half, engineering desks (7) in two rows on the right. Bookshelves along back wall, scattered plants. Warm wood floor with dark walls.

**Break Room** (bottom-right, walled, tile floor): Coffee machine, vending machine, water cooler, couch, small table. Where idle agents wander. Doorway to main area.

**Kanban Whiteboard**: The whiteboard's static frame (border, columns, header) is baked into the Tiled map as tile art in the `furniture-above` layer. The dynamic content (task bars, phase name, completion %) continues to be rendered by `Whiteboard.ts` as a PixiJS `Container` positioned at the whiteboard's tile coordinates, layered on top of the map. Same approach for `PresentationScreen.ts` in the boardroom.

### Zone Data

Zone boundaries (boardroom, open work area, break room) are defined as rectangles in a Tiled object layer named `zones`. Each rectangle has a `name` property matching the zone identifier. `TiledMapRenderer` extracts these and exposes them as a zones map. This replaces the `zones` object in the old layout JSON files. The camera phase targets in `camera.ts` and the `idleZone` field in `agents.config.ts` consume these zone boundaries.

## Lobby Layout Design

Grid: 20x14 tiles at 16x16px (unchanged).

- Tile or marble floor (light, clean — contrasts with the wood office)
- Dark walls with baseboard trim
- Reception desk (center) with a static concierge character
- Wall-mounted sign or framed picture above desk
- Two potted plants flanking the sign
- Bench or small seating area near bottom
- Two more plants near seating

The concierge is a decorative tile baked into the Tiled map — not a `Character` instance. It's placed behind the reception desk using character tiles from the tileset, rendered in the `furniture-above` layer so it appears behind the desk surface.

The SessionPanel (left-side HTML session list) is unchanged. Only the PixiJS canvas gets the tileset upgrade.

## Character Integration

### Generic Sprites

Use LimeZu's office worker character variants — pick 15 distinct variants (different hair/clothing) for visual variety, one per agent role including freelancer. Each agent gets a `spriteVariant` field in config.

### LimeZu Character Spritesheet Format

The LimeZu pack provides characters as individual PNG files per variant (not a single atlas). Each character sheet contains frames for 4 directions (down, left, right, up) with 3-frame walk cycles. Frame dimensions are 16x16 or 16x32 depending on the specific pack version.

Available animations: idle (standing), walk (3-frame cycle per direction). The pack does **not** include typing or reading poses.

### Sprite Adapter

`SpriteAdapter` maps the LimeZu per-character sheets to the frame format `CharacterSprite.ts` expects:
- Reads individual character PNGs (one per variant)
- Extracts directional walk frames and maps them to the 3-row (down/up/right) layout CharacterSprite expects
- For typing and reading animations (columns 3-6 in the expected layout), reuses the front-facing idle frame — the character sits still at the desk. This is a visual downgrade from the spec's original vision but acceptable for the "environments first" scope.

The existing animation state machine (IDLE/WALK/TYPE/READ) and Character.ts logic remain unchanged. CharacterSprite.ts constructor changes to accept a `Texture[][]` (frames by direction) from SpriteAdapter instead of slicing a single spritesheet directly.

### Depth Sorting

Characters render in the layer between `furniture-below` and `furniture-above`. The character container has `sortableChildren = true`. Within this container, each character's `zIndex` is set to its `y` position on every animation tick — characters further down the screen render on top. Standard 2D RPG approach.

### Desk Positions from Tiled

Desk positions are defined as point objects in a Tiled object layer named `spawn-points`. Each point is named with the pattern `desk-<role>` where `<role>` matches the agent role identifier (e.g., `desk-ceo`, `desk-backend-engineer`, `desk-freelancer`). `TiledMapRenderer` extracts these into a `Map<string, {x: number, y: number}>`.

`agents.config.ts` removes hardcoded `deskTile` coordinates. Instead, `Character.ts` looks up its desk position from the spawn points map at construction time using `desk-${agentRole}`. If no matching spawn point exists, the character defaults to idle wandering (no assigned desk).

## Code Changes

### New Files

| File | Purpose |
|------|---------|
| `src/renderer/src/office/engine/TiledMapRenderer.ts` | Parses Tiled JSON, creates sprite layers, exposes character container and walkability grid |
| `src/renderer/src/office/characters/SpriteAdapter.ts` | Maps LimeZu spritesheet layout to CharacterSprite's expected animation frame format |
| `maps/` directory (project root) | Tiled source files (.tmx, .tsx) |
| `src/renderer/src/assets/tilesets/modern-interiors.png` | Tileset spritesheet |
| `src/renderer/src/assets/maps/office.tmj` | Exported Tiled JSON for office |
| `src/renderer/src/assets/maps/lobby.tmj` | Exported Tiled JSON for lobby |

### Modified Files

| File | Changes |
|------|---------|
| `OfficeScene.ts` | Replace `Graphics` rectangle drawing with `TiledMapRenderer`. Load map JSON + tileset, insert characters into depth-correct layer. |
| `LobbyScene.ts` | Replace procedural drawing with `TiledMapRenderer` for lobby map. |
| `CharacterSprite.ts` | Accept textures from `SpriteAdapter` instead of expecting a specific sheet format directly. Minor constructor change. |
| `Character.ts` | Add Y-sort update in animation tick (set `zIndex` based on `y` position). |
| `agents.config.ts` | Add `spriteVariant` per agent. Remove hardcoded `deskTile` — positions come from Tiled spawn points at runtime. |
| `pathfinding.ts` | Accept `TiledMapRenderer` interface (with `isWalkable`) instead of `TileMap`. |
| `camera.ts` | Read zone boundaries from `TiledMapRenderer` for phase focus targets instead of hardcoded pixel coordinates. |
| `Whiteboard.ts` | Position dynamically based on whiteboard tile coordinates from the Tiled map. |
| `PresentationScreen.ts` | Position dynamically based on screen tile coordinates from the Tiled map. |

### Removed Files

| File | Reason |
|------|--------|
| `src/renderer/src/assets/office-layout.json` | Replaced by Tiled JSON |
| `src/renderer/src/assets/lobby-layout.json` | Replaced by Tiled JSON |
| `src/renderer/src/office/engine/tilemap.ts` | Replaced entirely by `TiledMapRenderer` |

### Unchanged

Stores, IPC, preload, main process, adapters, ChatPanel, TopBar, StatsOverlay, SessionPanel. This is purely a renderer-side graphics upgrade.
