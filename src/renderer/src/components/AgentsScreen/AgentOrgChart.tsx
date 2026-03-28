import type { AgentInfo } from '../../stores/agents.store';
import type { AgentRole } from '@shared/types';

interface AgentOrgChartProps {
  agents: AgentInfo[];
  onSelect: (agent: AgentInfo) => void;
}

const TIERS: { label: string; roles: AgentRole[]; annotations?: Record<string, string> }[] = [
  {
    label: 'Leadership',
    roles: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
    annotations: {
      'ceo': 'Vision Brief',
      'product-manager': 'PRD',
      'market-researcher': 'Market Analysis',
      'chief-architect': 'System Design',
    },
  },
  {
    label: 'Coordination',
    roles: ['agent-organizer', 'project-manager', 'team-lead'],
  },
  {
    label: 'Engineering',
    roles: [
      'backend-engineer', 'frontend-engineer', 'mobile-developer',
      'ui-ux-expert', 'data-engineer', 'devops', 'automation-developer', 'freelancer',
    ],
  },
];

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  tier: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  tierLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  tierNodes: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: '10px',
  },
  connector: {
    width: '2px',
    height: '20px',
    background: '#333',
    margin: '0 auto',
  },
  node: (color: string) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '10px 14px',
    background: '#1a1a2e',
    border: `1px solid ${color}44`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
    minWidth: '90px',
  }),
  nodeSpriteWrapper: {
    width: '32px',
    height: '64px',
    overflow: 'hidden',
  },
  nodeSprite: {
    width: '32px',
    height: '64px',
    objectFit: 'none' as const,
    objectPosition: '-288px -32px',
    imageRendering: 'pixelated' as const,
    transform: 'scale(2)',
    transformOrigin: 'top left',
  },
  nodeName: (color: string) => ({
    fontSize: '11px',
    fontWeight: 600,
    color,
    textAlign: 'center' as const,
  }),
  annotation: {
    fontSize: '9px',
    color: '#475569',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
};

export function AgentOrgChart({ agents, onSelect }: AgentOrgChartProps) {
  const agentMap = new Map(agents.map((a) => [a.role, a]));

  return (
    <div style={styles.container}>
      {TIERS.map((tier, i) => (
        <div key={tier.label}>
          {i > 0 && <div style={styles.connector} />}
          <div style={styles.tier}>
            <span style={styles.tierLabel}>{tier.label}</span>
            <div style={styles.tierNodes}>
              {tier.roles.map((role) => {
                const agent = agentMap.get(role);
                if (!agent) return null;
                const annotation = tier.annotations?.[role];
                return (
                  <button
                    key={role}
                    style={styles.node(agent.color)}
                    onClick={() => onSelect(agent)}
                  >
                    <div style={styles.nodeSpriteWrapper}>
                      <img
                        src={agent.spriteSheetUrl}
                        alt={agent.displayName}
                        style={styles.nodeSprite}
                        draggable={false}
                      />
                    </div>
                    <span style={styles.nodeName(agent.color)}>{agent.displayName}</span>
                    {annotation && <span style={styles.annotation}>{annotation} →</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
