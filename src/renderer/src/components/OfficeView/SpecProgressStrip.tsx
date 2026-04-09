import { useSpecProgressStore } from '../../stores/spec-progress.store';
import { colors } from '../../theme';

const stripStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '34px',
  background: 'rgba(15,15,26,0.85)',
  borderTop: `1px solid ${colors.border}`,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  gap: '12px',
  zIndex: 5,
  fontSize: '11px',
  fontFamily: 'monospace',
  transition: 'opacity 0.4s ease',
};

const segmentBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '2px',
  flex: 1,
  height: '6px',
  borderRadius: '3px',
  overflow: 'hidden',
};

const STATUS_COLORS: Record<string, string> = {
  queued: colors.border,
  active: colors.warning,
  done: colors.success,
};

export function SpecProgressStrip() {
  const phases = useSpecProgressStore((s) => s.phases);
  const visible = useSpecProgressStore((s) => s.visible);

  if (!visible || phases.size === 0) return null;

  const entries = [...phases.entries()];
  const doneCount = entries.filter(([, p]) => p.status === 'done').length;
  const activeNames = entries
    .filter(([, p]) => p.status === 'active')
    .map(([, p]) => p.name);
  const total = entries.length;
  const allDone = doneCount === total;

  const statusText = allDone
    ? 'All specs complete'
    : activeNames.length > 0
      ? activeNames.join(', ')
      : 'queued...';

  return (
    <div style={{ ...stripStyle, opacity: visible ? 1 : 0 }}>
      <span style={{ color: colors.textMuted, whiteSpace: 'nowrap' }}>
        Specs: {doneCount}/{total}
      </span>
      <div style={segmentBarStyle}>
        {entries.map(([id, phase]) => (
          <div
            key={id}
            style={{
              flex: 1,
              background: STATUS_COLORS[phase.status],
              borderRadius: '3px',
              transition: 'background 0.3s ease',
              animation: phase.status === 'active' ? 'spec-pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
        ))}
      </div>
      <span style={{
        color: allDone ? colors.success : colors.textDim,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '200px',
      }}>
        {statusText}
      </span>
      <style>{`
        @keyframes spec-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
