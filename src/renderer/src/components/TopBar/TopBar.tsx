import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chat.store';
import type { ConnectionStatus } from '../../../shared/types';

export function TopBar() {
  const totalCost = useChatStore((s) => s.totalCost);
  const totalTokens = useChatStore((s) => s.totalTokens);
  const [connection, setConnection] = useState<ConnectionStatus>({
    claudeCode: 'disconnected',
    openCode: 'disconnected',
  });

  useEffect(() => {
    if (!(window as any).office?.onConnectionStatus) return;
    const unsub = (window as any).office.onConnectionStatus(setConnection);
    return unsub;
  }, []);

  const dot = (status: string) => {
    const color = status === 'connected' ? '#4ade80' : status === 'error' ? '#ef4444' : '#6b7280';
    return (
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        marginRight: 4,
      }} />
    );
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '6px 16px',
      background: '#0a0a18',
      borderBottom: '1px solid #2a2a4a',
      fontSize: 12,
      color: '#9ca3af',
    }}>
      <span>{dot(connection.claudeCode)} Claude Code</span>
      <span>{dot(connection.openCode)} OpenCode</span>
      <span style={{ marginLeft: 'auto' }}>${totalCost.toFixed(2)}</span>
      <span>{(totalTokens / 1000).toFixed(1)}k tokens</span>
    </div>
  );
}