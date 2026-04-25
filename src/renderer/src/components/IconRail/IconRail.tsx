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
import { useSettingsStore } from '../../stores/settings.store';
import { collectPanelIds, findLeafByPanelId, firstLeaf } from '../SplitLayout/layout-utils';
import { colors } from '../../theme';
import type { StringKey } from '../../i18n';
import { useT } from '../../i18n';

interface NavItem {
  id: PanelId;
  icon: string;
  labelKey: StringKey;
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'chat', icon: '💬', labelKey: 'iconrail.chat' },
  { id: 'office', icon: '🖥️', labelKey: 'iconrail.office' },
  { id: 'agents', icon: '👥', labelKey: 'iconrail.agents' },
  { id: 'kanban', icon: '📋', labelKey: 'iconrail.kanban' },
  { id: 'stats', icon: '📊', labelKey: 'iconrail.stats' },
  { id: 'complete', icon: '🎉', labelKey: 'iconrail.complete' },
  { id: 'workshop', icon: '🔧', labelKey: 'iconrail.workshop' },
  { id: 'diff', icon: '📝', labelKey: 'iconrail.diff' },
];

const UTILITY_ITEMS: NavItem[] = [
  { id: 'logs', icon: '📋', labelKey: 'iconrail.logs' },
  { id: 'about', icon: 'ℹ️', labelKey: 'iconrail.about' },
];

const DEVJUMP_ITEM: NavItem = { id: 'devjump', icon: '🧪', labelKey: 'iconrail.devjump' };
const isDevMode = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window.office as any)?.devJump === 'function';

interface ActionItem {
  id: 'settings';
  icon: string;
  labelKey: StringKey;
}

const UTILITY_ACTIONS: ActionItem[] = [
  { id: 'settings', icon: '⚙️', labelKey: 'iconrail.settings' },
];

const styles = {
  rail: {
    width: '40px',
    minWidth: '40px',
    background: colors.bgDark,
    borderInlineEnd: `1px solid ${colors.borderLight}`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: '8px',
    paddingBottom: '8px',
    gap: '2px',
    flexShrink: 0,
    zIndex: 2,
    minHeight: 0,
    overflowY: 'auto' as const,
    scrollbarWidth: 'none' as const,
  },
  actionSpacer: {
    marginTop: 'auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
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
    borderInlineStart: inWorkspace ? `2px solid ${colors.accent}` : '2px solid transparent',
    borderInlineEnd: 'none',
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
    insetInlineStart: '42px',
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
  const t = useT();

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
      title={t(item.labelKey)}
    >
      {item.icon}
      {badge}
      {hovered && !inWorkspace && <div style={styles.tooltip}>{t(item.labelKey)}</div>}
    </button>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        ...styles.iconButton(false),
        cursor: 'pointer',
        color: colors.text,
        opacity: hovered ? 1 : 0.7,
        background: hovered ? colors.surface : 'transparent',
      }}
    >
      {icon}
      {hovered && <div style={styles.tooltip}>{label}</div>}
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
  const showComplete = completedPhases.includes('build');
  const mode = useProjectStore((s) => s.projectState?.mode);
  const showWorkshop = mode === 'workshop';
  const kanbanHasActive = kanbanTasks.some(t => t.status === 'active' || t.status === 'review');
  const rateLimitWarning = useStatsStore((s) => {
    const rl = s.stats?.rateLimit;
    if (!rl) return null;
    if (rl.status === 'rejected') return 'error';
    if (rl.status === 'allowed_warning' || rl.utilization > 0.8) return 'warning';
    return null;
  });

  const t = useT();

  const visiblePrimary = PRIMARY_ITEMS.filter(item => {
    if (item.id === 'kanban') return showKanban;
    if (item.id === 'complete') return showComplete;
    if (item.id === 'workshop') return showWorkshop;
    if (item.id === 'diff') return showWorkshop;
    return true;
  });

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
      {isDevMode() && (
        <IconButton
          key={DEVJUMP_ITEM.id}
          item={DEVJUMP_ITEM}
          inWorkspace={activePanels.has(DEVJUMP_ITEM.id)}
          onClick={() => handleClick(DEVJUMP_ITEM.id)}
          onDragStart={(e) => handleDragStart(e, DEVJUMP_ITEM.id)}
        />
      )}
      <div style={styles.actionSpacer}>
        {UTILITY_ACTIONS.map((action) => (
          <ActionButton
            key={action.id}
            icon={action.icon}
            label={t(action.labelKey)}
            onClick={() => useSettingsStore.getState().open()}
          />
        ))}
      </div>
    </div>
  );
}
