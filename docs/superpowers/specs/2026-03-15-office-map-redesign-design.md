# Office Map Redesign

Redesign the office screen map using the new Office Tileset, replacing the current 60x40 layout with a compact ~40x30 tile layout featuring distinct rooms and an entrance area.

## Tileset

Replace `room-builder.png` + `interiors.png` with `Office Tileset All 16x16.png` (single spritesheet). Copy the tileset into `src/renderer/src/assets/tilesets/`.

## Layout (40w x 30h tiles)

```
┌──────────┬───────────────────────────────┐
│ CEO Room │         BOARDROOM             │
│ (8x10)   │         (28x10)              │
│ desk,    │  [TV monitor on north wall]   │
│ chair,   │  [conference table, 8 chairs] │
│ plant    ░  [windows, clock, plant]      │
│          │                    ░           │
├──────────┘                    │           │
│            ···hallway···                  │
├──────────────────────────────────────────│
│              OPEN SPACE                  │
│  (38w x 10h)                             │
│  🌿 [desk][desk][desk]          🌿      │
│              🌿                          │
│        [desk][desk][desk]  [bookshelf]   │
│  🌿                              🌿     │
├──────────────────┬───────────────────────│
│  KITCHEN/COFFEE  │  ENTRANCE/RECEPTION   │
│  (18w x 6h)     │  (18w x 6h)           │
│  counter, coffee │  reception counter    │
│  water cooler    │  2 couches + table    │
│  break table     │  entrance door (right)│
│  🌿             │  🌿                   │
└──────────────────┴───────────────────────┘
```

## Rooms & Furniture

### CEO Room (top-left corner)
- Desk with computer monitor + chair
- Plant in corner
- Picture/decoration on wall
- Door on right wall opening to hallway

### Boardroom (top, right of CEO room)
- Large TV/monitor centered on north wall
- Windows on north wall (left and right of TV)
- Long conference table (center) with 8 chairs (4 per side)
- Clock on wall
- Plant in corner
- Door at bottom opening to hallway

### Open Space (full-width middle)
- 6 desks total in 2 offset clusters of 3
  - Top-left cluster: 3 desks in a row
  - Bottom-right cluster: 3 desks in a row (offset from top cluster)
- Each desk has a computer monitor and chair
- Plants at all 4 corners + 1 between clusters
- Bookshelf on right wall

### Kitchen / Coffee Area (bottom-left)
- Counter along wall
- Coffee machine + water cooler
- Small break table with 2 chairs
- Plant
- Door at top opening to corridor

### Entrance / Reception (bottom-right)
- Reception counter with chair
- 2 couches with side table (waiting area)
- Plant
- Entrance door on right wall
- Door at top opening to corridor

## Zones (for camera/agent logic)

| Zone | Position | Agents |
|------|----------|--------|
| `ceo-room` | Top-left | CEO (1) |
| `boardroom` | Top | PM, Market Researcher, Chief Architect (3) |
| `open-work-area` | Middle | Coordination (3) + Engineering (7) = 10 |
| `break-room` | Bottom-left | Freelancer (1) |
| `entrance` | Bottom-right | None (transit zone) |

## Agent Config Changes

- CEO `idleZone` changes from `boardroom` to `ceo-room`
- New zone type `ceo-room` added to `AgentConfig.idleZone` union
- New zone `entrance` added (no idle agents)

## Spawn Points

- CEO: inside CEO room near desk
- Leadership (3): around boardroom conference table
- Coordination + Engineering (10): distributed across open space desks/area
- Freelancer: inside kitchen/break area

## Files to Modify

1. **`scripts/generate-maps.ts`** — Replace tileset refs, rewrite office map generation with new layout, tile IDs from new tileset
2. **`src/renderer/src/assets/tilesets/`** — Add `office-tileset.png` (copy from Downloads)
3. **`src/renderer/src/office/characters/agents.config.ts`** — Update CEO `idleZone` to `ceo-room`, add `ceo-room` and `entrance` to type union
4. **`shared/types.ts`** — If zone types are defined here, add new zones
5. **`src/renderer/src/assets/maps/office.tmj`** — Regenerated output (run script)
6. **`electron.vite.config.ts`** — May need tileset path update if name changes
