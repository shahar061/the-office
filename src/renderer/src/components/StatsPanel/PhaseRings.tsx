import { useState } from 'react';
import type { PhaseStats } from '@shared/types';
import { useT, type StringKey } from '../../i18n';
import { colors } from '../../theme';
import { ActBreakdown } from './ActBreakdown';

interface PhaseRingsProps {
  phases: Record<string, PhaseStats>;
}

const PHASE_ORDER = ['imagine', 'warroom', 'build'] as const;
const PHASE_COLORS: Record<string, string> = {
  imagine: '#3b82f6',
  warroom: '#f59e0b',
  build: '#22c55e',
};
const PHASE_LABEL_KEYS: Record<string, StringKey> = {
  imagine: 'phase.imagine',
  warroom: 'phase.warroom',
  build: 'phase.build',
};

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  rings: {
    display: 'flex',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: '8px',
  },
  ringWrapper: (clickable: boolean) => ({
    textAlign: 'center' as const,
    cursor: clickable ? 'pointer' : 'default',
  }),
  ring: (color: string, active: boolean, selected: boolean) => ({
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: `3px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 4px',
    boxShadow: active ? `0 0 8px ${color}44` : selected ? `0 0 12px ${color}66` : 'none',
    transition: 'box-shadow 0.2s',
    background: selected ? `${color}11` : 'transparent',
  }),
  ringCost: {
    fontSize: '11px',
    fontWeight: 700,
    color: colors.text,
  },
  phaseName: {
    fontSize: '9px',
    color: colors.textMuted,
  },
  duration: {
    fontSize: '9px',
    color: colors.textDim,
  },
  emptyRing: (color: string) => ({
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: `3px dashed ${color}44`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 4px',
  }),
  emptyLabel: {
    fontSize: '9px',
    color: colors.textDim,
  },
} as const;

function formatDuration(startedAt: number, completedAt: number | null): string {
  const end = completedAt ?? Date.now();
  const ms = end - startedAt;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatCost(cost: number): string {
  return cost < 0.01 ? '—' : `$${cost.toFixed(2)}`;
}

export function PhaseRings({ phases }: PhaseRingsProps) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const t = useT();

  return (
    <div style={styles.root}>
      <div style={styles.rings}>
        {PHASE_ORDER.map(phase => {
          const stats = phases[phase];
          const color = PHASE_COLORS[phase];
          const active = stats && stats.completedAt === null;
          const selected = selectedPhase === phase;

          if (!stats) {
            return (
              <div key={phase} style={styles.ringWrapper(false)}>
                <div style={styles.emptyRing(color)}>
                  <span style={styles.emptyLabel}>—</span>
                </div>
                <div style={styles.phaseName}>{t(PHASE_LABEL_KEYS[phase])}</div>
              </div>
            );
          }

          return (
            <div
              key={phase}
              style={styles.ringWrapper(stats.acts.length > 0)}
              onClick={() => {
                if (stats.acts.length > 0) {
                  setSelectedPhase(selected ? null : phase);
                }
              }}
            >
              <div style={styles.ring(color, !!active, selected)}>
                <span style={styles.ringCost}>{formatCost(stats.cost)}</span>
              </div>
              <div style={styles.phaseName}>{t(PHASE_LABEL_KEYS[phase])}</div>
              <div style={styles.duration}>{formatDuration(stats.startedAt, stats.completedAt)}</div>
            </div>
          );
        })}
      </div>

      {selectedPhase && phases[selectedPhase] && (
        <ActBreakdown
          acts={phases[selectedPhase].acts}
          phaseColor={PHASE_COLORS[selectedPhase]}
        />
      )}
    </div>
  );
}
