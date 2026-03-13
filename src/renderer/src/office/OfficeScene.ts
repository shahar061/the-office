import { Application, Container, Graphics } from 'pixi.js';
import { TileMap, TileType } from './engine/tilemap';
import { Camera } from './engine/camera';
import { Character } from './characters/Character';
import type { AgentRole } from '../../../shared/types';
import officeLayout from '../assets/office-layout.json';

const FLOOR_COLOR = 0x2a2a4a;
const WALL_COLOR = 0x4a4a6a;

export class OfficeScene {
  private app: Application;
  private worldContainer: Container;
  private tileMap: TileMap;
  private camera: Camera;
  private characters: Map<string, Character> = new Map();
  private characterLayer: Container;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileMap = new TileMap(officeLayout);
    this.camera = new Camera(this.worldContainer);
    this.camera.setViewSize(app.screen.width, app.screen.height);

    this.drawTiles();

    this.characterLayer = new Container();
    this.worldContainer.addChild(this.characterLayer);

    this.camera.focusOnPhase('imagine');

    this.app.ticker.add(() => this.update());
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

  private update(): void {
    const dt = this.app.ticker.deltaMS / 1000;
    this.camera.update();
    for (const character of this.characters.values()) {
      character.update(dt);
    }
  }

  getTileMap(): TileMap {
    return this.tileMap;
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