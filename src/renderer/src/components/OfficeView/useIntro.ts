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
    // Start fog reveal + camera zoom-out immediately (while overlay is still mounted)
    if (officeScene) {
      officeScene.skipFog();
      officeScene.getCamera().fitToScreen();
    }
    // Delay overlay unmount so the fog has time to fade visually
    setTimeout(() => {
      setIntroHighlights(null);
      setIntroChatHighlight(false);
      if (officeScene) {
        officeScene.hideCharacter('ceo');
      }
    }, 700);
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
      scene.getCamera().snapTo(72, 104, 3.5);
      scene.showCharacter('ceo');
      const ceo = scene.getCharacter('ceo');
      if (ceo) {
        const desk = ceo.getDeskTile();
        ceo.repositionTo(desk.x, desk.y);
      }
    } else {
      // No intro — remove fog immediately so it doesn't render at all
      scene.removeFog();
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
