import { useState } from 'react';
import type { AppTab } from '../../stores/ui.store';
import { useOfficeStore } from '../../stores/office.store';
import { useLogStore } from '../../stores/log.store';
import { colors } from '../../theme';

interface IconRailProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

interface NavItem {
  id: AppTab;
  icon: string;
  label: string;
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'office', icon: '🖥️', label: 'Office' },
  { id: 'agents', icon: '👥', label: 'Agents' },
];

const UTILITY_ITEMS: NavItem[] = [
  { id: 'logs', icon: '📋', label: 'Logs' },
  { id: 'about', icon: 'ℹ️', label: 'About' },
];

const styles = {
  rail: {
    width: '40px',
    minWidth: '40px',
    background: colors.bgDark,
    borderRight: `1px solid ${colors.borderLight}`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: '8px',
    gap: '2px',
    flexShrink: 0,
    zIndex: 2,
  },
  divider: {
    width: '20px',
    height: '1px',
    background: colors.borderLight,
    margin: '4px 0',
  },
  iconButton: (active: boolean) => ({
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
    borderLeft: active ? `2px solid ${colors.accent}` : '2px solid transparent',
    borderRight: 'none',
    borderTop: 'none',
    borderBottom: 'none',
    borderRadius: '0 4px 4px 0',
    opacity: active ? 1 : 0.45,
    cursor: 'pointer',
    position: 'relative' as const,
    padding: 0,
    fontFamily: 'inherit',
    transition: 'opacity 0.15s, background 0.15s',
  }),
  tooltip: {
    position: 'absolute' as const,
    left: '42px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    color: colors.text,
    whiteSpace: 'nowrap' as const,
    zIndex: 100,
    pointerEvents: 'none' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: colors.warning,
  },
  countBadge: {
    position: 'absolute' as const,
    top: '1px',
    right: '1px',
    minWidth: '14px',
    height: '14px',
    borderRadius: '7px',
    background: colors.accent,
    color: '#fff',
    fontSize: '8px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    lineHeight: 1,
  },
} as const;

function IconButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      style={{
        ...styles.iconButton(active),
        opacity: active ? 1 : hovered ? 0.75 : 0.45,
        background: active
          ? 'rgba(59,130,246,0.1)'
          : hovered
            ? colors.surface
            : 'transparent',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={item.label}
    >
      {item.icon}
      {badge}
      {hovered && !active && <div style={styles.tooltip}>{item.label}</div>}
    </button>
  );
}

export function IconRail({ activeTab, onTabChange }: IconRailProps) {
  const agentActive = useOfficeStore((s) => s.agentActivity.isActive);
  const unreadCount = useLogStore((s) => s.unreadCount);

  return (
    <div style={styles.rail}>
      {PRIMARY_ITEMS.map((item) => (
        <IconButton
          key={item.id}
          item={item}
          active={activeTab === item.id}
          badge={
            item.id === 'agents' && agentActive && activeTab !== 'agents'
              ? <div style={styles.badge} />
              : undefined
          }
          onClick={() => onTabChange(item.id)}
        />
      ))}
      <div style={styles.divider} />
      {UTILITY_ITEMS.map((item) => (
        <IconButton
          key={item.id}
          item={item}
          active={activeTab === item.id}
          badge={
            item.id === 'logs' && unreadCount > 0 && activeTab !== 'logs'
              ? <div style={styles.countBadge}>{unreadCount > 99 ? '99+' : unreadCount}</div>
              : undefined
          }
          onClick={() => onTabChange(item.id)}
        />
      ))}
    </div>
  );
}
