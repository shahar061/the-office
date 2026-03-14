import { Application, Assets, Container } from 'pixi.js';
import { TiledMapRenderer } from '../office/engine/TiledMapRenderer';
import tilesetUrl from '../assets/tilesets/modern-interiors.png?url';
import lobbyMapData from '../assets/maps/lobby.tmj';

export class LobbyScene {
  private app: Application;
  private worldContainer: Container;
  private mapRenderer!: TiledMapRenderer;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);
  }

  async init(): Promise<void> {
    const tilesetTexture = await Assets.load(tilesetUrl);
    tilesetTexture.source.scaleMode = 'nearest';

    this.mapRenderer = new TiledMapRenderer(lobbyMapData as any, tilesetTexture);
    this.worldContainer.addChild(this.mapRenderer.getContainer());

    this.centerCamera();
  }

  private centerCamera(): void {
    const worldW = this.mapRenderer.width * this.mapRenderer.tileSize;
    const worldH = this.mapRenderer.height * this.mapRenderer.tileSize;
    const zoom = 2.5;
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = this.app.screen.width / 2 - (worldW * zoom) / 2;
    this.worldContainer.y = this.app.screen.height / 2 - (worldH * zoom) / 2;
  }

  onResize(): void {
    this.centerCamera();
  }
}
