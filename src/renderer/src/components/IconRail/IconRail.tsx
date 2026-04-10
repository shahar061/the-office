// src/renderer/src/components/IconRail/IconRail.tsx

import { useState, useCallback } from 'react';
import type { PanelId } from '../SplitLayout/layout-types';
import { useLayoutStore } from '../../stores/layout.store';
import { useOfficeStore } from '../../stores/office.store';
import { useLogStore } from '../../stores/log.store';
import { useProjectStore } from '../../stores/project.store';
import { useKanbanStore } from '../../stores/kanban.store';
import { useStatsStore } from '../../stores/stats.store';
import { useChatStore } from '../../stores/chat.store';
import { collectPanelIds, findLeafByPanelId, firstLeaf } from '../SplitLayout/layout-utils';
import { colors } from '../../theme';

interface NavItem {
  id: PanelId;
  icon: string;
  label: string;
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'office', icon: '🖥️', label: 'Office' },
  { id: 'agents', icon: '👥', label: 'Agents' },
  { id: 'kanban', icon: '📋', label: 'Kanban' },
  { id: 'stats', icon: '📊', label: 'Stats' },
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
  iconButton: (inWorkspace: boolean) => ({
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    background: inWorkspace ? 'rgba(59,130,246,0.1)' : 'transparent',
    borderLeft: inWorkspace ? `2px solid ${colors.accent}` : '2px solid transparent',
    borderRight: 'none',
    borderTop: 'none',
    borderBottom: 'none',
    borderRadius: '0 4px 4px 0',
    opacity: inWorkspace ? 1 : 0.45,
    cursor: 'grab',
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
    animation: 'icon-rail-pulse 1.5s ease-in-out infinite',
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
  pingBadge: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: colors.warning,
  },
  pingRing: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    border: `1.5px solid ${colors.warning}`,
    boxSizing: 'border-box' as const,
    animation: 'icon-rail-ping 1.5s ease-out infinite',
  },
} as const;

function IconButton({
  item,
  inWorkspace,
  badge,
  onClick,
  onDragStart,
}: {
  item: NavItem;
  inWorkspace: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      draggable
      onDragStart={onDragStart}
      style={{
        ...styles.iconButton(inWorkspace),
        opacity: inWorkspace ? 1 : hovered ? 0.75 : 0.45,
        background: inWorkspace
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
      {hovered && !inWorkspace && <div style={styles.tooltip}>{item.label}</div>}
    </button>
  );
}

export function IconRail() {
  const tree = useLayoutStore((s) => s.tree);
  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);
  const replacePanel = useLayoutStore((s) => s.replacePanel);
  const setFocusedPane = useLayoutStore((s) => s.setFocusedPane);

  const activePanels = collectPanelIds(tree);

  const agentActive = useOfficeStore((s) => s.agentActivity.isActive);
  const waitingForResponse = useChatStore((s) => s.waitingForResponse);
  const unreadCount = useLogStore((s) => s.unreadCount);
  const completedPhases = useProjectStore((s) => s.projectState?.completedPhases ?? []);
  const kanbanFailed = useKanbanStore((s) => s.kanban.failed);
  const kanbanTasks = useKanbanStore((s) => s.kanban.tasks);
  const showKanban = completedPhases.includes('warroom');
  const kanbanHasActive = kanbanTasks.some(t => t.status === 'active' || t.status === 'review');
  const rateLimitWarning = useStatsStore((s) => {
    const rl = s.stats?.rateLimit;
    if (!rl) return null;
    if (rl.status === 'rejected') return 'error';
    if (rl.status === 'allowed_warning' || rl.utilization > 0.8) return 'warning';
    return null;
  });

  const visiblePrimary = PRIMARY_ITEMS.filter(item =>
    item.id === 'kanban' ? showKanban : true
  );

  const handleClick = useCallback((panelId: PanelId) => {
    // If panel is already in workspace, focus it
    const existing = findLeafByPanelId(tree, panelId);
    if (existing) {
      setFocusedPane(existing.id);
      return;
    }
    // Otherwise, replace the focused pane — or fall back to the first leaf
    // so clicking an icon always does something even when nothing is focused.
    const targetPaneId = focusedPaneId ?? firstLeaf(tree).id;
    replacePanel(targetPaneId, panelId);
  }, [tree, focusedPaneId, replacePanel, setFocusedPane]);

  const handleDragStart = useCallback((e: React.DragEvent, panelId: PanelId) => {
    e.dataTransfer.setData('text/plain', panelId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const getBadge = (id: PanelId): React.ReactNode => {
    if (id === 'chat' && waitingForResponse && !activePanels.has('chat')) {
      return <>
        <div style={styles.pingBadge} />
        <div style={styles.pingRing} />
      </>;
    }
    if (id === 'stats' && rateLimitWarning) {
      return <div style={{ ...styles.badge, background: rateLimitWarning === 'error' ? colors.error : colors.warning }} />;
    }
    if (id === 'kanban') {
      if (kanbanFailed) return <div style={{ ...styles.badge, background: colors.error }} />;
      if (kanbanHasActive) return <div style={styles.badge} />;
    }
    if (id === 'agents' && agentActive) {
      return <div style={styles.badge} />;
    }
    if (id === 'logs' && unreadCount > 0) {
      return <div style={styles.countBadge}>{unreadCount > 99 ? '99+' : unreadCount}</div>;
    }
    return undefined;
  };

  return (
    <div style={styles.rail}>
      {visiblePrimary.map((item) => (
        <IconButton
          key={item.id}
          item={item}
          inWorkspace={activePanels.has(item.id)}
          badge={getBadge(item.id)}
          onClick={() => handleClick(item.id)}
          onDragStart={(e) => handleDragStart(e, item.id)}
        />
      ))}
      <div style={styles.divider} />
      {UTILITY_ITEMS.map((item) => (
        <IconButton
          key={item.id}
          item={item}
          inWorkspace={activePanels.has(item.id)}
          badge={getBadge(item.id)}
          onClick={() => handleClick(item.id)}
          onDragStart={(e) => handleDragStart(e, item.id)}
        />
      ))}
    </div>
  );
}
