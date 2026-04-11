import React from 'react';
import { useGreenfieldBannersStore } from '../../stores/greenfield-banners.store';
import { colors } from '../../theme';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '8px 12px 0',
    position: 'relative' as const,
    zIndex: 30,
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    lineHeight: '1.4',
  },
  bannerInfo: {
    background: 'rgba(59,130,246,0.10)',
    border: '1px solid rgba(59,130,246,0.35)',
    color: '#93c5fd',
  },
  bannerWarning: {
    background: 'rgba(245,158,11,0.10)',
    border: '1px solid rgba(245,158,11,0.35)',
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
