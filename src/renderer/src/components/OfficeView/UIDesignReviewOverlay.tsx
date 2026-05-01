import { useEffect, useState } from 'react';
import { useUIDesignReviewStore } from '../../stores/ui-design-review.store';
import { colors } from '../../theme';
import { useT } from '../../i18n';

const styles = {
  backdrop: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    padding: '16px',
  },
  panel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    width: '90%',
    maxWidth: '520px',
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  panelFullscreen: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    width: '96%',
    height: '96%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.text,
  },
  close: {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    fontFamily: 'inherit',
    lineHeight: 1,
  },
  body: {
    padding: '16px 18px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  direction: {
    fontSize: '12px',
    color: colors.textLight,
    lineHeight: '1.5',
    marginBottom: '18px',
  },
  mockupRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 0',
    borderTop: `1px solid ${colors.borderLight}`,
  },
  mockupCaption: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '4px',
  },
  mockupExplanation: {
    fontSize: '11px',
    color: colors.textMuted,
    lineHeight: '1.4',
  },
  openButton: {
    padding: '6px 12px',
    background: colors.surfaceLight,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.text,
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  feedbackLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: '18px',
    marginBottom: '6px',
  },
  feedbackInput: {
    width: '100%',
    minHeight: '60px',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    padding: '8px 12px',
    color: colors.text,
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  footer: {
    display: 'flex',
    gap: '8px',
    padding: '12px 18px',
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  reviseButton: {
    padding: '8px 16px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.textMuted,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  approveButton: {
    padding: '8px 16px',
    background: colors.success,
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
} as const;

export function UIDesignReviewOverlay() {
  const t = useT();
  const isOpen = useUIDesignReviewStore((s) => s.isOpen);
  const designDirection = useUIDesignReviewStore((s) => s.designDirection);
  const mockups = useUIDesignReviewStore((s) => s.mockups);
  const closeReview = useUIDesignReviewStore((s) => s.closeReview);

  const [feedback, setFeedback] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset feedback + size when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFeedback('');
      setIsFullscreen(false);
    }
  }, [isOpen]);

  // Close on Escape — treat as implicit approval (prevents orchestrator hang)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleApprove();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleOpenMockup(filename: string) {
    const relPath = `docs/office/05-ui-designs/${filename}`;
    await window.office.openFileInBrowser(relPath);
  }

  function handleApprove() {
    window.office.respondUIDesignReview({ approved: true });
    closeReview();
  }

  function handleRevise() {
    const trimmed = feedback.trim();
    if (!trimmed) {
      handleApprove();
      return;
    }
    window.office.respondUIDesignReview({ approved: false, feedback: trimmed });
    closeReview();
  }

  return (
    <div style={styles.backdrop}>
      <div style={isFullscreen ? styles.panelFullscreen : styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>{t('overlay.uidesign.title')}</span>
          <div style={styles.headerActions}>
            <button
              style={styles.close}
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={t(isFullscreen ? 'overlay.collapse' : 'overlay.expand')}
              title={t(isFullscreen ? 'overlay.collapse' : 'overlay.expand')}
            >
              {isFullscreen ? '⤡' : '⤢'}
            </button>
            <button style={styles.close} onClick={handleApprove} aria-label="Close (approve)" title={t('overlay.uidesign.approve')}>✕</button>
          </div>
        </div>
        <div style={styles.body}>
          {designDirection && (
            <>
              <div style={styles.sectionTitle}>Design Direction</div>
              <div style={styles.direction}>{designDirection}</div>
            </>
          )}
          <div style={styles.sectionTitle}>Mockups ({mockups.length})</div>
          {mockups.map((m) => (
            <div key={m.filename} style={styles.mockupRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.mockupCaption}>{m.caption}</div>
                <div style={styles.mockupExplanation}>{m.explanation}</div>
              </div>
              <button style={styles.openButton} onClick={() => handleOpenMockup(m.filename)}>
                Open →
              </button>
            </div>
          ))}
          <div style={styles.feedbackLabel}>Feedback (optional)</div>
          <textarea
            style={styles.feedbackInput}
            placeholder={t('overlay.uidesign.feedback.placeholder')}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
        <div style={styles.footer}>
          <button style={styles.reviseButton} onClick={handleRevise}>
            {t('overlay.uidesign.feedback.send')}
          </button>
          <button style={styles.approveButton} onClick={handleApprove}>
            {t('overlay.uidesign.approve')}
          </button>
        </div>
      </div>
    </div>
  );
}
