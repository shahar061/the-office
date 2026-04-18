import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  qrPayload: string;
  expiresAt: number;
  sas: string | null;
  onCancel: () => void;
}

export function PairingView({ qrPayload, expiresAt, sas, onCancel }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [expiresAt]);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', marginTop: 12 }}>
      <div style={{ background: '#fff', padding: 10, borderRadius: 10 }}>
        <QRCodeSVG value={qrPayload} size={220} level="M" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Scan with The Office mobile app</div>
        <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>
          You'll confirm a 6-digit code on both devices before pairing completes.
        </div>
        {sas && (
          <div style={{
            padding: '14px 20px', background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12,
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 28, fontWeight: 700, letterSpacing: '0.15em',
            color: '#fff', textAlign: 'center',
          }}>{sas}</div>
        )}
        <div style={{ color: '#9ca3af', fontSize: 12 }}>Code expires in {mm}:{ss}</div>
        <button onClick={onCancel} style={{
          alignSelf: 'flex-start', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', color: '#e5e7eb',
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
        }}>Cancel</button>
      </div>
    </div>
  );
}
