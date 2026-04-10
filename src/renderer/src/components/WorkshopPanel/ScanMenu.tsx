import { useState, useRef, useEffect } from 'react';
import { colors } from '../../theme';

const styles = {
  root: {
    position: 'relative' as const,
    display: 'inline-block',
  },
  trigger: {
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute' as const,
    top: '32px',
    right: 0,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    minWidth: '160px',
    padding: '4px',
    zIndex: 10,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    color: colors.text,
    fontSize: '12px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderRadius: '4px',
  },
  menuItemHover: {
    background: colors.surfaceLight,
  },
} as const;

export function ScanMenu() {
  const [open, setOpen] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleRescan() {
    setOpen(false);
    const confirmed = window.confirm(
      'Re-scan will overwrite the current project context. Continue?'
    );
    if (!confirmed) return;
    window.office.runOnboardingScan();
  }

  return (
    <div ref={rootRef} style={styles.root}>
      <button
        style={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-label="Workshop menu"
        title="Workshop menu"
      >
        ⚙️
      </button>
      {open && (
        <div style={styles.menu}>
          <button
            style={{
              ...styles.menuItem,
              ...(hoverIndex === 0 ? styles.menuItemHover : {}),
            }}
            onMouseEnter={() => setHoverIndex(0)}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={handleRescan}
          >
            Re-scan project
          </button>
        </div>
      )}
    </div>
  );
}
