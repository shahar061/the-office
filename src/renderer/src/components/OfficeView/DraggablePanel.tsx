import React, { useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 4;

interface Props {
  /** Unique id — used as the localStorage key so each panel remembers its own position + expanded state. */
  id: string;
  /** Header label shown in the collapsed bar and the expanded header. */
  title: string;
  /** Starting position if nothing is persisted yet. Both values are CSS pixels relative to the office pane. */
  defaultPosition: { top: number; right: number };
  /** Start collapsed or expanded on first render. */
  defaultExpanded?: boolean;
  /** Children are only rendered when the panel is expanded. */
  children: React.ReactNode;
}

interface Persisted {
  x: number;  // distance from the right edge (so the panel stays docked right on window resize)
  y: number;  // distance from the top edge
  expanded: boolean;
}

function loadPersisted(id: string): Persisted | null {
  try {
    const raw = localStorage.getItem(`office.draggablePanel.${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || typeof parsed.expanded !== 'boolean') return null;
    return parsed as Persisted;
  } catch {
    return null;
  }
}

function savePersisted(id: string, state: Persisted): void {
  try { localStorage.setItem(`office.draggablePanel.${id}`, JSON.stringify(state)); }
  catch { /* quota or disabled — non-fatal */ }
}

export function DraggablePanel({ id, title, defaultPosition, defaultExpanded = false, children }: Props): React.ReactElement {
  const persisted = loadPersisted(id);
  const [pos, setPos] = useState(() =>
    persisted ? { top: persisted.y, right: persisted.x } : defaultPosition,
  );
  const [expanded, setExpanded] = useState<boolean>(persisted ? persisted.expanded : defaultExpanded);

  // Track whether the current mousedown produced a drag (past threshold) vs.
  // a click. A pure click toggles the expanded state; a drag does not.
  const dragState = useRef<{
    startX: number;
    startY: number;
    originTop: number;
    originRight: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    savePersisted(id, { x: pos.right, y: pos.top, expanded });
  }, [id, pos.top, pos.right, expanded]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originTop: pos.top,
      originRight: pos.right,
      moved: false,
    };

    const handleMove = (ev: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      s.moved = true;
      // Right-anchored: moving mouse right reduces `right` offset.
      setPos({
        top: Math.max(0, s.originTop + dy),
        right: Math.max(0, s.originRight - dx),
      });
    };

    const handleUp = () => {
      const s = dragState.current;
      dragState.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (s && !s.moved) setExpanded((v) => !v);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [pos.top, pos.right]);

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.top,
        right: pos.right,
        background: 'rgba(15,15,26,0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid #333',
        borderRadius: '8px',
        minWidth: '140px',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      <div
        onMouseDown={onMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '6px 10px',
          borderBottom: expanded ? '1px solid #222' : 'none',
          cursor: 'grab',
          fontSize: '9px',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
        title="Drag to move · click to expand/collapse"
      >
        <span>{title}</span>
        <span style={{ fontSize: '10px', color: '#475569' }}>{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
