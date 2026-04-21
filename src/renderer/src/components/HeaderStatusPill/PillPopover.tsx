import React, { useEffect, useRef } from 'react';
import { useMobileBridgeStore } from '../../stores/mobile-bridge.store';
import { useSettingsStore } from '../../stores/settings.store';

interface Props {
  onClose: () => void;
}

export function PillPopover({ onClose }: Props) {
  const status = useMobileBridgeStore((s) => s.status);
  const pauseRelay = useMobileBridgeStore((s) => s.pauseRelay);
  const settingsStore = useSettingsStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  const devices = status?.devices ?? [];
  const paused = status?.relay === 'paused';

  async function togglePause() {
    await pauseRelay(paused ? null : Number.MAX_SAFE_INTEGER);
  }

  function openMobileTab() {
    onClose();
    settingsStore.open('mobile');
  }

  async function pairAnother() {
    onClose();
    settingsStore.open('mobile');
    try { await window.office.mobile.getPairingQR(); } catch { /* ignore */ }
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 40,
        right: 0,
        width: 320,
        background: '#0f0f14',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 1000,
      }}
    >
      {devices.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 4px' }}>
          No phones paired yet.
        </div>
      ) : (
        devices.map((d) => (
          <div key={d.deviceId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: d.mode === 'lan' ? '#22c55e' : d.mode === 'relay' ? '#6366f1' : '#6b7280',
            }} />
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, flex: 1 }}>{d.deviceName}</span>
            <span style={{ color: '#9ca3af', fontSize: 11 }}>
              {d.mode === 'lan' ? 'Local' : d.mode === 'relay' ? 'Remote' : 'Idle'}
            </span>
          </div>
        ))
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

      <button
        onClick={togglePause}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px',
          background: paused ? 'rgba(99,102,241,0.15)' : 'transparent',
          border: 'none', borderRadius: 8, color: '#e5e7eb', fontSize: 13,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        ⏸ {paused ? 'Remote access paused' : 'Pause remote access'}
      </button>

      <button onClick={pairAnother} style={linkStyle}>
        Pair another phone
      </button>
      <button onClick={openMobileTab} style={linkStyle}>
        Manage in Settings…
      </button>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  padding: '8px 8px',
  background: 'transparent',
  border: 'none',
  color: '#a5b4fc',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
};
