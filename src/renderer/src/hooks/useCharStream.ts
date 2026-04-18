import { useEffect, type RefObject } from 'react';
import type { OfficeScene } from '../office/OfficeScene';

/**
 * Polls the scene at 10Hz and broadcasts visible character states to main
 * (which fans out to all connected mobile peers). Gates on:
 *  - scene ref is populated
 *  - at least one mobile device is connected
 */
export function useCharStream(
  sceneRef: RefObject<OfficeScene | null>,
  mobileConnectedCount: number,
): void {
  useEffect(() => {
    if (!sceneRef.current || mobileConnectedCount < 1) return;
    const id = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const states = scene.getCharacterStates();
      window.office.broadcastCharStates(states);
    }, 100);
    return () => clearInterval(id);
  }, [sceneRef, mobileConnectedCount]);
}
