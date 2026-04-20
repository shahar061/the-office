import type React from 'react';
import type { Phase } from '../../shared/types';

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

export function PhaseSeparator({ phase }: { phase: Phase }): React.JSX.Element {
  return (
    <div className="phase-separator" role="separator" aria-label={`Phase: ${PHASE_LABELS[phase]}`}>
      <span className="phase-separator-line" />
      <span className="phase-separator-label">{PHASE_LABELS[phase]}</span>
      <span className="phase-separator-line" />
    </div>
  );
}
