import { useState } from 'react';
import { useRequestStore } from '../../stores/request.store';
import { useRequestPlanReviewStore } from '../../stores/request-plan-review.store';
import { AGENT_COLORS } from '@shared/types';
import { colors } from '../../theme';
import { RequestDetail } from './RequestDetail';
import type { Request } from '@shared/types';

const styles = {
  root: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 0',
  },
  empty: {
    padding: '20px 16px',
    color: colors.textDim,
    fontSize: '11px',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    cursor: 'pointer',
    borderBottom: `1px solid ${colors.borderLight}`,
    fontSize: '12px',
    color: colors.text,
  },
  rowHover: {
    background: colors.surfaceLight,
  },
  statusIcon: {
    width: '18px',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  title: {
    color: colors.text,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  titleEmpty: {
    color: colors.textDim,
    fontStyle: 'italic' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  agentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: colors.textMuted,
    flexShrink: 0,
  },
  agentDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  timestamp: {
    fontSize: '10px',
    color: colors.textDim,
    flexShrink: 0,
    fontFamily: 'monospace',
  },
} as const;

function statusIcon(status: Request['status']): string {
  switch (status) {
    case 'queued': return '⏳';
    case 'in_progress': return '⟳';
    case 'awaiting_review': return '👁';
    case 'done': return '✓';
    case 'failed': return '✗';
    case 'cancelled': return '◯';
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function RequestList() {
  const requests = useRequestStore((s) => s.requests);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const sorted = [...requests].sort((a, b) => b.createdAt - a.createdAt);

  if (sorted.length === 0) {
    return (
      <div style={styles.root}>
        <div style={styles.empty}>No requests yet — type one above to get started.</div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {sorted.map((r) => {
        const isExpanded = expandedId === r.id;
        const agentColor = r.assignedAgent ? AGENT_COLORS[r.assignedAgent] : colors.textDim;
        return (
          <div key={r.id}>
            <div
              style={{
                ...styles.row,
                ...(hoverId === r.id ? styles.rowHover : {}),
              }}
              onClick={() => {
                if (r.status === 'awaiting_review' && r.plan) {
                  useRequestPlanReviewStore.getState().openReview({
                    requestId: r.id,
                    title: r.title || r.description.slice(0, 60),
                    plan: r.plan,
                  });
                  return;
                }
                setExpandedId(isExpanded ? null : r.id);
              }}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <div style={styles.statusIcon}>{statusIcon(r.status)}</div>
              <div style={styles.titleBlock}>
                <div style={r.title ? styles.title : styles.titleEmpty}>
                  {r.title || 'untitled...'}
                </div>
              </div>
              {r.assignedAgent && (
                <div style={styles.agentBadge}>
                  <div style={{ ...styles.agentDot, background: agentColor }} />
                  {r.assignedAgent.split('-')[0]}
                </div>
              )}
              <div style={styles.timestamp}>{relativeTime(r.createdAt)}</div>
            </div>
            {isExpanded && <RequestDetail request={r} />}
          </div>
        );
      })}
    </div>
  );
}
