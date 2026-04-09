import { useEffect, useRef } from 'react';
import { useOfficeStore, type CharacterInfo } from '../stores/office.store';
import { useProjectStore } from '../stores/project.store';
import { useArtifactStore } from '../stores/artifact.store';
import { useWarTableStore } from '../stores/war-table.store';
import type { OfficeScene } from './OfficeScene';
import type { AgentRole } from '../../../../shared/types';
import { audioManager } from '../audio/AudioManager';
import { useSpecProgressStore } from '../stores/spec-progress.store';

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
        if (prevInfo && prevInfo.state === info.state && prevInfo.toolName === info.toolName && prevInfo.toolTarget === info.toolTarget) {
          continue;
        }

        switch (info.state) {
          case 'typing':
            character.setWorking('type');
            if (info.toolName && info.toolTarget) {
              character.showToolBubble(info.toolName, info.toolTarget);
            }
            break;
          case 'reading':
            character.setWorking('read');
            if (info.toolName && info.toolTarget) {
              character.showToolBubble(info.toolName, info.toolTarget);
            }
            break;
          case 'idle':
            if (prevInfo && prevInfo.state !== 'idle') {
              character.setIdle();
              if (state.activeAgents.has(role as any)) {
                character.showToolBubble('', '...');
              } else {
                character.hideToolBubble();
              }
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

    function syncActiveAgents(current: Set<AgentRole>) {
      // Detect newly active agents (entered)
      for (const role of current) {
        if (!prevActive.has(role)) {
          scene!.showCharacter(role);
          audioManager.playSfx('agent-appear');
          const character = scene!.getCharacter(role);
          if (character) {
            character.moveTo(character.getDeskTile());
            const entrance = scene!.getEntrancePosition();
            const mapRenderer = scene!.getMapRenderer();
            const pos = mapRenderer.tileToPixel(entrance.x, entrance.y);
            scene!.getCamera().nudgeToward(
              pos.x + mapRenderer.tileSize / 2,
              pos.y + mapRenderer.tileSize,
            );
          }
        }
      }

      // Detect deactivated agents (closed)
      for (const role of prevActive) {
        if (!current.has(role)) {
          scene!.hideCharacter(role);
        }
      }

      prevActive.clear();
      for (const role of current) prevActive.add(role);
    }

    // Process any agents that became active before the scene was ready
    syncActiveAgents(useOfficeStore.getState().activeAgents);

    const unsub = useOfficeStore.subscribe((state) => {
      syncActiveAgents(state.activeAgents);
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

  // Sync war table visual state → PixiJS WarTable
  useEffect(() => {
    if (!scene) return;

    const warTable = scene.getWarTable();
    if (!warTable) return;

    // Sync current state immediately
    warTable.setState(useWarTableStore.getState().visualState);

    const unsub = useWarTableStore.subscribe((state, prev) => {
      if (state.visualState !== prev.visualState) {
        warTable.setState(state.visualState);
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

    // PC seats available for TL clones (spawn points in the Tiled map)
    const PC_SEATS = ['pc-1', 'pc-2', 'pc-3', 'pc-4', 'pc-5', 'pc-6'];
    const occupiedSeats = new Set<string>();
    // Maps cloneId → { seat, characterId }
    const cloneMap = new Map<string, { seat: string; characterId: string }>();

    function getNextSeat(): string | undefined {
      return PC_SEATS.find(s => !occupiedSeats.has(s));
    }

    function handleChoreography(e: Event) {
      const { step, cloneId } = (e as CustomEvent).detail;
      const mapRenderer = scene!.getMapRenderer();
      const warTable = scene!.getWarTable();
      if (!warTable) return;

      const tableTile = warTable.getTableTile();

      switch (step) {
        case 'intro-walk': {
          // Warroom intro handles PM walk and fog — choreography is managed by useWarRoomIntro
          // Show PM character so it's visible in the scene
          scene!.showCharacter('project-manager');
          useSpecProgressStore.getState().reset();
          break;
        }
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
          scene!.showCharacter('team-lead');
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
        case 'tl-coordinator-done': {
          // Coordinator TL finishes — move to desk
          const tl = scene!.getCharacter('team-lead');
          if (tl) {
            const desk = tl.getDeskTile();
            tl.moveTo(desk);
            tl.setWorking('type');
          }
          break;
        }
        case 'tl-clone-spawned': {
          if (!cloneId) break;
          const { phaseId, phaseName } = (e as CustomEvent).detail;
          const seat = getNextSeat();
          if (!seat) break;
          occupiedSeats.add(seat);
          const characterId = `tl-clone-${cloneId}`;
          cloneMap.set(cloneId, { seat, characterId });

          // Track in progress store
          if (phaseId) {
            useSpecProgressStore.getState().addPhase(phaseId, phaseName || phaseId);
          }

          const clone = scene!.createClone(characterId, 'team-lead', seat);
          if (clone) {
            const entrance = scene!.getEntrancePosition();
            clone.repositionTo(entrance.x, entrance.y);
            clone.show(scene!.getMapRenderer().getCharacterContainer());
            clone.moveTo(clone.getDeskTile());
          }
          break;
        }
        case 'tl-clone-writing': {
          if (!cloneId) break;
          const { phaseId: writingPhaseId } = (e as CustomEvent).detail;
          const writingInfo = cloneMap.get(cloneId);
          if (!writingInfo) break;

          // Settle-in delay before typing starts
          setTimeout(() => {
            const clone = scene!.getCharacter(writingInfo.characterId);
            if (clone) clone.setWorking('type');
            // Monitor glow on
            scene!.setMonitorGlow(writingInfo.seat, true);
          }, 500);

          // Update progress store
          if (writingPhaseId) {
            useSpecProgressStore.getState().setStatus(writingPhaseId, 'active');
          }
          break;
        }
        case 'tl-clone-done': {
          if (!cloneId) break;
          const { phaseId: donePhaseId } = (e as CustomEvent).detail;
          const doneInfo = cloneMap.get(cloneId);
          if (!doneInfo) break;

          // Monitor glow off
          scene!.setMonitorGlow(doneInfo.seat, false);

          // Update progress store
          if (donePhaseId) {
            useSpecProgressStore.getState().setStatus(donePhaseId, 'done');
          }

          const doneClone = scene!.getCharacter(doneInfo.characterId);
          if (doneClone) {
            doneClone.setIdle();
            // Brief pause, then walk to entrance and fade out
            setTimeout(() => {
              const entrance = scene!.getEntrancePosition();
              doneClone.walkToAndThen(entrance, () => {
                scene!.destroyClone(doneInfo.characterId);
                occupiedSeats.delete(doneInfo.seat);
                cloneMap.delete(cloneId);
              });
            }, 1000);
          } else {
            // Clone already gone — just clean up
            occupiedSeats.delete(doneInfo.seat);
            cloneMap.delete(cloneId);
          }
          break;
        }
        case 'tl-done': {
          // All clones finished — clean up any stragglers
          const tl = scene!.getCharacter('team-lead');
          if (tl) {
            tl.moveTo(tableTile);
            tl.setIdle();
          }
          for (const [, { characterId, seat }] of cloneMap) {
            scene!.destroyClone(characterId);
            occupiedSeats.delete(seat);
          }
          cloneMap.clear();

          // Hide progress strip after a brief delay
          setTimeout(() => {
            useSpecProgressStore.getState().hide();
          }, 2000);
          break;
        }
      }
    }

    window.addEventListener('war-table-choreography', handleChoreography);
    return () => window.removeEventListener('war-table-choreography', handleChoreography);
  }, [scene]);
}
