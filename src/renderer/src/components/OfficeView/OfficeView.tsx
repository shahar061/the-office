import { useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { useChatStore } from '../../stores/chat.store';
import { useArtifactStore } from '../../stores/artifact.store';
import { useOfficeStore } from '../../stores/office.store';
import { useAgentsStore } from '../../stores/agents.store';
import { colors } from '../../theme';
import { PermissionPrompt } from '../PermissionPrompt/PermissionPrompt';
import { useSceneSync } from '../../office/useSceneSync';
import type { OfficeScene } from '../../office/OfficeScene';
import { audioManager } from '../../audio/AudioManager';
import { useAudioStore } from '../../stores/audio.store';
import { PhaseTracker } from './PhaseTracker';
import { IntroSequence } from './IntroSequence';
import { useIntro, CEO_INTRO_STEPS } from './useIntro';
import { useWarRoomIntro, WARROOM_SPEAKER, WARROOM_SPEAKER_COLOR } from './useWarRoomIntro';
import { useWarTableStore } from '../../stores/war-table.store';
import { IconRail } from '../IconRail/IconRail';
import { useLogStore } from '../../stores/log.store';
import { SplitLayout } from '../SplitLayout/PaneRenderer';
import { useLayoutStore } from '../../stores/layout.store';
import { findLeafByPanelId } from '../SplitLayout/layout-utils';
import { useCharStream } from '../../hooks/useCharStream';
import { useMobileBridgeStore } from '../../stores/mobile-bridge.store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function phaseLabel(phase: string | undefined, status: string | undefined): string {
  if (!phase || phase === 'idle') return 'idle';
  return `${phase}${status ? ` — ${status}` : ''}`;
}

