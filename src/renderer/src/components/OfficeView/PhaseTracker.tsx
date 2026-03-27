import { useState, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import type { Phase, BuildConfig } from '@shared/types';

const PHASES = [
  { key: 'imagine' as Phase, label: 'Imagine' },
  { key: 'warroom' as Phase, label: 'War Room' },
  { key: 'build' as Phase, label: 'Build' },
] as const;

const DEFAULT_BUILD_CONFIG: BuildConfig = {
  modelPreset: 'default',
  retryLimit: 2,
  permissionMode: 'auto-all',
};

function getActionButton(
  phase: Phase,
  status: string | undefined,
  completedPhases: Phase[],
): { label: string; action: 'continue' | 'retry'; targetPhase: Phase } | null {
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed' || status === 'interrupted';

  if (isCompleted) {
    if (phase === 'imagine') {
      return { label: 'Continue to War Room', action: 'continue', targetPhase: 'warroom' };
    }
    if (phase === 'warroom') {
      return { label: 'Continue to Build', action: 'continue', targetPhase: 'build' };
    }
    return null;
  }

  if (isFailed) {
    if (phase === 'warroom') {
      return { label: 'Retry War Room', action: 'retry', targetPhase: 'warroom' };
    }
    if (phase === 'build') {
      return { label: 'Retry Build', action: 'retry', targetPhase: 'build' };
    }
    return null;
  }

  return null;
}

export function PhaseTracker() {
  const { projectState, currentPhase } = useProjectStore();
  const [starting, setStarting] = useState(false);

  const phase = projectState?.currentPhase ?? 'idle';
  const completedPhases = projectState?.completedPhases ?? [];
  const status = currentPhase?.status;

  const actionButton = phase !== 'idle' ? getActionButton(phase, status, completedPhases) : null;

  const handleAction = useCallback(async () => {
    if (!actionButton || starting) return;
    setStarting(true);
    try {
      if (actionButton.targetPhase === 'warroom') {
        await window.office.startWarroom();
      } else if (actionButton.targetPhase === 'build') {
        await window.office.startBuild(DEFAULT_BUILD_CONFIG);
      }
    } finally {
      setStarting(false);
    }
  }, [actionButton, starting]);

  if (phase === 'idle') return null;

  return (
    <div style={styles.container}>
      <div style={styles.track}>
        {PHASES.map((p, i) => {
          const done = completedPhases.includes(p.key);
          const active = phase === p.key;
          const isCurrent = active && status !== 'completed' && status !== 'failed' && status !== 'interrupted';
          const isFailed = active && (status === 'failed' || status === 'interrupted');
          const upcoming = !done && !active;

          return (
            <div key={p.key} style={styles.stepRow}>
              {i > 0 && (
                <div style={styles.connector(done || active)} />
              )}
              <div style={styles.step}>
                <div
                  className={isCurrent ? 'phase-pulse' : undefined}
                  style={styles.circle(done, isCurrent, isFailed, upcoming)}
                >
                  {done ? '\u2713' : i + 1}
                </div>
                <span style={styles.label(done, active, isFailed, upcoming)}>
                  {p.label}
                </span>
                {isCurrent && status && (
                  <span style={styles.statusText}>{status}</span>
                )}
                {isFailed && status && (
                  <span style={styles.failedStatusText}>{status}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {actionButton && (
        <button
          style={styles.actionBtn(starting)}
          onClick={handleAction}
          disabled={starting}
        >
          {starting ? 'Starting\u2026' : actionButton.label}
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    borderBottom: '1px solid #1e1e2e',
    background: '#0d0d1a',
    gap: '16px',
    flexShrink: 0,
  } as React.CSSProperties,
  track: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  stepRow: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  connector: (filled: boolean): React.CSSProperties => ({
    width: '32px',
    height: '2px',
    background: filled ? '#3b82f6' : '#333',
    transition: 'background 0.3s',
  }),
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  circle: (done: boolean, current: boolean, failed: boolean, upcoming: boolean): React.CSSProperties => ({
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    flexShrink: 0,
    transition: 'all 0.3s',
    ...(done
      ? { background: '#22c55e', color: '#fff', border: '2px solid #22c55e' }
      : current
        ? { background: '#3b82f6', color: '#fff', border: '2px solid #3b82f6' }
        : failed
          ? { background: '#ef4444', color: '#fff', border: '2px solid #ef4444' }
          : { background: 'transparent', color: '#4b5563', border: '2px solid #333', boxSizing: 'border-box' }),
  }),
  label: (done: boolean, active: boolean, failed: boolean, upcoming: boolean): React.CSSProperties => ({
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    color: done ? '#22c55e' : failed ? '#ef4444' : active ? '#e2e8f0' : '#4b5563',
    whiteSpace: 'nowrap',
    transition: 'color 0.3s',
  }),
  statusText: {
    fontSize: '10px',
    color: '#64748b',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  failedStatusText: {
    fontSize: '10px',
    color: '#ef4444',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  actionBtn: (disabled: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? '#1e3a5f' : '#3b82f6',
    color: disabled ? '#64748b' : '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'background 0.15s',
  }),
};
