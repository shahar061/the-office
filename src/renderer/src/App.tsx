import React from 'react';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { TopBar } from './components/TopBar/TopBar';
import { StatsOverlay } from './components/StatsOverlay/StatsOverlay';
import { OfficeCanvas } from './office/OfficeCanvas';

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ChatPanel />
        <OfficeCanvas />
        <StatsOverlay />
      </div>
    </div>
  );
}