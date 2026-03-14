import { Application, Assets, Container } from 'pixi.js';
import { TiledMapRenderer } from './engine/TiledMapRenderer';
import { Camera } from './engine/camera';
import { Character } from './characters/Character';
import { SpriteAdapter } from './characters/SpriteAdapter';
import { AGENT_CONFIGS } from './characters/agents.config';
import type { AgentRole } from '../../../shared/types';
import tilesetUrl from '../assets/tilesets/modern-interiors.png?url';
import officeMapData from '../assets/maps/office.tmj';

export class OfficeScene {
  private app: Application;
  private worldContainer: Container;
  private mapRenderer!: TiledMapRenderer;
  private camera!: Camera;
  private characters: Map<string, Character> = new Map();
  private characterLayer!: Container;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);
  }

  async init(): Promise<void> {
    // Load tileset texture with nearest-neighbor scaling for pixel art
    const tilesetTexture = await Assets.load(tilesetUrl);
    tilesetTexture.source.scaleMode = 'nearest';

    // Create renderer from Tiled JSON map
    this.mapRenderer = new TiledMapRenderer(officeMapData as any, tilesetTexture);

    // Add tile layers to scene
    this.worldContainer.addChild(this.mapRenderer.getContainer());
    this.characterLayer = this.mapRenderer.getCharacterContainer();

    // Set up camera with zone data
    this.camera = new Camera(this.worldContainer, this.mapRenderer.getAllZones());
    this.camera.setViewSize(this.app.screen.width, this.app.screen.height);
    this.camera.focusOnPhase('imagine');

    this.app.ticker.add(() => this.update());
  }

  private update(): void {
    const dt = this.app.ticker.deltaMS / 1000;
    this.camera.update();
    for (const character of this.characters.values()) {
      character.update(dt);
    }
  }

  getMapRenderer(): TiledMapRenderer {
    return this.mapRenderer;
  }

  getCamera(): Camera {
    return this.camera;
  }

  getWorldContainer(): Container {
    return this.worldContainer;
  }

  onResize(width: number, height: number): void {
    this.camera.setViewSize(width, height);
  }
}
