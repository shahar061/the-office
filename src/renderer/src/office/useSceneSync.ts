import { useEffect, useRef } from 'react';
import { useOfficeStore, type CharacterInfo } from '../stores/office.store';
import { useProjectStore } from '../stores/project.store';
import { useArtifactStore } from '../stores/artifact.store';
import type { OfficeScene } from './OfficeScene';
import type { AgentRole } from '../../../../shared/types';

/**
 * Watches the Zustand office store and synchronizes character state
 * changes to the PixiJS scene. Also watches phase changes for camera.
 */
export function useSceneSync(scene: OfficeScene | null) {
  const prevStatesRef = useRef<Map<string, CharacterInfo>>(new Map());

  // Sync character state changes from store → PixiJS scene
  useEffect(() => {
    if (!scene) return;

    const unsub = useOfficeStore.subscribe((state) => {
      const prev = prevStatesRef.current;

      for (const [role, info] of state.characters) {
        const prevInfo = prev.get(role);
        const character = scene.getCharacter(role);
        if (!character) continue;

        // Skip if state hasn't changed
        if (prevInfo && prevInfo.state === info.state && prevInfo.toolName === info.toolName) {
          continue;
        }

        switch (info.state) {
          case 'typing':
            character.setWorking('type');
            break;
          case 'reading':
            character.setWorking('read');
            break;
          case 'idle':
            if (prevInfo && prevInfo.state !== 'idle') {
              character.setIdle();
            }
            break;
          // 'walking' is handled internally by Character.moveTo()
        }
      }

      prevStatesRef.current = new Map(state.characters);
    });

    return unsub;
  }, [scene]);

  // Sync phase changes → camera
  useEffect(() => {
    if (!scene) return;

    const unsub = useProjectStore.subscribe((state) => {
      const phase = state.currentPhase?.phase;
      if (phase && phase !== 'idle' && phase !== 'complete') {
        const camera = scene.getCamera();
        camera.focusOnPhase(phase as 'imagine' | 'warroom' | 'build');
      }
    });

    return unsub;
  }, [scene]);

  // Sync agent lifecycle → character show/hide
  useEffect(() => {
    if (!scene) return;

    const prevActive = new Set<AgentRole>();

    const unsub = useOfficeStore.subscribe((state) => {
      const current = state.activeAgents;

      // Detect newly active agents (entered)
      for (const role of current) {
        if (!prevActive.has(role)) {
          scene.showCharacter(role);
          const character = scene.getCharacter(role);
          if (character) {
            character.moveTo(character.getDeskTile());
            const entrance = scene.getEntrancePosition();
            const mapRenderer = scene.getMapRenderer();
            const pos = mapRenderer.tileToPixel(entrance.x, entrance.y);
            scene.getCamera().nudgeToward(
              pos.x + mapRenderer.tileSize / 2,
              pos.y + mapRenderer.tileSize,
            );
          }
        }
      }

      // Detect deactivated agents (closed)
      for (const role of prevActive) {
        if (!current.has(role)) {
          scene.hideCharacter(role);
        }
      }

      prevActive.clear();
      for (const role of current) prevActive.add(role);
    });

    return unsub;
  }, [scene]);

  // Sync artifact availability → interactive objects
  useEffect(() => {
    if (!scene) return;

    const unsub = useArtifactStore.subscribe((state) => {
      const interactiveObjs = scene.getInteractiveObjects();
      for (const artifact of state.artifacts) {
        interactiveObjs.setAvailable(`artifact-${artifact.key}`, artifact.available);
      }
    });

    return unsub;
  }, [scene]);
}
