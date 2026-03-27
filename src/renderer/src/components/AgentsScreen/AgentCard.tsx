import type { AgentInfo } from '../../stores/agents.store';

interface AgentCardProps {
  agent: AgentInfo;
  onClick: () => void;
  compact?: boolean;
}

const styles = {
  card: (color: string) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderLeft: `3px solid ${color}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    transition: 'border-color 0.15s, background 0.15s',
    width: '100%',
  }),
  spriteWrapper: {
    width: '32px',
    height: '48px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sprite: {
    width: '32px',
    height: '64px',
    objectFit: 'none' as const,
    objectPosition: '0 0',
    imageRendering: 'pixelated' as const,
    transform: 'scale(2)',
    transformOrigin: 'top left',
  },
  info: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
  name: (color: string) => ({
    fontSize: '13px',
    fontWeight: 700,
    color,
  }),
  description: {
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '180px',
  },
  group: {
    fontSize: '9px',
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
};

export function AgentCard({ agent, onClick, compact }: AgentCardProps) {
  return (
    <button style={styles.card(agent.color)} onClick={onClick}>
      <div style={styles.spriteWrapper}>
        <img
          src={agent.spriteSheetUrl}
          alt={agent.displayName}
          style={styles.sprite}
          draggable={false}
        />
      </div>
      <div style={styles.info}>
        <span style={styles.name(agent.color)}>{agent.displayName}</span>
        {!compact && <span style={styles.description}>{agent.description}</span>}
        <span style={styles.group}>{agent.group}</span>
      </div>
    </button>
  );
}
