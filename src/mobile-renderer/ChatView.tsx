import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { QuestionBubble } from '../renderer/src/components/OfficeView/QuestionBubble';
import { PhaseSeparator } from './PhaseSeparator';
import { ActivityFooter } from './ActivityFooter';
import { ArchivedRunsList } from './ArchivedRunsList';
import { AGENT_COLORS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { sendAnswer } from './sendAnswer';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = snapshot?.chatTail ?? [];
  const waiting = snapshot?.waiting ?? null;
  const firstQuestion = waiting?.questions?.[0];
  const showInteractive = !!firstQuestion && firstQuestion.options.length > 0;
  const archived = snapshot?.archivedRuns ?? [];

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, waiting]);

  if (messages.length === 0 && !waiting && archived.length === 0) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  const rendered: React.ReactNode[] = [];
  if (archived.length > 0) {
    rendered.push(<ArchivedRunsList key="archived-runs" runs={archived} />);
  }
  let prevPhase: Phase | undefined;
  messages.forEach((m, i) => {
    if (m.phase && prevPhase !== undefined && m.phase !== prevPhase) {
      rendered.push(<PhaseSeparator key={`sep-${m.id}`} phase={m.phase} />);
    }
    if (m.phase) prevPhase = m.phase as Phase;
    const isLast = i === messages.length - 1;
    rendered.push(
      <MessageBubble
        key={m.id}
        msg={m}
        isWaiting={isLast && !!waiting && !showInteractive}
      />,
    );
  });

  if (showInteractive && waiting && firstQuestion) {
    const accent = AGENT_COLORS[waiting.agentRole] ?? '#6366f1';
    rendered.push(
      <QuestionBubble
        key="question-bubble"
        question={firstQuestion}
        accentColor={accent}
        isExpanded={true}
        onSelect={(label) => sendAnswer(label)}
      />,
    );
  }

  return (
    <>
      <div className="chat-list" ref={listRef}>{rendered}</div>
      <ActivityFooter />
    </>
  );
}
