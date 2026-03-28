import { useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { useChatStore } from '../../stores/chat.store';
import { useUIStore } from '../../stores/ui.store';
import { useArtifactStore } from '../../stores/artifact.store';
import { useAgentsStore } from '../../stores/agents.store';
import { colors } from '../../theme';
import { PermissionPrompt } from '../PermissionPrompt/PermissionPrompt';
import { OfficeCanvas } from '../../office/OfficeCanvas';
import { useSceneSync } from '../../office/useSceneSync';
import type { OfficeScene } from '../../office/OfficeScene';
import { TabBar } from '../TabBar/TabBar';
import { ArtifactToolbox } from './ArtifactToolbox';
import { ArtifactOverlay } from './ArtifactOverlay';
import { PhaseTracker } from './PhaseTracker';
import { IntroSequence } from './IntroSequence';
import { ChatPanel } from './ChatPanel';
import { AgentsScreen } from '../AgentsScreen/AgentsScreen';
import { useIntro } from './useIntro';

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

  // Handle character view-details click from Pixi canvas
  useEffect(() => {
    function handleViewDetails(e: Event) {
      const { role } = (e as CustomEvent).detail;
      const { selectAgent } = useAgentsStore.getState();
      selectAgent(role);
      if (!isExpanded) toggleExpanded();
      setTimeout(() => useUIStore.getState().setActiveTab('agents'), 50);
    }
    window.addEventListener('character-view-details', handleViewDetails);
    return () => window.removeEventListener('character-view-details', handleViewDetails);
  }, [isExpanded, toggleExpanded]);

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
      `}</style>

      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <button
            onClick={() => {
              useChatStore.getState().clearMessages();
              useArtifactStore.getState().reset();
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
        <button
          onClick={() => {
            if (!isExpanded) toggleExpanded();
            setTimeout(() => useUIStore.getState().setActiveTab('agents'), 50);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 13,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'inherit',
          }}
          title="View agents"
        >
          ⊞
        </button>
        <div
          style={styles.authDot(authStatus.connected)}
          title={authStatus.connected ? `Connected${authStatus.account ? ` as ${authStatus.account}` : ''}` : 'Disconnected'}
        />
      </div>

      {/* Phase tracker */}
      <PhaseTracker highlightedPhases={introHighlights} />

      {/* Main area */}
      <div style={{ ...styles.main, position: 'relative' }}>
        {/* PixiJS canvas -- single instance, always mounted */}
        <div style={{
          ...styles.canvasArea,
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          left: isExpanded ? 0 : 340, // 320px chat panel + 20px chevron
          zIndex: 0,
          visibility: isExpanded && activeTab !== 'office' ? 'hidden' : 'visible',
        }}>
          <OfficeCanvas onSceneReady={handleSceneReady} />
          <ArtifactToolbox />
          <ArtifactOverlay />
          {showIntro && (
            <IntroSequence
              onComplete={handleIntroComplete}
              onHighlightChange={handleHighlightChange}
              onChatHighlightChange={handleChatHighlightChange}
              onStepChange={handleStepChange}
            />
          )}
        </div>

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
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Chat tab (full width) */}
              <div style={{
                ...styles.expandedChatPanel,
                display: activeTab === 'chat' ? 'flex' : 'none',
              }}>
                <ChatPanel isExpanded={true} />
              </div>

              {/* Office tab -- canvas shows through (behind this layer) */}

              {/* Agents tab */}
              <div style={{
                ...styles.expandedChatPanel,
                display: activeTab === 'agents' ? 'flex' : 'none',
              }}>
                <AgentsScreen />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Default: side-by-side layout */}
            <ChatPanel
              isExpanded={false}
              highlightClassName={introChatHighlight ? 'chat-panel-highlight' : undefined}
            />

            {/* Expand chevron */}
            <button
              style={{ ...styles.chevronButton, zIndex: 1, position: 'relative' }}
              onClick={toggleExpanded}
              title="Expand chat to full width"
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
      </div>
      <PermissionPrompt />
    </div>
  );
}
