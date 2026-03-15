import { Application, Assets, Container } from 'pixi.js';
import { TiledMapRenderer } from '../office/engine/TiledMapRenderer';
import roomBuilderUrl from '../assets/tilesets/room-builder.png?url';
import interiorsUrl from '../assets/tilesets/interiors.png?url';
import lobbyMapData from '../assets/maps/lobby.tmj';

export class LobbyScene {
  private app: Application;
  private worldContainer: Container;
  private mapRenderer!: TiledMapRenderer;
  private viewWidth = 800;
  private viewHeight = 600;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);
  }

  async init(): Promise<void> {
    const [roomBuilderTex, interiorsTex] = await Promise.all([
      Assets.load(roomBuilderUrl),
      Assets.load(interiorsUrl),
    ]);
    roomBuilderTex.source.scaleMode = 'nearest';
    interiorsTex.source.scaleMode = 'nearest';

    this.mapRenderer = new TiledMapRenderer(
      lobbyMapData as any,
      [roomBuilderTex, interiorsTex],
    );
    this.worldContainer.addChild(this.mapRenderer.getContainer());

    this.viewWidth = this.app.screen.width;
    this.viewHeight = this.app.screen.height;
    this.centerCamera();
  }

  private centerCamera(): void {
    const worldW = this.mapRenderer.width * this.mapRenderer.tileSize;
    const worldH = this.mapRenderer.height * this.mapRenderer.tileSize;
    const zoom = Math.min(
      this.viewWidth / worldW,
      this.viewHeight / worldH,
    );
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = this.viewWidth / 2 - (worldW * zoom) / 2;
    this.worldContainer.y = this.viewHeight / 2 - (worldH * zoom) / 2;

    // Clamp to map bounds
    const minX = this.viewWidth - worldW * zoom;
    const minY = this.viewHeight - worldH * zoom;
    this.worldContainer.x = Math.min(0, Math.max(minX, this.worldContainer.x));
    this.worldContainer.y = Math.min(0, Math.max(minY, this.worldContainer.y));
  }

  onResize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    if (this.mapRenderer) {
      this.centerCamera();
    }
  }
}
