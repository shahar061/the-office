import type { Phase } from '@shared/types';

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
    <div style={{
      display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(15,15,26,0.6)',
    }}>
      {PHASE_ORDER.map((phase) => {
        const isActive = viewedPhase === phase;
        const isEnabled = completedPhases.includes(phase) || phase === currentPhase;
        const isUnread = !!unreadByPhase[phase];
        return (
          <button
            key={phase}
            onClick={() => isEnabled && onSelect(phase)}
            disabled={!isEnabled}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
              color: !isEnabled ? '#475569' : isActive ? '#fff' : '#9ca3af',
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              cursor: isEnabled ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              position: 'relative',
            }}
          >
            {PHASE_LABELS[phase]}
            {isUnread && (
              <span
                data-testid="phase-tab-badge"
                style={{
                  position: 'absolute',
                  top: 6, right: 6,
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#ef4444',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
