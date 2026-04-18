import React from 'react';
import { useGreenfieldBannersStore } from '../../stores/greenfield-banners.store';
import { colors } from '../../theme';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    // Float the snackbar stack over the canvas instead of consuming layout
    // space at the top of the office pane. pointerEvents:none on the wrapper
    // lets clicks fall through to the canvas; each banner re-enables pointer
    // events so its dismiss button still works.
    position: 'absolute' as const,
    top: '8px',
    left: '12px',
    right: '12px',
    zIndex: 30,
    pointerEvents: 'none' as const,
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    lineHeight: '1.4',
    pointerEvents: 'auto' as const,
    backdropFilter: 'blur(6px)',
  },
  bannerInfo: {
    // Higher background opacity so the banner is readable when overlaid on
    // the animated canvas underneath.
    background: 'rgba(15,23,42,0.85)',
    border: '1px solid rgba(59,130,246,0.55)',
    color: '#93c5fd',
  },
  bannerWarning: {
    background: 'rgba(15,23,42,0.85)',
    border: '1px solid rgba(245,158,11,0.55)',
    color: '#fcd34d',
  },
  message: {
    flex: 1,
  },
  actionBtn: {
    background: 'transparent',
    border: `1px solid ${colors.accent}`,
    borderRadius: '3px',
    color: colors.accent,
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600 as const,
    padding: '3px 10px',
    fontFamily: 'inherit',
  },
  close: {
    background: 'none',
    border: 'none',
    color: colors.textDim,
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    fontFamily: 'inherit',
  },
} as const;

export function GreenfieldBanners() {
  const banners = useGreenfieldBannersStore((s) => s.banners);
  const dismiss = useGreenfieldBannersStore((s) => s.dismissBanner);

  if (banners.length === 0) return null;

  return (
    <div style={styles.container}>
      {banners.map((b) => (
        <div
          key={b.id}
          style={{
            ...styles.banner,
            ...(b.level === 'warning' ? styles.bannerWarning : styles.bannerInfo),
          }}
        >
          <div style={styles.message}>{b.message}</div>
          {b.action && (
            <button style={styles.actionBtn} onClick={b.action.onClick}>
              {b.action.label}
            </button>
          )}
          <button style={styles.close} onClick={() => dismiss(b.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
