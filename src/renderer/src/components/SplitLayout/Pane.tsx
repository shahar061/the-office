// src/renderer/src/components/SplitLayout/Pane.tsx

import { useCallback, useState } from 'react';
import type { PanelId } from './layout-types';
import type { DropZone } from './DropZoneOverlay';
import { DropZoneOverlay } from './DropZoneOverlay';
import { useLayoutStore } from '../../stores/layout.store';
import { colors } from '../../theme';

import { ChatPanel } from '../OfficeView/ChatPanel';
import { AgentsScreen } from '../AgentsScreen/AgentsScreen';
import { LogViewer } from '../LogViewer/LogViewer';
import { AboutPanel } from '../AboutPanel/AboutPanel';
import { KanbanBoard } from '../KanbanBoard/KanbanBoard';
import { StatsPanel } from '../StatsPanel/StatsPanel';
import { OfficeCanvas } from '../../office/OfficeCanvas';
import { ArtifactToolbox } from '../OfficeView/ArtifactToolbox';
import { AudioControls } from '../OfficeView/AudioControls';
import { ArtifactOverlay } from '../OfficeView/ArtifactOverlay';
import { PlanOverlay } from '../OfficeView/PlanOverlay';
import { UIDesignReviewOverlay } from '../OfficeView/UIDesignReviewOverlay';
import { SpecProgressStrip } from '../OfficeView/SpecProgressStrip';
import { CompletionPanel } from '../CompletionPanel/CompletionPanel';
import { WorkshopPanel } from '../WorkshopPanel/WorkshopPanel';

const PANEL_META: Record<PanelId, { icon: string; label: string }> = {
  chat: { icon: '💬', label: 'Chat' },
  office: { icon: '🖥️', label: 'Office' },
  agents: { icon: '👥', label: 'Agents' },
  kanban: { icon: '📋', label: 'Kanban' },
  stats: { icon: '📊', label: 'Stats' },
  logs: { icon: '📋', label: 'Logs' },
  about: { icon: 'ℹ️', label: 'About' },
  complete: { icon: '🎉', label: 'Complete' },
  workshop: { icon: '🔧', label: 'Workshop' },
};

interface PaneProps {
  paneId: string;
  panelId: PanelId;
  isOnly: boolean; // true if this is the last remaining pane
  onSceneReady?: (scene: any) => void;
}

export function Pane({ paneId, panelId, isOnly, onSceneReady }: PaneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const splitPane = useLayoutStore((s) => s.splitPane);
  const closePane = useLayoutStore((s) => s.closePane);
  const replacePanelAction = useLayoutStore((s) => s.replacePanel);
  const setFocusedPane = useLayoutStore((s) => s.setFocusedPane);
  const focusedPaneId = useLayoutStore((s) => s.focusedPaneId);

  const meta = PANEL_META[panelId];
  const isFocused = focusedPaneId === paneId;

  const handleDrop = useCallback((zone: DropZone, droppedPanelId: string) => {
    setIsDragOver(false);
    const pid = droppedPanelId as PanelId;
    if (zone === 'center') {
      replacePanelAction(paneId, pid);
    } else {
      const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
      const position = (zone === 'left' || zone === 'top') ? 'before' : 'after';
      splitPane(paneId, direction, pid, position);
    }
  }, [paneId, splitPane, replacePanelAction]);

  const handleHeaderDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', panelId);
    e.dataTransfer.effectAllowed = 'move';
  }, [panelId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        border: isFocused ? `1px solid ${colors.accent}33` : '1px solid transparent',
        borderRadius: '4px',
      }}
      onClick={() => setFocusedPane(paneId)}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
      }}
    >
      {/* Header */}
      <div
        draggable
        onDragStart={handleHeaderDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '24px',
          minHeight: '24px',
          padding: '0 8px',
          background: colors.bgDark,
          borderBottom: `1px solid ${colors.borderLight}`,
          cursor: 'grab',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '11px', color: colors.textMuted, display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </span>
        {!isOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); closePane(paneId); }}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textDim,
              cursor: 'pointer',
              fontSize: '12px',
              padding: '0 2px',
              lineHeight: 1,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = colors.text; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = colors.textDim; }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {panelId === 'chat' && <ChatPanel isExpanded={true} />}
        {panelId === 'office' && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <OfficeCanvas onSceneReady={onSceneReady} />
            <ArtifactToolbox />
            <AudioControls />
            <ArtifactOverlay />
            <PlanOverlay />
            <UIDesignReviewOverlay />
            <SpecProgressStrip />
          </div>
        )}
        {panelId === 'agents' && <AgentsScreen />}
        {panelId === 'kanban' && <KanbanBoard />}
        {panelId === 'stats' && <StatsPanel />}
        {panelId === 'logs' && <LogViewer />}
        {panelId === 'about' && <AboutPanel />}
        {panelId === 'complete' && <CompletionPanel />}
        {panelId === 'workshop' && <WorkshopPanel />}
      </div>

      {/* Drop zone overlay (only during drag) */}
      {isDragOver && <DropZoneOverlay onDrop={handleDrop} />}
    </div>
  );
}
