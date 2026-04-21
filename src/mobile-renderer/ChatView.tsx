import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { QuestionBubble } from '../renderer/src/components/OfficeView/QuestionBubble';
import { PhaseSeparator } from './PhaseSeparator';
import { ActivityFooter } from './ActivityFooter';
import { ArchivedRunsList } from './ArchivedRunsList';
import { PhaseTabs } from './PhaseTabs';
import { sendPhaseHistoryRequest } from './sendPhaseHistoryRequest';
import { AGENT_COLORS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { sendAnswer } from './sendAnswer';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  const viewedPhase = useSessionStore((s) => s.viewedPhase);
  const phaseHistoryCache = useSessionStore((s) => s.phaseHistoryCache);
  const lastVisitedAtByPhase = useSessionStore((s) => s.lastVisitedAtByPhase);
  const setViewedPhase = useSessionStore((s) => s.setViewedPhase);
  const currentPhase: Phase = snapshot?.phase ?? 'idle';
  const effectiveViewedPhase: Phase = viewedPhase ?? currentPhase;
  const isLive = effectiveViewedPhase === currentPhase;

  const PHASE_ORDER_LOCAL: Phase[] = ['imagine', 'warroom', 'build', 'complete'];
  const completedPhases: Phase[] = (() => {
    const idx = PHASE_ORDER_LOCAL.indexOf(currentPhase);
    if (idx <= 0) return [];
    return PHASE_ORDER_LOCAL.slice(0, idx);
  })();

  const unreadByPhase: Record<Phase, boolean> = {
    idle: false, imagine: false, warroom: false, build: false, complete: false,
  };
  if (currentPhase !== effectiveViewedPhase) {
    const lastMsgTs = snapshot?.chatTail?.[snapshot.chatTail.length - 1]?.timestamp ?? 0;
    const lastVisit = lastVisitedAtByPhase[currentPhase] ?? 0;
    if (lastMsgTs > lastVisit) unreadByPhase[currentPhase] = true;
  }

  const messages = snapshot?.chatTail ?? [];
  const waiting = snapshot?.waiting ?? null;
  const firstQuestion = waiting?.questions?.[0];
  const showInteractive = !!firstQuestion && firstQuestion.options.length > 0;
  const archived = snapshot?.archivedRuns ?? [];

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, waiting]);

  useEffect(() => {
    if (isLive) return;
    if (phaseHistoryCache[effectiveViewedPhase]) return;
    if (effectiveViewedPhase === 'idle') return;
    sendPhaseHistoryRequest(effectiveViewedPhase as 'imagine' | 'warroom' | 'build' | 'complete');
  }, [isLive, effectiveViewedPhase, phaseHistoryCache]);

  return (
    <>
      <PhaseTabs
        currentPhase={currentPhase}
        viewedPhase={effectiveViewedPhase}
        completedPhases={completedPhases}
        unreadByPhase={unreadByPhase}
        onSelect={(p) => setViewedPhase(p)}
      />
      {isLive ? (
        (() => {
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
        })()
      ) : (
        (() => {
          const cached = phaseHistoryCache[effectiveViewedPhase];
          if (!cached) return <div className="chat-empty">Loading {effectiveViewedPhase}…</div>;
          const flattened: typeof messages = [];
          for (const entry of cached) for (const run of entry.runs) flattened.push(...run.messages);
          flattened.sort((a, b) => a.timestamp - b.timestamp);
          if (flattened.length === 0) return <div className="chat-empty">No messages in {effectiveViewedPhase}.</div>;
          return (
            <div className="chat-list" ref={listRef}>
              {flattened.map((m) => <MessageBubble key={m.id} msg={m} isWaiting={false} />)}
            </div>
          );
        })()
      )}
      {!isLive && (
        <div className="past-phase-footer">
          <button
            className="return-to-current"
            onClick={() => setViewedPhase(currentPhase)}
          >
            Return to {currentPhase}
          </button>
        </div>
      )}
    </>
  );
}
