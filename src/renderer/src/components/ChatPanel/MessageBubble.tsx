import React from 'react';
import type { ChatMessage } from '../../stores/chat.store';
import { AGENT_COLORS } from '@shared/types';
import type { AgentRole } from '../../../shared/types';

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const color = isUser
    ? '#e5e5e5'
    : isSystem
      ? '#6b7280'
      : AGENT_COLORS[message.role as AgentRole] ?? '#9ca3af';

  return (
    <div style={{
      marginBottom: 8,
      padding: '6px 10px',
      borderLeft: `3px solid ${color}`,
      background: isUser ? '#1e1e36' : '#16162a',
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 10, color, marginBottom: 2, fontWeight: 600 }}>
        {isUser ? 'You' : message.role}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
        {message.content}
      </div>
    </div>
  );
}