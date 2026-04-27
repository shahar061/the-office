import React, { useState } from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import { useT } from '../../../i18n';
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
  header: {
    fontSize: '14px',
    fontWeight: 700 as const,
    color: colors.text,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: colors.text,
    cursor: 'pointer',
  },
  description: {
    fontSize: '11px',
    color: colors.textMuted,
    lineHeight: '1.5',
    marginLeft: '24px',
  },
  strong: {
    fontWeight: 700 as const,
    color: '#fcd34d',
  },
  confirmBlock: {
    padding: '12px',
    background: 'rgba(59,130,246,0.08)',
    border: `1px solid rgba(59,130,246,0.35)`,
    borderRadius: '6px',
    fontSize: '12px',
    color: colors.text,
  },
  confirmButtons: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    justifyContent: 'flex-end',
  },
  primaryBtn: {
    background: colors.accent,
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600 as const,
    padding: '6px 12px',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '11px',
    padding: '6px 12px',
    fontFamily: 'inherit',
  },
} as const;

export function GitPreferencesSubsection() {
  const settings = useSettingsStore((s) => s.settings);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const t = useT();

  if (!settings) return null;

  const current = settings.gitPreferences?.includeOfficeStateInRepo ?? false;

  async function handleToggle(next: boolean) {
    if (next && !current) {
      // Transitioning to enabled — show confirmation first
      setConfirmOpen(true);
      return;
    }
    await window.office.saveSettings({
      gitPreferences: { includeOfficeStateInRepo: next },
    });
  }

  async function confirmEnable() {
    await window.office.saveSettings({
      gitPreferences: { includeOfficeStateInRepo: true },
    });
    setConfirmOpen(false);
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>{t('settings.git.preferences.header')}</div>
      <div style={styles.field}>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span>{t('settings.git.preferences.includeOfficeState')}</span>
        </label>
        <div style={styles.description}>
          {t('settings.git.preferences.descriptionPrefix')}{' '}
          <span style={styles.strong}>{t('settings.git.preferences.warning')}</span> —{' '}
          {t('settings.git.preferences.descriptionSuffix')}
        </div>
      </div>

      {confirmOpen && (
        <div style={styles.confirmBlock}>
          {t('settings.git.preferences.confirmText')}
          <div style={styles.confirmButtons}>
            <button style={styles.cancelBtn} onClick={() => setConfirmOpen(false)}>
              {t('settings.git.preferences.cancel')}
            </button>
            <button style={styles.primaryBtn} onClick={confirmEnable}>
              {t('settings.git.preferences.enable')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
