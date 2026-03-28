import { useState } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { colors } from '../../theme';

export function PhaseActionButton() {
  const [starting, setStarting] = useState(false);
  const currentPhase = useProjectStore((s) => s.currentPhase);
  const projectState = useProjectStore((s) => s.projectState);

  if (!currentPhase || currentPhase.status !== 'completed') return null;

  const p = projectState?.currentPhase;
  let label: string;
  let action: () => Promise<void>;

  if (p === 'imagine') {
    label = 'Continue to War Room \u2192';
    action = () => window.office.startWarroom();
  } else if (p === 'warroom') {
    label = 'Continue to Build \u2192';
    action = () =>
      window.office.startBuild({
        modelPreset: 'default',
        retryLimit: 2,
        permissionMode: 'auto-all',
      });
  } else {
    return null;
  }

  return (
    <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
      <button
        disabled={starting}
        onClick={async () => {
          setStarting(true);
          try {
            await action();
          } catch (err) {
            console.error(err);
          } finally {
            setStarting(false);
          }
        }}
        style={{
          padding: '10px 24px',
          borderRadius: '8px',
          border: 'none',
          background: starting ? '#1e3a5f' : colors.accent,
          color: starting ? colors.textDim : '#fff',
          fontSize: '13px',
          fontWeight: 600,
          cursor: starting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        {starting ? 'Starting\u2026' : label}
      </button>
    </div>
  );
}
