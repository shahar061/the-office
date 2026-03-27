import { useRef, useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { useChatStore } from '../../stores/chat.store';
import type { ArchivedRun } from '../../stores/chat.store';
import { AGENT_COLORS } from '@shared/types';
import type { AgentRole, ChatMessage, Phase } from '@shared/types';
import { PermissionPrompt } from '../PermissionPrompt/PermissionPrompt';
import { OfficeCanvas } from '../../office/OfficeCanvas';
import { useSceneSync } from '../../office/useSceneSync';
import type { OfficeScene } from '../../office/OfficeScene';
import { useUIStore } from '../../stores/ui.store';
import { TabBar } from '../TabBar/TabBar';
import { MessageRenderer } from './MessageRenderer';
import { ArtifactToolbox } from './ArtifactToolbox';
import { ArtifactOverlay } from './ArtifactOverlay';
import { PhaseTracker } from './PhaseTracker';
import { IntroSequence } from './IntroSequence';
import { useArtifactStore } from '../../stores/artifact.store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function phaseLabel(phase: string | undefined, status: string | undefined): string {
  if (!phase || phase === 'idle') return 'idle';
  return `${phase}${status ? ` — ${status}` : ''}`;
}

function authDotColor(connected: boolean): string {
  return connected ? '#22c55e' : '#ef4444';
}

