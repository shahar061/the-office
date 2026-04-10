import { colors } from '../../theme';
import type { Request } from '@shared/types';

const styles = {
  root: {
    padding: '12px 0 6px 24px',
    borderLeft: `2px solid ${colors.accent}`,
    marginLeft: '8px',
    fontSize: '11px',
    color: colors.textLight,
  },
  section: {
    marginBottom: '10px',
  },
  label: {
    fontSize: '10px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  description: {
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.5',
    color: colors.text,
  },
  result: {
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.5',
    color: colors.success,
  },
  error: {
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.5',
    color: colors.error,
  },
  reasoning: {
    fontStyle: 'italic' as const,
    color: colors.textMuted,
  },
  timeline: {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: colors.textDim,
  },
} as const;

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

interface RequestDetailProps {
  request: Request;
}

export function RequestDetail({ request }: RequestDetailProps) {
  return (
    <div style={styles.root}>
      <div style={styles.section}>
        <div style={styles.label}>Description</div>
        <div style={styles.description}>{request.description}</div>
      </div>

      {request.assignedAgent && (
        <div style={styles.section}>
          <div style={styles.label}>Assigned agent</div>
          <div>{request.assignedAgent}</div>
        </div>
      )}

      {request.status === 'done' && request.result && (
        <div style={styles.section}>
          <div style={styles.label}>Result</div>
          <div style={styles.result}>{request.result}</div>
        </div>
      )}

      {request.status === 'failed' && request.error && (
        <div style={styles.section}>
          <div style={styles.label}>Error</div>
          <div style={styles.error}>{request.error}</div>
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.label}>Timeline</div>
        <div style={styles.timeline}>
          Created:   {formatTime(request.createdAt)}<br />
          Started:   {formatTime(request.startedAt)}<br />
          Completed: {formatTime(request.completedAt)}
        </div>
      </div>
    </div>
  );
}
