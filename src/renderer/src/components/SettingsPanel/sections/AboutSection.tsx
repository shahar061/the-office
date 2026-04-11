import React from 'react';
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
} as const;

export function AboutSection() {
  const version =
    (typeof process !== 'undefined' && process.env.npm_package_version) || 'dev';

  function openExternal(url: string) {
    window.office.openExternal(url);
  }

  return (
    <div style={styles.root}>
      <div style={styles.title}>The Office</div>
      <div style={styles.version}>Version {version}</div>

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
