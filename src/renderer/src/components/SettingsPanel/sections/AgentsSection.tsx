import React from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import { colors } from '../../../theme';
import type { AppSettings, BuildConfig } from '@shared/types';

const styles = {
  root: {
    padding: '24px',
    color: colors.text,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600 as const,
    color: colors.text,
  },
  description: {
    fontSize: '11px',
    color: colors.textMuted,
    marginBottom: '6px',
  },
  radioGroup: {
    display: 'flex',
    gap: '16px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    color: colors.text,
  },
  numberInput: {
    width: '80px',
    padding: '6px 10px',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.text,
    fontSize: '12px',
    fontFamily: 'inherit',
  },
  loading: {
    padding: '24px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
} as const;

export function AgentsSection() {
  const settings = useSettingsStore((s) => s.settings);

  if (!settings) {
    return <div style={styles.loading}>Loading settings…</div>;
  }

  async function save(patch: Partial<AppSettings>) {
    await window.office.saveSettings(patch);
    // IPC handler emits SETTINGS_UPDATED → store updates via App.tsx listener
  }

  const modelPresets: BuildConfig['modelPreset'][] = ['default', 'fast', 'quality'];
  const permissionModes: BuildConfig['permissionMode'][] = ['ask', 'auto-safe', 'auto-all'];

  return (
    <div style={styles.root}>
      <div style={styles.field}>
        <div style={styles.label}>Default model preset</div>
        <div style={styles.description}>
          Which model agents use by default. Applied on next session start.
        </div>
        <div style={styles.radioGroup}>
          {modelPresets.map((preset) => (
            <label key={preset} style={styles.radioLabel}>
              <input
                type="radio"
                name="modelPreset"
                checked={settings.defaultModelPreset === preset}
                onChange={() => save({ defaultModelPreset: preset })}
              />
              <span style={{ textTransform: 'capitalize' }}>{preset}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={styles.field}>
        <div style={styles.label}>Default permission mode</div>
        <div style={styles.description}>
          How agents handle tool permissions. Applied on next session start.
        </div>
        <div style={styles.radioGroup}>
          {permissionModes.map((mode) => (
            <label key={mode} style={styles.radioLabel}>
              <input
                type="radio"
                name="permissionMode"
                checked={settings.defaultPermissionMode === mode}
                onChange={() => save({ defaultPermissionMode: mode })}
              />
              <span style={{ textTransform: 'capitalize' }}>{mode.replace('-', ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={styles.field}>
        <div style={styles.label}>Max parallel Team Leads</div>
        <div style={styles.description}>
          How many Team Lead agents can run in parallel. Higher = faster but more cost.
        </div>
        <input
          type="number"
          min={1}
          max={10}
          value={settings.maxParallelTLs}
          style={styles.numberInput}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && n >= 1 && n <= 10) {
              save({ maxParallelTLs: n });
            }
          }}
        />
      </div>
    </div>
  );
}
