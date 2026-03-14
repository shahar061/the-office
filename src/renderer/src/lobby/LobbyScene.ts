import { Application, Container, Graphics } from 'pixi.js';
import { TileMap, TileType } from '../office/engine/tilemap';
import lobbyLayout from '../assets/lobby-layout.json';

const FLOOR_COLOR = 0x3a3a5a;
const WALL_COLOR = 0x5a5a7a;
const DESK_COLOR = 0x8b6914;

export class LobbyScene {
  private app: Application;
  private worldContainer: Container;
  private tileMap: TileMap;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileMap = new TileMap(lobbyLayout as any);
    this.drawTiles();
    this.drawReceptionDesk();
    this.centerCamera();
  }

  private drawTiles(): void {
    const g = new Graphics();
    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        const tile = this.tileMap.getTile(x, y);
        if (tile === TileType.Void) continue;
        const color = tile === TileType.Floor ? FLOOR_COLOR : WALL_COLOR;
        g.rect(x * this.tileMap.tileSize, y * this.tileMap.tileSize, this.tileMap.tileSize, this.tileMap.tileSize);
        g.fill(color);
      }
    }
    this.worldContainer.addChild(g);
  }

  private drawReceptionDesk(): void {
    const g = new Graphics();
    const zone = (lobbyLayout as any).zones.reception;
    const ts = this.tileMap.tileSize;
    g.rect(zone.x * ts + 2, zone.y * ts + 2, zone.w * ts - 4, zone.h * ts - 4);
    g.fill(DESK_COLOR);
    g.rect(zone.x * ts + 2, zone.y * ts + 2, zone.w * ts - 4, zone.h * ts - 4);
    g.stroke({ width: 1, color: 0x6b4f10 });
    this.worldContainer.addChild(g);
  }

  private centerCamera(): void {
    const worldW = this.tileMap.width * this.tileMap.tileSize;
    const worldH = this.tileMap.height * this.tileMap.tileSize;
    const zoom = 2.5;
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = this.app.screen.width / 2 - (worldW * zoom) / 2;
    this.worldContainer.y = this.app.screen.height / 2 - (worldH * zoom) / 2;
  }

  onResize(): void {
    this.centerCamera();
  }
}
