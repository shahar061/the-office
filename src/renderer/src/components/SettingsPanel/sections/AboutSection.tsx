import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../../stores/settings.store';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';

const styles = {
  root: {
    padding: '24px',
    color: colors.text,
  },
  title: {
    fontSize: '16px',
    fontWeight: 700 as const,
    marginBottom: '4px',
  },
  version: {
    fontSize: '12px',
    color: colors.textMuted,
    marginBottom: '16px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    display: 'inline-block',
  },
  toast: {
    fontSize: '12px',
    color: '#c7d2fe',
    background: '#1f1b3d',
    padding: '6px 10px',
    borderRadius: '4px',
    display: 'inline-block',
    marginInlineStart: '12px',
  },
  link: {
    background: 'none',
    border: 'none',
    color: colors.accent,
    cursor: 'pointer',
    fontSize: '12px',
    textDecoration: 'underline',
    padding: 0,
    fontFamily: 'inherit',
  },
  section: {
    marginBottom: '16px',
  },
  devmodeRow: {
    fontSize: '11px',
    color: colors.textMuted,
    marginTop: '8px',
  },
} as const;

export function AboutSection() {
  const t = useT();
  const version =
    (typeof process !== 'undefined' && process.env.npm_package_version) || 'dev';
  const isDevMode = useSettingsStore((s) => s.isDevMode);
  const settings = useSettingsStore((s) => s.settings);
  const bumpVersionTap = useSettingsStore((s) => s.bumpVersionTap);
  const disableDevMode = useSettingsStore((s) => s.disableDevMode);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  function openExternal(url: string) {
    window.office.openExternal(url);
  }

  async function handleVersionClick() {
    if (isDevMode) {
      // Already on; ignore further taps.
      return;
    }
    const res = await bumpVersionTap();
    if (res.unlocked) {
      setToast(t('about.devmode.enabled'));
    } else if (res.remaining <= 3) {
      setToast(t('about.devmode.almost', { count: res.remaining }));
    }
  }

  // The env-var override case: settings.devMode is false but isDevMode is true.
  const forcedByEnv = isDevMode && settings?.devMode === false;

  return (
    <div style={styles.root}>
      <div style={styles.title}>The Office</div>
      <div style={styles.version} onClick={handleVersionClick}>
        Version {version}
        {toast && <span style={styles.toast}>{toast}</span>}
      </div>

      {isDevMode && (
        <div style={styles.devmodeRow}>
          {forcedByEnv ? (
            <span>{t('about.devmode.forced')}</span>
          ) : (
            <>
              {t('about.devmode.on')}{' '}
              <button
                style={styles.link}
                onClick={() => disableDevMode()}
              >
                {t('about.devmode.disable')}
              </button>
            </>
          )}
        </div>
      )}

      <div style={styles.section}>
        AI-powered workspace for building software through phases of collaboration.
      </div>

      <div style={styles.section}>
        <button style={styles.link} onClick={() => openExternal('https://github.com/shahar061/the-office')}>
          GitHub repository
        </button>
      </div>
    </div>
  );
}
