import { useEffect, useState } from 'react';
import { colors } from '../../theme';
import { parseRunMd, type ParsedRunMd } from './run-md-parser';

const styles = {
  root: {
    padding: '16px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  buttonGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '8px',
    marginBottom: '16px',
  },
  primaryButton: {
    padding: '10px 12px',
    background: colors.accent,
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  secondaryButton: {
    padding: '10px 12px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.text,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  disabledButton: {
    padding: '10px 12px',
    background: colors.surfaceLight,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.textDim,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'not-allowed',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    fontSize: '14px',
  },
  toast: {
    fontSize: '11px',
    color: colors.success,
    marginTop: '6px',
    marginLeft: '4px',
  },
  runSection: {
    marginTop: '12px',
    borderTop: `1px solid ${colors.borderLight}`,
    paddingTop: '12px',
  },
  runHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none' as const,
    marginBottom: '8px',
  },
  runTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  runChevron: {
    fontSize: '10px',
    color: colors.textMuted,
  },
  runContent: {
    background: colors.bgDark,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '6px',
    padding: '12px',
    fontSize: '11px',
    color: colors.textLight,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    overflowX: 'auto' as const,
  },
  runEmpty: {
    fontSize: '11px',
    color: colors.textDim,
    fontStyle: 'italic' as const,
  },
} as const;

function confirm(message: string): boolean {
  return window.confirm(message);
}

export function ActionHub() {
  const [runMd, setRunMd] = useState<ParsedRunMd | null>(null);
  const [runMdLoaded, setRunMdLoaded] = useState(false);
  const [runExpanded, setRunExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.office.readRunMd().then((raw) => {
      if (raw) setRunMd(parseRunMd(raw));
      setRunMdLoaded(true);
    }).catch(() => setRunMdLoaded(true));
  }, []);

  const hasRunCommand = runMd?.runCommand != null;

  async function handleOpenFolder() {
    await window.office.openProjectFolder();
  }

  async function handleRunApp() {
    if (!runMd?.runCommand) return;
    await window.office.copyToClipboard(runMd.runCommand);
    await window.office.openProjectFolder();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleNewIteration() {
    if (!confirm('This will restart from the Imagine phase. Continue?')) return;
    await window.office.restartPhase({ targetPhase: 'imagine' });
  }

  async function handleRefine() {
    if (!confirm('Restart from the War Room? Your Imagine artifacts will be preserved.')) return;
    await window.office.restartPhase({ targetPhase: 'warroom' });
  }

  return (
    <div style={styles.root}>
      <div style={styles.sectionTitle}>What next?</div>
      <div style={styles.buttonGrid}>
        <button style={styles.primaryButton} onClick={handleOpenFolder}>
          <span style={styles.icon}>📁</span>
          Open project folder
        </button>
        <button
          style={hasRunCommand ? styles.primaryButton : styles.disabledButton}
          onClick={handleRunApp}
          disabled={!hasRunCommand}
          title={hasRunCommand ? 'Copy run command and open folder' : 'No run command detected — see RUN.md'}
        >
          <span style={styles.icon}>▶</span>
          Run app
        </button>
        {copied && <div style={styles.toast}>✓ Command copied — paste in your terminal</div>}
        <button style={styles.secondaryButton} onClick={handleNewIteration}>
          <span style={styles.icon}>↻</span>
          Start new iteration
        </button>
        <button style={styles.secondaryButton} onClick={handleRefine}>
          <span style={styles.icon}>↩</span>
          Refine from War Room
        </button>
      </div>

      {runMdLoaded && (
        <div style={styles.runSection}>
          <div style={styles.runHeader} onClick={() => setRunExpanded(!runExpanded)}>
            <span style={styles.runTitle}>How to run</span>
            <span style={styles.runChevron}>{runExpanded ? '▼' : '▶'}</span>
          </div>
          {runExpanded && (
            runMd ? (
              <div style={styles.runContent}>{runMd.raw}</div>
            ) : (
              <div style={styles.runEmpty}>Run instructions were not generated for this project.</div>
            )
          )}
        </div>
      )}
    </div>
  );
}
