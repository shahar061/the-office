# Pixel Art Graphics Overhaul Design

## Overview

Replace the current procedurally-drawn colored rectangles with proper pixel art graphics using the LimeZu "Modern Interiors" tileset and the Tiled map editor. The goal is to achieve a Pokemon Gen 4/5 style look — rich, detailed environments with multi-tile furniture, distinct room materials, and depth through layered rendering.

## Scope

- Office scene: full tileset-based rendering with hybrid room layout
- Lobby scene: simple polished tileset-based rendering
- Characters: generic sprites from the LimeZu pack (14 distinct variants, one per agent)
- Out of scope: custom character art for the 14 unique agents (deferred to a future pass)

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

This is how Pokemon-style games achieve depth — a character walking behind a desk has the desk top rendered on a layer above them.

### TiledMapRenderer Class

- Parses Tiled JSON: reads `tilesets[]` for spritesheet coordinates, `layers[]` for tile placement
- For each tile layer, creates a PixiJS `Container` of `Sprite` objects positioned on the grid
- Containers are added to the scene in render order
- Exposes `getCharacterContainer()` returning the container between `furniture-below` and `furniture-above`
- Extracts the collision layer from Tiled and exposes a 2D boolean walkability grid for pathfinding

### Walkability

Tiled provides a dedicated collision layer marking which tiles characters can walk on. The renderer extracts this into a 2D boolean grid that the existing BFS pathfinding consumes. Replaces the current `0=floor, 1=wall, 2=void` tile value system.

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

**Open Work Area** (center + right, wood floor): No interior walls. Coordination desks (3) on the left half, engineering desks (7) in two rows on the right. Bookshelves along back wall, scattered plants. Warm wood floor with dark walls matching reference images.

**Break Room** (bottom-right, walled, tile floor): Coffee machine, vending machine, water cooler, couch, small table. Where idle agents wander. Doorway to main area.

**Kanban Whiteboard**: Wall-mounted on the back wall of the open area, visible from the bullpen.

## Lobby Layout Design

Grid: 20x14 tiles at 16x16px (unchanged).

- Tile or marble floor (light, clean — contrasts with the wood office)
- Dark walls with baseboard trim
- Reception desk (center) with a static concierge character
- Wall-mounted sign or framed picture above desk
- Two potted plants flanking the sign
- Bench or small seating area near bottom
- Two more plants near seating

The SessionPanel (left-side HTML session list) is unchanged. Only the PixiJS canvas gets the tileset upgrade.

## Character Integration

### Generic Sprites

Use LimeZu's office worker character variants — pick 14 distinct variants (different hair/clothing) for visual variety. Each agent gets a `spriteVariant` field in config.

### Sprite Adapter

The current `CharacterSprite.ts` expects 16x32px frames in a 7-column x 3-row layout. LimeZu uses a different spritesheet arrangement.

A `SpriteAdapter` class maps the LimeZu layout to the animation frames the existing code expects:
- Extracts frames from the LimeZu spritesheet layout
- Maps to direction/animation format for CharacterSprite
- If the pack lacks typing/reading poses, uses front-facing idle frame for both

The existing animation state machine (IDLE/WALK/TYPE/READ) and Character.ts logic remain unchanged.

### Depth Sorting

Characters render in the layer between `furniture-below` and `furniture-above`. Within the character layer, sprites are Y-sorted each frame — characters further down the screen render on top. Standard 2D RPG approach.

### Desk Positions from Tiled

Desk positions are extracted from a Tiled object layer (`spawn-points`) so agent config stays in sync with the map. When furniture moves in Tiled, spawn points move with it. `agents.config.ts` references spawn point names rather than hardcoded tile coordinates.

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
| `agents.config.ts` | Add `spriteVariant` per agent. Remove hardcoded desk tile positions — sourced from Tiled object layer. |
| `tilemap.ts` | Consume walkability grid from `TiledMapRenderer` instead of parsing old layout JSON. |
| `pathfinding.ts` | Accept boolean walkability grid instead of tile-value array. |

### Removed Files

| File | Reason |
|------|--------|
| `src/renderer/src/assets/office-layout.json` | Replaced by Tiled JSON |
| `src/renderer/src/assets/lobby-layout.json` | Replaced by Tiled JSON |

### Unchanged

Stores, IPC, preload, main process, adapters, ChatPanel, TopBar, StatsOverlay, SessionPanel, camera.ts. This is purely a renderer-side graphics upgrade.
