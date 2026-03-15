import { Application, Assets, Container, Texture } from 'pixi.js';
import { TiledMapRenderer } from './engine/TiledMapRenderer';
import { Camera } from './engine/camera';
import { Character } from './characters/Character';
import { SpriteAdapter } from './characters/SpriteAdapter';
import { AGENT_CONFIGS } from './characters/agents.config';
import type { AgentRole } from '../../../shared/types';
import officeTilesetUrl from '../assets/tilesets/office-tileset.png?url';
import a5FloorsWallsUrl from '../assets/tilesets/a5-office-floors-walls.png?url';
import interiorsUrl from '../assets/tilesets/interiors.png?url';
import officeMapData from '../assets/maps/office.tmj';

import adamUrl from '../assets/characters/Adam_walk.png?url';
import alexUrl from '../assets/characters/Alex_walk.png?url';
import ameliaUrl from '../assets/characters/Amelia_walk.png?url';
import bobUrl from '../assets/characters/Bob_walk.png?url';

const CHARACTER_SHEETS: Record<string, string> = {
  adam: adamUrl,
  alex: alexUrl,
  amelia: ameliaUrl,
  bob: bobUrl,
};

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
    // Load all tileset textures with nearest-neighbor for pixel art
    const officeTilesetTex = await Assets.load(officeTilesetUrl);
    officeTilesetTex.source.scaleMode = 'nearest';
    const a5FloorsTex = await Assets.load(a5FloorsWallsUrl);
    a5FloorsTex.source.scaleMode = 'nearest';
    const interiorsTex = await Assets.load(interiorsUrl);
    interiorsTex.source.scaleMode = 'nearest';

    // Resolve external tileset references with inline metadata
    const resolvedMapData = {
      ...officeMapData,
      tilesets: [
        officeMapData.tilesets[0],
        {
          firstgid: 513,
          image: '../tilesets/A5 Office Floors & Walls.png',
          imagewidth: 256,
          imageheight: 512,
          tilewidth: 16,
          tileheight: 16,
          columns: 16,
          tilecount: 512,
        },
        {
          firstgid: 1025,
          image: '../tilesets/interiors.png',
          imagewidth: 256,
          imageheight: 1424,
          tilewidth: 16,
          tileheight: 16,
          columns: 16,
          tilecount: 1424,
        },
      ],
    };

    // Create renderer with all tilesets (order matches resolved array)
    this.mapRenderer = new TiledMapRenderer(
      resolvedMapData as any,
      [officeTilesetTex, a5FloorsTex, interiorsTex],
    );

    this.worldContainer.addChild(this.mapRenderer.getContainer());
    this.characterLayer = this.mapRenderer.getCharacterContainer();

    // Load character spritesheets
    const sheetTextures = new Map<string, Texture>();
    for (const [name, url] of Object.entries(CHARACTER_SHEETS)) {
      const tex = await Assets.load(url);
      tex.source.scaleMode = 'nearest';
      sheetTextures.set(name, tex);
    }

    // Create characters for all agents
    for (const config of Object.values(AGENT_CONFIGS)) {
      const sheetTex = sheetTextures.get(config.spriteVariant);
      if (!sheetTex) continue;

      const frames = SpriteAdapter.extractFrames(sheetTex, {
        frameWidth: 16,
        frameHeight: 32,
        walkRow: 1,
        framesPerDirection: 6,
      });

      const character = new Character({
        agentId: config.role,
        role: config.role,
        mapRenderer: this.mapRenderer,
        frames,
      });

      this.characters.set(config.role, character);
      this.characterLayer.addChild(character.sprite.container);
    }

    // Set up camera with zone data
    this.camera = new Camera(this.worldContainer, this.mapRenderer.getAllZones());
    this.camera.setMapSize(
      this.mapRenderer.width * this.mapRenderer.tileSize,
      this.mapRenderer.height * this.mapRenderer.tileSize,
    );
    this.camera.setViewSize(this.app.screen.width, this.app.screen.height);
    // Start with map fitted to screen, then focus on initial phase
    this.camera.fitToScreen();
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

  getCharacter(role: string): Character | undefined {
    return this.characters.get(role);
  }

  getAllCharacters(): Map<string, Character> {
    return this.characters;
  }

  onResize(width: number, height: number): void {
    this.camera.setViewSize(width, height);
  }
}
