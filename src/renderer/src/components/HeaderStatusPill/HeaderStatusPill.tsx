import React, { useState } from 'react';
import { useMobileBridgeStore } from '../../stores/mobile-bridge.store';
import { useT, type StringKey } from '../../i18n';
import { PillPopover } from './PillPopover';

type Device = {
  deviceId: string;
  deviceName: string;
  mode: 'lan' | 'relay' | 'offline';
  lastSeenAt: number;
  remoteAllowed: boolean;
};

function modeKey(mode: 'lan' | 'relay' | 'offline'): StringKey {
  if (mode === 'lan') return 'mobile.mode.local';
  if (mode === 'relay') return 'mobile.mode.remote';
  return 'mobile.mode.idle';
}

function describe(devices: Device[], t: ReturnType<typeof useT>): { label: string; dotColor: string } {
  if (devices.length === 0) return { label: t('mobile.pill.pairPhone'), dotColor: 'transparent' };
  if (devices.length === 1) {
    const d = devices[0];
    const color = d.mode === 'lan' ? '#22c55e' : d.mode === 'relay' ? '#6366f1' : '#6b7280';
    return { label: `${d.deviceName} · ${t(modeKey(d.mode))}`, dotColor: color };
  }
  const modes = new Set(devices.map((d) => d.mode));
  const comboKey: StringKey = modes.has('lan') && modes.has('relay') ? 'mobile.mode.localRemote'
                : modes.has('lan') ? 'mobile.mode.local'
                : modes.has('relay') ? 'mobile.mode.remote'
                : 'mobile.mode.idle';
  return {
    label: t('mobile.pill.multi', { count: devices.length, mode: t(comboKey) }),
    dotColor: '#a5b4fc',
  };
}

export function HeaderStatusPill() {
  const status = useMobileBridgeStore((s) => s.status);
  const devices = status?.devices ?? [];
  const [open, setOpen] = useState(false);
  const t = useT();
  const { label, dotColor } = describe(devices, t);

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
          <span
            style={{
              width: 8,
              height: 8,
              background: dotColor,
              borderRadius: '50%',
              flexShrink: 0,
              alignSelf: 'center',
            }}
          />
        )}
        {label}
      </button>
      {open && <PillPopover onClose={() => setOpen(false)} />}
    </div>
  );
}
