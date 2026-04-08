import type { ActStats } from '@shared/types';
import { colors } from '../../theme';

interface ActBreakdownProps {
  acts: ActStats[];
  phaseColor: string;
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    padding: '8px 12px',
    background: colors.bgDark,
    borderRadius: '4px',
    marginTop: '8px',
  },
  act: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '10px',
    padding: '4px 0',
  },
  dot: (color: string, completed: boolean) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: completed ? color : 'transparent',
    border: `1.5px solid ${color}`,
    flexShrink: 0,
  }),
  line: (color: string) => ({
    width: '1px',
    height: '8px',
    background: `${color}44`,
    marginLeft: '2.5px',
  }),
  name: {
    flex: 1,
    color: colors.textMuted,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  duration: {
    color: colors.textDim,
    fontSize: '9px',
    whiteSpace: 'nowrap' as const,
  },
  cost: {
    color: colors.text,
    fontSize: '10px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
} as const;

function formatDuration(startedAt: number, completedAt: number | null): string {
  const end = completedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return '<1s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatCost(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
}

export function ActBreakdown({ acts, phaseColor }: ActBreakdownProps) {
  if (acts.length === 0) return null;

  return (
    <div style={styles.root}>
      {acts.map((act, i) => (
        <div key={act.name}>
          {i > 0 && <div style={styles.line(phaseColor)} />}
          <div style={styles.act}>
            <div style={styles.dot(phaseColor, act.completedAt !== null)} />
            <span style={styles.name}>{act.name}</span>
            <span style={styles.duration}>{formatDuration(act.startedAt, act.completedAt)}</span>
            <span style={styles.cost}>{formatCost(act.cost)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
