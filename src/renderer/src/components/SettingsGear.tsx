import React from 'react';
import { useSettingsStore } from '../stores/settings.store';

export function SettingsGear() {
  const open = useSettingsStore((s) => s.open);

  return (
    <button
      onClick={open}
      title="Settings"
      style={{
        background: 'none',
        border: '1px solid #2a2a4a',
        borderRadius: 2,
        color: '#9ca3af',
        cursor: 'pointer',
        padding: '2px 6px',
        fontSize: 14,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ⚙
    </button>
  );
}
