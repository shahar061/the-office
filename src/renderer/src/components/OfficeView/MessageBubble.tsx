import React from 'react';
import { AGENT_COLORS } from '@shared/types';
import type { ChatMessage } from '@shared/types';
import { agentDisplayName, formatTime } from '../../utils';
import { colors } from '../../theme';
import { MessageRenderer } from './MessageRenderer';

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  messageBubble: (role: 'user' | 'agent' | 'system', accentColor: string) => ({
    padding: '10px 12px',
    borderRadius: '8px',
    borderLeft: `3px solid ${accentColor}`,
    background: role === 'user' ? '#1a2a3a' : role === 'system' ? '#1a1a1a' : colors.surface,
    marginBottom: '0px', // gap handled by parent flex gap
  }),
  messageSender: (color: string) => ({
    display: 'block',
    fontSize: '10px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  }),
  messageTimestamp: {
    fontSize: '10px',
    color: '#666',
    textAlign: 'right' as const,
    marginTop: '4px',
  },
};

// ── Component ────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  isWaiting: boolean;
}

export function MessageBubble({ msg, isWaiting }: MessageBubbleProps): React.JSX.Element {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  const senderLabel = isUser
    ? 'You'
    : isSystem
      ? 'System'
      : msg.agentLabel ?? (msg.agentRole
        ? agentDisplayName(msg.agentRole)
        : 'Agent');

  const accentColor = isUser
    ? colors.accent
    : isSystem
      ? '#666'
      : msg.agentRole
        ? AGENT_COLORS[msg.agentRole]
        : colors.textMuted;

  const senderColor = isUser
    ? colors.accent
    : isSystem
      ? '#999'
      : msg.agentRole
        ? AGENT_COLORS[msg.agentRole]
        : colors.textMuted;

  return (
    <div
      key={msg.id}
      className={isWaiting ? 'bubble-waiting' : undefined}
      style={{
        ...styles.messageBubble(msg.role, accentColor),
        ...(isWaiting ? { '--accent-color': accentColor } as React.CSSProperties : {}),
      }}
    >
      <span style={styles.messageSender(senderColor)}>
        {senderLabel}
      </span>
      <MessageRenderer text={msg.text} role={msg.role} />
      <div style={styles.messageTimestamp}>{formatTime(msg.timestamp)}</div>
      {isWaiting && (
        <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginTop: '6px' }}>
          Awaiting your response
        </div>
      )}
    </div>
  );
}
