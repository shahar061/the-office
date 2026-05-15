// First-run consent modal. Shown once per install: as soon as settings have
// hydrated and `telemetry.consentDecidedAt` is still null. Either action
// (accept or decline) records the decision so the modal never returns —
// users adjust later from Settings → Privacy.

import { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { useSettingsStore } from '../stores/settings.store';
import { useT } from '../i18n';
import { colors } from '../theme';

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  panel: {
    width: 480,
    maxWidth: '90vw',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    padding: 22,
    color: colors.text,
    fontSize: 13,
    lineHeight: 1.5,
  },
  title: {
    fontSize: 16,
    fontWeight: 700 as const,
    margin: 0,
    marginBottom: 10,
  },
  body: {
    color: colors.textMuted,
    margin: 0,
    marginBottom: 12,
  },
  collected: {
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 12,
    color: colors.textDim,
    marginBottom: 12,
  },
  hint: {
    fontSize: 11,
    color: colors.textDim,
    fontStyle: 'italic' as const,
    marginBottom: 18,
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  decline: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  accept: {
    background: colors.accent,
    border: 'none',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600 as const,
    fontFamily: 'inherit',
  },
} as const;

export function TelemetryConsentModal() {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const [submitting, setSubmitting] = useState(false);

  // Don't render until settings have hydrated, otherwise we'd flash the
  // modal even for users who already decided.
  const decidedAt = settings?.telemetry?.consentDecidedAt;
  const shouldShow = settings !== null && (decidedAt === undefined || decidedAt === null);

  useEffect(() => {
    if (!shouldShow) return;
    const onKey = (e: KeyboardEvent) => {
      // No close-on-Escape — make the user pick. It's two clicks total.
      if (e.key === 'Escape') e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [shouldShow]);

  if (!shouldShow) return null;

  const decide = async (enabled: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const patch: Partial<AppSettings> = {
        telemetry: { enabled, consentDecidedAt: Date.now() },
      };
      await window.office.saveSettings(patch);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <h2 style={styles.title}>{t('consent.title')}</h2>
        <p style={styles.body}>{t('consent.body')}</p>
        <div style={styles.collected}>{t('consent.collected')}</div>
        <p style={styles.hint}>{t('consent.changeLater')}</p>
        <div style={styles.buttonRow}>
          <button
            type="button"
            style={styles.decline}
            onClick={() => { void decide(false); }}
            disabled={submitting}
          >
            {t('consent.decline')}
          </button>
          <button
            type="button"
            style={styles.accept}
            onClick={() => { void decide(true); }}
            disabled={submitting}
          >
            {t('consent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
