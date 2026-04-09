import { useRef, useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chat.store';
import type { ArchivedRun } from '../../stores/chat.store';
import { useProjectStore } from '../../stores/project.store';
import { AGENT_COLORS } from '@shared/types';
import type { ChatMessage } from '@shared/types';
import { agentDisplayName } from '../../utils';
import { colors } from '../../theme';
import { MessageBubble } from './MessageBubble';
import { QuestionBubble } from './QuestionBubble';
import { PhaseActionButton } from './PhaseActionButton';
import { ActivityIndicator } from './ActivityIndicator';
import { useOfficeStore } from '../../stores/office.store';
import { audioManager } from '../../audio/AudioManager';

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  chatPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '320px',
    minWidth: '320px',
    borderRight: `1px solid ${colors.border}`,
    background: colors.bg,
    overflow: 'hidden',
  },
  expandedChatPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    background: colors.bg,
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
    color: colors.textDim,
  },
  emptySubtitle: {
    fontSize: '11px',
    color: '#475569',
    lineHeight: 1.5,
  },
  inputArea: {
    padding: '8px 12px 12px',
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  inputField: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: colors.text,
    fontSize: '12px',
    padding: '8px 10px',
    resize: 'none' as const,
    fontFamily: 'inherit',
    lineHeight: 1.4,
    overflow: 'hidden',
    maxHeight: '120px',
  },
  sendButton: (enabled: boolean) => ({
    background: 'transparent',
    border: 'none',
    outline: 'none',
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? colors.accentPurple : '#334155',
    padding: '8px 10px',
    fontSize: '16px',
    lineHeight: 1,
    flexShrink: 0,
    transition: 'color 0.15s',
  }),
  expandedInputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
    maxWidth: '720px',
    margin: '0 auto',
    width: '100%',
  },
} as const;

// ── Component ────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  isExpanded: boolean;
  highlightClassName?: string;
}

export function ChatPanel({ isExpanded, highlightClassName }: ChatPanelProps) {
  const {
    messages,
    archivedRuns,
    waitingForResponse,
    waitingAgentRole,
    waitingSessionId,
    waitingQuestions,
    addMessage,
    setWaiting,
    loadHistory,
  } = useChatStore();

  const projectState = useProjectStore((s) => s.projectState);
  const agentActive = useOfficeStore((s) => s.agentActivity.isActive);

  const [inputValue, setInputValue] = useState('');
  const [expandedArchived, setExpandedArchived] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const phase = projectState?.currentPhase ?? 'idle';
  const isIdle = phase === 'idle';

  const inputPlaceholder = waitingForResponse && waitingAgentRole
    ? `Responding to ${agentDisplayName(waitingAgentRole)}...`
    : isIdle
      ? 'What would you like to build?'
      : 'Type a message...';

  const canSend = inputValue.trim().length > 0;

  const showEmpty = messages.length === 0 && archivedRuns.length === 0;

  // ── Effects ──────────────────────────────────────────────────────────────

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSend() {
    const text = inputValue.trim();
    if (!text) return;

    audioManager.playSfx('chat-send');
    setInputValue('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

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

  function autoResizeTextarea() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value);
    autoResizeTextarea();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function toggleArchived(key: string) {
    setExpandedArchived((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleQuestionSelect(label: string) {
    setInputValue(label);
    inputRef.current?.focus();
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderArchivedRuns() {
    if (archivedRuns.length === 0) return null;

    return (
      <>
        {archivedRuns.map((run) => {
          const key = `${run.agentRole}-${run.runNumber}`;
          const isOpen = expandedArchived.has(key);
          const msgCount = run.messages.length;
          const dateStr = new Date(run.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
          const color = run.agentRole ? AGENT_COLORS[run.agentRole] ?? colors.textMuted : colors.textMuted;

          return (
            <div key={key}>
              <button
                onClick={() => toggleArchived(key)}
                style={{
                  background: colors.surfaceDark,
                  border: `1px solid ${colors.borderLight}`,
                  borderRadius: '6px',
                  color: colors.textMuted,
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
                <span style={{ color: '#666' }}>{isOpen ? '\u25BC' : '\u25B6'}</span>
                <span style={{ color, fontWeight: 600 }}>
                  Run {run.runNumber} — {agentDisplayName(run.agentRole)}
                </span>
                <span style={{ color: '#555' }}>
                  ({msgCount} message{msgCount !== 1 ? 's' : ''}, {dateStr})
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.7 }}>
                  {run.messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} isWaiting={false} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div style={{
          borderBottom: `1px solid ${colors.border}`,
          margin: '4px 0',
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute',
            top: '-8px',
            left: '12px',
            background: colors.bg,
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

  function renderQuestionBubble() {
    if (!waitingForResponse || waitingQuestions.length === 0 || waitingQuestions[0].options.length === 0) {
      return null;
    }

    const accentColor = waitingAgentRole ? AGENT_COLORS[waitingAgentRole] : colors.textMuted;

    return (
      <QuestionBubble
        question={waitingQuestions[0]}
        accentColor={accentColor}
        isExpanded={isExpanded}
        onSelect={handleQuestionSelect}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const panelStyle = isExpanded ? styles.expandedChatPanel : styles.chatPanel;
  const inputRowStyle = isExpanded ? styles.expandedInputRow : styles.inputRow;
  const messageListStyle = isExpanded
    ? { ...styles.messageList, paddingTop: '48px' }
    : styles.messageList;

  return (
    <div
      className={highlightClassName}
      style={{ ...panelStyle, zIndex: 1, position: 'relative' as const }}
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
        <div style={messageListStyle}>
          {renderArchivedRuns()}
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const isWaiting = isLast && waitingForResponse;
            const hasQuestionBubble = isWaiting && waitingQuestions.length > 0 && waitingQuestions[0].options.length > 0;
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isWaiting={isWaiting && !hasQuestionBubble}
              />
            );
          })}
          {renderQuestionBubble()}
          <PhaseActionButton />
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input area / Activity indicator */}
      {agentActive && !waitingForResponse ? (
        <ActivityIndicator />
      ) : (
        <div style={styles.inputArea}>
          <div style={inputRowStyle}>
            <textarea
              ref={inputRef}
              rows={1}
              style={styles.inputField}
              placeholder={inputPlaceholder}
              value={inputValue}
              onChange={handleInputChange}
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
      )}
    </div>
  );
}
