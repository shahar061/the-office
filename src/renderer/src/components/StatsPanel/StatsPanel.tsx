import { useStatsStore } from '../../stores/stats.store';
import { useT } from '../../i18n';
import { colors } from '../../theme';
import { RateLimitBar } from './RateLimitBar';
import { PhaseRings } from './PhaseRings';
import { AgentRoster } from './AgentRoster';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: colors.bg,
    overflow: 'hidden',
    padding: '12px 16px',
    gap: '12px',
  },
  header: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.text,
    flexShrink: 0,
  },
  totals: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
    fontSize: '11px',
    color: colors.textMuted,
    flexShrink: 0,
  },
  totalValue: {
    fontWeight: 600,
    color: colors.text,
    fontSize: '12px',
  },
  totalLabel: {
    fontSize: '9px',
    color: colors.textDim,
    marginTop: '2px',
  },
  totalItem: {
    textAlign: 'center' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '12px',
  },
  emptyIcon: {
    fontSize: '40px',
  },
  emptyText: {
    fontSize: '13px',
    color: colors.textDim,
  },
} as const;

function formatCost(cost: number): string {
  return cost < 0.01 ? '$0.00' : `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return `${tokens}`;
}

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function StatsPanel() {
  const stats = useStatsStore((s) => s.stats);
  const t = useT();

  if (!stats) {
    return (
      <div style={styles.root}>
        <div style={styles.header}>{t('stats.header')}</div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📊</div>
          <div style={styles.emptyText}>{t('stats.empty')}</div>
        </div>
      </div>
    );
  }

  const totalTokens = stats.session.totalInputTokens + stats.session.totalOutputTokens;

  return (
    <div style={styles.root}>
      <div style={styles.header}>{t('stats.header')}</div>

      <RateLimitBar rateLimit={stats.rateLimit} />

      <div style={styles.totals}>
        <div style={styles.totalItem}>
          <div style={styles.totalValue}>{formatCost(stats.session.totalCost)}</div>
          <div style={styles.totalLabel}>{t('stats.total.cost')}</div>
        </div>
        <div style={styles.totalItem}>
          <div style={styles.totalValue}>{formatTokens(totalTokens)}</div>
          <div style={styles.totalLabel}>{t('stats.total.tokens')}</div>
        </div>
        <div style={styles.totalItem}>
          <div style={styles.totalValue}>{formatElapsed(stats.session.startedAt)}</div>
          <div style={styles.totalLabel}>{t('stats.total.elapsed')}</div>
        </div>
      </div>

      <PhaseRings phases={stats.phases} />

      <AgentRoster agents={stats.agents} />
    </div>
  );
}
