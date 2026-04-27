import React, { useEffect, useState } from 'react';
import { useMobileBridgeStore } from '../../../stores/mobile-bridge.store';
import { useProjectStore } from '../../../stores/project.store';
import { useT, type StringKey } from '../../../i18n';
import { PairingView } from './mobile/PairingView';
import { DeviceCard } from './mobile/DeviceCard';

export function MobileSection() {
  const store = useMobileBridgeStore();
  const [pairing, setPairing] = useState<{ qrPayload: string; expiresAt: number } | null>(null);
  const t = useT();

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

  const relayLabelKey: StringKey = {
    ready: 'settings.mobile.relay.ready',
    unreachable: 'settings.mobile.relay.unreachable',
    disabled: 'settings.mobile.relay.disabled',
    paused: 'settings.mobile.relay.paused',
  }[relay] as StringKey;
  const relayLabel = t(relayLabelKey);

  const relayColor = {
    ready: '#86efac',
    unreachable: '#fdba74',
    disabled: '#9ca3af',
    paused: '#a5b4fc',
  }[relay];

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{t('settings.mobile.title')}</div>
      <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
        {t('settings.mobile.subtitle')}
      </div>

      {v1DeviceCount > 0 && (
        <div style={{
          padding: 12, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)',
          borderRadius: 8, marginBottom: 16,
        }}>
          <div style={{ color: '#fdba74', fontWeight: 600, fontSize: 13 }}>{t('settings.mobile.actionRequired')}</div>
          <div style={{ color: '#d1d5db', fontSize: 12, marginTop: 4 }}>
            {t('settings.mobile.repair')}
          </div>
        </div>
      )}

      {!pairing && (
        <button
          onClick={startPair}
          disabled={!inSession}
          title={!inSession ? t('settings.mobile.openProjectTooltip') : undefined}
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
          {t('settings.mobile.pair')}
        </button>
      )}
      {!pairing && !inSession && (
        <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
          {t('settings.mobile.openProjectFirst')}
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
          }}>{t('settings.mobile.trustedDevices', { count: devices.length })}</div>
          {devices.map((d) => <DeviceCard key={d.deviceId} device={d} />)}
        </div>
      )}

      {devices.length === 0 && !pairing && (
        <div style={{
          marginTop: 28, padding: 28, background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
          <div style={{ color: '#d1d5db', fontSize: 14 }}>{t('settings.mobile.empty')}</div>
        </div>
      )}

      <div style={{ marginTop: 24, color: relayColor, fontSize: 12 }}>{relayLabel}</div>

      <details style={{ marginTop: 24, color: '#9ca3af' }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          {t('settings.mobile.advanced')}
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
          {t('settings.mobile.lanHelper')}
        </div>
      </details>
    </div>
  );
}
