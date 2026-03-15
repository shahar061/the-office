import React from 'react';
import { useSettingsStore } from '../stores/settings.store';

export function SettingsGear() {
  const open = useSettingsStore((s) => s.open);

  return (
    <button
      onClick={open}
      title="Settings"
      style={{
        background: '#3b82f6',
        border: '2px solid #3b82f6',
        borderRadius: 2,
        color: '#ffffff',
        cursor: 'pointer',
        padding: '6px 10px',
        fontSize: 18,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 8px rgba(59, 130, 246, 0.2)',
      }}
    >
      ⚙
    </button>
  );
}
