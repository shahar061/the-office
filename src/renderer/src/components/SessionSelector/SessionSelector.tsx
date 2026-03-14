import React from 'react';
import { useOfficeStore } from '../../stores/office.store';
import { AGENT_CONFIGS } from '../../office/characters/agents.config';

export function SessionSelector() {
  const agents = useOfficeStore((s) => s.agents);
  const focusedSessionId = useOfficeStore((s) => s.focusedSessionId);
  const setFocusedSession = useOfficeStore((s) => s.setFocusedSession);

  const sessions = Object.values(agents);

  if (sessions.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(15, 15, 26, 0.9)',
      border: '1px solid #2a2a4a',
      borderRadius: 8,
      padding: '6px 8px',
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      zIndex: 10,
    }}>
      <span style={{ fontSize: 10, color: '#6b7280', marginRight: 2 }}>Sessions:</span>
      {sessions.map((agent) => {
        const config = AGENT_CONFIGS[agent.role];
        const isSelected = focusedSessionId === agent.agentId;
        return (
          <button
            key={agent.agentId}
            onClick={() => setFocusedSession(isSelected ? null : agent.agentId)}
            title={`${config.displayName} (${agent.agentId.slice(0, 12)}...)`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 4,
              border: isSelected ? `1px solid ${config.color}` : '1px solid transparent',
              background: isSelected ? `${config.color}22` : 'rgba(42, 42, 74, 0.5)',
              color: isSelected ? config.color : '#9ca3af',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: config.color,
              opacity: agent.state === 'type' || agent.state === 'read' ? 1 : 0.5,
            }} />
            {config.displayName}
          </button>
        );
      })}
      {focusedSessionId && (
        <button
          onClick={() => setFocusedSession(null)}
          title="Show all"
          style={{
            padding: '3px 6px',
            borderRadius: 4,
            border: '1px solid #4a4a6a',
            background: 'transparent',
            color: '#6b7280',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          All
        </button>
      )}
    </div>
  );
}
