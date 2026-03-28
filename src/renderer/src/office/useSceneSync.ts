import { useEffect, useRef } from 'react';
import { useOfficeStore, type CharacterInfo } from '../stores/office.store';
import { useProjectStore } from '../stores/project.store';
import { useArtifactStore } from '../stores/artifact.store';
import { useWarTableStore } from '../stores/war-table.store';
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

  // Sync artifact availability → interactive objects + zoom out after vision-brief
  useEffect(() => {
    if (!scene) return;

    const interactiveObjs = scene.getInteractiveObjects();
    let visionBriefWasAvailable = useArtifactStore.getState().artifacts
      .find((a) => a.key === 'vision-brief')?.available ?? false;

    // Sync current state immediately (artifacts may have been hydrated before the scene was ready)
    for (const artifact of useArtifactStore.getState().artifacts) {
      interactiveObjs.setAvailable(`artifact-${artifact.key}`, artifact.available);
    }

    // Subscribe to future changes
    const unsub = useArtifactStore.subscribe((state) => {
      for (const artifact of state.artifacts) {
        interactiveObjs.setAvailable(`artifact-${artifact.key}`, artifact.available);
      }

      // Zoom out to show full office when vision-brief first becomes available
      const vb = state.artifacts.find((a) => a.key === 'vision-brief');
      if (vb?.available && !visionBriefWasAvailable) {
        visionBriefWasAvailable = true;
        const camera = scene.getCamera();
        camera.fitToScreen();
      }
    });

    return unsub;
  }, [scene]);

  // Sync war table store → PixiJS WarTable
  useEffect(() => {
    if (!scene) return;

    const warTable = scene.getWarTable();
    if (!warTable) return;

    // Sync current state immediately
    const current = useWarTableStore.getState();
    warTable.setState(current.visualState);
    for (const m of current.milestones) warTable.addCard(m);
    for (const t of current.tasks) warTable.addCard(t);

    const unsub = useWarTableStore.subscribe((state, prev) => {
      if (state.visualState !== prev.visualState) {
        warTable.setState(state.visualState);
      }
      // Detect newly added cards
      if (state.milestones.length > prev.milestones.length) {
        const newCards = state.milestones.slice(prev.milestones.length);
        for (const card of newCards) warTable.addCard(card);
      }
      if (state.tasks.length > prev.tasks.length) {
        const newCards = state.tasks.slice(prev.tasks.length);
        for (const card of newCards) warTable.addCard(card);
      }
    });

    return unsub;
  }, [scene]);

  // Transition war table to 'persisted' when Build phase starts
  useEffect(() => {
    if (!scene) return;

    const unsub = useProjectStore.subscribe((state) => {
      const phase = state.currentPhase?.phase;
      const warTable = scene.getWarTable();
      if (!warTable) return;

      if (phase === 'build' || phase === 'complete') {
        const { visualState } = useWarTableStore.getState();
        if (visualState === 'complete') {
          useWarTableStore.getState().setVisualState('persisted');
        }
      }
    });

    return unsub;
  }, [scene]);

  // War Room agent choreography — direct PM/TL movement based on phase steps
  useEffect(() => {
    if (!scene) return;

    function handleChoreography(e: Event) {
      const { step } = (e as CustomEvent).detail;
      const mapRenderer = scene!.getMapRenderer();
      const warTable = scene!.getWarTable();
      if (!warTable) return;

      const tableTile = warTable.getTableTile();

      switch (step) {
        case 'pm-reading': {
          const pm = scene!.getCharacter('project-manager');
          if (pm) {
            // Walk PM to boardroom zone center to "read" artifacts
            const boardroom = mapRenderer.getZone('boardroom');
            if (boardroom) {
              const bx = boardroom.x + Math.floor(boardroom.width / 2);
              const by = boardroom.y + Math.floor(boardroom.height / 2);
              pm.moveTo({ x: bx, y: by });
              pm.setWorking('read');
              // Camera follows PM to boardroom first
              const camera = scene!.getCamera();
              camera.focusOnPhase('imagine'); // reuse imagine target (boardroom center)
            }
          }
          break;
        }
        case 'pm-writing': {
          const pm = scene!.getCharacter('project-manager');
          if (pm) {
            pm.moveTo(tableTile);
            pm.setWorking('type');
            // Camera follows PM to the war table
            const camera = scene!.getCamera();
            camera.focusOnPhase('warroom'); // snaps to open-work-area center
          }
          break;
        }
        case 'pm-done': {
          const pm = scene!.getCharacter('project-manager');
          if (pm) {
            // Step back a few tiles from the table
            pm.moveTo({ x: tableTile.x - 2, y: tableTile.y + 2 });
            pm.setIdle();
          }
          break;
        }
        case 'tl-reading': {
          const tl = scene!.getCharacter('team-lead');
          if (tl) {
            tl.moveTo(tableTile);
            tl.setWorking('read');
          }
          break;
        }
        case 'tl-writing': {
          const tl = scene!.getCharacter('team-lead');
          if (tl) {
            tl.setWorking('type');
          }
          break;
        }
        case 'tl-done': {
          const tl = scene!.getCharacter('team-lead');
          if (tl) {
            const desk = tl.getDeskTile();
            tl.moveTo(desk);
            tl.setIdle();
          }
          break;
        }
      }
    }

    window.addEventListener('war-table-choreography', handleChoreography);
    return () => window.removeEventListener('war-table-choreography', handleChoreography);
  }, [scene]);
}
