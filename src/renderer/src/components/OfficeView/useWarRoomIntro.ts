import { useState, useCallback, useEffect, useRef } from 'react';
import type { Phase } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import { useProjectStore } from '../../stores/project.store';
import type { OfficeScene } from '../../office/OfficeScene';
import type { DialogueStep } from './IntroSequence';

const WARROOM_INTRO_STEPS: DialogueStep[] = [
  {
    text: "Time to turn vision into action. I'm the Project Manager — I'll be leading the War Room phase.",
    highlights: ['warroom'] as Phase[],
  },
  {
    text: "I'll review everything the leadership team created and write a battle plan. You'll get to review it before we move on.",
    highlights: ['imagine', 'warroom'] as Phase[],
  },
  {
    text: "Then the Team Lead will break it into tasks for the engineers. Let's get started.",
    highlights: ['warroom', 'build'] as Phase[],
  },
];

export const WARROOM_SPEAKER = 'Project Manager';
export const WARROOM_SPEAKER_COLOR = AGENT_COLORS['project-manager'];

export function useWarRoomIntro(scene: OfficeScene | null) {
  const warRoomIntroActive = useProjectStore((s) => s.warRoomIntroActive);
  const setWarRoomIntroActive = useProjectStore((s) => s.setWarRoomIntroActive);

  const [showDialog, setShowDialog] = useState(false);
  const [highlights, setHighlights] = useState<Phase[]>([]);
  const trackingRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // Phase 1: PM walk-in with fog tracking
  useEffect(() => {
    if (!warRoomIntroActive || !scene) return;

    const pm = scene.getCharacter('project-manager');
    if (!pm) return;

    // Show PM at entrance
    const entrance = scene.getEntrancePosition();
    scene.showCharacter('project-manager');
    pm.repositionTo(entrance.x, entrance.y);

    // Create fog centered on PM's pixel position
    const pmPos = pm.getPixelPosition();
    scene.createFog(pmPos.x, pmPos.y);

    // Camera: snap to PM at 2.5x zoom
    const camera = scene.getCamera();
    camera.snapTo(pmPos.x, pmPos.y, 2.5);

    // Walk PM to a walkable tile in the boardroom
    const mapRenderer = scene.getMapRenderer();
    const boardroom = mapRenderer.getZone('boardroom');
    if (boardroom) {
      // Find a walkable tile within the boardroom zone (center-first search)
      const cx = boardroom.x + Math.floor(boardroom.width / 2);
      const cy = boardroom.y + Math.floor(boardroom.height / 2);
      let target: { x: number; y: number } | null = null;

      // Spiral out from center to find nearest walkable tile
      for (let radius = 0; radius <= Math.max(boardroom.width, boardroom.height); radius++) {
        for (let dy = -radius; dy <= radius && !target; dy++) {
          for (let dx = -radius; dx <= radius && !target; dx++) {
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
            const tx = cx + dx;
            const ty = cy + dy;
            if (tx >= boardroom.x && tx < boardroom.x + boardroom.width &&
                ty >= boardroom.y && ty < boardroom.y + boardroom.height &&
                mapRenderer.isWalkable(tx, ty)) {
              target = { x: tx, y: ty };
            }
          }
        }
        if (target) break;
      }

      if (target) {
        pm.moveTo(target);
      }
    }

    // Track PM position each frame: update fog center + camera
    function trackPM() {
      const s = sceneRef.current;
      if (!s) return;
      const pm = s.getCharacter('project-manager');
      if (!pm) return;

      const pos = pm.getPixelPosition();
      s.setFogCenter(pos.x, pos.y);

      // Smooth camera follow
      const cam = s.getCamera();
      cam.snapTo(pos.x, pos.y, 2.5);

      // Check if PM has arrived (no longer walking)
      if (pm.getState() !== 'walk') {
        // PM arrived at boardroom — show dialog
        setShowDialog(true);
        return; // stop tracking
      }

      trackingRef.current = requestAnimationFrame(trackPM);
    }

    // Start tracking after a brief delay to let moveTo set state to 'walk'
    const startTimer = setTimeout(() => {
      trackingRef.current = requestAnimationFrame(trackPM);
    }, 100);

    return () => {
      clearTimeout(startTimer);
      if (trackingRef.current) {
        cancelAnimationFrame(trackingRef.current);
        trackingRef.current = null;
      }
    };
  }, [warRoomIntroActive, scene]);

  // Dialog completion
  const handleIntroComplete = useCallback(async () => {
    if (!scene) return;

    // Fog fades out
    scene.skipFog();

    // Signal backend that intro is done
    try {
      await window.office.warRoomIntroDone();
    } catch (err) {
      console.error('Failed to signal warroom intro done:', err);
    }

    // Delay cleanup to let fog fade (1200ms matches intro)
    setTimeout(() => {
      setShowDialog(false);
      setHighlights([]);
      setWarRoomIntroActive(false);
    }, 1200);
  }, [scene, setWarRoomIntroActive]);

  const handleHighlightChange = useCallback((phases: Phase[]) => {
    setHighlights(phases);
  }, []);

  return {
    warRoomIntroActive,
    showDialog,
    highlights,
    introSteps: WARROOM_INTRO_STEPS,
    handleIntroComplete,
    handleHighlightChange,
  };
}
