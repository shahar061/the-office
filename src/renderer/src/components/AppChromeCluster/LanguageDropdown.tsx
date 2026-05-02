import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settings.store';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const styles = {
  badge: {
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${colors.border}`,
    color: colors.textMuted,
    padding: '4px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600 as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  dropdown: {
    position: 'absolute' as const,
    top: 'calc(100% + 4px)',
    insetInlineEnd: 0,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    minWidth: 120,
    zIndex: 95,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  item: (active: boolean) => ({
    width: '100%',
    textAlign: 'start' as const,
    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    border: 'none',
    color: active ? colors.text : colors.textMuted,
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'block',
  }),
} as const;

export function LanguageDropdown() {
  const t = useT();
  const language = useSettingsStore((s) => s.settings?.language ?? 'en');
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={styles.badge}
        aria-label={t('cluster.language.aria')}
        aria-expanded={open}
      >
        {language.toUpperCase()} ▾
      </button>
      {open && (
        <div style={styles.dropdown}>
          <button
            onClick={() => { setLanguage('en'); setOpen(false); }}
            style={styles.item(language === 'en')}
          >English</button>
          <button
            onClick={() => { setLanguage('he'); setOpen(false); }}
            style={styles.item(language === 'he')}
          >עברית</button>
          <button
            onClick={() => { setLanguage('es'); setOpen(false); }}
            style={styles.item(language === 'es')}
          >Español</button>
          <button
            onClick={() => { setLanguage('it'); setOpen(false); }}
            style={styles.item(language === 'it')}
          >Italiano</button>
          <button
            onClick={() => { setLanguage('de'); setOpen(false); }}
            style={styles.item(language === 'de')}
          >Deutsch</button>
          <button
            onClick={() => { setLanguage('pt'); setOpen(false); }}
            style={styles.item(language === 'pt')}
          >Português</button>
        </div>
      )}
    </div>
  );
}
