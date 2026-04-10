import { useState } from 'react';
import { useRequestStore } from '../../stores/request.store';
import { useProjectStore } from '../../stores/project.store';
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
  notScannedBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    background: 'rgba(245,158,11,0.08)',
    border: `1px solid rgba(245,158,11,0.3)`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11px',
    color: '#fbbf24',
  },
  bannerButton: {
    padding: '4px 10px',
    background: 'transparent',
    border: `1px solid rgba(245,158,11,0.4)`,
    borderRadius: '4px',
    color: '#fbbf24',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  skipLink: {
    background: 'transparent',
    border: 'none',
    color: colors.textDim,
    fontSize: '10px',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0',
    alignSelf: 'flex-start' as const,
  },
} as const;

export function RequestComposer() {
  const requests = useRequestStore((s) => s.requests);
  const addOrUpdate = useRequestStore((s) => s.addOrUpdate);
  const scanStatus = useProjectStore((s) => s.projectState?.scanStatus);
  const isScanning = scanStatus === 'pending' || scanStatus === 'in_progress';
  const isSkipped = scanStatus === 'skipped';
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = requests.some(
    (r) => r.status === 'queued' || r.status === 'in_progress',
  );
  const disabled = isRunning || submitting || isScanning;

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
      {isSkipped && (
        <div style={styles.notScannedBanner}>
          <span>⚠️ Project not scanned — agent routing may be less accurate.</span>
          <button
            style={styles.bannerButton}
            onClick={() => window.office.runOnboardingScan()}
          >
            Scan now
          </button>
        </div>
      )}
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
      {isScanning && (
        <button
          style={styles.skipLink}
          onClick={() => window.office.skipOnboardingScan()}
        >
          Skip scan
        </button>
      )}
      <div style={styles.footer}>
        <div style={styles.statusLine}>
          {isScanning && 'Scanning your project — this takes about 30 seconds. Watch the Chief Architect at work on the map!'}
          {!isScanning && isRunning && 'Request in progress — wait for it to finish'}
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
