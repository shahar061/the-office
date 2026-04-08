import { useState, useEffect } from 'react';
import type { RateLimitState } from '@shared/types';
import { colors } from '../../theme';

interface RateLimitBarProps {
  rateLimit: RateLimitState | null;
}

const styles = {
  root: {
    marginBottom: '12px',
  },
  collapsed: (warning: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    background: warning ? 'rgba(245,158,11,0.1)' : colors.surface,
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    border: warning ? '1px solid rgba(245,158,11,0.3)' : `1px solid ${colors.borderLight}`,
  }),
  icon: {
    fontSize: '12px',
  },
  label: {
    flex: 1,
    color: colors.textMuted,
  },
  value: (warning: boolean) => ({
    fontWeight: 600,
    color: warning ? colors.warning : colors.text,
  }),
  expanded: {
    marginTop: '6px',
    padding: '8px 10px',
    background: colors.bgDark,
    borderRadius: '4px',
    fontSize: '10px',
    color: colors.textDim,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  bar: {
    height: '4px',
    background: colors.surface,
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '4px',
  },
  barFill: (pct: number, warning: boolean, rejected: boolean) => ({
    height: '100%',
    width: `${Math.min(pct * 100, 100)}%`,
    background: rejected ? colors.error : warning ? colors.warning : colors.accent,
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  }),
} as const;

function formatResetTime(resetsAt: number | null): string {
  if (!resetsAt) return 'unknown';
  const ms = resetsAt - Date.now();
  if (ms <= 0) return 'now';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function RateLimitBar({ rateLimit }: RateLimitBarProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (rateLimit && rateLimit.utilization > 0.8) {
      setExpanded(true);
    }
  }, [rateLimit?.utilization]);

  if (!rateLimit) return null;

  const warning = rateLimit.status === 'allowed_warning' || rateLimit.utilization > 0.8;
  const rejected = rateLimit.status === 'rejected';
  const pct = rateLimit.utilization;

  return (
    <div style={styles.root}>
      <div
        style={styles.collapsed(warning || rejected)}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={styles.icon}>{rejected ? '🔴' : warning ? '🟡' : '⚡'}</span>
        <span style={styles.label}>Rate Limit</span>
        <span style={styles.value(warning || rejected)}>
          {Math.round(pct * 100)}%
        </span>
        <span style={{ color: colors.textDim, fontSize: '10px' }}>
          resets {formatResetTime(rateLimit.resetsAt)}
        </span>
      </div>

      <div style={styles.bar}>
        <div style={styles.barFill(pct, warning, rejected)} />
      </div>

      {expanded && (
        <div style={styles.expanded}>
          <div>Type: {rateLimit.rateLimitType}</div>
          <div>Status: {rateLimit.status}</div>
          {rateLimit.isUsingOverage && <div>Overage: {rateLimit.overageStatus}</div>}
          <div>Resets: {formatResetTime(rateLimit.resetsAt)}</div>
        </div>
      )}
    </div>
  );
}