function agentDisplayName(role: AgentRole): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: '#0f0f1a',
    color: '#e2e8f0',
    fontFamily: "'Inter', system-ui, sans-serif",
    overflow: 'hidden',
  },

  // Top bar
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '40px',
    minHeight: '40px',
    padding: '0 16px',
    borderBottom: '1px solid #333',
    background: '#0d0d1a',
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
    color: '#cbd5e1',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
  },
  phaseIndicator: {
    fontSize: '11px',
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
  },
  authDot: (connected: boolean) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: authDotColor(connected),
    flexShrink: 0,
  }),

  // Main area
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },

  // Chat panel
  chatPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '320px',
    minWidth: '320px',
    borderRight: '1px solid #333',
    background: '#0f0f1a',
    overflow: 'hidden',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 12px 6px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  messageSender: (color: string) => ({
    display: 'block',
    fontSize: '10px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  }),
  // Chat bubble styles
  messageBubble: (role: 'user' | 'agent' | 'system', accentColor: string) => ({
    padding: '10px 12px',
    borderRadius: '8px',
    borderLeft: `3px solid ${accentColor}`,
    background: role === 'user' ? '#1a2a3a' : role === 'system' ? '#1a1a1a' : '#1a1a2e',
    marginBottom: '0px', // gap handled by parent flex gap
  }),
  messageTimestamp: {
    fontSize: '10px',
    color: '#666',
    textAlign: 'right' as const,
    marginTop: '4px',
  },

  // Empty state
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: '#475569',
    padding: '24px',
    textAlign: 'center' as const,
  },
  emptyTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#64748b',
  },
  emptySubtitle: {
    fontSize: '11px',
    color: '#475569',
    lineHeight: 1.5,
  },

  // Input area
  inputArea: {
    padding: '8px 12px 12px',
    borderTop: '1px solid #333',
    flexShrink: 0,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  inputField: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '8px 10px',
    resize: 'none' as const,
    fontFamily: 'inherit',
    lineHeight: 1.4,
  },
  sendButton: (enabled: boolean) => ({
    background: 'transparent',
    border: 'none',
    outline: 'none',
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? '#6366f1' : '#334155',
    padding: '8px 10px',
    fontSize: '16px',
    lineHeight: 1,
    flexShrink: 0,
    transition: 'color 0.15s',
  }),

  // Canvas placeholder
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

  // Chevron toggle button
  chevronButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    background: '#1a1a2e',
    border: 'none',
    borderLeft: '1px solid #333',
    borderRight: '1px solid #333',
    color: '#666',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
    transition: 'background 0.15s, color 0.15s',
    fontFamily: 'inherit',
  },

  // Question bubble styles
  questionBubble: (accentColor: string) => ({
    background: '#151528',
    borderRadius: '8px',
    padding: '12px',
    border: `1px solid ${accentColor}44`,
    borderLeft: `3px solid ${accentColor}`,
  }),
  questionText: (isExpanded: boolean) => ({
    fontSize: isExpanded ? '13px' : '11px',
    color: '#e2e8f0',
    fontWeight: 600,
    marginBottom: '10px',
  }),
  questionOption: (isExpanded: boolean) => ({
    padding: isExpanded ? '10px 14px' : '8px 12px',
    fontSize: isExpanded ? '12px' : '11px',
    background: '#1a1a3e',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#cbd5e1',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }),
  questionOptionsGrid: (isExpanded: boolean) => ({
    display: isExpanded ? 'grid' : 'flex',
    gridTemplateColumns: isExpanded ? '1fr 1fr' : undefined,
    flexDirection: isExpanded ? undefined : 'column' as const,
    gap: '6px',
  }),
  questionHint: (accentColor: string) => ({
    fontSize: '10px',
    color: accentColor,
    fontStyle: 'italic',
    marginTop: '8px',
  }),

  // Expanded question card styles
  expandedQuestionCard: (isRecommended: boolean, accentColor: string) => ({
    padding: '14px 16px',
    background: isRecommended ? '#1a1a2e' : '#151528',
    border: isRecommended ? `1px solid ${accentColor}88` : '1px solid #333',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    transition: 'border-color 0.15s',
  }),
  expandedCardLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  expandedCardDescription: {
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  expandedCardTradeoffs: {
    fontSize: '11px',
    color: '#64748b',
    lineHeight: 1.4,
    fontStyle: 'italic' as const,
  },
  expandedCardBadge: (accentColor: string) => ({
    display: 'inline-block',
    fontSize: '9px',
    fontWeight: 700,
    color: accentColor,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '2px',
  }),

  // Expanded mode: full-width content area
  expandedContent: {
    position: 'relative' as const,
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  // Expanded chat panel (full width)
  expandedChatPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    background: '#0f0f1a',
    overflow: 'hidden',
  },
  // Expanded input row capped at 720px
  expandedInputRow: {
    display: 'flex',
    alignItems: 'center',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden',
    maxWidth: '720px',
    margin: '0 auto',
    width: '100%',
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function OfficeView() {
  const { authStatus, projectState, currentPhase } = useProjectStore();
  const { messages, addMessage, archivedRuns, loadHistory, waitingForResponse, waitingAgentRole, waitingSessionId, waitingQuestions, setWaiting } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [officeScene, setOfficeScene] = useState<OfficeScene | null>(null);
  const [expandedArchived, setExpandedArchived] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { isExpanded, activeTab, toggleExpanded, setActiveTab } = useUIStore();

  const phase = projectState?.currentPhase ?? 'idle';
  const isIdle = phase === 'idle';

  const [introHighlights, setIntroHighlights] = useState<Phase[] | null>(
    projectState && !projectState.introSeen && phase === 'idle' ? [] : null,
  );

  const showIntro = phase === 'idle' && projectState !== null && !projectState.introSeen && introHighlights !== null;

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

  const [introChatHighlight, setIntroChatHighlight] = useState(false);

  const handleChatHighlightChange = useCallback((highlight: boolean) => {
    setIntroChatHighlight(highlight);
  }, []);

  // Focus camera on CEO room and show CEO character during intro
  useEffect(() => {
    if (!showIntro || !officeScene) return;
    const camera = officeScene.getCamera();
    // CEO room center: zone at (16,32) size 112x144 → center pixel (72, 104)
    camera.panTo(72, 104);
    camera.setZoom(2.5);
    // Show CEO at their desk (showCharacter places at entrance, so reposition to desk)
    officeScene.showCharacter('ceo');
    const ceo = officeScene.getCharacter('ceo');
    if (ceo) {
      const desk = ceo.getDeskTile();
      ceo.repositionTo(desk.x, desk.y);
    }
  }, [showIntro, officeScene]);

  useEffect(() => {
    const unsub = window.office.onAgentWaiting((payload) => {
      setWaiting(payload);
    });
    return unsub;
  }, []);

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

  // Bridge store → PixiJS scene
  useSceneSync(officeScene);

  // Load chat history when returning to a project with existing phases
  useEffect(() => {
    if (!projectState || projectState.currentPhase === 'idle') return;

    let cancelled = false;
    window.office.getChatHistory(projectState.currentPhase).then((history) => {
      if (!cancelled && history.length > 0) {
        loadHistory(history);
      }
    });

    return () => { cancelled = true; };
  }, [projectState?.path, projectState?.currentPhase]);

  const handleSceneReady = useCallback((scene: OfficeScene) => {
    setOfficeScene(scene);
  }, []);

  const inputPlaceholder = waitingForResponse && waitingAgentRole
    ? `Responding to ${agentDisplayName(waitingAgentRole)}...`
    : isIdle
      ? 'What would you like to build?'
      : 'Type a message...';

  const canSend = inputValue.trim().length > 0;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = inputValue.trim();
    if (!text) return;

    setInputValue('');

    // If answering a question, inject the question as an agent message first
    if (waitingForResponse && waitingSessionId) {
      if (waitingQuestions.length > 0) {
        const questionMsg: ChatMessage = {
          id: `question-${Date.now()}`,
          role: 'agent',
          agentRole: waitingAgentRole ?? undefined,
          text: waitingQuestions[0].question,
          timestamp: Date.now(),
        };
        addMessage(questionMsg);
      }

      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        text,
        timestamp: Date.now(),
      });

      const answers: Record<string, string> = {};
      if (waitingQuestions.length > 0) {
        answers[waitingQuestions[0].question] = text;
      }
      await window.office.respondToAgent(waitingSessionId, answers);
      setWaiting(null);
      return;
    }

    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    });

    if (isIdle) {
      await window.office.startImagine(text);
    } else {
      await window.office.sendMessage(text);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const projectName = projectState?.name ?? 'No project';
  const phaseStatus = currentPhase?.status;
  const phaseText = phaseLabel(phase, phaseStatus);

  const showEmpty = messages.length === 0 && archivedRuns.length === 0;

  function toggleArchived(key: string) {
    setExpandedArchived(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderArchivedRuns() {
    if (archivedRuns.length === 0) return null;

    return (
      <>
        {archivedRuns.map((run) => {
          const key = `${run.agentRole}-${run.runNumber}`;
          const isOpen = expandedArchived.has(key);
          const msgCount = run.messages.length;
          const dateStr = new Date(run.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
          const color = run.agentRole ? AGENT_COLORS[run.agentRole] ?? '#94a3b8' : '#94a3b8';

          return (
            <div key={key}>
              <button
                onClick={() => toggleArchived(key)}
                style={{
                  background: '#111122',
                  border: '1px solid #2a2a3a',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  width: '100%',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ color: '#666' }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ color, fontWeight: 600 }}>
                  Run {run.runNumber} — {agentDisplayName(run.agentRole)}
                </span>
                <span style={{ color: '#555' }}>
                  ({msgCount} message{msgCount !== 1 ? 's' : ''}, {dateStr})
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.7 }}>
                  {run.messages.map((msg) => renderMessage(msg, false))}
                </div>
              )}
            </div>
          );
        })}
        <div style={{
          borderBottom: '1px solid #333',
          margin: '4px 0',
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute',
            top: '-8px',
            left: '12px',
            background: '#0f0f1a',
            padding: '0 8px',
            fontSize: '10px',
            color: '#555',
          }}>
            Current
          </span>
        </div>
      </>
    );
  }

  function renderMessage(msg: ChatMessage, isLast: boolean = false) {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    const senderLabel = isUser
      ? 'You'
      : isSystem
        ? 'System'
        : msg.agentRole
          ? agentDisplayName(msg.agentRole)
          : 'Agent';
    const accentColor = isUser
      ? '#3b82f6'
      : isSystem
        ? '#666'
        : msg.agentRole
          ? AGENT_COLORS[msg.agentRole]
          : '#94a3b8';
    const senderColor = isUser
      ? '#3b82f6'
      : isSystem
        ? '#999'
        : msg.agentRole
          ? AGENT_COLORS[msg.agentRole]
          : '#94a3b8';

    const isWaiting = isLast && waitingForResponse;
    const hasQuestionBubble = isWaiting && waitingQuestions.length > 0 && waitingQuestions[0].options.length > 0;

    return (
      <div
        key={msg.id}
        className={isWaiting && !hasQuestionBubble ? 'bubble-waiting' : undefined}
        style={{
          ...styles.messageBubble(msg.role, accentColor),
          ...(isWaiting && !hasQuestionBubble ? { '--accent-color': accentColor } as React.CSSProperties : {}),
        }}
      >
        <span style={styles.messageSender(senderColor)}>
          {senderLabel}
        </span>
        <MessageRenderer text={msg.text} role={msg.role} />
        <div style={styles.messageTimestamp}>{formatTime(msg.timestamp)}</div>
        {isWaiting && !hasQuestionBubble && (
          <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginTop: '6px' }}>
            Awaiting your response
          </div>
        )}
      </div>
    );
  }

  function renderQuestionBubble() {
    if (!waitingForResponse || waitingQuestions.length === 0 || waitingQuestions[0].options.length === 0) {
      return null;
    }

    const question = waitingQuestions[0];
    const accentColor = waitingAgentRole ? AGENT_COLORS[waitingAgentRole] : '#94a3b8';

    return (
      <div
        className="bubble-waiting"
        style={{
          ...styles.questionBubble(accentColor),
          '--accent-color': accentColor,
        } as React.CSSProperties}
      >
        <div style={styles.questionText(isExpanded)}>
          {question.question}
        </div>

        {isExpanded ? (
          /* Expanded mode: rich cards with description, tradeoffs, recommendation */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {question.options.map((opt) => {
              const isRecommended = question.recommendation === opt.label;
              return (
                <button
                  key={opt.label}
                  onClick={() => {
                    setInputValue(opt.label);
                    inputRef.current?.focus();
                  }}
                  style={styles.expandedQuestionCard(isRecommended, accentColor)}
                >
                  {isRecommended && (
                    <span style={styles.expandedCardBadge(accentColor)}>
                      ★ Recommended
                    </span>
                  )}
                  <span style={styles.expandedCardLabel}>{opt.label}</span>
                  {opt.description && (
                    <span style={styles.expandedCardDescription}>{opt.description}</span>
                  )}
                  {opt.tradeoffs && (
                    <span style={styles.expandedCardTradeoffs}>{opt.tradeoffs}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* Compact mode: label-only buttons (unchanged) */
          <div style={styles.questionOptionsGrid(false)}>
            {question.options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  setInputValue(opt.label);
                  inputRef.current?.focus();
                }}
                title={opt.description}
                style={styles.questionOption(false)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div style={styles.questionHint(accentColor)}>
          Click to select or type your own answer
        </div>
      </div>
    );
  }

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
        <div
          style={styles.authDot(authStatus.connected)}
          title={authStatus.connected ? `Connected${authStatus.account ? ` as ${authStatus.account}` : ''}` : 'Disconnected'}
        />
      </div>

      {/* Phase tracker */}
      <PhaseTracker highlightedPhases={introHighlights} />

      {/* Main area */}
      <div style={styles.main}>
        {isExpanded ? (
          <>
            {/* Collapse chevron */}
            <button
              style={styles.chevronButton}
              onClick={toggleExpanded}
              title="Collapse to side-by-side"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2a2a4a';
                e.currentTarget.style.color = '#e5e5e5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a2e';
                e.currentTarget.style.color = '#666';
              }}
            >
              ‹
            </button>

            {/* Expanded content area */}
            <div style={styles.expandedContent}>
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Chat tab (full width) */}
              <div style={{
                ...styles.expandedChatPanel,
                display: activeTab === 'chat' ? 'flex' : 'none',
              }}>
                {showEmpty ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyTitle}>The Office</div>
                    <div style={styles.emptySubtitle}>
                      {isIdle
                        ? 'Describe what you want to build and the team will get to work.'
                        : 'No messages yet.'}
                    </div>
                  </div>
                ) : (
                  <div style={{ ...styles.messageList, paddingTop: '48px' }}>
                    {renderArchivedRuns()}
                    {messages.map((msg, i) => renderMessage(msg, i === messages.length - 1))}
                    {renderQuestionBubble()}
                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Input area (capped width) */}
                <div style={styles.inputArea}>
                  <div style={styles.expandedInputRow}>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      style={styles.inputField}
                      placeholder={inputPlaceholder}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      style={styles.sendButton(canSend)}
                      onClick={handleSend}
                      disabled={!canSend}
                      aria-label="Send message"
                    >
                      ↑
                    </button>
                  </div>
                </div>
              </div>

              {/* Office tab (canvas) — always mounted, hidden when chat tab active */}
              <div style={{
                ...styles.canvasArea,
                position: 'relative',
                display: activeTab === 'office' ? 'flex' : 'none',
              }}>
                <OfficeCanvas onSceneReady={handleSceneReady} />
                <ArtifactToolbox />
                <ArtifactOverlay />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Default: side-by-side layout */}
            <div
              className={introChatHighlight ? 'chat-panel-highlight' : undefined}
              style={styles.chatPanel}
            >
              {showEmpty ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyTitle}>The Office</div>
                  <div style={styles.emptySubtitle}>
                    {isIdle
                      ? 'Describe what you want to build and the team will get to work.'
                      : 'No messages yet.'}
                  </div>
                </div>
              ) : (
                <div style={styles.messageList}>
                  {renderArchivedRuns()}
                  {messages.map((msg, i) => renderMessage(msg, i === messages.length - 1))}
                  {renderQuestionBubble()}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Input area */}
              <div style={styles.inputArea}>
                <div style={styles.inputRow}>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    style={styles.inputField}
                    placeholder={inputPlaceholder}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    style={styles.sendButton(canSend)}
                    onClick={handleSend}
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>

            {/* Expand chevron */}
            <button
              style={styles.chevronButton}
              onClick={toggleExpanded}
              title="Expand chat to full width"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2a2a4a';
                e.currentTarget.style.color = '#e5e5e5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a2e';
                e.currentTarget.style.color = '#666';
              }}
            >
              ›
            </button>

            {/* PixiJS office canvas */}
            <div style={{ ...styles.canvasArea, position: 'relative' }}>
              <OfficeCanvas onSceneReady={handleSceneReady} />
              <ArtifactToolbox />
              <ArtifactOverlay />
              {showIntro && (
                <IntroSequence
                  onComplete={handleIntroComplete}
                  onHighlightChange={handleHighlightChange}
                  onChatHighlightChange={handleChatHighlightChange}
                />
              )}
            </div>
          </>
        )}
      </div>
      <PermissionPrompt />
    </div>
  );
}
