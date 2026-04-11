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
    padding: '8px 12px',
    margin: '0 12px 8px',
    background: 'rgba(59, 130, 246, 0.08)',
    border: `1px solid rgba(59, 130, 246, 0.35)`,
    borderRadius: '6px',
    fontSize: '11px',
    color: colors.textLight,
  },
  message: {
    flex: 1,
  },
  strong: {
    fontWeight: 700 as const,
    color: colors.text,
  },
  actions: {
    display: 'flex',
    gap: '6px',
  },
  btn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '3px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '10px',
    padding: '3px 8px',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    background: colors.accent,
    border: 'none',
    borderRadius: '3px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600 as const,
    padding: '3px 8px',
    fontFamily: 'inherit',
  },
  dismissBtn: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    fontFamily: 'inherit',
  },
} as const;

export function FirstRunIdentityBanner() {
  const settings = useSettingsStore((s) => s.settings);
  const isFirstRunBannerDismissed = useSettingsStore((s) => s.isFirstRunBannerDismissed);
  const dismissFirstRunBanner = useSettingsStore((s) => s.dismissFirstRunBanner);
  const openSettings = useSettingsStore((s) => s.open);
  const projectState = useProjectStore((s) => s.projectState);

  if (!settings || !projectState) return null;
  if (projectState.mode !== 'workshop') return null;

  // Only show when:
  // - at least one identity exists
  // - the project has no explicit assignment (gitIdentityId is null/undefined)
  // - the banner hasn't been dismissed this session
  const hasExplicitAssignment =
    projectState.gitIdentityId !== null && projectState.gitIdentityId !== undefined;
  if (hasExplicitAssignment) return null;
  if (settings.gitIdentities.length === 0) return null;
  if (isFirstRunBannerDismissed(projectState.path)) return null;

  const defaultIdentity = settings.gitIdentities.find(
    (i) => i.id === settings.defaultGitIdentityId,
  );
  if (!defaultIdentity) return null;

  async function handleUseDefault() {
    if (!projectState || !settings) return;
    await window.office.setProjectGitIdentity(projectState.path, settings.defaultGitIdentityId!);
  }

  function handleChange() {
    openSettings('integrations');
  }

  function handleDismiss() {
    if (!projectState) return;
    dismissFirstRunBanner(projectState.path);
  }

  return (
    <div style={styles.root}>
      <div style={styles.message}>
        Commits will be authored as <span style={styles.strong}>{defaultIdentity.label}</span> ({defaultIdentity.email}), your global default.
      </div>
      <div style={styles.actions}>
        <button style={styles.primaryBtn} onClick={handleUseDefault}>
          Use default
        </button>
        <button style={styles.btn} onClick={handleChange}>
          Change
        </button>
        <button style={styles.dismissBtn} onClick={handleDismiss} title="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
