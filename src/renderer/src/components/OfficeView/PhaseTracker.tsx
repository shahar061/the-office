import { useState, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { colors } from '../../theme';
import type { Phase, BuildConfig } from '@shared/types';
import { PhaseRestartModal } from './PhaseRestartModal';

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

const HIGHLIGHT_COLORS: Partial<Record<Phase, string>> = {
  imagine: colors.accent,
  warroom: colors.warning,
  build: colors.success,
};

function getActionButton(
  phase: Phase,
  status: string | undefined,
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

interface PhaseTrackerProps {
  highlightedPhases?: Phase[] | null;
}

export function PhaseTracker({ highlightedPhases }: PhaseTrackerProps) {
  const { projectState, currentPhase } = useProjectStore();
  const [starting, setStarting] = useState(false);
  const [restartTarget, setRestartTarget] = useState<Phase | null>(null);
  const [originalIdea, setOriginalIdea] = useState<string>('');

  const phase = projectState?.currentPhase ?? 'idle';
  const completedPhases = projectState?.completedPhases ?? [];
  const status = currentPhase?.status;

  const introMode = highlightedPhases !== undefined && highlightedPhases !== null;

  // Derive effective status: if no active PhaseInfo but phase is in completedPhases, treat as completed
  const effectiveStatus = status ?? (completedPhases.includes(phase as Phase) ? 'completed' : undefined);
  const actionButton = phase !== 'idle' ? getActionButton(phase, effectiveStatus) : null;

  const handleAction = useCallback(async () => {
    if (!actionButton || starting) return;
    setStarting(true);
    try {
      if (actionButton.targetPhase === 'warroom') {
        await window.office.startWarroom();
      } else if (actionButton.targetPhase === 'build') {
        await window.office.startBuild(DEFAULT_BUILD_CONFIG);
      }
    } catch (err) {
      console.error(`Failed to ${actionButton.action} phase:`, err);
    } finally {
      setStarting(false);
    }
  }, [actionButton, starting]);

  const handlePhaseClick = useCallback(async (clickedPhase: Phase) => {
    const done = completedPhases.includes(clickedPhase);
    const active = phase === clickedPhase;
    if (!done && !active) return;

    if (clickedPhase === 'imagine') {
      try {
        const history = await window.office.getChatHistory('imagine');
        const ceoHistory = history.find((h: any) => h.agentRole === 'ceo');
        if (ceoHistory && ceoHistory.runs.length > 0) {
          const firstRun = ceoHistory.runs[0];
          const userMsg = firstRun.messages.find((m: any) => m.role === 'user');
          if (userMsg) {
            setOriginalIdea(userMsg.text);
          }
        }
      } catch {
        // No history available
      }
    }

    setRestartTarget(clickedPhase);
  }, [completedPhases, phase]);

  const handleRestartConfirm = useCallback(async (userIdea?: string) => {
    if (!restartTarget) return;
    setRestartTarget(null);
    try {
      await window.office.restartPhase({ targetPhase: restartTarget, userIdea });
    } catch (err) {
      console.error('Failed to restart phase:', err);
    }
  }, [restartTarget]);

  const handleRestartCancel = useCallback(() => {
    setRestartTarget(null);
    setOriginalIdea('');
  }, []);

  const affectedPhases = restartTarget ? (() => {
    const ORDER: Phase[] = ['imagine', 'warroom', 'build'];
    const targetIdx = ORDER.indexOf(restartTarget);
    const result: { phase: Phase; status: string }[] = [];

    for (let i = targetIdx; i < ORDER.length; i++) {
      const p = ORDER[i];
      if (p === restartTarget) continue;
      const isDone = completedPhases.includes(p);
      const isActive = phase === p;
      if (isDone) result.push({ phase: p, status: 'completed' });
      else if (isActive) result.push({ phase: p, status: status ?? 'active' });
    }
    return result;
  })() : [];

  // Hide when idle UNLESS in intro mode
  if (phase === 'idle' && !introMode) return null;

  return (
    <div style={styles.container}>
      <div style={styles.track}>
        {PHASES.map((p, i) => {
          // Intro mode: highlight/dim based on highlightedPhases array
          if (introMode) {
            const isHighlighted = highlightedPhases.includes(p.key);
            const highlightColor = HIGHLIGHT_COLORS[p.key] ?? colors.accent;

            return (
              <div key={p.key} style={styles.stepRow}>
                {i > 0 && (
                  <div style={{
                    ...styles.connector(false),
                    opacity: isHighlighted ? 1 : 0.3,
                    background: isHighlighted ? highlightColor : colors.border,
                  }} />
                )}
                <div style={{ ...styles.step, opacity: isHighlighted ? 1 : 0.3, transition: 'opacity 0.3s' }}>
                  <div
                    className={isHighlighted ? 'phase-pulse' : undefined}
                    style={{
                      ...styles.circle(false, false, false, true),
                      ...(isHighlighted ? {
                        background: highlightColor,
                        color: '#fff',
                        border: `2px solid ${highlightColor}`,
                        boxShadow: `0 0 8px ${highlightColor}66`,
                      } : {}),
                    }}
                  >
                    {i + 1}
                  </div>
                  <span style={{
                    ...styles.label(false, isHighlighted, false, !isHighlighted),
                    color: isHighlighted ? colors.text : colors.textDark,
                    fontWeight: isHighlighted ? 600 : 500,
                  }}>
                    {p.label}
                  </span>
                </div>
              </div>
            );
          }

          // Normal mode: existing logic
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
                  style={{
                    ...styles.circle(done, isCurrent, isFailed, upcoming),
                    ...(done || active ? {
                      cursor: 'pointer',
                      transition: 'all 0.3s, filter 0.15s',
                    } : {}),
                  }}
                  onClick={done || active ? () => handlePhaseClick(p.key) : undefined}
                  onMouseEnter={(e) => {
                    if (done || active) {
                      (e.currentTarget as HTMLElement).style.filter = 'brightness(1.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (done || active) {
                      (e.currentTarget as HTMLElement).style.filter = 'brightness(1)';
                    }
                  }}
                  title={done || active ? `Click to restart ${p.label}` : undefined}
                >
                  {done ? '\u2713' : i + 1}
                </div>
                <span
                  style={{
                    ...styles.label(done, active, isFailed, upcoming),
                    ...(done || active ? { cursor: 'pointer' } : {}),
                  }}
                  onClick={done || active ? () => handlePhaseClick(p.key) : undefined}
                >
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

      {!introMode && actionButton && (
        <button
          style={styles.actionBtn(starting)}
          onClick={handleAction}
          disabled={starting}
        >
          {starting ? 'Starting\u2026' : actionButton.label}
        </button>
      )}

      {restartTarget && (
        <PhaseRestartModal
          targetPhase={restartTarget}
          originalIdea={restartTarget === 'imagine' ? originalIdea : undefined}
          affectedPhases={affectedPhases}
          onConfirm={handleRestartConfirm}
          onCancel={handleRestartCancel}
        />
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
    background: colors.bgDark,
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
    background: filled ? colors.accent : colors.border,
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
      ? { background: colors.success, color: '#fff', border: `2px solid ${colors.success}` }
      : current
        ? { background: colors.accent, color: '#fff', border: `2px solid ${colors.accent}` }
        : failed
          ? { background: colors.error, color: '#fff', border: `2px solid ${colors.error}` }
          : { background: 'transparent', color: colors.textDark, border: `2px solid ${colors.border}`, boxSizing: 'border-box' }),
  }),
  label: (done: boolean, active: boolean, failed: boolean, upcoming: boolean): React.CSSProperties => ({
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    color: done ? colors.success : failed ? colors.error : active ? colors.text : colors.textDark,
    whiteSpace: 'nowrap',
    transition: 'color 0.3s',
  }),
  statusText: {
    fontSize: '10px',
    color: colors.textDim,
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  failedStatusText: {
    fontSize: '10px',
    color: colors.error,
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  actionBtn: (disabled: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? '#1e3a5f' : colors.accent,
    color: disabled ? colors.textDim : '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'background 0.15s',
  }),
};
