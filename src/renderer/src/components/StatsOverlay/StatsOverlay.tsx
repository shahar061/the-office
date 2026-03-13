import React from 'react';
import { useOfficeStore } from '../../stores/office.store';
import { useChatStore } from '../../stores/chat.store';
import { AGENT_CONFIGS } from '../../office/characters/agents.config';
import { AGENT_GROUPS } from '@shared/types';

export function StatsOverlay() {
  const agents = useOfficeStore((s) => s.agents);
  const totalCost = useChatStore((s) => s.totalCost);
  const totalTokens = useChatStore((s) => s.totalTokens);
  const currentPhase = useChatStore((s) => s.currentPhase);

  const groupOrder = ['leadership', 'coordination', 'engineering'] as const;

  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      right: 12,
      background: 'rgba(15, 15, 26, 0.85)',
      border: '1px solid #2a2a4a',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 11,
      color: '#9ca3af',
      pointerEvents: 'none',
      minWidth: 180,
    }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <span>${totalCost.toFixed(2)}</span>
        <span>{(totalTokens / 1000).toFixed(1)}k</span>
        <span style={{ textTransform: 'capitalize' }}>{currentPhase}</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {groupOrder.map((group) => (
          <div key={group} style={{ display: 'flex', gap: 3 }}>
            {AGENT_GROUPS[group].map((role) => {
              const config = AGENT_CONFIGS[role];
              const isActive = Object.values(agents).some(
                (a) => a.role === role && (a.state === 'type' || a.state === 'read'),
              );
              return (
                <div
                  key={role}
                  title={config.displayName}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: config.color,
                    opacity: isActive ? 1 : 0.3,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}