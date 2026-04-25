import { useState } from 'react';
import type { KanbanTask } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import { colors } from '../../theme';
import { useT, type StringKey } from '../../i18n';

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

const STATUS_LABEL_KEY: Record<KanbanTask['status'], StringKey> = {
  queued: 'kanban.column.queued',
  active: 'kanban.column.active',
  review: 'kanban.column.review',
  done: 'kanban.column.done',
  failed: 'kanban.column.failed',
};

const styles = {
  card: (status: KanbanTask['status'], hovered: boolean) => ({
    display: 'flex',
    gap: '8px',
    padding: '8px 10px',
    background: hovered ? colors.surfaceLight : colors.surface,
    borderInlineStart: `3px solid ${STATUS_BORDER[status]}`,
    borderRadius: '4px',
    fontSize: '12px',
    transition: 'transform 0.3s ease, opacity 0.3s ease, background 0.15s ease',
    position: 'relative' as const,
    cursor: 'pointer',
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
  description: (expanded: boolean) => ({
    color: colors.text,
    lineHeight: '1.3',
    ...(expanded ? {} : {
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical' as const,
      overflow: 'hidden',
    }),
  }),
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
  // Popup overlay
  popupOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  popup: (statusColor: string) => ({
    background: colors.surface,
    border: `1px solid ${colors.borderLight}`,
    borderTop: `3px solid ${statusColor}`,
    borderRadius: '8px',
    width: '420px',
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  }),
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.borderLight}`,
    flexShrink: 0,
  },
  popupHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  popupClose: {
    background: 'none',
    border: 'none',
    color: colors.textDim,
    fontSize: '18px',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '4px',
    lineHeight: 1,
  },
  popupBody: {
    padding: '16px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  popupLabel: {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: colors.textDim,
    marginBottom: '4px',
  },
  popupValue: {
    fontSize: '13px',
    color: colors.text,
    lineHeight: '1.5',
    marginBottom: '14px',
    whiteSpace: 'pre-wrap' as const,
  },
  popupMeta: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
    marginBottom: '14px',
  },
  popupMetaItem: {
    fontSize: '11px',
    color: colors.textMuted,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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

function agentDisplayName(agent: string): string {
  return agent
    .split('-')
    .map(w => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

function TaskPopup({ task, onClose }: { task: KanbanTask; onClose: () => void }) {
  const t = useT();
  const agentColor = AGENT_COLORS[task.assignedAgent] || '#6b7280';
  const pColor = phaseColor(task.phaseId);
  const statusColor = STATUS_BORDER[task.status];

  return (
    <div style={styles.popupOverlay} onClick={onClose}>
      <div style={styles.popup(statusColor)} onClick={e => e.stopPropagation()}>
        <div style={styles.popupHeader}>
          <div style={styles.popupHeaderLeft}>
            <div style={styles.avatar(agentColor)}>
              {agentInitials(task.assignedAgent)}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: colors.textMuted }}>{task.id}</div>
              <div style={{ fontSize: '12px', color: colors.text, fontWeight: 600 }}>
                {agentDisplayName(task.assignedAgent)}
              </div>
            </div>
          </div>
          <button style={styles.popupClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.popupBody}>
          <div style={styles.popupLabel}>Description</div>
          <div style={styles.popupValue}>{task.description}</div>

          <div style={styles.popupMeta}>
            <div style={styles.popupMetaItem}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: statusColor,
              }} />
              {t(STATUS_LABEL_KEY[task.status])}
            </div>
            <div style={styles.popupMetaItem}>
              <span style={styles.phasePill(pColor)}>{task.phaseId}</span>
            </div>
          </div>

          {task.dependsOn.length > 0 && (
            <>
              <div style={styles.popupLabel}>Depends On</div>
              <div style={{ ...styles.popupValue, fontSize: '12px', color: colors.textMuted }}>
                {task.dependsOn.join(', ')}
              </div>
            </>
          )}

          {task.error && (
            <>
              <div style={{ ...styles.popupLabel, color: colors.error }}>Error</div>
              <div style={{
                ...styles.popupValue,
                fontSize: '12px',
                color: colors.error,
                background: `${colors.error}11`,
                padding: '8px 10px',
                borderRadius: '4px',
                fontFamily: 'monospace',
              }}>
                {task.error}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function KanbanCard({ task }: KanbanCardProps) {
  const [hovered, setHovered] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const agentColor = AGENT_COLORS[task.assignedAgent] || '#6b7280';

  return (
    <>
      <div
        style={styles.card(task.status, hovered)}
        title={task.description}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setPopupOpen(true)}
      >
        <div style={styles.avatar(agentColor)}>
          {agentInitials(task.assignedAgent)}
        </div>
        <div style={styles.content}>
          <div style={styles.description(hovered)}>{task.description}</div>
          <span style={styles.phasePill(phaseColor(task.phaseId))}>
            {task.phaseId}
          </span>
        </div>
        {task.status === 'failed' && <span style={styles.failedBadge}>!</span>}
      </div>
      {popupOpen && <TaskPopup task={task} onClose={() => setPopupOpen(false)} />}
    </>
  );
}
