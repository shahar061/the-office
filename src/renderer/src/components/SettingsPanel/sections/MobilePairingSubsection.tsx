import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useMobileBridgeStore } from '../../../stores/mobile-bridge.store';
import { colors } from '../../../theme';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: `1px solid ${colors.borderLight}`,
  },
  header: { fontSize: '14px', fontWeight: 700 as const, color: colors.text },
  statusLine: { fontSize: '12px', color: colors.textMuted },
  actionRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  primaryBtn: {
    background: colors.accent,
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600 as const,
    padding: '8px 14px',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '12px',
    padding: '8px 14px',
    fontFamily: 'inherit',
  },
  smallBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '11px',
    padding: '4px 10px',
    fontFamily: 'inherit',
  },
  migrationBanner: {
    padding: '10px 12px',
    background: 'rgba(251,146,60,0.1)',
    border: `1px solid rgba(251,146,60,0.35)`,
    borderRadius: '6px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  migrationBannerTitle: {
    fontSize: '11px',
    fontWeight: 700 as const,
    color: '#fdba74',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  migrationBannerBody: {
    fontSize: '12px',
    color: colors.textMuted,
    lineHeight: 1.5,
  },
  qrBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    background: 'rgba(59,130,246,0.08)',
    border: `1px solid rgba(59,130,246,0.35)`,
    borderRadius: '6px',
  },
  qrHint: { fontSize: '11px', color: colors.textMuted, textAlign: 'center' as const },
  sasBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
    padding: '12px 16px',
    background: 'rgba(99,102,241,0.12)',
    border: `1px solid rgba(99,102,241,0.4)`,
    borderRadius: '6px',
    marginTop: '8px',
  },
  sasLabel: {
    fontSize: '11px',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    fontWeight: 700 as const,
  },
  sasCode: {
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: '28px',
    fontWeight: 700 as const,
    letterSpacing: '0.15em',
    color: colors.text,
  },
  devicesHeader: { fontSize: '12px', fontWeight: 600 as const, color: colors.text, marginTop: '8px' },
  emptyHint: { fontSize: '11px', color: colors.textMuted, fontStyle: 'italic' as const },
  deviceList: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.02)',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
  },
  deviceInfo: { display: 'flex', flexDirection: 'column' as const, gap: '2px', minWidth: 0, flex: 1 },
  deviceName: { fontSize: '12px', color: colors.text, fontWeight: 600 as const },
  deviceMeta: { fontSize: '10px', color: colors.textMuted },
} as const;

export function MobilePairingSubsection() {
  const { status, devices, pendingQR, refresh, generateQR, clearQR, revoke } = useMobileBridgeStore();
  const [now, setNow] = useState(Date.now());

  // Initial load + subscribe to live status
  useEffect(() => {
    void refresh();
    const unsub = window.office.mobile.onStatusChange(() => { void refresh(); });
    return () => { unsub(); };
  }, [refresh]);

  // Countdown tick while a QR is pending
  useEffect(() => {
    if (!pendingQR) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= pendingQR.expiresAt) clearQR();
    }, 500);
    return () => clearInterval(timer);
  }, [pendingQR, clearQR]);

  const secondsRemaining = pendingQR ? Math.max(0, Math.floor((pendingQR.expiresAt - now) / 1000)) : 0;

  return (
    <div style={styles.root}>
      <div style={styles.header}>Mobile Pairing</div>

      {status?.v1DeviceCount && status.v1DeviceCount > 0 ? (
        <div style={styles.migrationBanner}>
          <div style={styles.migrationBannerTitle}>Action required</div>
          <div style={styles.migrationBannerBody}>
            We've upgraded pairing security. Your existing phone{status.v1DeviceCount === 1 ? '' : 's'} {status.v1DeviceCount === 1 ? 'needs' : 'need'} to re-pair once to continue using the companion.
          </div>
        </div>
      ) : null}

      <div style={styles.statusLine}>
        {status?.running
          ? `Bridge running on port ${status.port} · ${status.connectedDevices} connected`
          : 'Bridge not running'}
      </div>

      <div style={styles.actionRow}>
        {!pendingQR && (
          <button style={styles.primaryBtn} onClick={() => void generateQR()}>
            Generate pairing QR
          </button>
        )}
      </div>

      {pendingQR && (
        <div style={styles.qrBlock}>
          <QRCodeSVG value={pendingQR.qrPayload} size={220} bgColor="#ffffff" fgColor="#000000" />
          <div style={styles.qrHint}>
            Scan from The Office mobile app. Expires in {secondsRemaining}s.
          </div>
          {status?.pendingSas && (
            <div style={styles.sasBlock}>
              <div style={styles.sasLabel}>Confirm this code matches on your phone</div>
              <div style={styles.sasCode}>{status.pendingSas}</div>
              <div style={styles.qrHint}>
                If the codes differ, someone may be intercepting. Cancel and try again.
              </div>
            </div>
          )}
          <button style={styles.cancelBtn} onClick={clearQR}>Hide</button>
        </div>
      )}

      <div style={styles.devicesHeader}>Paired devices</div>
      {devices.length === 0 ? (
        <div style={styles.emptyHint}>No devices paired.</div>
      ) : (
        <div style={styles.deviceList}>
          {devices.map((d) => (
            <div key={d.deviceId} style={styles.deviceRow}>
              <div style={styles.deviceInfo}>
                <div style={styles.deviceName}>{d.deviceName}</div>
                <div style={styles.deviceMeta}>
                  paired {new Date(d.pairedAt).toLocaleDateString()} · last seen{' '}
                  {new Date(d.lastSeenAt).toLocaleString()}
                </div>
              </div>
              <button style={styles.smallBtn} onClick={() => void revoke(d.deviceId)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
