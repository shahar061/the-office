import type { AgentInfo } from '../../stores/agents.store';
import { AgentCard } from './AgentCard';

interface AgentGridProps {
  agents: AgentInfo[];
  onSelect: (agent: AgentInfo) => void;
}

const GROUP_ORDER: { key: AgentInfo['group']; label: string }[] = [
  { key: 'leadership', label: 'Leadership' },
  { key: 'coordination', label: 'Coordination' },
  { key: 'engineering', label: 'Engineering' },
];

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    padding: '16px 24px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  groupHeader: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '10px',
  },
};

export function AgentGrid({ agents, onSelect }: AgentGridProps) {
  return (
    <div style={styles.container}>
      {GROUP_ORDER.map(({ key, label }) => {
        const groupAgents = agents.filter((a) => a.group === key);
        if (groupAgents.length === 0) return null;
        return (
          <div key={key}>
            <div style={styles.groupHeader}>{label}</div>
            <div style={styles.grid}>
              {groupAgents.map((agent) => (
                <AgentCard
                  key={agent.role}
                  agent={agent}
                  onClick={() => onSelect(agent)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
