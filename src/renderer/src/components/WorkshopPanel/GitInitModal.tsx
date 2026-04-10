import React from 'react';
import { useGitInitModalStore } from '../../stores/git-init-modal.store';
import { colors } from '../../theme';

const styles = {
  backdrop: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    padding: '24px',
  },
  panel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    width: '90%',
    maxWidth: '480px',
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
  body: {
    padding: '16px 24px',
    fontSize: '13px',
    color: colors.textLight,
    lineHeight: '1.5',
  },
  path: {
    fontFamily: 'monospace',
    color: colors.textLight,
    fontSize: '11px',
    wordBreak: 'break-all' as const,
  },
  footer: {
    padding: '12px 24px',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  primaryButton: {
    padding: '8px 16px',
    background: colors.accent,
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryButton: {
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
} as const;

export function GitInitModal() {
  const isOpen = useGitInitModalStore((s) => s.isOpen);
  const projectPath = useGitInitModalStore((s) => s.projectPath);
  const close = useGitInitModalStore((s) => s.close);

  if (!isOpen) return null;

  function handleYes() {
    window.office.respondGitInit('yes');
    close();
  }

  function handleNo() {
    window.office.respondGitInit('no');
    close();
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Initialize git in this directory?</h2>
          <p style={styles.subtitle}>
            The Office runs each request on its own git branch.
          </p>
        </div>
        <div style={styles.body}>
          This directory is not a git repository:
          <div style={styles.path}>{projectPath}</div>
          <br />
          To isolate each request on its own branch, we need to initialize git here.
          If you skip this, requests will still work but will run in-place on your files
          without branch isolation.
        </div>
        <div style={styles.footer}>
          <button style={styles.secondaryButton} onClick={handleNo}>
            Skip (run in place)
          </button>
          <button style={styles.primaryButton} onClick={handleYes}>
            Initialize git
          </button>
        </div>
      </div>
    </div>
  );
}
