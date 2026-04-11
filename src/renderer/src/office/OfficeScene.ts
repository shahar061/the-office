import { Application, Assets, Container, Texture, Text, Graphics } from 'pixi.js';
import { TiledMapRenderer } from './engine/TiledMapRenderer';
import { Camera } from './engine/camera';
import { Character } from './characters/Character';
import { SpriteAdapter } from './characters/SpriteAdapter';
import { AGENT_CONFIGS } from './characters/agents.config';
import { InteractiveObjects } from './InteractiveObjects';
import { FogOfWar } from './engine/FogOfWar';
import { MonitorGlow } from './MonitorGlow';
import { WarTable } from './WarTable';
import { SeatPool } from './SeatPool';
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
  private interactiveObjects!: InteractiveObjects;
  private characterPopup: Container | null = null;
  private characterPopupRole: AgentRole | null = null;
  private characterPopupAgentId: string | null = null;
  private characterPopupSize = { w: 120, h: 52 };
  private fog: FogOfWar | null = null;
  private monitorGlow!: MonitorGlow;
  private warTable!: WarTable;
  private readonly seatPool = new SeatPool(['pc-1', 'pc-2', 'pc-3', 'pc-4', 'pc-5', 'pc-6']);

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

    this.monitorGlow = new MonitorGlow(this.mapRenderer.getMonitorGlowRects());
    this.worldContainer.addChild(this.monitorGlow.container);

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

      // Constrain wandering to the agent's idle zone (already in tile coords)
      const zone = this.mapRenderer.getZone(config.idleZone);
      const wanderBounds = zone ? {
        tileX: zone.x,
        tileY: zone.y,
        tileW: zone.width,
        tileH: zone.height,
      } : undefined;

      const character = new Character({
        agentId: config.role,
        role: config.role,
        mapRenderer: this.mapRenderer,
        frames,
        wanderBounds,
      });

      this.characters.set(config.role, character);
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

    // Interactive objects for artifact viewing (using extracted sprites from tilemap)
    this.interactiveObjects = new InteractiveObjects(
      this.mapRenderer.getInteractiveObjects(),
      this.mapRenderer.getExtractedGroups(),
      this.mapRenderer.tileSize,
      (artifactKey) => {
        window.dispatchEvent(new CustomEvent('artifact-click', { detail: { key: artifactKey } }));
      },
    );
    this.worldContainer.addChild(this.interactiveObjects.container);

    // War Table — uses war-room-pc extracted tiles from the map
    const warRoomObjects = this.mapRenderer.getWarRoomObjects();
    const warRoomPc = warRoomObjects.get('war-room-pc');
    const warRoomGroup = this.mapRenderer.getExtractedGroups().get('war-room-pc');
    if (warRoomPc && warRoomGroup) {
      this.warTable = new WarTable(
        warRoomGroup,
        warRoomPc,
        this.mapRenderer.tileSize,
        () => {
          window.dispatchEvent(new CustomEvent('war-table-click'));
        },
      );
      this.worldContainer.addChild(this.warTable.container);
    }

    // Character popup: show on character click, dismiss on background click
    window.addEventListener('character-click', (e: Event) => {
      const { agentId } = (e as CustomEvent).detail;
      this.showCharacterPopup(agentId);
    });

    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointertap', () => {
      this.dismissCharacterPopup();
    });

    this.app.ticker.add(() => this.update());
  }

  private update(): void {
    const dt = this.app.ticker.deltaMS / 1000;
    this.camera.update();
    for (const character of this.characters.values()) {
      character.update(dt);
    }
    this.interactiveObjects.update(dt);
    this.monitorGlow.update(dt);
    if (this.warTable) {
      this.warTable.update(dt);
    }
    if (this.fog && !this.fog.isDestroyed()) {
      this.fog.update(dt);
    }
    this.updatePopupPosition();
  }

  private updatePopupPosition(): void {
    if (!this.characterPopup || !this.characterPopupAgentId) return;
    const character = this.characters.get(this.characterPopupAgentId);
    if (!character || !character.isVisible) {
      this.dismissCharacterPopup();
      return;
    }
    const pos = character.getPixelPosition();
    const { w: bgW, h: bgH } = this.characterPopupSize;
    this.positionPopup(this.characterPopup, pos, bgW, bgH);
  }

  private positionPopup(popup: Container, pos: { x: number; y: number }, bgW: number, bgH: number): void {
    const { left: visLeft, right: visRight, top: visTop, bottom: visBottom } = this.camera.getVisibleBounds();

    const aboveY = pos.y - 32 - bgH - 4;
    let py = aboveY < visTop ? pos.y + 4 : aboveY;
    if (py + bgH > visBottom) py = visBottom - bgH;
    if (py < visTop) py = visTop;

    let px = pos.x - bgW / 2;
    if (px + bgW > visRight) px = visRight - bgW;
    if (px < visLeft) px = visLeft;

    popup.x = px;
    popup.y = py;
  }

  getInteractiveObjects(): InteractiveObjects {
    return this.interactiveObjects;
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

  showCharacterPopup(agentId: string): void {
    this.dismissCharacterPopup();

    const character = this.characters.get(agentId);
    if (!character || !character.isVisible) return;

    // Use the character's role for config lookup (works for both originals and clones)
    const role = character.role;
    const config = AGENT_CONFIGS[role];
    if (!config) return;
    const color = parseInt(config.color.slice(1), 16);
    const pos = character.getPixelPosition();

    // For clones, show a label like "Team Lead #2" instead of just "Team Lead"
    const isClone = agentId !== role;
    const displayName = isClone
      ? `${config.displayName} (${agentId.replace('tl-clone-tl-', 'spec: ')})`
      : config.displayName;

    const popup = new Container();
    popup.label = 'character-popup';

    const bgW = isClone ? 160 : 120;
    const bgH = 52;
    const bg = new Graphics();
    bg.setStrokeStyle({ width: 1, color });
    bg.roundRect(0, 0, bgW, bgH, 4);
    bg.fill({ color: 0x1a1a2e, alpha: 0.95 });
    bg.stroke();

    const nameText = new Text({
      text: displayName,
      style: { fontSize: 9, fill: config.color, fontWeight: 'bold', fontFamily: 'monospace' },
    });
    nameText.x = 8;
    nameText.y = 6;

    const stateText = new Text({
      text: character.getState(),
      style: { fontSize: 8, fill: '#94a3b8', fontFamily: 'monospace' },
    });
    stateText.x = 8;
    stateText.y = 20;

    const linkText = new Text({
      text: 'View details →',
      style: { fontSize: 8, fill: '#6366f1', fontFamily: 'monospace' },
    });
    linkText.x = 8;
    linkText.y = 35;
    linkText.eventMode = 'static';
    linkText.cursor = 'pointer';
    linkText.on('pointertap', () => {
      window.dispatchEvent(new CustomEvent('character-view-details', { detail: { role } }));
    });

    popup.addChild(bg, nameText, stateText, linkText);

    this.characterPopupSize = { w: bgW, h: bgH };
    this.characterPopupRole = role;
    this.characterPopupAgentId = agentId;
    this.positionPopup(popup, pos, bgW, bgH);

    this.worldContainer.addChild(popup);
    this.characterPopup = popup;
  }

  dismissCharacterPopup(): void {
    if (this.characterPopup) {
      this.characterPopup.parent?.removeChild(this.characterPopup);
      this.characterPopup.destroy({ children: true });
      this.characterPopup = null;
      this.characterPopupRole = null;
      this.characterPopupAgentId = null;
    }
  }

  showCharacter(role: AgentRole): void {
    const character = this.characters.get(role);
    if (!character || character.isVisible) return;
    const entrance = this.getEntrancePosition();
    character.repositionTo(entrance.x, entrance.y);
    character.show(this.characterLayer);
  }

  hideCharacter(role: AgentRole): void {
    const character = this.characters.get(role);
    if (!character || !character.isVisible) return;
    character.hide(3000);
  }

  /**
   * Create a clone character that looks like `baseRole` but sits at `deskSpawnName`.
   * Returns the clone's unique ID, or null if the spawn point doesn't exist.
   */
  createClone(cloneId: string, baseRole: AgentRole, deskSpawnName: string): Character | null {
    const baseConfig = AGENT_CONFIGS[baseRole];
    if (!baseConfig) return null;

    const deskPos = this.mapRenderer.getSpawnPoint(deskSpawnName);
    if (!deskPos) return null;

    // Reuse the same frames as the base character
    const baseCharacter = this.characters.get(baseRole);
    if (!baseCharacter) return null;

    const zone = this.mapRenderer.getZone(baseConfig.idleZone);
    const wanderBounds = zone ? {
      tileX: zone.x, tileY: zone.y,
      tileW: zone.width, tileH: zone.height,
    } : undefined;

    const clone = new Character({
      agentId: cloneId,
      role: baseRole,
      mapRenderer: this.mapRenderer,
      frames: baseCharacter.sprite.getRawFrames(),
      wanderBounds,
      deskOverride: deskPos,
    });

    this.characters.set(cloneId, clone);
    return clone;
  }

  destroyClone(cloneId: string): void {
    const character = this.characters.get(cloneId);
    if (!character) return;
    character.hide(0);
    this.characters.delete(cloneId);
    // Give hide animation time to complete, then destroy
    setTimeout(() => character.destroy(), 1500);
  }

  setMonitorGlow(seatName: string, on: boolean): void {
    this.monitorGlow.setGlowing(seatName, on);
  }

  /**
   * Reserve the next free PC seat in the shared pool.
   * Both TL warroom clones and engineer clones reserve through this method.
   * Returns null if all 6 seats are currently taken.
   */
  reserveFreeSeat(): string | null {
    return this.seatPool.reserveNext();
  }

  /** Release a previously-reserved seat. */
  releaseSeat(seat: string): void {
    this.seatPool.release(seat);
  }

  getWarTable(): WarTable {
    return this.warTable;
  }

  getEntrancePosition(): { x: number; y: number } {
    const sp = this.mapRenderer.getSpawnPoint('entrance');
    if (sp) return sp;
    // Fallback: bottom-center of the map
    return { x: Math.floor(this.mapRenderer.width / 2), y: this.mapRenderer.height - 2 };
  }

  onResize(width: number, height: number): void {
    this.camera.setViewSize(width, height);
  }

  /** Create fog overlay. Defaults to CEO room center; pass coords to override. */
  createFog(centerX?: number, centerY?: number): void {
    if (this.fog && !this.fog.isDestroyed()) return; // already exists and active
    if (this.fog?.isDestroyed()) this.fog = null;
    const mapPxW = this.mapRenderer.width * this.mapRenderer.tileSize;
    const mapPxH = this.mapRenderer.height * this.mapRenderer.tileSize;

    if (centerX !== undefined && centerY !== undefined) {
      this.fog = new FogOfWar(mapPxW, mapPxH, centerX, centerY);
    } else {
      const ceoZone = this.mapRenderer.getZone('ceo-room');
      if (!ceoZone) return;
      const cx = (ceoZone.x + ceoZone.width / 2) * this.mapRenderer.tileSize;
      const cy = (ceoZone.y + ceoZone.height / 2) * this.mapRenderer.tileSize;
      this.fog = new FogOfWar(mapPxW, mapPxH, cx, cy);
    }
    this.worldContainer.addChild(this.fog.container);
  }

  setFogStep(step: number): void {
    this.fog?.setStep(step);
  }

  setFogCenter(x: number, y: number): void {
    this.fog?.setCenter(x, y);
  }

  skipFog(): void {
    this.fog?.skip();
  }

  /** Remove fog entirely (for projects where intro was already seen). */
  removeFog(): void {
    if (this.fog && !this.fog.isDestroyed()) {
      this.fog.destroy();
    }
    this.fog = null;
  }
}
