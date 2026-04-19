import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [snapshot?.chatTail.length]);

  const messages = snapshot?.chatTail ?? [];
  if (messages.length === 0) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  return (
    <div className="chat-list" ref={listRef}>
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} isWaiting={false} />
      ))}
    </div>
  );
}
