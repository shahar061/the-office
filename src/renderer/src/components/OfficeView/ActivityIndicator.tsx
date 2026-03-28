import { useOfficeStore } from '../../stores/office.store';
import type { ActivityAction } from '../../stores/office.store';
import { AGENT_COLORS } from '@shared/types';
import { agentDisplayName } from '../../utils';
import { colors } from '../../theme';

function ActionRow({ action, agentColor }: { action: ActivityAction; agentColor: string }) {
  const isDone = action.status === 'done';

  return (
    <div style={styles.actionRow}>
      {isDone ? (
        <span style={styles.checkmark}>{'\u2713'}</span>
      ) : (
        <span
          style={{
            ...styles.spinner,
            borderColor: `${agentColor}33`,
            borderTopColor: agentColor,
          }}
        />
      )}
      <span style={isDone ? styles.actionTextDone : styles.actionTextRunning}>
        {action.toolName} {action.target}
        {!isDone && '...'}
      </span>
    </div>
  );
}

export function ActivityIndicator() {
  const { agentRole, actions } = useOfficeStore((s) => s.agentActivity);

  if (!agentRole) return null;

  const agentColor = AGENT_COLORS[agentRole] ?? colors.textMuted;
  const displayName = agentDisplayName(agentRole);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ ...styles.dot, background: agentColor }} />
        <span style={{ ...styles.agentName, color: agentColor }}>{displayName}</span>
      </div>
      <div style={{ ...styles.timeline, borderLeftColor: `${agentColor}4D` }}>
        {actions.length === 0 ? (
          <div style={styles.actionRow}>
            <span
              style={{
                ...styles.spinner,
                borderColor: `${agentColor}33`,
                borderTopColor: agentColor,
              }}
            />
            <span style={styles.actionTextRunning}>Thinking...</span>
          </div>
        ) : (
          actions.map((action) => (
            <ActionRow key={action.id} action={action} agentColor={agentColor} />
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '8px 12px 12px',
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  } as React.CSSProperties,
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  } as React.CSSProperties,
  agentName: {
    fontSize: '11px',
    fontWeight: 600,
  } as React.CSSProperties,
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    paddingLeft: '14px',
    borderLeft: '2px solid',
  } as React.CSSProperties,
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  checkmark: {
    fontSize: '10px',
    color: colors.success,
    width: '10px',
    textAlign: 'center' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  spinner: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    border: '2px solid',
    borderTopColor: 'transparent',
    flexShrink: 0,
    animation: 'activity-spin 0.8s linear infinite',
  } as React.CSSProperties,
  actionTextDone: {
    fontSize: '10px',
    color: colors.textDark,
  } as React.CSSProperties,
  actionTextRunning: {
    fontSize: '10px',
    color: colors.text,
    fontWeight: 500,
  } as React.CSSProperties,
};
