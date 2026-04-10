import { colors } from '../../theme';

interface ExistingCodebaseModalProps {
  path: string;
  fileCount: number;
  onWorkshop: () => void;
  onStartFresh: () => void;
  onCancel: () => void;
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
  },
  panel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    width: '90%',
    maxWidth: '560px',
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 8px',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '12px',
    color: colors.textMuted,
    margin: 0,
  },
  path: {
    fontFamily: 'monospace',
    color: colors.textLight,
  },
  body: {
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    overflowY: 'auto' as const,
  },
  optionPrimary: {
    border: `2px solid ${colors.accent}`,
    background: 'rgba(59,130,246,0.08)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  optionSecondary: {
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  optionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  optionIcon: {
    fontSize: '18px',
  },
  optionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.text,
    flex: 1,
  },
  recommendedBadge: {
    fontSize: '9px',
    fontWeight: 700,
    color: colors.accent,
    background: 'rgba(59,130,246,0.15)',
    padding: '2px 8px',
    borderRadius: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  optionDescription: {
    fontSize: '12px',
    color: colors.textMuted,
    lineHeight: '1.5',
  },
  warningBlock: {
    background: 'rgba(239,68,68,0.08)',
    border: `1px solid rgba(239,68,68,0.3)`,
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '11px',
    color: '#fca5a5',
    lineHeight: '1.5',
  },
  optionFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    padding: '10px 18px',
    background: colors.accent,
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryButton: {
    padding: '8px 14px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.textMuted,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  footer: {
    padding: '12px 24px',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    color: colors.textDim,
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
} as const;

function shortenPath(fullPath: string): string {
  const parts = fullPath.split('/');
  if (parts.length <= 3) return fullPath;
  return '...' + '/' + parts.slice(-2).join('/');
}

export function ExistingCodebaseModal({
  path,
  fileCount,
  onWorkshop,
  onStartFresh,
  onCancel,
}: ExistingCodebaseModalProps) {
  function handleStartFresh() {
    if (fileCount > 3) {
      const confirmed = window.confirm(
        `This directory contains ${fileCount} files.\n\n` +
        'Starting fresh may modify or overwrite them based on the plan the AI generates. ' +
        'Are you absolutely sure?'
      );
      if (!confirmed) return;
    }
    onStartFresh();
  }

  return (
    <div style={styles.backdrop} onClick={onCancel}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>This directory isn't an Office project yet</h2>
          <p style={styles.subtitle}>
            We found existing files in <span style={styles.path}>{shortenPath(path)}</span>. How would you like to proceed?
          </p>
        </div>

        <div style={styles.body}>
          {/* Primary option — Workshop */}
          <div style={styles.optionPrimary}>
            <div style={styles.optionHeader}>
              <span style={styles.optionIcon}>⚙️</span>
              <span style={styles.optionTitle}>Work on existing code</span>
              <span style={styles.recommendedBadge}>Recommended</span>
            </div>
            <div style={styles.optionDescription}>
              Keep your existing code and submit change requests. An AI team will
              read your codebase, understand its structure, and make targeted
              modifications based on what you ask for.
            </div>
            <div style={styles.optionFooter}>
              <button style={styles.primaryButton} onClick={onWorkshop}>
                Continue with Workshop →
              </button>
            </div>
          </div>

          {/* Secondary option — Start fresh */}
          <div style={styles.optionSecondary}>
            <div style={styles.optionHeader}>
              <span style={styles.optionIcon}>🆕</span>
              <span style={styles.optionTitle}>Start fresh (Imagine phase)</span>
            </div>
            <div style={styles.optionDescription}>
              Treat this directory as a new empty project. The AI team will plan
              and build a new app from scratch.
            </div>
            <div style={styles.warningBlock}>
              ⚠️ <strong>WARNING:</strong> This may modify or overwrite existing files
              based on the generated plan. Not safe for projects with code you want to keep.
            </div>
            <div style={styles.optionFooter}>
              <button style={styles.secondaryButton} onClick={handleStartFresh}>
                Start fresh anyway
              </button>
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
