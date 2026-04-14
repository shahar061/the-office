import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { AGENT_COLORS } from '../../shared/types';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [snapshot?.chatTail.length]);

  const messages = snapshot?.chatTail ?? [];

  if (messages.length === 0) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  return (
    <div className="chat-list" ref={listRef}>
      {messages.map((m) => {
        const color = m.agentRole ? AGENT_COLORS[m.agentRole] : '#999';
        return (
          <div key={m.id} className="chat-message">
            <div className="role" style={{ color }}>
              {m.agentLabel ?? m.agentRole ?? m.role}
            </div>
            <div>{m.text}</div>
          </div>
        );
      })}
    </div>
  );
}
