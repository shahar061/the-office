import { useEffect, useState } from 'react';
import { useAgentsStore } from '../../stores/agents.store';
import { AgentGrid } from './AgentGrid';
import { AgentDetailPanel } from './AgentDetailPanel';

type View = 'grid' | 'orgchart';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: '#0f0f1a',
    overflow: 'hidden',
    paddingTop: '48px',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 24px 0',
    flexShrink: 0,
  },
  toggle: {
    display: 'flex',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  toggleBtn: (active: boolean) => ({
    padding: '6px 16px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    background: active ? '#2a2a4a' : 'transparent',
    color: active ? '#e5e5e5' : '#666',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  }),
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: '14px',
  },
};

export function AgentsScreen() {
  const { agents, loaded, loadAgents, selectedAgent, selectAgent, clearSelection } = useAgentsStore();
  const [view, setView] = useState<View>('grid');

  useEffect(() => {
    loadAgents();
  }, []);

  const selectedInfo = selectedAgent
    ? agents.find((a) => a.role === selectedAgent) ?? null
    : null;

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div style={styles.toggle}>
          <button style={styles.toggleBtn(view === 'grid')} onClick={() => setView('grid')}>
            Grid
          </button>
          <button style={styles.toggleBtn(view === 'orgchart')} onClick={() => setView('orgchart')}>
            Org Chart
          </button>
        </div>
      </div>

      {!loaded ? (
        <div style={styles.placeholder}>Loading agents...</div>
      ) : view === 'grid' ? (
        <AgentGrid agents={agents} onSelect={(a) => selectAgent(a.role)} />
      ) : (
        <div style={styles.placeholder}>Org chart view coming next...</div>
      )}

      {selectedInfo && (
        <AgentDetailPanel agent={selectedInfo} onClose={clearSelection} />
      )}
    </div>
  );
}
