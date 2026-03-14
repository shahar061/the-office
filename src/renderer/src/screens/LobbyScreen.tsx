import React from 'react';
import { SessionPanel } from '../components/SessionPanel/SessionPanel';
import { LobbyCanvas } from '../lobby/LobbyCanvas';
import { LobbyFAB } from '../components/LobbyFAB/LobbyFAB';

export function LobbyScreen() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5', position: 'relative' }}>
      <SessionPanel />
      <LobbyCanvas />
      <LobbyFAB />
    </div>
  );
}
