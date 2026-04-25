import React from 'react';
import { useSettingsStore } from '../../stores/settings.store';
import { useProjectStore } from '../../stores/project.store';
import { colors } from '../../theme';

const styles = {
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 12px',
    margin: '0 12px 8px',
    background: 'rgba(59, 130, 246, 0.05)',
    border: `1px solid rgba(59, 130, 246, 0.25)`,
    borderRadius: '4px',
    fontSize: '11px',
    color: colors.textLight,
    cursor: 'pointer',
  },
  rootUnset: {
    background: 'rgba(245, 158, 11, 0.05)',
    border: `1px solid rgba(245, 158, 11, 0.3)`,
    color: '#fcd34d',
  },
  label: {
    color: colors.textMuted,
    marginInlineEnd: '4px',
  },
  value: {
    fontWeight: 600 as const,
    fontFamily: 'monospace',
  },
  changeBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '3px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '10px',
    padding: '2px 8px',
    fontFamily: 'inherit',
  },
} as const;

export function GitIdentityChip() {
  const settings = useSettingsStore((s) => s.settings);
  const openSettings = useSettingsStore((s) => s.open);
  const projectState = useProjectStore((s) => s.projectState);

  if (!settings || !projectState) return null;

  const { gitIdentities, defaultGitIdentityId } = settings;
  const projectIdentityId = projectState.gitIdentityId ?? null;

  let resolved = null;
  if (projectIdentityId) {
    resolved = gitIdentities.find((i) => i.id === projectIdentityId) ?? null;
  }
  if (!resolved && defaultGitIdentityId) {
    resolved = gitIdentities.find((i) => i.id === defaultGitIdentityId) ?? null;
  }

  function handleClick() {
    openSettings('integrations');
  }

  if (!resolved) {
    return (
      <div style={{ ...styles.root, ...styles.rootUnset }} onClick={handleClick}>
        <span>
          <span style={styles.label}>Git identity:</span>
          <span style={styles.value}>not configured</span>
        </span>
        <button style={styles.changeBtn} onClick={(e) => { e.stopPropagation(); handleClick(); }}>
          Set up
        </button>
      </div>
    );
  }

  return (
    <div style={styles.root} onClick={handleClick}>
      <span>
        <span style={styles.label}>Git identity:</span>
        <span style={styles.value}>
          {resolved.label} · {resolved.email}
        </span>
      </span>
      <button style={styles.changeBtn} onClick={(e) => { e.stopPropagation(); handleClick(); }}>
        Change
      </button>
    </div>
  );
}
