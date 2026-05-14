import React from 'react';
import { useT } from '../../i18n';

interface Props {
  agentLabel?: string;
  onRestartStep: () => void;
  onLeavePaused: () => void;
}

const styles = {
  wrap: {
    margin: '8px 0',
    padding: '10px 14px',
    background: 'rgba(220, 38, 38, 0.08)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    borderRadius: 8,
    fontSize: 13,
    color: '#fecaca',
  } as React.CSSProperties,
  title: { fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
  agent: { opacity: 0.85, marginBottom: 8 } as React.CSSProperties,
  row: { display: 'flex', gap: 8 } as React.CSSProperties,
  btn: {
    background: 'transparent',
    border: '1px solid rgba(220, 38, 38, 0.6)',
    color: '#fecaca',
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  } as React.CSSProperties,
};

export function InterruptedBubble({ agentLabel, onRestartStep, onLeavePaused }: Props) {
  const t = useT();
  return (
    <div style={styles.wrap}>
      <div style={styles.title}>⏸ {t('chat.interrupted.title')}</div>
      {agentLabel && <div style={styles.agent}>{t('chat.interrupted.agent', { agent: agentLabel })}</div>}
      <div style={styles.row}>
        <button style={styles.btn} onClick={onRestartStep}>{t('chat.interrupted.restartStep')}</button>
        <button style={styles.btn} onClick={onLeavePaused}>{t('chat.interrupted.leavePaused')}</button>
      </div>
    </div>
  );
}
