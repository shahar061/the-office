import React from 'react';
import { useDiffReviewStore } from '../../stores/diff-review.store';
import { useRequestStore } from '../../stores/request.store';
import { DiffFile } from './DiffFile';
import { RejectConfirmModal } from './RejectConfirmModal';
import { colors } from '../../theme';

const styles = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.bg,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  header: {
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.borderLight}`,
    flexShrink: 0,
  },
  title: {
    fontSize: '13px',
    fontWeight: 700 as const,
    color: colors.text,
    marginBottom: '4px',
    wordBreak: 'break-all' as const,
  },
  stats: {
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  statsInsertions: { color: '#86efac' },
  statsDeletions: { color: '#fca5a5' },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px',
  },
  footer: {
    padding: '12px 16px',
    borderTop: `1px solid ${colors.borderLight}`,
    background: colors.bgDark,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    flexShrink: 0,
  },
  rejectBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: `1px solid #ef4444`,
    borderRadius: '6px',
    color: '#fca5a5',
    fontSize: '12px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  acceptBtn: {
    padding: '8px 16px',
    background: '#22c55e',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
    padding: '24px',
    textAlign: 'center' as const,
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: colors.textMuted,
  },
  error: {
    padding: '16px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: '6px',
    margin: '12px',
    color: '#fca5a5',
    fontSize: '11px',
    lineHeight: '1.5',
  },
} as const;

export function DiffPanel() {
  const activeRequestId = useDiffReviewStore((s) => s.activeRequestId);
  const diff = useDiffReviewStore((s) => s.diff);
  const loading = useDiffReviewStore((s) => s.loading);
  const error = useDiffReviewStore((s) => s.error);
  const accepting = useDiffReviewStore((s) => s.accepting);
  const rejecting = useDiffReviewStore((s) => s.rejecting);
  const accept = useDiffReviewStore((s) => s.accept);
  const openRejectConfirm = useDiffReviewStore((s) => s.openRejectConfirm);

  const request = useRequestStore((s) =>
    activeRequestId ? s.requests.find((r) => r.id === activeRequestId) ?? null : null,
  );

  // Empty state: no request selected
  if (!activeRequestId) {
    return (
      <div style={styles.root}>
        <div style={styles.emptyState}>
          Select a completed request from the list to review its diff.
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.loading}>Loading diff…</div>
      </div>
    );
  }

  // Error state (and no diff loaded)
  if (error && !diff) {
    return (
      <div style={styles.root}>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!request || !diff) {
    return (
      <div style={styles.root}>
        <div style={styles.emptyState}>Request not found.</div>
      </div>
    );
  }

  const canAccept = request.status === 'done';
  const title = request.title || request.description.slice(0, 60);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>{request.id}: {title}</div>
        <div style={styles.stats}>
          {diff.totalFilesChanged} {diff.totalFilesChanged === 1 ? 'file' : 'files'} changed
          {'  ·  '}
          <span style={styles.statsInsertions}>+{diff.totalInsertions}</span>
          {' '}
          <span style={styles.statsDeletions}>−{diff.totalDeletions}</span>
          {request.commitSha && (
            <>
              {'  ·  '}
              {request.commitSha.slice(0, 7)}
            </>
          )}
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.body}>
        {diff.files.length === 0 && (
          <div style={{ fontSize: '11px', color: colors.textMuted, fontStyle: 'italic' }}>
            No changes.
          </div>
        )}
        {diff.files.map((file) => (
          <DiffFile key={file.path} file={file} />
        ))}
      </div>

      <div style={styles.footer}>
        <button
          style={styles.rejectBtn}
          onClick={openRejectConfirm}
          disabled={rejecting || accepting}
        >
          {rejecting ? 'Rejecting…' : 'Reject'}
        </button>
        {canAccept && (
          <button
            style={styles.acceptBtn}
            onClick={() => accept()}
            disabled={accepting || rejecting}
          >
            {accepting ? 'Merging…' : 'Accept'}
          </button>
        )}
      </div>

      <RejectConfirmModal />
    </div>
  );
}
