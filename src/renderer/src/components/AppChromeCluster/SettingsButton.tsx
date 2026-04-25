import { useSettingsStore } from '../../stores/settings.store';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const styles = {
  iconButton: {
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${colors.border}`,
    color: colors.textMuted,
    width: 28,
    height: 28,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
} as const;

export function SettingsButton() {
  const t = useT();
  const open = useSettingsStore((s) => s.open);
  return (
    <button
      title={t('app.menu.settings')}
      aria-label={t('app.menu.settings')}
      onClick={() => open()}
      style={styles.iconButton}
    >
      ⚙️
    </button>
  );
}
