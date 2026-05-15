import { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { useSettingsStore } from '../../../stores/settings.store';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';

const styles = {
  root: {
    padding: '24px',
    color: colors.text,
    fontSize: 13,
    overflowY: 'auto' as const,
    height: '100%',
    boxSizing: 'border-box' as const,
  },
  heading: {
    fontSize: 14,
    fontWeight: 600 as const,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 18,
    lineHeight: 1.5,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: colors.text,
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 1.4,
    maxWidth: 480,
  },
  switch: (on: boolean): React.CSSProperties => ({
    width: 36,
    height: 20,
    background: on ? colors.accent : colors.border,
    borderRadius: 999,
    position: 'relative',
    cursor: 'pointer',
    flexShrink: 0,
    border: 'none',
    outline: 'none',
    padding: 0,
    transition: 'background 0.15s',
  }),
  switchKnob: (on: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: 2,
    insetInlineStart: on ? 18 : 2,
    width: 16,
    height: 16,
    background: '#fff',
    borderRadius: '50%',
    transition: 'inset-inline-start 0.15s',
  }),
  collectedTitle: {
    fontSize: 12,
    fontWeight: 600 as const,
    color: colors.text,
    marginTop: 8,
    marginBottom: 6,
  },
  list: {
    margin: 0,
    paddingInlineStart: 18,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 1.6,
  },
  installRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    flexWrap: 'wrap' as const,
  },
  installIdLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  installId: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    color: colors.textDim,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: '2px 6px',
  },
  smallButton: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  dangerSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: `1px solid ${colors.border}`,
  },
  dangerButton: {
    background: 'transparent',
    border: `1px solid ${colors.error ?? '#a33'}`,
    color: colors.error ?? '#a33',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  status: {
    fontSize: 11,
    color: colors.textMuted,
    marginInlineStart: 10,
  },
} as const;

export function PrivacySection() {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const enabled = settings?.telemetry?.enabled === true;
  const [installId, setInstallId] = useState<string>('');
  const [busy, setBusy] = useState<'reset' | 'delete' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    void window.office.telemetry.getInstallId().then((id) => {
      if (mounted) setInstallId(id);
    });
    return () => { mounted = false; };
  }, []);

  const setEnabled = async (next: boolean) => {
    const patch: Partial<AppSettings> = {
      telemetry: { enabled: next, consentDecidedAt: Date.now() },
    };
    await window.office.saveSettings(patch);
  };

  const handleReset = async () => {
    setBusy('reset');
    setStatusMsg('');
    try {
      const next = await window.office.telemetry.resetInstallId();
      setInstallId(next);
      setStatusMsg(t('settings.privacy.installId.resetDone'));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('settings.privacy.delete.confirm'))) return;
    setBusy('delete');
    setStatusMsg('');
    try {
      const result = await window.office.telemetry.deleteAllData();
      setStatusMsg(
        result.ok
          ? t('settings.privacy.delete.done')
          : t('settings.privacy.delete.failed'),
      );
    } finally {
      setBusy(null);
    }
  };

  const shortId = installId ? installId.slice(0, 8) + '…' : '';

  return (
    <div style={styles.root}>
      <h2 style={styles.heading}>{t('settings.privacy.title')}</h2>
      <p style={styles.subtitle}>{t('settings.privacy.subtitle')}</p>

      <div style={styles.toggleRow}>
        <div>
          <div style={styles.toggleLabel}>{t('settings.privacy.toggle.label')}</div>
          <div style={styles.toggleDescription}>{t('settings.privacy.toggle.description')}</div>
        </div>
        <button
          type="button"
          style={styles.switch(enabled)}
          onClick={() => { void setEnabled(!enabled); }}
          aria-pressed={enabled}
          aria-label={t('settings.privacy.toggle.label')}
        >
          <span style={styles.switchKnob(enabled)} />
        </button>
      </div>

      <div style={styles.collectedTitle}>{t('settings.privacy.collected.title')}</div>
      <ul style={styles.list}>
        <li>{t('settings.privacy.collected.item.events')}</li>
        <li>{t('settings.privacy.collected.item.errors')}</li>
        <li>{t('settings.privacy.collected.item.platform')}</li>
      </ul>
      <div style={styles.collectedTitle}>{t('settings.privacy.notCollected.title')}</div>
      <ul style={styles.list}>
        <li>{t('settings.privacy.notCollected.item.code')}</li>
        <li>{t('settings.privacy.notCollected.item.prompts')}</li>
        <li>{t('settings.privacy.notCollected.item.identity')}</li>
      </ul>

      <div style={styles.installRow}>
        <span style={styles.installIdLabel}>{t('settings.privacy.installId.label')}</span>
        <span style={styles.installId} title={installId}>{shortId}</span>
        <button
          type="button"
          style={styles.smallButton}
          onClick={handleReset}
          disabled={busy !== null}
        >
          {busy === 'reset'
            ? t('settings.privacy.installId.resetting')
            : t('settings.privacy.installId.reset')}
        </button>
      </div>

      <div style={styles.dangerSection}>
        <div style={styles.toggleLabel}>{t('settings.privacy.delete.title')}</div>
        <div style={{ ...styles.toggleDescription, marginBottom: 10 }}>
          {t('settings.privacy.delete.description')}
        </div>
        <button
          type="button"
          style={styles.dangerButton}
          onClick={handleDelete}
          disabled={busy !== null}
        >
          {busy === 'delete'
            ? t('settings.privacy.delete.deleting')
            : t('settings.privacy.delete.button')}
        </button>
        {statusMsg && <span style={styles.status}>{statusMsg}</span>}
      </div>
    </div>
  );
}
