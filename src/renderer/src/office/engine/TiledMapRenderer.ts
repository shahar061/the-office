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

export interface TiledObject {
  name: string
  x: number
  y: number
  width?: number
  height?: number
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
  private interactiveObjects: Map<string, ZoneRect> = new Map()
  private layerContainers: Map<string, Container> = new Map()
  private characterContainer: Container
  private rootContainer: Container

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
    this.parseZones()
    this.parseInteractiveObjects()
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
      this.interactiveObjects.set(obj.name, {
        x: Math.floor(obj.x / this.tileSize),
        y: Math.floor(obj.y / this.tileSize),
        width: Math.ceil((obj.width ?? 0) / this.tileSize),
        height: Math.ceil((obj.height ?? 0) / this.tileSize),
      })
    }
  }

  getInteractiveObjects(): Map<string, ZoneRect> {
    return this.interactiveObjects
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
      if (layerName === 'furniture-below') {
        this.rootContainer.addChild(this.characterContainer)
      }
    }
  }

  private findLayer(name: string, type: 'tilelayer' | 'objectgroup'): TiledLayer | undefined {
    return this.mapData.layers.find((l) => l.name === name && l.type === type)
  }
}
