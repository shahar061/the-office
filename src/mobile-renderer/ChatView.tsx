import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { PhaseSeparator } from './PhaseSeparator';
import { ActivityFooter } from './ActivityFooter';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = snapshot?.chatTail ?? [];
  const waiting = snapshot?.waiting ?? null;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, waiting]);

  if (messages.length === 0 && !waiting) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  const rendered: React.ReactNode[] = [];
  let prevPhase: string | undefined;
  messages.forEach((m, i) => {
    if (m.phase && prevPhase !== undefined && m.phase !== prevPhase) {
      rendered.push(<PhaseSeparator key={`sep-${m.id}`} phase={m.phase} />);
    }
    if (m.phase) prevPhase = m.phase;
    const isLast = i === messages.length - 1;
    rendered.push(
      <MessageBubble key={m.id} msg={m} isWaiting={isLast && !!waiting} />,
    );
  });

  return (
    <>
      <div className="chat-list" ref={listRef}>{rendered}</div>
      <ActivityFooter />
    </>
  );
}
