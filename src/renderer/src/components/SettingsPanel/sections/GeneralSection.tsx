import React from 'react';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';

export function GeneralSection() {
  const t = useT();
  return (
    <div style={{ padding: '24px', color: colors.textMuted, fontSize: '13px', fontStyle: 'italic' }}>
      {t('settings.general.placeholder')}
      <br />
      <br />
      {t('settings.general.planned')}
    </div>
  );
}
