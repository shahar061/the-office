import { describe, it, expect, vi, beforeEach } from 'vitest'

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
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
      expect(renderer.width).toBe(4)
      expect(renderer.height).toBe(3)
      expect(renderer.tileSize).toBe(16)
    })
  })

  describe('tileToPixel / pixelToTile', () => {
    it('converts tile coords to pixel coords', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
      expect(renderer.tileToPixel(2, 3)).toEqual({ x: 32, y: 48 })
    })

    it('converts pixel coords to tile coords', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
      expect(renderer.pixelToTile(35, 50)).toEqual({ x: 2, y: 3 })
    })
  })

  describe('collision / walkability', () => {
    it('all tiles walkable when no collision layer exists', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
      expect(renderer.isWalkable(0, 0)).toBe(true)
      expect(renderer.isWalkable(3, 2)).toBe(true)
    })

    it('marks tiles with non-zero collision tile IDs as unwalkable', () => {
      const map = makeMap({
        layers: [
          {
            name: 'collision',
            type: 'tilelayer',
            data: [
              0, 1, 0, 0,
              0, 0, 0, 1,
              1, 0, 0, 0,
            ],
          },
        ],
      })
      const renderer = new TiledMapRenderer(map, [mockTexture])
      expect(renderer.isWalkable(0, 0)).toBe(true)
      expect(renderer.isWalkable(1, 0)).toBe(false)
      expect(renderer.isWalkable(3, 1)).toBe(false)
      expect(renderer.isWalkable(0, 2)).toBe(false)
      expect(renderer.isWalkable(2, 2)).toBe(true)
    })

    it('out-of-bounds tiles are not walkable', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
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
      const renderer = new TiledMapRenderer(map, [mockTexture])
      expect(renderer.getSpawnPoint('desk-ceo')).toEqual({ x: 5, y: 8 })
      expect(renderer.getSpawnPoint('desk-backend-engineer')).toEqual({ x: 20, y: 6 })
      expect(renderer.getSpawnPoint('nonexistent')).toBeUndefined()
    })

    it('returns empty map when no spawn-points layer', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
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
      const renderer = new TiledMapRenderer(map, [mockTexture])
      expect(renderer.getZone('boardroom')).toEqual({ x: 1, y: 1, width: 10, height: 12 })
      expect(renderer.getZone('break-room')).toEqual({ x: 26, y: 16, width: 12, height: 7 })
      expect(renderer.getZone('nonexistent')).toBeUndefined()
    })
  })

  describe('getMonitorGlowRects', () => {
    it('parses rectangles from monitor-glow object layer in pixel space', () => {
      const map = makeMap({
        layers: [
          {
            name: 'monitor-glow',
            type: 'objectgroup',
            objects: [
              { name: 'monitor-pc-1', x: 100, y: 50, width: 12, height: 7 },
              { name: 'monitor-pc-2', x: 200, y: 80, width: 12, height: 7 },
            ],
          },
        ],
      })
      const renderer = new TiledMapRenderer(map, [mockTexture])
      const rects = renderer.getMonitorGlowRects()
      expect(rects.size).toBe(2)
      expect(rects.get('monitor-pc-1')).toEqual({ x: 100, y: 50, width: 12, height: 7 })
      expect(rects.get('monitor-pc-2')).toEqual({ x: 200, y: 80, width: 12, height: 7 })
    })

    it('defaults width and height to 0 when not provided', () => {
      const map = makeMap({
        layers: [
          {
            name: 'monitor-glow',
            type: 'objectgroup',
            objects: [
              { name: 'monitor-pc-1', x: 100, y: 50 },
            ],
          },
        ],
      })
      const renderer = new TiledMapRenderer(map, [mockTexture])
      const rects = renderer.getMonitorGlowRects()
      expect(rects.get('monitor-pc-1')).toEqual({ x: 100, y: 50, width: 0, height: 0 })
    })

    it('returns empty map when monitor-glow layer is missing', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
      const rects = renderer.getMonitorGlowRects()
      expect(rects.size).toBe(0)
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
      const renderer = new TiledMapRenderer(map, [mockTexture])
      const root = renderer.getContainer()
      const labels = root.children.map((c: any) => c.label ?? 'character')

      expect(labels).toEqual(['floor', 'walls', 'furniture-below', '', 'furniture-above'])
    })

    it('character container has sortableChildren enabled', () => {
      const renderer = new TiledMapRenderer(makeMap(), [mockTexture])
      expect(renderer.getCharacterContainer().sortableChildren).toBe(true)
    })
  })
})
