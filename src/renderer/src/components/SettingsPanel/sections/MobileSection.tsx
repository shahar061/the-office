import React, { useEffect, useState } from 'react';
import { useMobileBridgeStore } from '../../../stores/mobile-bridge.store';
import { useProjectStore } from '../../../stores/project.store';
import { PairingView } from './mobile/PairingView';
import { DeviceCard } from './mobile/DeviceCard';

export function MobileSection() {
  const store = useMobileBridgeStore();
  const [pairing, setPairing] = useState<{ qrPayload: string; expiresAt: number } | null>(null);

  useEffect(() => {
    void store.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPair() {
    const qr = await window.office.mobile.getPairingQR();
    setPairing(qr);
    void store.refresh();
  }

  const projectState = useProjectStore((s) => s.projectState);
  const inSession = projectState !== null;

  const status = store.status;
  const devices = status?.devices ?? [];
  const v1DeviceCount = status?.v1DeviceCount ?? 0;
  const relay = status?.relay ?? 'disabled';

  const relayLabel = {
    ready: '● Relay ready',
    unreachable: '○ Relay unreachable · LAN still works',
    disabled: '● Relay disabled (no remote devices)',
    paused: '⏸ Relay paused',
  }[relay];

  const relayColor = {
    ready: '#86efac',
    unreachable: '#fdba74',
    disabled: '#9ca3af',
    paused: '#a5b4fc',
  }[relay];

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Mobile Companion</div>
      <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
        Pair your phone to watch agents run and reply on the go.
      </div>

      {v1DeviceCount > 0 && (
        <div style={{
          padding: 12, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)',
          borderRadius: 8, marginBottom: 16,
        }}>
          <div style={{ color: '#fdba74', fontWeight: 600, fontSize: 13 }}>Action required</div>
          <div style={{ color: '#d1d5db', fontSize: 12, marginTop: 4 }}>
            Re-pair your existing phone to upgrade to encrypted v2 pairing.
          </div>
        </div>
      )}

      {!pairing && (
        <button
          onClick={startPair}
          disabled={!inSession}
          title={!inSession ? 'Open a project first to pair a phone' : undefined}
          style={{
            background: inSession ? '#6366f1' : 'rgba(99,102,241,0.3)',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: inSession ? 'pointer' : 'not-allowed',
          }}
        >
          Pair a phone
        </button>
      )}
      {!pairing && !inSession && (
        <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
          Open a project first to pair a phone.
        </div>
      )}

      {pairing && (
        <PairingView
          qrPayload={pairing.qrPayload}
          expiresAt={pairing.expiresAt}
          sas={status?.pendingSas ?? null}
          onCancel={() => setPairing(null)}
        />
      )}

      {devices.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            color: '#a5b4fc', fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10,
          }}>Trusted devices ({devices.length})</div>
          {devices.map((d) => <DeviceCard key={d.deviceId} device={d} />)}
        </div>
      )}

      {devices.length === 0 && !pairing && (
        <div style={{
          marginTop: 28, padding: 28, background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
          <div style={{ color: '#d1d5db', fontSize: 14 }}>Get agent updates on your phone.</div>
        </div>
      )}

      <div style={{ marginTop: 24, color: relayColor, fontSize: 12 }}>{relayLabel}</div>

      <details style={{ marginTop: 24, color: '#9ca3af' }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          Advanced: LAN direct connection
        </summary>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="192.168.1.42 (optional)"
            defaultValue={status?.lanHost ?? ''}
            onBlur={(e) => {
              const trimmed = e.target.value.trim();
              void store.setLanHost(trimmed || null);
            }}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 11 }}>
          Pair over your local network for lower latency. Leave empty to pair via the encrypted relay.
          Changes take effect on the next QR generation.
        </div>
      </details>
    </div>
  );
}
