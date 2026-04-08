import { useState } from 'react';
import type { KanbanTask } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import { colors } from '../../theme';

interface KanbanCardProps {
  task: KanbanTask;
}

const STATUS_BORDER: Record<KanbanTask['status'], string> = {
  queued: colors.accent,
  active: colors.warning,
  review: '#a855f7',
  done: colors.success,
  failed: colors.error,
};

const styles = {
  card: (status: KanbanTask['status'], entering: boolean) => ({
    display: 'flex',
    gap: '8px',
    padding: '8px 10px',
    background: colors.surface,
    borderLeft: `3px solid ${STATUS_BORDER[status]}`,
    borderRadius: '4px',
    fontSize: '12px',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    opacity: entering ? 0.7 : 1,
    transform: entering ? 'translateX(-8px)' : 'translateX(0)',
    position: 'relative' as const,
  }),
  avatar: (agentColor: string) => ({
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    background: agentColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  }),
  content: {
    flex: 1,
    minWidth: 0,
  },
  description: {
    color: colors.text,
    lineHeight: '1.3',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  phasePill: (phaseColor: string) => ({
    display: 'inline-block',
    marginTop: '4px',
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    background: `${phaseColor}22`,
    color: phaseColor,
  }),
  failedBadge: {
    position: 'absolute' as const,
    top: '4px',
    right: '6px',
    fontSize: '12px',
  },
} as const;

function phaseColor(phaseId: string): string {
  const hues = ['#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e', '#f97316', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < phaseId.length; i++) hash = (hash * 31 + phaseId.charCodeAt(i)) | 0;
  return hues[Math.abs(hash) % hues.length];
}

function agentInitials(agent: string): string {
  return agent
    .split('-')
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function KanbanCard({ task }: KanbanCardProps) {
  const [hovered, setHovered] = useState(false);
  const agentColor = AGENT_COLORS[task.assignedAgent] || '#6b7280';

  return (
    <div
      style={styles.card(task.status, false)}
      title={hovered ? task.description : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.avatar(agentColor)}>
        {agentInitials(task.assignedAgent)}
      </div>
      <div style={styles.content}>
        <div style={styles.description}>{task.description}</div>
        <span style={styles.phasePill(phaseColor(task.phaseId))}>
          {task.phaseId}
        </span>
      </div>
      {task.status === 'failed' && <span style={styles.failedBadge}>!</span>}
    </div>
  );
}
