import { Container, Sprite, Texture, Rectangle } from 'pixi.js'

// --- Tiled flip flags ---

const FLIPPED_H_FLAG = 0x80000000
const FLIPPED_V_FLAG = 0x40000000
const FLIPPED_D_FLAG = 0x20000000
const TILE_ID_MASK = 0x1fffffff

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
  data?: number[]
  objects?: TiledObject[]
  width?: number
  height?: number
  visible?: boolean
}

export interface TiledPolygonPoint {
  x: number
  y: number
}

export interface TiledObject {
  name: string
  x: number
  y: number
  width?: number
  height?: number
  polygon?: TiledPolygonPoint[]
}

export interface TiledTilesetRef {
  firstgid: number
  source?: string
  image?: string
  imagewidth?: number
  imageheight?: number
  tilewidth?: number
  tileheight?: number
  columns?: number
  tilecount?: number
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

/** An interactive object defined by a polygon in the Tiled map. */
export interface PolygonObject {
  /** Bounding rect in tile coordinates (used for tile extraction). */
  rect: ZoneRect
  /** Polygon vertices in pixels, relative to the object's origin. */
  polygonPoints: { x: number; y: number }[]
  /** Object origin in pixels. */
  originX: number
  originY: number
}

// --- Tile layer names we expect in every map ---

const TILE_LAYERS = ['floor', 'walls', 'furniture-below', 'furniture-mid', 'furniture-above'] as const
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
  private interactiveObjects: Map<string, ZoneRect> = new Map()
  private warRoomObjects: Map<string, PolygonObject> = new Map()
  private monitorGlowRects: Map<string, ZoneRect> = new Map()
  private layerContainers: Map<string, Container> = new Map()
  private characterContainer: Container
  private rootContainer: Container
  private extractedGroups: Map<string, Container> = new Map()
  /** Set of "layer:tx:ty" keys to skip in normal rendering */
  private extractionSkips: Set<string> = new Set()
  /** Collected tiles per interactive object: objectName → array of { layer, tx, ty } */
  private extractionCollected: Map<string, { layer: string; tx: number; ty: number }[]> = new Map()

  constructor(private mapData: TiledMap, private tilesetTextures: Texture[]) {
    this.width = mapData.width
    this.height = mapData.height
    this.tileSize = mapData.tilewidth
    this.rootContainer = new Container()
    this.characterContainer = new Container()
    this.characterContainer.label = ''
    this.characterContainer.sortableChildren = true

    this.parseCollisionLayer()
    this.parseSpawnPoints()
    this.markWalkableSpawnPoints()
    this.parseZones()
    this.parseInteractiveObjects()
    this.parseWarRoomObjects()
    this.parseMonitorGlowRects()
    this.collectExtractionTargets()
    this.buildTileLayers()
  }

  getContainer(): Container {
    return this.rootContainer
  }

  getCharacterContainer(): Container {
    return this.characterContainer
  }

  isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false
    return this.walkabilityGrid[ty][tx]
  }

  tileToPixel(tx: number, ty: number): Point {
    return { x: tx * this.tileSize, y: ty * this.tileSize }
  }

  pixelToTile(px: number, py: number): Point {
    return {
      x: Math.floor(px / this.tileSize),
      y: Math.floor(py / this.tileSize),
    }
  }

  getSpawnPoint(name: string): Point | undefined {
    return this.spawnPoints.get(name)
  }

  getAllSpawnPoints(): Map<string, Point> {
    return this.spawnPoints
  }

  getZone(name: string): ZoneRect | undefined {
    return this.zones.get(name)
  }

  getAllZones(): Map<string, ZoneRect> {
    return this.zones
  }

  private parseCollisionLayer(): void {
    const layer = this.findLayer(COLLISION_LAYER, 'tilelayer')
    this.walkabilityGrid = Array.from({ length: this.height }, () =>
      Array(this.width).fill(true),
    )
    if (!layer?.data) return
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const rawId = layer.data[y * this.width + x]
        if ((rawId & TILE_ID_MASK) !== 0) {
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

  /** Spawn points prefixed with these names override collision to be walkable. */
  private static readonly WALKABLE_SPAWN_POINTS = ['warroom-seat']

  private markWalkableSpawnPoints(): void {
    for (const name of TiledMapRenderer.WALKABLE_SPAWN_POINTS) {
      const point = this.spawnPoints.get(name)
      if (point && point.y >= 0 && point.y < this.height && point.x >= 0 && point.x < this.width) {
        this.walkabilityGrid[point.y][point.x] = true
      }
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

  private parseInteractiveObjects(): void {
    const layer = this.findLayer('interactive-objects', 'objectgroup')
    if (!layer?.objects) return
    for (const obj of layer.objects) {
      // Compute which tiles the freehand rectangle actually overlaps
      const startX = Math.floor(obj.x / this.tileSize)
      const startY = Math.floor(obj.y / this.tileSize)
      const endX = Math.ceil((obj.x + (obj.width ?? 0)) / this.tileSize)
      const endY = Math.ceil((obj.y + (obj.height ?? 0)) / this.tileSize)
      this.interactiveObjects.set(obj.name, {
        x: startX,
        y: startY,
        width: Math.max(1, endX - startX),
        height: Math.max(1, endY - startY),
      })
    }
  }

  private parseWarRoomObjects(): void {
    const layer = this.findLayer('war-room-objects', 'objectgroup')
    if (!layer?.objects) return
    for (const obj of layer.objects) {
      if (!obj.polygon || obj.polygon.length === 0) continue

      // Compute bounding rect from polygon vertices (in pixels, relative to object origin)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const pt of obj.polygon) {
        const absX = obj.x + pt.x
        const absY = obj.y + pt.y
        if (absX < minX) minX = absX
        if (absY < minY) minY = absY
        if (absX > maxX) maxX = absX
        if (absY > maxY) maxY = absY
      }

      const startX = Math.floor(minX / this.tileSize)
      const startY = Math.floor(minY / this.tileSize)
      const endX = Math.ceil(maxX / this.tileSize)
      const endY = Math.ceil(maxY / this.tileSize)

      const rect: ZoneRect = {
        x: startX,
        y: startY,
        width: Math.max(1, endX - startX),
        height: Math.max(1, endY - startY),
      }

      // Store polygon points as-is (relative to object origin) for hit area
      const polygonPoints = obj.polygon.map((pt) => ({ x: pt.x, y: pt.y }))

      this.warRoomObjects.set(obj.name, {
        rect,
        polygonPoints,
        originX: obj.x,
        originY: obj.y,
      })

      // Also register in interactiveObjects so tile extraction picks it up
      this.interactiveObjects.set(obj.name, rect)
    }
  }

  private parseMonitorGlowRects(): void {
    const layer = this.findLayer('monitor-glow', 'objectgroup')
    if (!layer?.objects) return
    for (const obj of layer.objects) {
      this.monitorGlowRects.set(obj.name, {
        x: obj.x,
        y: obj.y,
        width: obj.width ?? 0,
        height: obj.height ?? 0,
      })
    }
  }

  getMonitorGlowRects(): Map<string, ZoneRect> {
    return this.monitorGlowRects
  }

  getInteractiveObjects(): Map<string, ZoneRect> {
    return this.interactiveObjects
  }

  getWarRoomObjects(): Map<string, PolygonObject> {
    return this.warRoomObjects
  }

  getExtractedGroups(): Map<string, Container> {
    return this.extractedGroups
  }

  /**
   * Collect tiles within each interactive object's rect from the
   * furniture-above layer only — furniture-below holds base surfaces
   * (desks, shelves) that should stay in the static tilemap.
   */
  private collectExtractionTargets(): void {
    for (const layerName of ['furniture-above'] as const) {
      const layer = this.findLayer(layerName, 'tilelayer')
      if (!layer?.data) continue

      for (const [name, rect] of this.interactiveObjects) {
        for (let dy = 0; dy < rect.height; dy++) {
          for (let dx = 0; dx < rect.width; dx++) {
            const tx = rect.x + dx
            const ty = rect.y + dy
            if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue
            const rawId = layer.data[ty * this.width + tx]
            if ((rawId & TILE_ID_MASK) !== 0) {
              const key = `${layerName}:${tx}:${ty}`
              this.extractionSkips.add(key)
              if (!this.extractionCollected.has(name)) {
                this.extractionCollected.set(name, [])
              }
              this.extractionCollected.get(name)!.push({ layer: layerName, tx, ty })
            }
          }
        }
      }
    }
  }

  private resolveTileset(tileId: number): { tileset: TiledTilesetRef; texture: Texture } | undefined {
    for (let i = this.mapData.tilesets.length - 1; i >= 0; i--) {
      if (tileId >= this.mapData.tilesets[i].firstgid) {
        return { tileset: this.mapData.tilesets[i], texture: this.tilesetTextures[i] }
      }
    }
    return undefined
  }

  private buildTileLayers(): void {
    if (this.mapData.tilesets.length === 0) return

    for (const layerName of TILE_LAYERS) {
      const layer = this.findLayer(layerName, 'tilelayer')
      const container = new Container()
      container.label = layerName

      if (layer?.data) {
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            const raw = layer.data[y * this.width + x]
            if (raw === 0) continue

            // Skip tiles collected for interactive object extraction
            const skipKey = `${layerName}:${x}:${y}`
            if (this.extractionSkips.has(skipKey)) continue

            // Strip flip flags to get the actual tile ID
            const flippedH = (raw & FLIPPED_H_FLAG) !== 0
            const flippedV = (raw & FLIPPED_V_FLAG) !== 0
            const flippedD = (raw & FLIPPED_D_FLAG) !== 0
            const tileId = raw & TILE_ID_MASK

            const resolved = this.resolveTileset(tileId)
            if (!resolved) continue

            const { tileset, texture } = resolved
            const cols = tileset.columns ?? 16
            const tw = tileset.tilewidth ?? this.tileSize
            const th = tileset.tileheight ?? this.tileSize
            const localId = tileId - tileset.firstgid
            const srcX = (localId % cols) * tw
            const srcY = Math.floor(localId / cols) * th

            const frame = new Rectangle(srcX, srcY, tw, th)
            const tileTexture = new Texture({ source: texture.source, frame })
            const sprite = new Sprite(tileTexture)

            // Apply Tiled flip/rotation transforms
            if (flippedH || flippedV || flippedD) {
              sprite.anchor.set(0.5, 0.5)
              sprite.x = x * this.tileSize + this.tileSize / 2
              sprite.y = y * this.tileSize + this.tileSize / 2
              if (flippedD) {
                if (flippedH && !flippedV) {
                  sprite.rotation = Math.PI / 2
                } else if (!flippedH && flippedV) {
                  sprite.rotation = -Math.PI / 2
                } else if (flippedH && flippedV) {
                  sprite.rotation = Math.PI / 2
                  sprite.scale.y = -1
                } else {
                  sprite.rotation = Math.PI / 2
                  sprite.scale.x = -1
                }
              } else {
                if (flippedH) sprite.scale.x = -1
                if (flippedV) sprite.scale.y = -1
              }
            } else {
              sprite.x = x * this.tileSize
              sprite.y = y * this.tileSize
            }

            container.addChild(sprite)
          }
        }
      }

      this.layerContainers.set(layerName, container)

      this.rootContainer.addChild(container)
      if (layerName === 'furniture-above') {
        this.rootContainer.addChild(this.characterContainer)
      }
    }

    // Assemble extracted groups from collected tiles
    for (const [name, tiles] of this.extractionCollected) {
      const rect = this.interactiveObjects.get(name)
      if (!rect) continue

      const group = new Container()
      group.label = name
      group.x = rect.x * this.tileSize
      group.y = rect.y * this.tileSize

      for (const tile of tiles) {
        const layer = this.findLayer(tile.layer, 'tilelayer')
        if (!layer?.data) continue

        const raw = layer.data[tile.ty * this.width + tile.tx]
        if (raw === 0) continue

        const flippedH = (raw & FLIPPED_H_FLAG) !== 0
        const flippedV = (raw & FLIPPED_V_FLAG) !== 0
        const flippedD = (raw & FLIPPED_D_FLAG) !== 0
        const tileId = raw & TILE_ID_MASK

        const resolved = this.resolveTileset(tileId)
        if (!resolved) continue

        const { tileset, texture } = resolved
        const cols = tileset.columns ?? 16
        const tw = tileset.tilewidth ?? this.tileSize
        const th = tileset.tileheight ?? this.tileSize
        const localId = tileId - tileset.firstgid
        const srcX = (localId % cols) * tw
        const srcY = Math.floor(localId / cols) * th

        const frame = new Rectangle(srcX, srcY, tw, th)
        const tileTexture = new Texture({ source: texture.source, frame })
        const sprite = new Sprite(tileTexture)

        // Position relative to group origin
        const relX = (tile.tx - rect.x) * this.tileSize
        const relY = (tile.ty - rect.y) * this.tileSize

        if (flippedH || flippedV || flippedD) {
          sprite.anchor.set(0.5, 0.5)
          sprite.x = relX + this.tileSize / 2
          sprite.y = relY + this.tileSize / 2
          if (flippedD) {
            if (flippedH && !flippedV) {
              sprite.rotation = Math.PI / 2
            } else if (!flippedH && flippedV) {
              sprite.rotation = -Math.PI / 2
            } else if (flippedH && flippedV) {
              sprite.rotation = Math.PI / 2
              sprite.scale.y = -1
            } else {
              sprite.rotation = Math.PI / 2
              sprite.scale.x = -1
            }
          } else {
            if (flippedH) sprite.scale.x = -1
            if (flippedV) sprite.scale.y = -1
          }
        } else {
          sprite.x = relX
          sprite.y = relY
        }

        group.addChild(sprite)
      }

      this.extractedGroups.set(name, group)
    }
  }

  private findLayer(name: string, type: 'tilelayer' | 'objectgroup'): TiledLayer | undefined {
    return this.mapData.layers.find((l) => l.name === name && l.type === type)
  }
}
