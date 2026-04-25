import { useEffect, useState } from 'react';
import { useStatsStore } from '../../stores/stats.store';
import { useKanbanStore } from '../../stores/kanban.store';
import { colors } from '../../theme';
import type { PhaseStats } from '@shared/types';

const styles = {
  root: {
    padding: '16px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '16px',
  },
  card: {
    background: colors.surfaceLight,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    padding: '10px 12px',
  },
  cardLabel: {
    fontSize: '10px',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  cardValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: colors.text,
    fontFamily: 'monospace',
  },
  phaseTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '11px',
  },
  phaseRow: {
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  phaseCell: {
    padding: '6px 4px',
    color: colors.textLight,
  },
  phaseNameCell: {
    padding: '6px 4px',
    color: colors.text,
    textTransform: 'capitalize' as const,
  },
  phaseCellRight: {
    padding: '6px 4px',
    color: colors.textMuted,
    textAlign: 'end' as const,
    fontFamily: 'monospace',
  },
} as const;

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

function formatDurationMs(ms: number): string {
  if (ms === 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) {
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function phaseDurationMs(phase: PhaseStats): number {
  if (!phase.completedAt) return 0;
  return phase.completedAt - phase.startedAt;
}

export function SummarySection() {
  const stats = useStatsStore((s) => s.stats);
  const tasks = useKanbanStore((s) => s.kanban.tasks);
  const [fileCount, setFileCount] = useState<number | null>(null);

  useEffect(() => {
    window.office.getProjectFileCount().then(setFileCount).catch(() => setFileCount(0));
  }, []);

  const totalCost = stats?.session.totalCost ?? 0;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const totalTasks = tasks.length;

  const phaseEntries = stats?.phases
    ? Object.entries(stats.phases).filter(([name]) => ['imagine', 'warroom', 'build'].includes(name))
    : [];
  const totalDurationMs = phaseEntries.reduce((sum, [, p]) => sum + phaseDurationMs(p), 0);

  return (
    <div style={styles.root}>
      <div style={styles.sectionTitle}>Summary</div>
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Cost</div>
          <div style={styles.cardValue}>{formatCost(totalCost)}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Duration</div>
          <div style={styles.cardValue}>{formatDurationMs(totalDurationMs)}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Tasks</div>
          <div style={styles.cardValue}>{doneTasks} / {totalTasks}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Files</div>
          <div style={styles.cardValue}>{fileCount === null ? '—' : fileCount}</div>
        </div>
      </div>

      {phaseEntries.length > 0 && (
        <>
          <div style={styles.sectionTitle}>Per phase</div>
          <table style={styles.phaseTable}>
            <tbody>
              {phaseEntries.map(([name, phase]) => (
                <tr key={name} style={styles.phaseRow}>
                  <td style={styles.phaseNameCell}>{name}</td>
                  <td style={styles.phaseCellRight}>{formatCost(phase.cost)}</td>
                  <td style={styles.phaseCellRight}>{formatDurationMs(phaseDurationMs(phase))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
