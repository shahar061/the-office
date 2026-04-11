import React, { useState } from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
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
      <div style={styles.header}>Git Preferences</div>
      <div style={styles.field}>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span>Include The Office project state in git commits</span>
        </label>
        <div style={styles.description}>
          Includes chat history, agent logs, layouts, and project config in git commits.{' '}
          <span style={styles.strong}>Only enable if you trust where this repo is pushed</span> —
          chat messages may contain credentials or secrets you typed.
        </div>
      </div>

      {confirmOpen && (
        <div style={styles.confirmBlock}>
          Got it — project state will be committed from the next phase onward.
          Existing commits are not affected.
          <div style={styles.confirmButtons}>
            <button style={styles.cancelBtn} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button style={styles.primaryBtn} onClick={confirmEnable}>
              Enable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
