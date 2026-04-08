import type { KanbanTask } from '@shared/types';
import { colors } from '../../theme';

interface BuildFailureModalProps {
  failedTask: KanbanTask;
  onResume: () => void;
  onRestart: () => void;
  onBackToWarroom: () => void;
}

const styles = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '420px',
    width: '90%',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: colors.error,
    marginBottom: '8px',
  },
  taskLabel: {
    fontSize: '13px',
    color: colors.text,
    marginBottom: '4px',
  },
  errorText: {
    fontSize: '12px',
    color: colors.textMuted,
    background: colors.bgDark,
    padding: '8px 12px',
    borderRadius: '4px',
    marginBottom: '16px',
    maxHeight: '120px',
    overflowY: 'auto' as const,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  buttons: {
    display: 'flex',
    gap: '8px',
  },
  button: (primary: boolean) => ({
    flex: 1,
    padding: '8px 12px',
    border: primary ? 'none' : `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    background: primary ? colors.accent : 'transparent',
    color: primary ? '#fff' : colors.textMuted,
    fontFamily: 'inherit',
  }),
} as const;

export function BuildFailureModal({
  failedTask,
  onResume,
  onRestart,
  onBackToWarroom,
}: BuildFailureModalProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.title}>Build Failed</div>
        <div style={styles.taskLabel}>
          Task: <strong>{failedTask.id}</strong> — {failedTask.description}
        </div>
        {failedTask.error && (
          <div style={styles.errorText}>{failedTask.error}</div>
        )}
        <div style={styles.buttons}>
          <button style={styles.button(true)} onClick={onResume}>
            Resume Build
          </button>
          <button style={styles.button(false)} onClick={onRestart}>
            Restart Build
          </button>
          <button style={styles.button(false)} onClick={onBackToWarroom}>
            Back to Warroom
          </button>
        </div>
      </div>
    </div>
  );
}
