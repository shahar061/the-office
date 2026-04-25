import type { AgentStats, AgentRole } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import { colors } from '../../theme';

interface AgentStatRowProps {
  role: string;
  stats: AgentStats;
}

const PHASE_COLORS: Record<string, string> = {
  imagine: '#3b82f6',
  warroom: '#f59e0b',
  build: '#22c55e',
};

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    background: colors.surface,
    borderRadius: '0 4px 4px 0',
    fontSize: '10px',
    gap: '6px',
  },
  name: (color: string) => ({
    flex: 1,
    color,
    fontWeight: 600,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  }),
  dots: {
    display: 'flex',
    gap: '3px',
    marginInlineEnd: '4px',
  },
  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
  }),
  cost: {
    color: colors.text,
    width: '42px',
    textAlign: 'end' as const,
    fontWeight: 600,
    fontSize: '11px',
  },
  tokens: {
    color: colors.textDim,
    width: '48px',
    textAlign: 'end' as const,
    fontSize: '9px',
  },
} as const;

function formatCost(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tok`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K tok`;
  return `${tokens} tok`;
}

function formatRole(role: string): string {
  return role
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function AgentStatRow({ role, stats }: AgentStatRowProps) {
  const agentColor = AGENT_COLORS[role as AgentRole] || '#6b7280';

  return (
    <div style={{ ...styles.row, borderInlineStart: `3px solid ${agentColor}` }}>
      <span style={styles.name(agentColor)}>{formatRole(role)}</span>
      <div style={styles.dots}>
        {stats.phases.map(p => (
          <div key={p} style={styles.dot(PHASE_COLORS[p] || colors.textDim)} title={p} />
        ))}
      </div>
      <span style={styles.cost}>{formatCost(stats.cost)}</span>
      <span style={styles.tokens}>{formatTokens(stats.inputTokens + stats.outputTokens)}</span>
    </div>
  );
}
