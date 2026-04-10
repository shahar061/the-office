import React from 'react';
import { useDiffReviewStore } from '../../stores/diff-review.store';
import { colors } from '../../theme';

const styles = {
  backdrop: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    padding: '16px',
  },
  panel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    width: '90%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 8px',
    fontSize: '14px',
    fontWeight: 700 as const,
    color: colors.text,
  },
  body: {
    padding: '8px 20px 16px',
    fontSize: '12px',
    color: colors.textLight,
    lineHeight: '1.5',
  },
  footer: {
    padding: '12px 20px',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  cancelBtn: {
    padding: '8px 14px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.textMuted,
    fontSize: '12px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  rejectBtn: {
    padding: '8px 14px',
    background: '#ef4444',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
} as const;

export function RejectConfirmModal() {
  const open = useDiffReviewStore((s) => s.confirmRejectOpen);
  const closeRejectConfirm = useDiffReviewStore((s) => s.closeRejectConfirm);
  const reject = useDiffReviewStore((s) => s.reject);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={closeRejectConfirm}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>Delete branch and reject?</div>
        <div style={styles.body}>
          This will force-delete the request's branch and mark the request as cancelled.
          The work will be discarded. This can't be undone.
        </div>
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={closeRejectConfirm}>
            Cancel
          </button>
          <button style={styles.rejectBtn} onClick={() => reject()}>
            Delete branch and reject
          </button>
        </div>
      </div>
    </div>
  );
}
