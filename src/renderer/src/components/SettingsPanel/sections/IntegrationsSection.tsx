import React from 'react';
import { GitIdentitySubsection } from './GitIdentitySubsection';
import { GitPreferencesSubsection } from './GitPreferencesSubsection';
import { colors } from '../../../theme';

const styles = {
  root: {
    padding: '24px',
    color: colors.text,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
} as const;

export function IntegrationsSection() {
  return (
    <div style={styles.root}>
      <GitIdentitySubsection />
      <GitPreferencesSubsection />
    </div>
  );
}
