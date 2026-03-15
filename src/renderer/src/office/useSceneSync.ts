import { useEffect, useRef } from 'react';
import { useOfficeStore, type CharacterInfo } from '../stores/office.store';
import { useProjectStore } from '../stores/project.store';
import type { OfficeScene } from './OfficeScene';

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
}
