import { useRef, useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { useChatStore } from '../../stores/chat.store';
import { AGENT_COLORS } from '@shared/types';
import type { AgentRole, ChatMessage } from '@shared/types';
import { PermissionPrompt } from '../PermissionPrompt/PermissionPrompt';
import { OfficeCanvas } from '../../office/OfficeCanvas';
import { useSceneSync } from '../../office/useSceneSync';
import type { OfficeScene } from '../../office/OfficeScene';
import { useUIStore } from '../../stores/ui.store';
import { TabBar } from '../TabBar/TabBar';

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
    fontSize: '10px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }),
  messageText: {
    fontSize: '12px',
    color: '#cbd5e1',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },

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
  const { messages, addMessage } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [officeScene, setOfficeScene] = useState<OfficeScene | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { isExpanded, activeTab, toggleExpanded, setActiveTab } = useUIStore();

  // Bridge store → PixiJS scene
  useSceneSync(officeScene);

  const handleSceneReady = useCallback((scene: OfficeScene) => {
    setOfficeScene(scene);
  }, []);

  const phase = projectState?.currentPhase ?? 'idle';
  const isIdle = phase === 'idle';

  const inputPlaceholder = isIdle
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

    // Add user message to store
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

  const showEmpty = messages.length === 0;

  function renderMessage(msg: ChatMessage) {
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

    return (
      <div key={msg.id} style={styles.messageBubble(msg.role, accentColor)}>
        <span style={styles.messageSender(senderColor)}>
          {senderLabel}
        </span>
        <span style={styles.messageText}>{msg.text}</span>
        <div style={styles.messageTimestamp}>{formatTime(msg.timestamp)}</div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <button
            onClick={() => {
              useChatStore.getState().clearMessages();
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
                    {messages.map(renderMessage)}
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

              {/* Office tab (canvas) */}
              <div style={{
                ...styles.canvasArea,
                display: activeTab === 'office' ? 'flex' : 'none',
              }}>
                <OfficeCanvas onSceneReady={handleSceneReady} />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Default: side-by-side layout */}
            <div style={styles.chatPanel}>
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
                  {messages.map(renderMessage)}
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
            <div style={styles.canvasArea}>
              <OfficeCanvas onSceneReady={handleSceneReady} />
            </div>
          </>
        )}
      </div>
      <PermissionPrompt />
    </div>
  );
}
