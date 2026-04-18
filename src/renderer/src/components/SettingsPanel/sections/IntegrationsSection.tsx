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
  note: {
    color: colors.textMuted,
    fontSize: '12px',
    padding: '10px 12px',
    border: `1px dashed ${colors.border}`,
    borderRadius: '6px',
  },
} as const;

export function IntegrationsSection() {
  return (
    <div style={styles.root}>
      <GitIdentitySubsection />
      <GitPreferencesSubsection />
      <div style={styles.note}>
        Mobile pairing moved to its own tab — check the <strong>Mobile</strong> section in the sidebar.
      </div>
    </div>
  );
}
