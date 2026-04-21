import React, { useState } from 'react';
import { useMobileBridgeStore } from '../../stores/mobile-bridge.store';
import { PillPopover } from './PillPopover';

type Device = {
  deviceId: string;
  deviceName: string;
  mode: 'lan' | 'relay' | 'offline';
  lastSeenAt: number;
  remoteAllowed: boolean;
};

function describe(devices: Device[]): { label: string; dotColor: string } {
  if (devices.length === 0) return { label: '📱 Pair a phone', dotColor: 'transparent' };
  if (devices.length === 1) {
    const d = devices[0];
    const mode = d.mode === 'lan' ? 'Local' : d.mode === 'relay' ? 'Remote' : 'Idle';
    const color = d.mode === 'lan' ? '#22c55e' : d.mode === 'relay' ? '#6366f1' : '#6b7280';
    return { label: `● ${d.deviceName} · ${mode}`, dotColor: color };
  }
  const modes = new Set(devices.map((d) => d.mode));
  const combo = modes.has('lan') && modes.has('relay') ? 'Local+Remote'
              : modes.has('lan') ? 'Local'
              : modes.has('relay') ? 'Remote'
              : 'Idle';
  return { label: `📱 ${devices.length} phones · ${combo}`, dotColor: '#a5b4fc' };
}

export function HeaderStatusPill() {
  const status = useMobileBridgeStore((s) => s.status);
  const devices = status?.devices ?? [];
  const [open, setOpen] = useState(false);
  const { label, dotColor } = describe(devices);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: devices.length === 0 ? 'transparent' : 'rgba(99,102,241,0.12)',
          border: devices.length === 0 ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(99,102,241,0.25)',
          borderRadius: 999,
          fontSize: 12,
          color: '#e5e7eb',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {dotColor !== 'transparent' && (
          <span style={{ width: 6, height: 6, background: dotColor, borderRadius: '50%' }} />
        )}
        {label}
      </button>
      {open && <PillPopover onClose={() => setOpen(false)} />}
    </div>
  );
}
