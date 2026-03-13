import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chat.store';
import { MessageBubble } from './MessageBubble';

export function MessageThread() {
  const messages = useChatStore((s) => s.messages);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {messages.length === 0 && (
        <div style={{ color: '#6b7280', textAlign: 'center', marginTop: 32, fontSize: 12 }}>
          No messages yet. Type a prompt to start.
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={endRef} />
    </div>
  );
}