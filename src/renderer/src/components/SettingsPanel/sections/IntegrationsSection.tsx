import React from 'react';
import { GitIdentitySubsection } from './GitIdentitySubsection';
import { GitPreferencesSubsection } from './GitPreferencesSubsection';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';

const styles = {
  root: {
    padding: '24px',
    color: colors.text,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  note: {
    color: colors.textMuted,
    fontSize: '12px',
    padding: '10px 12px',
    border: `1px dashed ${colors.border}`,
    borderRadius: '6px',
  },
} as const;

export function IntegrationsSection() {
  const t = useT();
  return (
    <div style={styles.root}>
      <GitIdentitySubsection />
      <GitPreferencesSubsection />
      <div style={styles.note}>
        {t('settings.integrations.mobileMoved')}
      </div>
    </div>
  );
}
