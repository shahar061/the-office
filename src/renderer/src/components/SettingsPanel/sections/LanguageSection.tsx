import { useSettingsStore } from '../../../stores/settings.store';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';

export function LanguageSection() {
  const t = useT();
  const language = useSettingsStore((s) => s.settings?.language ?? 'en');
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <div style={{ padding: '24px', color: colors.text, fontSize: 13 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        {t('settings.language.title')}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="radio"
            name="language"
            value="en"
            checked={language === 'en'}
            onChange={() => setLanguage('en')}
          />
          <span>{t('settings.language.english')}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="radio"
            name="language"
            value="he"
            checked={language === 'he'}
            onChange={() => setLanguage('he')}
          />
          <span>{t('settings.language.hebrew')}</span>
        </label>
      </div>

      <p style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>
        {t('settings.language.note')}
      </p>
    </div>
  );
}
