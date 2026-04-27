import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useT } from '../../../../i18n';

interface Props {
  qrPayload: string;
  expiresAt: number;
  sas: string | null;
  onCancel: () => void;
}

function splitSas(sas: string): { left: string; right: string } {
  const compact = sas.replace(/\s+/g, '');
  if (compact.length >= 6) {
    return { left: compact.slice(0, 3), right: compact.slice(3, 6) };
  }
  return { left: sas, right: '' };
}

export function PairingView({ qrPayload, expiresAt, sas, onCancel }: Props) {
  const t = useT();
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [expiresAt]);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const sasParts = sas ? splitSas(sas) : null;

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', marginTop: 12 }}>
      <div style={{ background: '#fff', padding: 10, borderRadius: 10 }}>
        <QRCodeSVG value={qrPayload} size={220} level="M" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{t('settings.mobile.pairing.title')}</div>
        <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>
          {t('settings.mobile.pairing.instruction')}
        </div>
        {sasParts && (
          <div
            // Force LTR: SAS must render left-to-right regardless of system
            // locale so group order is consistent across devices.
            dir="ltr"
            style={{
              padding: '14px 20px',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 12,
              display: 'flex',
              direction: 'ltr',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 28, fontWeight: 700, letterSpacing: '0.1em',
              color: '#fff', textAlign: 'center',
            }}>{sasParts.left}</span>
            <span style={{
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 28, fontWeight: 700, letterSpacing: '0.1em',
              color: '#fff', textAlign: 'center',
            }}>{sasParts.right}</span>
          </div>
        )}
        <div style={{ color: '#9ca3af', fontSize: 12 }}>{t('settings.mobile.pairing.expires', { time: `${mm}:${ss}` })}</div>
        <button onClick={onCancel} style={{
          alignSelf: 'flex-start', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', color: '#e5e7eb',
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
        }}>{t('settings.mobile.pairing.cancel')}</button>
      </div>
    </div>
  );
}
