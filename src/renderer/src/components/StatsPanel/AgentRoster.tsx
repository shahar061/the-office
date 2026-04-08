import type { AgentStats } from '@shared/types';
import { colors } from '../../theme';
import { AgentStatRow } from './AgentStatRow';

interface AgentRosterProps {
  agents: Record<string, AgentStats>;
}

const styles = {
  root: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '9px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: colors.textDim,
    marginBottom: '4px',
  },
  empty: {
    fontSize: '11px',
    color: colors.textDim,
    fontStyle: 'italic',
    textAlign: 'center' as const,
    padding: '12px 0',
  },
} as const;

export function AgentRoster({ agents }: AgentRosterProps) {
  const sorted = Object.entries(agents)
    .sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div style={styles.root}>
      <div style={styles.label}>Agents</div>
      {sorted.length === 0 ? (
        <div style={styles.empty}>No agent activity yet</div>
      ) : (
        sorted.map(([role, stats]) => (
          <AgentStatRow key={role} role={role} stats={stats} />
        ))
      )}
    </div>
  );
}
