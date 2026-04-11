import React from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import { colors } from '../../../theme';
import { SegmentedControl } from '../SegmentedControl';
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
        <SegmentedControl
          name="modelPreset"
          value={settings.defaultModelPreset}
          onChange={(v) => save({ defaultModelPreset: v })}
          options={modelPresets.map((preset) => ({
            value: preset,
            label: preset,
          }))}
        />
      </div>

      <div style={styles.field}>
        <div style={styles.label}>Default permission mode</div>
        <div style={styles.description}>
          How agents handle tool permissions. Applied on next session start.
        </div>
        <SegmentedControl
          name="permissionMode"
          value={settings.defaultPermissionMode}
          onChange={(v) => save({ defaultPermissionMode: v })}
          options={permissionModes.map((mode) => ({
            value: mode,
            label: mode.replace('-', ' '),
          }))}
        />
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
