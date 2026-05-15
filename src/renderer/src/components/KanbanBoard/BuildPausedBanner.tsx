import React from 'react';
import { useT } from '../../i18n';

interface Props {
  done: number;
  total: number;
  onResume: () => void;
  onRestart: () => void;
  onLeave: () => void;
}

const styles = {
  wrap: {
    background: 'rgba(245, 158, 11, 0.12)',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,
  text: { flex: 1, color: '#fde68a', fontSize: 13 } as React.CSSProperties,
  btn: (primary?: boolean) => ({
    background: primary ? '#f59e0b' : 'transparent',
    color: primary ? '#1f1300' : '#fde68a',
    border: '1px solid #f59e0b',
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
  }) as React.CSSProperties,
};

export function BuildPausedBanner({ done, total, onResume, onRestart, onLeave }: Props) {
  const t = useT();
  const remaining = Math.max(0, total - done);
  return (
    <div style={styles.wrap}>
      <span style={styles.text}>
        ⏸ {t('build.paused.banner', { done: remaining, total })}
      </span>
      <button style={styles.btn(true)} onClick={onResume}>{t('build.paused.resume')}</button>
      <button style={styles.btn()} onClick={onRestart}>{t('build.paused.restart')}</button>
      <button style={styles.btn()} onClick={onLeave}>{t('build.paused.leave')}</button>
    </div>
  );
}
