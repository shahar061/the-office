import React from 'react';
import { AGENT_COLORS } from '@shared/types';
import type { ChatMessage } from '@shared/types';
import { formatTime } from '../../utils';
import { colors } from '../../theme';
import { MessageRenderer } from './MessageRenderer';
import { useT } from '../../i18n';
import type { StringKey } from '../../i18n';

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  messageBubble: (role: 'user' | 'agent' | 'system', accentColor: string) => ({
    padding: '10px 12px',
    borderRadius: '8px',
    borderInlineStart: `3px solid ${accentColor}`,
    background: role === 'user' ? '#1a2a3a' : role === 'system' ? '#1a1a1a' : colors.surface,
    marginBottom: '0px', // gap handled by parent flex gap
  }),
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  messageSender: (color: string) => ({
    fontSize: '10px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }),
  mobileTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'rgba(99,102,241,0.15)',
    border: '1px solid rgba(99,102,241,0.35)',
    color: '#a5b4fc',
    fontSize: '9px',
    fontWeight: 600 as const,
    letterSpacing: '0.03em',
    textTransform: 'none' as const,
    lineHeight: 1.2,
  },
  messageTimestamp: {
    fontSize: '10px',
    color: '#666',
    textAlign: 'end' as const,
    marginTop: '4px',
  },
};

// ── Component ────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage;
  isWaiting: boolean;
}

export function MessageBubble({ msg, isWaiting }: MessageBubbleProps): React.JSX.Element {
  const t = useT();
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  const senderLabel = isUser
    ? 'You'
    : isSystem
      ? 'System'
      : msg.agentLabel ?? (msg.agentRole
        ? t(`agent.${msg.agentRole}` as StringKey)
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
      <div style={styles.messageHeader}>
        <span style={styles.messageSender(senderColor)}>{senderLabel}</span>
        {msg.source === 'mobile' && (
          <span style={styles.mobileTag} aria-label="Sent from mobile" title="Sent from mobile">
            📱 Mobile
          </span>
        )}
      </div>
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
