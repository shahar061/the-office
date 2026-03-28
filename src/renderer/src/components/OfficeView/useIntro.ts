import { useState, useCallback, useRef, useEffect } from 'react';
import type { Phase, ProjectState } from '@shared/types';
import { useProjectStore } from '../../stores/project.store';
import type { OfficeScene } from '../../office/OfficeScene';

export function useIntro(projectState: ProjectState | null, phase: string) {
  const [introHighlights, setIntroHighlights] = useState<Phase[] | null>(
    projectState && !projectState.introSeen && phase === 'idle' ? [] : null,
  );

  const [introChatHighlight, setIntroChatHighlight] = useState(false);
  const [officeScene, setOfficeScene] = useState<OfficeScene | null>(null);

  const showIntro =
    phase === 'idle' &&
    projectState !== null &&
    !projectState.introSeen &&
    introHighlights !== null;

  const showIntroRef = useRef(showIntro);
  showIntroRef.current = showIntro;

  const handleIntroComplete = useCallback(async () => {
    if (officeScene) {
      // Snap camera wide so the full office is visible behind the fading fog
      const mr = officeScene.getMapRenderer();
      const cx = (mr.width * mr.tileSize) / 2;
      const cy = (mr.height * mr.tileSize) / 2;
      officeScene.getCamera().snapTo(cx, cy, 1);
      officeScene.getCamera().fitToScreen();
      officeScene.skipFog();
    }
    // Delay overlay unmount + cleanup so the fog has time to fade
    setTimeout(() => {
      setIntroHighlights(null);
      setIntroChatHighlight(false);
      if (officeScene) {
        officeScene.hideCharacter('ceo');
      }
    }, 1200);
    try {
      await window.office.markIntroSeen();
      if (projectState) {
        useProjectStore.getState().setProjectState({ ...projectState, introSeen: true });
      }
    } catch (err) {
      console.error('Failed to mark intro seen:', err);
    }
  }, [projectState, officeScene]);

  const handleHighlightChange = useCallback((phases: Phase[]) => {
    setIntroHighlights(phases);
  }, []);

  const handleChatHighlightChange = useCallback((highlight: boolean) => {
    setIntroChatHighlight(highlight);
  }, []);

  const handleStepChange = useCallback((step: number) => {
    if (!officeScene) return;
    officeScene.setFogStep(step);
  }, [officeScene]);

  const setupIntroScene = useCallback((scene: OfficeScene) => {
    setOfficeScene(scene);
    if (showIntroRef.current) {
      // Create fog only for the scene we're actively using for the intro
      scene.createFog();
      scene.getCamera().snapTo(72, 104, 3.5);
      scene.showCharacter('ceo');
      const ceo = scene.getCharacter('ceo');
      if (ceo) {
        const desk = ceo.getDeskTile();
        ceo.repositionTo(desk.x, desk.y);
      }
    }
  }, []);

  // Focus camera on CEO room and show CEO character during intro
  useEffect(() => {
    if (!showIntro || !officeScene) return;
    const camera = officeScene.getCamera();
    // Snap immediately to CEO room (no slow LERP) so the first frame is correct
    camera.snapTo(72, 104, 3.5);
    // Show CEO at their desk (showCharacter places at entrance, so reposition to desk)
    officeScene.showCharacter('ceo');
    const ceo = officeScene.getCharacter('ceo');
    if (ceo) {
      const desk = ceo.getDeskTile();
      ceo.repositionTo(desk.x, desk.y);
    }
  }, [showIntro, officeScene]);

  return {
    showIntro,
    introHighlights,
    introChatHighlight,
    officeScene,
    handleIntroComplete,
    handleHighlightChange,
    handleChatHighlightChange,
    handleStepChange,
    setupIntroScene,
  };
}