function authDotColor(connected: boolean): string {
  return connected ? colors.success : colors.error;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: colors.bg,
    color: colors.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '40px',
    minHeight: '40px',
    padding: '0 16px',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.bgDark,
    flexShrink: 0,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  projectName: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textLight,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
  },
  phaseIndicator: {
    fontSize: '11px',
    color: colors.textDim,
    whiteSpace: 'nowrap' as const,
  },
  authDot: (connected: boolean) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: authDotColor(connected),
    flexShrink: 0,
  }),
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function OfficeView() {
  const { authStatus, projectState, currentPhase } = useProjectStore();

  const phase = projectState?.currentPhase ?? 'idle';
  const projectName = projectState?.name ?? 'No project';
  const phaseText = phaseLabel(phase, currentPhase?.status);

  const {
    showIntro,
    introHighlights,
    introChatHighlight,
    officeScene,
    handleIntroComplete,
    handleHighlightChange,
    handleChatHighlightChange,
    handleStepChange,
    setupIntroScene,
  } = useIntro(projectState, phase);

  const {
    warRoomIntroActive: showWarRoomIntro,
    showDialog: showWarRoomDialog,
    highlights: warRoomHighlights,
    introSteps: warRoomSteps,
    handleIntroComplete: handleWarRoomIntroComplete,
    handleHighlightChange: handleWarRoomHighlightChange,
  } = useWarRoomIntro(officeScene);

  // Keep a stable ref to the current scene so useCharStream's interval
  // closure always reads the live value without re-starting on each render.
  const sceneRef = useRef<OfficeScene | null>(null);
  useEffect(() => { sceneRef.current = officeScene; }, [officeScene]);

  const mobileConnectedCount = useMobileBridgeStore(
    (s) => s.status?.connectedDevices ?? 0,
  );
  useCharStream(sceneRef, mobileConnectedCount);

  const handleSceneReady = useCallback((scene: OfficeScene) => {
    setupIntroScene(scene);
  }, [setupIntroScene]);

  useSceneSync(officeScene);

  // Handle artifact clicks from Pixi canvas
  useEffect(() => {
    async function handleArtifactClick(e: Event) {
      const key = (e as CustomEvent).detail.key;
      const artifacts = useArtifactStore.getState().artifacts;
      const artifact = artifacts.find((a: any) => a.key === key);
      if (!artifact?.available) return;

      const { openArtifact, openDocument, closeDocument } = useArtifactStore.getState();
      if (openArtifact?.key === key) {
        closeDocument();
        return;
      }

      const result = await window.office.readArtifact(artifact.filename);
      if ('content' in result) {
        openDocument(key, result.content);
      }
    }

    window.addEventListener('artifact-click', handleArtifactClick);
    return () => window.removeEventListener('artifact-click', handleArtifactClick);
  }, []);

  // Handle war table clicks from Pixi canvas
  useEffect(() => {
    async function handleWarTableClick() {
      const { visualState, reviewContent, reviewArtifact } = useWarTableStore.getState();
      if (visualState === 'review' || visualState === 'complete' || visualState === 'persisted') {
        if (reviewContent) {
          useWarTableStore.getState().setReviewContent(reviewContent, reviewArtifact ?? 'plan');
        } else {
          // Read plan.md fresh if no content cached
          const result = await window.office.readArtifact('plan.md');
          if ('content' in result) {
            useWarTableStore.getState().setReviewContent(result.content, 'plan');
          }
        }
      }
    }
    window.addEventListener('war-table-click', handleWarTableClick);
    return () => window.removeEventListener('war-table-click', handleWarTableClick);
  }, []);

  // Handle phase restart — clear renderer stores and re-sync from backend
  useEffect(() => {
    const cleanup = window.office.onPhaseRestart(async (_targetPhase: string) => {
      useWarTableStore.getState().reset();
      useChatStore.getState().clearMessages();
      useOfficeStore.getState().reset();
      useArtifactStore.getState().reset();
      // Re-fetch cleaned project state from backend (updated completedPhases)
      const freshState = await window.office.getProjectState();
      useProjectStore.getState().setProjectState(freshState);
      // Re-hydrate artifacts from disk (imagine artifacts may still exist)
      const status = await window.office.getArtifactStatus();
      useArtifactStore.getState().hydrateFromStatus(status);
    });
    return cleanup;
  }, []);

  // Hydrate audio prefs from AppSettings, then auto-play music and preload SFX
  useEffect(() => {
    useAudioStore.getState().hydrate().then(() => {
      const { musicMuted } = useAudioStore.getState();
      if (!musicMuted) {
        audioManager.playMusic();
      }
      audioManager.preloadSfx();
    });
  }, []);

  // Feed log store from agent events
  useEffect(() => {
    const unsub = window.office.onAgentEvent((event) => {
      useLogStore.getState().logAgentEvent(event);
    });
    return unsub;
  }, []);

  // Feed log store from chat messages (user messages only — agent messages logged via agent events)
  useEffect(() => {
    const unsub = window.office.onChatMessage((msg) => {
      if (msg.role === 'user') {
        useLogStore.getState().logMessage('user', msg.text);
      }
    });
    return unsub;
  }, []);

  // Log phase transitions
  useEffect(() => {
    if (phase && phase !== 'idle') {
      useLogStore.getState().logPhaseTransition(phase);
    }
  }, [phase]);

  // Flush logs on phase transitions
  useEffect(() => {
    const unsub = window.office.onPhaseChange(async () => {
      const logText = useLogStore.getState().serializeUnflushed();
      if (logText) {
        await window.office.flushLogs(logText);
        useLogStore.getState().markFlushed();
      }
    });
    return unsub;
  }, []);

  // Flush logs on app closing
  useEffect(() => {
    const handler = () => {
      const logText = useLogStore.getState().serializeUnflushed();
      if (logText) {
        window.office.flushLogs(logText);
        useLogStore.getState().markFlushed();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Handle character view-details click from Pixi canvas
  useEffect(() => {
    function handleViewDetails(e: Event) {
      const { role } = (e as CustomEvent).detail;
      const { selectAgent } = useAgentsStore.getState();
      selectAgent(role);
      // Focus the agents pane if it exists
      const tree = useLayoutStore.getState().tree;
      const agentsLeaf = findLeafByPanelId(tree, 'agents');
      if (agentsLeaf) {
        useLayoutStore.getState().setFocusedPane(agentsLeaf.id);
      }
    }
    window.addEventListener('character-view-details', handleViewDetails);
    return () => window.removeEventListener('character-view-details', handleViewDetails);
  }, []);

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-left-color: var(--accent-color); }
          50% { border-left-color: rgba(255,255,255,0.1); }
        }
        .bubble-waiting {
          animation: pulse-border 1.5s ease-in-out infinite;
        }
        @keyframes phase-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
        }
        .phase-pulse {
          animation: phase-pulse 2s ease-in-out infinite;
        }
        @keyframes chat-panel-pulse {
          0%, 100% {
            box-shadow: inset 0 0 20px rgba(59,130,246,0.1), 0 0 8px rgba(59,130,246,0.15);
            border-right-color: rgba(59,130,246,0.3);
          }
          50% {
            box-shadow: inset 0 0 30px rgba(59,130,246,0.25), 0 0 20px rgba(59,130,246,0.35);
            border-right-color: rgba(59,130,246,0.7);
          }
        }
        .chat-panel-highlight {
          animation: chat-panel-pulse 1.5s ease-in-out infinite;
          border-right: 2px solid rgba(59,130,246,0.3) !important;
        }
        @keyframes blink-indicator {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .blink-indicator {
          animation: blink-indicator 1s step-end infinite;
        }
        @keyframes activity-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes icon-rail-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes icon-rail-ping {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.8); opacity: 0; }
        }
      `}</style>

      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <button
            onClick={async () => {
              const logText = useLogStore.getState().serializeUnflushed();
              if (logText) {
                await window.office.flushLogs(logText);
                useLogStore.getState().markFlushed();
              }
              useLogStore.getState().reset();
              useChatStore.getState().clearMessages();
              useArtifactStore.getState().reset();
              useWarTableStore.getState().reset();
              // Flip main-process scope to inactive so the mobile bridge broadcasts a
              // Lobby snapshot; the renderer transition to the picker happens after
              // the IPC acks so state is consistent when the picker mounts.
              await window.office.closeProject();
              useProjectStore.getState().setProjectState(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 8px 0 0',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Back to project picker"
          >
            ←
          </button>
          <span style={styles.projectName} title={projectName}>
            {projectName}
          </span>
          <span style={styles.phaseIndicator}>{phaseText}</span>
        </div>
        <div
          style={styles.authDot(authStatus.connected)}
          title={authStatus.connected ? `Connected${authStatus.account ? ` as ${authStatus.account}` : ''}` : 'Disconnected'}
        />
      </div>

      {/* Phase tracker */}
      <PhaseTracker highlightedPhases={introHighlights ?? (showWarRoomIntro ? warRoomHighlights : null)} />

      {/* Main area */}
      <div style={{ ...styles.main, position: 'relative' }}>
        <IconRail />
        <SplitLayout onSceneReady={handleSceneReady} />
        {showIntro && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'auto', left: '40px' }}>
            <IntroSequence
              steps={CEO_INTRO_STEPS}
              speaker="CEO"
              onComplete={handleIntroComplete}
              onHighlightChange={handleHighlightChange}
              onChatHighlightChange={handleChatHighlightChange}
              onStepChange={handleStepChange}
            />
          </div>
        )}
        {showWarRoomIntro && showWarRoomDialog && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'auto', left: '40px' }}>
            <IntroSequence
              steps={warRoomSteps}
              speaker={WARROOM_SPEAKER}
              speakerColor={WARROOM_SPEAKER_COLOR}
              onComplete={handleWarRoomIntroComplete}
              onHighlightChange={handleWarRoomHighlightChange}
              onChatHighlightChange={() => {}}
              onStepChange={() => {}}
            />
          </div>
        )}
      </div>
      <PermissionPrompt />
    </div>
  );
}
