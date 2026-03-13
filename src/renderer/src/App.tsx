import React from 'react';
import { OfficeCanvas } from './office/OfficeCanvas';

export function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <div style={{ width: 320, borderRight: '1px solid #2a2a4a', padding: 16 }}>
        Chat Panel (placeholder)
      </div>
      <OfficeCanvas />
    </div>
  );
}