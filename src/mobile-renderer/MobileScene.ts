import { Application, Assets, Container, Texture } from 'pixi.js';
import { TiledMapRenderer } from '../renderer/src/office/engine/TiledMapRenderer';
import { Camera } from '../renderer/src/office/engine/camera';
import { Character } from '../renderer/src/office/characters/Character';
import { SpriteAdapter } from '../renderer/src/office/characters/SpriteAdapter';
import { AGENT_CONFIGS } from '../renderer/src/office/characters/agents.config';
import { useSessionStore } from '../../shared/stores/session.store';

import officeTilesetUrl from '../renderer/src/assets/tilesets/office-tileset.png?url';
import a5FloorsWallsUrl from '../renderer/src/assets/tilesets/a5-office-floors-walls.png?url';
import interiorsUrl from '../renderer/src/assets/tilesets/interiors.png?url';
import officeMapData from '../renderer/src/assets/maps/office.tmj';

import adamUrl from '../renderer/src/assets/characters/Adam_walk.png?url';
import alexUrl from '../renderer/src/assets/characters/Alex_walk.png?url';
import ameliaUrl from '../renderer/src/assets/characters/Amelia_walk.png?url';
import bobUrl from '../renderer/src/assets/characters/Bob_walk.png?url';

const CHARACTER_SHEETS: Record<string, string> = {
  adam: adamUrl,
  alex: alexUrl,
  amelia: ameliaUrl,
  bob: bobUrl,
};

export class MobileScene {
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
    console.log('[MobileScene] init: loading tilesets');
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

    console.log('[MobileScene] loading character sheets');
    // Load character spritesheets
    const sheetTextures = new Map<string, Texture>();
    for (const [name, url] of Object.entries(CHARACTER_SHEETS)) {
      const tex = await Assets.load(url);
      tex.source.scaleMode = 'nearest';
      sheetTextures.set(name, tex);
    }
    console.log('[MobileScene] character sheets loaded, keys=', [...sheetTextures.keys()]);

    // Create characters for all agents
    for (const config of Object.values(AGENT_CONFIGS)) {
      const sheetTex = sheetTextures.get(config.spriteVariant);
      if (!sheetTex) {
        console.log('[MobileScene] no sheet for', config.role, 'variant=', config.spriteVariant);
        continue;
      }

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
    }
    console.log('[MobileScene] characters created:', this.characters.size, 'roles=', [...this.characters.keys()]);

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

    this.app.ticker.add(() => this.driveFromStore());
  }

  private driveFromStore(): void {
    const dt = this.app.ticker.deltaMS / 1000;
    this.camera.update();

    const states = useSessionStore.getState().characterStates;

    // Apply state to known characters; spawn if new-visible
    for (const [agentId, target] of states) {
      const character = this.characters.get(agentId);
      if (!character) continue;
      if (!character.isVisible && target.visible) {
        const tileX = Math.floor(target.x / this.mapRenderer.tileSize);
        const tileY = Math.floor(target.y / this.mapRenderer.tileSize);
        character.repositionTo(tileX, tileY);
        character.show(this.characterLayer);
      }
      character.applyDrivenState(target, dt);
    }

    // Fade out characters no longer in the stream
    for (const [role, character] of this.characters) {
      if (!states.has(role) && character.isVisible) {
        character.hide(500);
      }
    }
  }

  getCamera(): Camera {
    return this.camera;
  }

  onResize(width: number, height: number): void {
    this.camera.setViewSize(width, height);
  }

  getCharacter(role: string): Character | undefined {
    return this.characters.get(role);
  }
}
