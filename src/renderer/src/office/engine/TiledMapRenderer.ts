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
    this.characterContainer.label = ''
    this.characterContainer.sortableChildren = true

    this.parseCollisionLayer()
    this.parseSpawnPoints()
    this.parseZones()
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
            if (rawTileId === 0) continue

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
      if (layerName === 'furniture-below') {
        this.rootContainer.addChild(this.characterContainer)
      }
    }
  }

  private findLayer(name: string, type: 'tilelayer' | 'objectgroup'): TiledLayer | undefined {
    return this.mapData.layers.find((l) => l.name === name && l.type === type)
  }
}
