import type { Phase } from '../../shared/types';

const PHASE_ORDER: Phase[] = ['imagine', 'warroom', 'build', 'complete'];
const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

interface Props {
  currentPhase: Phase;
  viewedPhase: Phase;
  completedPhases: Phase[];
  unreadByPhase: Record<Phase, boolean>;
  onSelect: (phase: Phase) => void;
}

export function PhaseTabs({
  currentPhase, viewedPhase, completedPhases, unreadByPhase, onSelect,
}: Props) {
  return (
    <div className="phase-tabs">
      {PHASE_ORDER.map((phase) => {
        const isActive = viewedPhase === phase;
        const isEnabled = completedPhases.includes(phase) || phase === currentPhase;
        const isUnread = !!unreadByPhase[phase];
        const className = [
          'phase-tab',
          isActive && 'active',
          !isEnabled && 'disabled',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={phase}
            type="button"
            className={className}
            disabled={!isEnabled}
            onClick={() => isEnabled && onSelect(phase)}
          >
            {PHASE_LABELS[phase]}
            {isUnread && <span className="phase-tab-badge" data-testid="phase-tab-badge" />}
          </button>
        );
      })}
    </div>
  );
}
