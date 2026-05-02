import { useSettingsStore } from '../../../stores/settings.store';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';
import { THEME_IDS, type ThemeId } from '@shared/types';
import type { StringKey } from '../../../i18n/dictionaries/en';

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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  card: (selected: boolean) => ({
    background: colors.surface,
    border: `1px solid ${selected ? colors.accent : colors.border}`,
    borderRadius: 8,
    padding: 10,
    cursor: 'pointer',
    transition: 'border-color 0.15s, transform 0.15s',
    boxShadow: selected ? `0 0 0 2px ${colors.accent}33` : 'none',
    outline: 'none',
    fontFamily: 'inherit',
    textAlign: 'start' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  }),
  cardTitle: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardSelectedTick: {
    fontSize: 11,
    color: colors.accent,
  },
  cardDescription: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  thumb: {
    aspectRatio: '16 / 9',
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative' as const,
    boxShadow: '0 1px 0 rgba(0,0,0,0.4) inset',
  },
  // Thumbnail uses the active theme via [data-theme] cascade — we don't
  // need any inline styles inside it for that to work.
  thumbInner: {
    position: 'absolute' as const,
    inset: 0,
    background: 'var(--theme-bg)',
    color: 'var(--theme-text)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  thumbHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    borderBottom: '1px solid var(--theme-border-light)',
    background: 'var(--theme-surface)',
    fontSize: 7,
    color: 'var(--theme-text-muted)',
  },
  thumbDot: (color: string) => ({
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: color,
  }),
  thumbBody: {
    flex: 1,
    display: 'flex',
    padding: 4,
    gap: 4,
    minHeight: 0,
  },
  thumbChat: {
    flex: 1,
    background: 'var(--theme-surface)',
    border: '1px solid var(--theme-border-light)',
    borderRadius: 3,
    padding: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
    minWidth: 0,
  },
  thumbBubble: {
    background: 'var(--theme-surface-light)',
    color: 'var(--theme-text-light)',
    fontSize: 6,
    padding: '2px 4px',
    borderRadius: 3,
    alignSelf: 'flex-start' as const,
  },
  thumbButton: {
    background: 'var(--theme-accent)',
    color: 'var(--theme-bg)',
    fontSize: 6,
    fontWeight: 600 as const,
    padding: '2px 5px',
    borderRadius: 3,
    alignSelf: 'flex-start' as const,
    marginTop: 'auto',
  },
  thumbKanban: {
    width: 50,
    background: 'var(--theme-surface)',
    border: '1px solid var(--theme-border-light)',
    borderRadius: 3,
    padding: 4,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  thumbCard: (statusVar: string) => ({
    background: 'var(--theme-surface-light)',
    borderInlineStart: `2px solid ${statusVar}`,
    color: 'var(--theme-text)',
    fontSize: 6,
    padding: '2px 3px',
    borderRadius: 2,
    lineHeight: 1.3,
  }),
  helper: {
    fontSize: 11,
    color: colors.textDim,
    fontStyle: 'italic' as const,
    marginTop: 16,
  },
} as const;

const NAME_KEYS: Record<ThemeId, StringKey> = {
  dark: 'settings.appearance.theme.dark',
  light: 'settings.appearance.theme.light',
  neon: 'settings.appearance.theme.neon',
  dusk: 'settings.appearance.theme.dusk',
  terminal: 'settings.appearance.theme.terminal',
};
const DESC_KEYS: Record<ThemeId, StringKey> = {
  dark: 'settings.appearance.theme.dark.description',
  light: 'settings.appearance.theme.light.description',
  neon: 'settings.appearance.theme.neon.description',
  dusk: 'settings.appearance.theme.dusk.description',
  terminal: 'settings.appearance.theme.terminal.description',
};

/** Self-contained mini-mock of the chrome — chat panel on the left, kanban
 *  cards on the right. Renders inside a `<div data-theme={id}>` so the
 *  custom-property cascade scopes the theme to *this* thumbnail only,
 *  letting all five render side-by-side regardless of the active theme. */
function ThemeThumbnail({ themeId, t }: { themeId: ThemeId; t: ReturnType<typeof useT> }) {
  return (
    <div data-theme={themeId} style={styles.thumb}>
      <div style={styles.thumbInner}>
        <div style={styles.thumbHeader}>
          <div style={styles.thumbDot('var(--theme-error)')} />
          <div style={styles.thumbDot('var(--theme-warning)')} />
          <div style={styles.thumbDot('var(--theme-success)')} />
        </div>
        <div style={styles.thumbBody}>
          <div style={styles.thumbChat}>
            <div style={styles.thumbBubble}>{t('settings.appearance.preview.message')}</div>
            <div style={styles.thumbButton}>{t('settings.appearance.preview.button')}</div>
          </div>
          <div style={styles.thumbKanban}>
            <div style={styles.thumbCard('var(--theme-warning)')}>{t('settings.appearance.preview.task')}</div>
            <div style={styles.thumbCard('var(--theme-accent)')}>{t('settings.appearance.preview.task')}</div>
            <div style={styles.thumbCard('var(--theme-success)')}>{t('settings.appearance.preview.task')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection() {
  const t = useT();
  const persistedTheme = useSettingsStore((s) => (s.settings?.appearance?.theme ?? 'dark') as ThemeId);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div style={styles.root}>
      <h2 style={styles.heading}>{t('settings.appearance.title')}</h2>
      <p style={styles.subtitle}>{t('settings.appearance.subtitle')}</p>

      <div style={styles.grid}>
        {THEME_IDS.map((id) => {
          const selected = persistedTheme === id;
          return (
            <button
              key={id}
              type="button"
              style={styles.card(selected)}
              onClick={() => { void setTheme(id); }}
              aria-pressed={selected}
            >
              <ThemeThumbnail themeId={id} t={t} />
              <div style={styles.cardTitle}>
                <span>{t(NAME_KEYS[id])}</span>
                {selected && <span style={styles.cardSelectedTick}>●</span>}
              </div>
              <div style={styles.cardDescription}>{t(DESC_KEYS[id])}</div>
            </button>
          );
        })}
      </div>

      <p style={styles.helper}>{t('settings.language.note')}</p>
    </div>
  );
}
