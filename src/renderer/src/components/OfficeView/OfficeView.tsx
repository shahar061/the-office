import { useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { useChatStore } from '../../stores/chat.store';
import { useUIStore } from '../../stores/ui.store';
import { useArtifactStore } from '../../stores/artifact.store';
import { useOfficeStore } from '../../stores/office.store';
import { useAgentsStore } from '../../stores/agents.store';
import { colors } from '../../theme';
import { PermissionPrompt } from '../PermissionPrompt/PermissionPrompt';
import { OfficeCanvas } from '../../office/OfficeCanvas';
import { useSceneSync } from '../../office/useSceneSync';
import type { OfficeScene } from '../../office/OfficeScene';
import { ArtifactToolbox } from './ArtifactToolbox';
import { AudioControls } from './AudioControls';
import { ArtifactOverlay } from './ArtifactOverlay';
import { PlanOverlay } from './PlanOverlay';
import { audioManager } from '../../audio/AudioManager';
import { useAudioStore } from '../../stores/audio.store';
import { PhaseTracker } from './PhaseTracker';
import { IntroSequence } from './IntroSequence';
import { ChatPanel } from './ChatPanel';
import { AgentsScreen } from '../AgentsScreen/AgentsScreen';
import { useIntro, CEO_INTRO_STEPS } from './useIntro';
import { useWarRoomIntro, WARROOM_SPEAKER, WARROOM_SPEAKER_COLOR } from './useWarRoomIntro';
import { useWarTableStore } from '../../stores/war-table.store';
import { IconRail } from '../IconRail/IconRail';
import { LogViewer } from '../LogViewer/LogViewer';
import { AboutPanel } from '../AboutPanel/AboutPanel';
import { useLogStore } from '../../stores/log.store';
import { KanbanBoard } from '../KanbanBoard/KanbanBoard';
import { StatsPanel } from '../StatsPanel/StatsPanel';

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
  canvasArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a15',
    color: '#334155',
    fontSize: '13px',
    fontStyle: 'italic',
    userSelect: 'none' as const,
  },
  chevronButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    background: colors.surface,
    border: 'none',
    borderLeft: `1px solid ${colors.border}`,
    borderRight: `1px solid ${colors.border}`,
    color: '#666',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
    transition: 'background 0.15s, color 0.15s',
    fontFamily: 'inherit',
  },
  expandedContent: {
    position: 'relative' as const,
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  expandedChatPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    background: colors.bg,
    overflow: 'hidden',
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function OfficeView() {
  const { authStatus, projectState, currentPhase } = useProjectStore();
  const { isExpanded, activeTab, toggleExpanded, setActiveTab } = useUIStore();

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

  // Auto-play music on mount, preload SFX
  useEffect(() => {
    const { musicMuted } = useAudioStore.getState();
    if (!musicMuted) {
      audioManager.playMusic();
    }
    audioManager.preloadSfx();
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

  // Clear unread when switching to logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      useLogStore.getState().clearUnread();
    }
  }, [activeTab]);

  // Handle character view-details click from Pixi canvas
  useEffect(() => {
    function handleViewDetails(e: Event) {
      const { role } = (e as CustomEvent).detail;
      const { selectAgent } = useAgentsStore.getState();
      selectAgent(role);
      useUIStore.getState().setActiveTab('agents');
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
        {/* Icon Rail — always visible */}
        <IconRail activeTab={activeTab} onTabChange={setActiveTab} />

        {/* PixiJS canvas -- single instance, always mounted */}
        <div style={{
          ...styles.canvasArea,
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          left: activeTab === 'office'
            ? 40
            : isExpanded
              ? 40
              : 380,
          zIndex: 0,
          visibility: isExpanded && activeTab !== 'office' ? 'hidden' : 'visible',
        }}>
          <OfficeCanvas onSceneReady={handleSceneReady} />
          <ArtifactToolbox />
          <AudioControls />
          <ArtifactOverlay />
          <PlanOverlay />
          {showIntro && (
            <IntroSequence
              steps={CEO_INTRO_STEPS}
              speaker="CEO"
              onComplete={handleIntroComplete}
              onHighlightChange={handleHighlightChange}
              onChatHighlightChange={handleChatHighlightChange}
              onStepChange={handleStepChange}
            />
          )}
          {showWarRoomIntro && showWarRoomDialog && (
            <IntroSequence
              steps={warRoomSteps}
              speaker={WARROOM_SPEAKER}
              speakerColor={WARROOM_SPEAKER_COLOR}
              onComplete={handleWarRoomIntroComplete}
              onHighlightChange={handleWarRoomHighlightChange}
              onChatHighlightChange={() => {}}
              onStepChange={() => {}}
            />
          )}
        </div>

        {activeTab !== 'office' && (
          <>
            {isExpanded ? (
              <>
                {/* Collapse chevron */}
                <button
                  style={{ ...styles.chevronButton, zIndex: 2, position: 'relative' }}
                  onClick={toggleExpanded}
                  title="Collapse to side-by-side"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2a2a4a';
                    e.currentTarget.style.color = '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.surface;
                    e.currentTarget.style.color = '#666';
                  }}
                >
                  ‹
                </button>

                {/* Expanded content area */}
                <div style={{ ...styles.expandedContent, zIndex: 1 }}>
                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'chat' ? 'flex' : 'none',
                  }}>
                    <ChatPanel isExpanded={true} />
                  </div>

                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'agents' ? 'flex' : 'none',
                  }}>
                    <AgentsScreen />
                  </div>

                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'logs' ? 'flex' : 'none',
                  }}>
                    <LogViewer />
                  </div>

                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'about' ? 'flex' : 'none',
                  }}>
                    <AboutPanel />
                  </div>

                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'kanban' ? 'flex' : 'none',
                  }}>
                    <KanbanBoard />
                  </div>

                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'stats' ? 'flex' : 'none',
                  }}>
                    <StatsPanel />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Collapsed: show active panel in 320px */}
                <div style={{
                  display: activeTab === 'chat' ? 'flex' : 'none',
                  flexDirection: 'column' as const,
                  width: '320px',
                  minWidth: '320px',
                  zIndex: 1,
                  position: 'relative' as const,
                }}>
                  <ChatPanel
                    isExpanded={false}
                    highlightClassName={introChatHighlight ? 'chat-panel-highlight' : undefined}
                  />
                </div>

                <div style={{
                  display: activeTab === 'agents' ? 'flex' : 'none',
                  flexDirection: 'column' as const,
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative' as const,
                }}>
                  <AgentsScreen />
                </div>

                <div style={{
                  display: activeTab === 'logs' ? 'flex' : 'none',
                  flexDirection: 'column' as const,
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative' as const,
                }}>
                  <LogViewer />
                </div>

                <div style={{
                  display: activeTab === 'about' ? 'flex' : 'none',
                  flexDirection: 'column' as const,
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative' as const,
                }}>
                  <AboutPanel />
                </div>

                <div style={{
                  display: activeTab === 'kanban' ? 'flex' : 'none',
                  flexDirection: 'column' as const,
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative' as const,
                }}>
                  <KanbanBoard />
                </div>

                <div style={{
                  display: activeTab === 'stats' ? 'flex' : 'none',
                  flexDirection: 'column' as const,
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative' as const,
                }}>
                  <StatsPanel />
                </div>

                {/* Expand chevron */}
                <button
                  style={{ ...styles.chevronButton, zIndex: 1, position: 'relative' }}
                  onClick={toggleExpanded}
                  title="Expand to full width"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2a2a4a';
                    e.currentTarget.style.color = '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.surface;
                    e.currentTarget.style.color = '#666';
                  }}
                >
                  ›
                </button>
              </>
            )}
          </>
        )}
      </div>
      <PermissionPrompt />
    </div>
  );
}
