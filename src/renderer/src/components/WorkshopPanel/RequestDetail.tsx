import { colors } from '../../theme';
import type { Request } from '@shared/types';
import { useLayoutStore } from '../../stores/layout.store';
import { useDiffReviewStore } from '../../stores/diff-review.store';

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
  gitBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    fontFamily: 'monospace',
    fontSize: '10px',
  },
  gitLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  gitLabel: {
    color: colors.textMuted,
    minWidth: '50px',
  },
  gitValue: {
    color: colors.text,
    flex: 1,
    wordBreak: 'break-all' as const,
  },
  copyBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '9px',
    padding: '2px 6px',
    fontFamily: 'inherit',
  },
  degradedNote: {
    fontStyle: 'italic' as const,
    color: colors.textDim,
    fontSize: '10px',
  },
  openDiffBtn: {
    background: colors.accent,
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600 as const,
    padding: '4px 10px',
    marginTop: '6px',
    fontFamily: 'inherit',
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

      {request.branchIsolated && request.branchName && (
        <div style={styles.section}>
          <div style={styles.label}>Git</div>
          <div style={styles.gitBlock}>
            <div style={styles.gitLine}>
              <span style={styles.gitLabel}>Branch:</span>
              <span style={styles.gitValue}>{request.branchName}</span>
              <button
                style={styles.copyBtn}
                onClick={() => window.office.copyToClipboard(request.branchName!)}
              >
                Copy
              </button>
            </div>
            {request.baseBranch && (
              <div style={styles.gitLine}>
                <span style={styles.gitLabel}>Base:</span>
                <span style={styles.gitValue}>{request.baseBranch}</span>
              </div>
            )}
            {request.commitSha && (
              <div style={styles.gitLine}>
                <span style={styles.gitLabel}>Commit:</span>
                <span style={styles.gitValue}>{request.commitSha}</span>
              </div>
            )}
            {request.commitSha && (
              <button
                style={styles.openDiffBtn}
                onClick={() => {
                  useLayoutStore.getState().ensurePanelVisible('diff');
                  useDiffReviewStore.getState().selectRequest(request.id);
                }}
              >
                Open diff →
              </button>
            )}
          </div>
        </div>
      )}

      {!request.branchIsolated && (request.status === 'done' || request.status === 'failed') && (
        <div style={styles.section}>
          <div style={styles.degradedNote}>Ran without branch isolation.</div>
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
