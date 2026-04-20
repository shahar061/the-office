import { useState } from 'react';
import type React from 'react';
import type { ArchivedRun } from '../../shared/types';
import { AGENT_COLORS } from '../../shared/types';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';
import { agentDisplayName } from '../renderer/src/utils';

export function ArchivedRunsList({ runs }: { runs: ArchivedRun[] }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (runs.length === 0) return null;

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  return (
    <div className="archived-runs">
      {runs.map((run) => {
        const key = `${run.agentRole}-${run.runNumber}`;
        const isOpen = expanded.has(key);
        const color = AGENT_COLORS[run.agentRole] ?? '#999';
        const dateStr = new Date(run.timestamp).toLocaleDateString([], {
          month: 'short', day: 'numeric',
        });
        const count = run.messages.length;
        return (
          <div key={key} className="archived-run">
            <button className="archived-run-header" onClick={() => toggle(key)}>
              <span className="archived-run-caret">{isOpen ? '\u25BC' : '\u25B6'}</span>
              <span className="archived-run-label" style={{ color }}>
                Run {run.runNumber} — {agentDisplayName(run.agentRole)}
              </span>
              <span className="archived-run-meta">
                ({count} msg{count !== 1 ? 's' : ''}, {dateStr})
              </span>
            </button>
            {isOpen && (
              <div className="archived-run-body">
                {run.messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} isWaiting={false} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="archived-runs-divider" />
    </div>
  );
}
