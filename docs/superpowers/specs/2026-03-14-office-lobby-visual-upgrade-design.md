# Office & Lobby Visual Upgrade

## Goal

Replace the current small, basic tile maps with larger, polished maps using the Modern tiles_Free asset pack. Make both screens fill the entire available viewport with auto-zoom camera logic.

## Current State

- Office map: 40x24 tiles (640x384px) — too small for the viewport, appears cut off
- Lobby map: 20x14 tiles (320x224px) — even smaller
- Tilesets: `room-builder.png` and `interiors.png` (basic LimeZu tiles)
- Camera: Phase-based zoom (1.5–2.5x) with no viewport-fill guarantee
- Result: Map floats in a corner with large empty dark background

## Design

### 1. New Tilesets

Copy from `~/Downloads/Modern tiles_Free/Interiors_free/16x16/` into `src/renderer/src/assets/tilesets/`, replacing the old files with the same names:

| Source | Destination | Purpose |
|--------|-------------|---------|
| `Room_Builder_free_16x16.png` | `room-builder.png` | Floors (dark wood, tile, carpet), walls, ceilings, room borders |
| `Interiors_free_16x16.png` | `interiors.png` | Desks, PCs, bookshelves, couches, plants, lamps, doors, chairs, rugs, windows |

The old tileset files are deleted and replaced. This keeps existing import paths (`import roomBuilder from '../assets/tilesets/room-builder.png'`) working without changes. The .tmj map files are regenerated with updated `firstgid` values and column counts based on the new image dimensions.

Update `LIMEZUASSETS-LICENSE.txt` to reflect the new asset pack (copy `LICENSE.txt` from the Modern tiles_Free download).

### 2. Office Map (60x40 tiles = 960x640px)

Dense & cozy layout inspired by reference image (dark wood floors, bookshelves lining walls, plants, desks with computers).

**Zones:**

| Zone | Location | Contents | Game Phase |
|------|----------|----------|------------|
| boardroom | Top-left | Meeting table with chairs, whiteboard on wall | imagine |
| open-work-area | Center-right | 15 desks with computers (one per agent), chairs in rows | warroom, build |
| break-room | Bottom-left | Couch, coffee table, vending machine, plants | idle (freelancer) |
| reception | Bottom-center | Entrance area | — |

**Decor:**
- Bookshelves lining top and side walls
- Corridor connecting zones with plants and lamps
- Windows, paintings, rugs in various rooms
- Dark wood floor throughout (warm, cohesive theme)

**Layers (7 layers, same structure as current):**
1. `floor` — dark wood planks base
2. `walls` — wall tiles, bookshelves, windows
3. `furniture-below` — desks, tables, rugs, lower furniture
4. `furniture-above` — monitors, lamps, items rendered above characters
5. `collision` — walkability grid (blocked by walls, furniture, bookshelves)
6. `spawn-points` — named spawn locations for all 15 agent roles
7. `zones` — named rectangles for camera targeting (boardroom, open-work-area, break-room)

### 3. Lobby Map (30x20 tiles = 480x320px)

Office reception / entrance:

- Reception desk near center
- Waiting area with couches and coffee table
- Plants, wall art, bookshelves along walls
- Dark wood floor matching office theme
- Same tileset as office for visual consistency

**Layers (5 layers — no spawn-points or zones needed):**
1. `floor` — dark wood planks base
2. `walls` — wall tiles, decor
3. `furniture-below` — reception desk, couches, tables
4. `furniture-above` — items rendered above any future lobby elements
5. `collision` — walkability grid

### 4. Auto-Zoom Camera

Add viewport-fill logic to the camera system. Uses a "cover" strategy — the map always fills the viewport completely; some map edges may be off-screen when zoomed into a specific zone.

**Camera needs map dimensions:** The `Camera` constructor (or a new `setMapSize(width, height)` method) must receive the map's pixel dimensions to compute bounds. Currently `Camera` only knows about zones and the container.

**Office camera (`camera.ts`):**
- Calculate minimum zoom: `minZoom = max(viewWidth / mapPixelWidth, viewHeight / mapPixelHeight)`
- Phase zoom levels (imagine=2.5, warroom=2.0, build=1.5) are kept but clamped: `effectiveZoom = max(phaseZoom, minZoom)`
- Clamp camera position to map bounds so panning never shows empty space:
  - `container.x` clamped to `[viewWidth - mapPixelWidth * zoom, 0]`
  - `container.y` clamped to `[viewHeight - mapPixelHeight * zoom, 0]`
- On resize: recalculate `minZoom` and re-clamp
- Update `FALLBACK_TARGETS` to match new map dimensions (or remove them since generated maps always have zone data)

**Lobby camera (`LobbyScene.ts`):**
- Same min-zoom formula to fill the viewport
- Center on map, no phase-based targeting
- Update `onResize()` to accept `(width, height)` parameters (matching OfficeScene's signature) for consistent auto-zoom recalculation

### 5. Map Generation

Maps are generated programmatically via a script rather than hand-editing JSON.

**Script:** `scripts/generate-maps.ts`

**How to run:** `npx tsx scripts/generate-maps.ts` — outputs to `src/renderer/src/assets/maps/`. Add a `package.json` script entry: `"generate-maps": "tsx scripts/generate-maps.ts"`.

**Dependencies:** Tileset image dimensions (width, height, columns) are hardcoded constants in the script based on the known PNG sizes. No image-reading library needed.

The script:
1. Defines tileset metadata (tile count, columns, firstgid) as constants
2. Builds tile data arrays for each layer using a layout definition (which tiles go where)
3. Defines collision grid, spawn points, and zone rectangles
4. Outputs valid Tiled .tmj files that TiledMapRenderer already understands
5. Can be re-run to iterate on layouts without manual tile editing

The layout definitions within the script describe the room boundaries, furniture placement, and decoration positions.

### 6. Files Changed

| Category | Files | Change |
|----------|-------|--------|
| Tilesets | `assets/tilesets/room-builder.png` | Replaced with Modern tiles_Free version |
| | `assets/tilesets/interiors.png` | Replaced with Modern tiles_Free version |
| | `assets/tilesets/LIMEZUASSETS-LICENSE.txt` | Updated with new asset pack license |
| Maps | `assets/maps/office.tmj` | Regenerated (60x40, new tilesets) |
| | `assets/maps/lobby.tmj` | Regenerated (30x20, new tilesets) |
| Generator | `scripts/generate-maps.ts` | New file |
| Camera | `office/engine/camera.ts` | Add map dimensions, min-zoom, bounds clamping, update/remove fallback targets |
| Office scene | `office/OfficeScene.ts` | Pass map dimensions to Camera |
| Lobby scene | `lobby/LobbyScene.ts` | Auto-zoom logic, update `onResize(width, height)` signature |

### 7. What Doesn't Change

- TiledMapRenderer.ts — already handles arbitrary map sizes and tilesets
- CharacterSprite, SpriteAdapter, Character — sprite system is independent
- Agent configs, spawn logic, pathfinding — work with any map that has spawn-points and collision layers
- Game phases, camera phase-targeting — same zones, just bigger and repositioned
- OfficeCanvas.tsx / LobbyCanvas.tsx — canvas setup and Pixi app init unchanged
