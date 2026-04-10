import { useState } from 'react';
import { useRequestStore } from '../../stores/request.store';
import { colors } from '../../theme';

const styles = {
  root: {
    padding: '16px',
    borderBottom: `1px solid ${colors.borderLight}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  textarea: {
    width: '100%',
    minHeight: '80px',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    padding: '10px 12px',
    color: colors.text,
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  textareaDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  statusLine: {
    fontSize: '11px',
    color: colors.textDim,
    fontStyle: 'italic' as const,
    flex: 1,
  },
  submitButton: {
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
  submitButtonDisabled: {
    padding: '8px 16px',
    background: colors.surfaceLight,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    color: colors.textDim,
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'not-allowed',
    fontFamily: 'inherit',
  },
  error: {
    fontSize: '11px',
    color: colors.error,
  },
} as const;

export function RequestComposer() {
  const requests = useRequestStore((s) => s.requests);
  const addOrUpdate = useRequestStore((s) => s.addOrUpdate);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = requests.some(
    (r) => r.status === 'queued' || r.status === 'in_progress',
  );
  const disabled = isRunning || submitting;

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await window.office.createRequest(trimmed);
      if (response.success && response.request) {
        addOrUpdate(response.request);
        setText('');
      } else {
        setError(response.error || 'Failed to create request');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.label}>New request</div>
      <textarea
        style={{
          ...styles.textarea,
          ...(disabled ? styles.textareaDisabled : {}),
        }}
        placeholder="Describe what you want — e.g., 'add a dark mode toggle to the settings page'"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <div style={styles.footer}>
        <div style={styles.statusLine}>
          {isRunning && 'Request in progress — wait for it to finish'}
        </div>
        <button
          style={disabled || !text.trim() ? styles.submitButtonDisabled : styles.submitButton}
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
        >
          Submit
        </button>
      </div>
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
