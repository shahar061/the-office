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
    setIntroHighlights(null);
    setIntroChatHighlight(false);
    // Hide CEO character and reset camera
    if (officeScene) {
      officeScene.hideCharacter('ceo');
      officeScene.getCamera().fitToScreen();
    }
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

  const setupIntroScene = useCallback((scene: OfficeScene) => {
    setOfficeScene(scene);
    // Set up intro camera/CEO immediately when scene is ready (don't wait for useEffect re-render)
    if (showIntroRef.current) {
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
    setupIntroScene,
  };
}
