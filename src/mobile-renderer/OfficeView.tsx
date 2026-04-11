import { useEffect, useRef } from 'react';
import type React from 'react';
import { Application } from 'pixi.js';
import { OfficeScene } from '../renderer/src/office/OfficeScene';
import { useMobileSessionStore } from './session.store';
import type { AgentEvent, CharacterSnapshot } from '../../shared/types';

interface Props {
  active: boolean;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent']);

function applyCharacterStates(scene: OfficeScene, characters: CharacterSnapshot[]): void {
  // OfficeScene.init() creates all 15 Character instances but leaves them invisible
  // until scene.showCharacter(role) adds them to the scene graph. The desktop flow
  // calls this from useSceneSync as characters become active; the mobile flow has
  // to do it here since the snapshot is our single source of truth.
  for (const c of characters) {
    scene.showCharacter(c.agentRole);
    const character = scene.getCharacter(c.agentRole);
    if (!character) continue;
    switch (c.activity) {
      case 'reading':
        character.setWorking('read');
        break;
      case 'typing':
        character.setWorking('type');
        break;
      case 'waiting':
        character.showToolBubble('', '...');
        break;
      case 'idle':
        character.setIdle();
        break;
      case 'walking':
        // Movement is handled internally by Character.moveTo() — no-op here.
        break;
    }
  }
}

function applyEventToScene(scene: OfficeScene, event: AgentEvent): void {
  // Make sure the character is on-screen before any state change. showCharacter()
  // is idempotent — it no-ops if the character is already visible.
  scene.showCharacter(event.agentRole);
  const character = scene.getCharacter(event.agentRole);
  if (!character) return;
  switch (event.type) {
    case 'agent:created':
      // Character is now visible via showCharacter above; nothing else to do.
      break;
    case 'agent:tool:start': {
      const isRead = event.toolName ? READ_TOOLS.has(event.toolName) : false;
      character.setWorking(isRead ? 'read' : 'type');
      if (event.toolName) character.showToolBubble(event.toolName, '');
      break;
    }
    case 'agent:tool:done':
    case 'agent:tool:clear':
      character.setIdle();
      break;
    case 'agent:waiting':
      character.showToolBubble('', '...');
      break;
    case 'agent:closed':
      scene.hideCharacter(event.agentRole);
      break;
    // Other events are non-visual.
    default:
      break;
  }
}

export function OfficeView({ active: _active }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;
    let unsub: (() => void) | null = null;

    (async () => {
      const app = new Application();
      try {
        await app.init({
          canvas,
          width: canvas.clientWidth || 400,
          height: canvas.clientHeight || 600,
          background: '#0a0a0a',
          antialias: false,
          preference: 'webgl',
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
      } catch (err) {
        console.error('[OfficeView] PixiJS init failed', err);
        return;
      }

      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }

      const scene = new OfficeScene(app);
      try {
        await scene.init();
      } catch (err) {
        console.error('[OfficeView] OfficeScene init failed', err);
        app.destroy(true, { children: true });
        return;
      }

      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }

      // Adapt the existing Camera to the portrait viewport.
      scene.getCamera().setViewSize(canvas.clientWidth || 400, canvas.clientHeight || 600);

      appRef.current = app;

      // Hydrate from the current snapshot if one exists.
      const initialState = useMobileSessionStore.getState();
      if (initialState.snapshot) {
        applyCharacterStates(scene, initialState.snapshot.characters);
      }

      // Subscribe to subsequent updates.
      unsub = useMobileSessionStore.subscribe((state, prev) => {
        if (state.snapshot && state.snapshot !== prev.snapshot) {
          applyCharacterStates(scene, state.snapshot.characters);
        }
        if (state.pendingEvents !== prev.pendingEvents && state.pendingEvents.length > 0) {
          const events = useMobileSessionStore.getState().drainPendingEvents();
          for (const e of events) applyEventToScene(scene, e);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) {
        unsub();
        unsub = null;
      }
      const app = appRef.current;
      if (app) {
        app.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="office-canvas" />;
}
