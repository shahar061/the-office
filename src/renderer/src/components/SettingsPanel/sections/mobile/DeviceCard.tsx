import React, { useState } from 'react';
import { useMobileBridgeStore } from '../../../../stores/mobile-bridge.store';

interface Props {
  device: {
    deviceId: string;
    deviceName: string;
    mode: 'lan' | 'relay' | 'offline';
    lastSeenAt: number;
    remoteAllowed: boolean;
  };
}

function formatLastSeen(ts: number, mode: string): string {
  if (mode === 'lan') return 'Active now · Local';
  if (mode === 'relay') return 'Active now · Remote';
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return `Just now · Idle`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago · Idle`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago · Idle`;
  return `${Math.floor(secs / 86400)}d ago · Idle`;
}

export function DeviceCard({ device }: Props) {
  const { renameDevice, setRemoteAccess, revoke } = useMobileBridgeStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.deviceName);

  const dotColor = device.mode === 'lan' ? '#22c55e'
                 : device.mode === 'relay' ? '#6366f1'
                 : '#6b7280';

  return (
    <div style={{
      padding: 14, border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8,
    }}>
      <div style={{
        width: 36, height: 36, background: 'rgba(99,102,241,0.15)',
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>📱</div>
      <div style={{ flex: 1 }}>
        {editing ? (
          <input
            autoFocus value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              const trimmed = name.trim();
              if (!trimmed) {
                setName(device.deviceName);       // reject empty, restore previous
                return;
              }
              if (trimmed !== device.deviceName) renameDevice(device.deviceId, trimmed);
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 14, fontWeight: 500, padding: 0 }}
          />
        ) : (
          <div style={{ color: '#fff', fontWeight: 500, fontSize: 14, cursor: 'text' }} onClick={() => setEditing(true)}>
            {device.deviceName}
          </div>
        )}
        <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, background: dotColor, borderRadius: '50%' }} />
          {formatLastSeen(device.lastSeenAt, device.mode)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', fontSize: 11 }}>
        <label style={{ color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={device.remoteAllowed}
            onChange={e => setRemoteAccess(device.deviceId, e.target.checked)}
          />
          Remote access
        </label>
        <button
          onClick={() => {
            if (confirm('Revoke this phone? It will stop receiving updates. You can re-pair anytime.')) {
              revoke(device.deviceId);
            }
          }}
          style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, padding: 0 }}>
          Revoke…
        </button>
      </div>
    </div>
  );
}
