// src/renderer/src/components/KanbanBoard/DependencyGraph.tsx
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useKanbanStore } from '../../stores/kanban.store';
import { AGENT_COLORS, type KanbanTask } from '@shared/types';
import { colors } from '../../theme';
import { computeLayout, type LayoutNode } from './graph-layout';
import { getUpstreamChain, getDownstreamChain } from './graph-traversal';

const STATUS_FILL: Record<KanbanTask['status'], string> = {
  queued: '#333',
  active: '#f59e0b',
  review: '#3b82f6',
  done: '#22c55e',
  failed: '#ef4444',
};

const styles = {
  root: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    background: colors.bg,
  },
  svg: {
    width: '100%',
    height: '100%',
    display: 'block',
    userSelect: 'none' as const,
  },
  fitButton: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    padding: '6px 10px',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    zIndex: 2,
  },
  infoButton: {
    position: 'absolute' as const,
    top: '8px',
    right: '108px',
    width: '28px',
    height: '28px',
    padding: 0,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '50%',
    color: colors.textMuted,
    fontSize: '13px',
    fontWeight: 700,
    fontStyle: 'italic' as const,
    fontFamily: 'serif',
    cursor: 'pointer',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    padding: '16px',
  },
  modalPanel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    width: '90%',
    maxWidth: '520px',
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.text,
  },
  modalClose: {
    background: 'none',
    border: 'none',
    color: colors.textMuted,
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    fontFamily: 'inherit',
    lineHeight: 1,
  },
  modalBody: {
    padding: '16px 18px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  section: {
    marginBottom: '18px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: colors.text,
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  sectionText: {
    fontSize: '12px',
    color: colors.textMuted,
    lineHeight: '1.5',
    marginBottom: '10px',
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
    fontSize: '11px',
    color: colors.textLight,
  },
  legendLabel: {
    fontSize: '11px',
    color: colors.textMuted,
    flex: 1,
  },
  kbd: {
    display: 'inline-block',
    padding: '2px 6px',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: colors.text,
    marginRight: '6px',
  },
} as const;

export function DependencyGraph() {
  const tasks = useKanbanStore((s) => s.kanban.tasks);
  const layout = useMemo(() => computeLayout(tasks), [tasks]);
  const svgRef = useRef<SVGSVGElement>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastTaskSetRef = useRef<string>('');

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Close info modal on Escape
  useEffect(() => {
    if (!showInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowInfo(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showInfo]);

  const highlightedIds = useMemo(() => {
    if (!hoveredId) return null;
    const up = getUpstreamChain(tasks, hoveredId);
    const down = getDownstreamChain(tasks, hoveredId);
    const set = new Set<string>(up);
    for (const d of down) set.add(d);
    set.add(hoveredId);
    return set;
  }, [hoveredId, tasks]);

  const fitToScreen = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const { minX, minY, maxX, maxY } = layout.bounds;
    const graphW = maxX - minX;
    const graphH = maxY - minY;
    if (graphW === 0 || graphH === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const padding = 24;
    const scaleX = (rect.width - padding * 2) / graphW;
    const scaleY = (rect.height - padding * 2) / graphH;
    const newZoom = Math.min(scaleX, scaleY, 1);
    const newPanX = padding + (rect.width - padding * 2 - graphW * newZoom) / 2 - minX * newZoom;
    const newPanY = padding + (rect.height - padding * 2 - graphH * newZoom) / 2 - minY * newZoom;
    setPan({ x: newPanX, y: newPanY });
    setZoom(newZoom);
  }, [layout.bounds]);

  useEffect(() => {
    const taskKey = tasks.map(t => t.id).sort().join(',');
    if (taskKey !== lastTaskSetRef.current) {
      lastTaskSetRef.current = taskKey;
      requestAnimationFrame(() => fitToScreen());
    }
  }, [tasks, fitToScreen]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.25, Math.min(3, zoom * (1 + delta)));
    const scaleRatio = newZoom / zoom;
    const newPanX = cursorX - (cursorX - pan.x) * scaleRatio;
    const newPanY = cursorY - (cursorY - pan.y) * scaleRatio;
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [pan, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).tagName === 'svg' || (e.target as Element).tagName === 'g') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({
      x: panStart.current.panX + dx,
      y: panStart.current.panY + dy,
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes graph-node-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .graph-node-active rect {
          animation: graph-node-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
      <button
        style={styles.infoButton}
        onClick={() => setShowInfo(true)}
        title="How to read this graph"
        aria-label="Graph info"
      >
        i
      </button>
      <button style={styles.fitButton} onClick={fitToScreen}>
        Fit to screen
      </button>
      <svg
        ref={svgRef}
        style={{ ...styles.svg, cursor: isPanning ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#444" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Phase headers */}
          {layout.phases.map((phase) => (
            <text
              key={phase.id}
              x={phase.x + phase.width / 2}
              y={20}
              textAnchor="middle"
              fill={colors.textMuted}
              fontSize="11"
              fontFamily="monospace"
            >
              {phase.name}
            </text>
          ))}

          {/* Edges */}
          {layout.edges.map((edge, i) => {
            const from = layout.nodes.find(n => n.id === edge.from);
            const to = layout.nodes.find(n => n.id === edge.to);
            if (!from || !to) return null;
            const x1 = from.x + from.width;
            const y1 = from.y + from.height / 2;
            const x2 = to.x;
            const y2 = to.y + to.height / 2;
            const dx = Math.abs(x2 - x1) * 0.5;
            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            let stroke = '#444';
            let strokeWidth = 1;
            let opacity = 1;
            if (highlightedIds) {
              const isHighlighted = highlightedIds.has(edge.from) && highlightedIds.has(edge.to);
              if (isHighlighted) {
                stroke = '#3b82f6';
                strokeWidth = 2;
              } else {
                opacity = 0.15;
              }
            }

            return (
              <path
                key={i}
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                markerEnd="url(#arrow)"
                style={{ transition: 'opacity 150ms ease, stroke 150ms ease' }}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((node) => {
            const isDimmed = highlightedIds !== null && !highlightedIds.has(node.id);
            const isHighlighted = highlightedIds !== null && highlightedIds.has(node.id);
            return (
              <GraphNode
                key={node.id}
                node={node}
                dimmed={isDimmed}
                highlighted={isHighlighted}
                onHoverStart={() => setHoveredId(node.id)}
                onHoverEnd={() => setHoveredId(null)}
              />
            );
          })}
        </g>
      </svg>
      {showInfo && <GraphInfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}

function GraphInfoModal({ onClose }: { onClose: () => void }) {
  // Small helper: an inline SVG mini-node matching the real GraphNode style
  const MiniNode = ({ status, label, agentColor = '#3b82f6', className }: {
    status: KanbanTask['status'];
    label: string;
    agentColor?: string;
    className?: string;
  }) => (
    <svg width={140} height={44} style={{ flexShrink: 0 }}>
      <g className={className}>
        <rect
          x={1}
          y={1}
          width={138}
          height={42}
          rx={6}
          ry={6}
          fill={STATUS_FILL[status]}
          stroke="#2a2a3a"
          strokeWidth={1}
        />
        <circle cx={11} cy={11} r={5} fill={agentColor} />
        <text x={23} y={15} fill="#94a3b8" fontSize="9" fontFamily="monospace">
          task-1
        </text>
        <text x={11} y={32} fill="#e2e8f0" fontSize="11" fontFamily="system-ui, sans-serif">
          {label}
        </text>
      </g>
    </svg>
  );

  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>How to read this graph</span>
          <button style={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={styles.modalBody}>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>What am I looking at?</div>
            <div style={styles.sectionText}>
              Each box is a build task. Tasks are grouped into columns by phase and flow left to right.
              Arrows show dependencies — a task can't start until all tasks pointing to it are done.
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Task status (color)</div>
            <div style={styles.sectionText}>
              The fill color tells you what state the task is in.
            </div>
            <div style={styles.legendRow}>
              <MiniNode status="queued" label="Waiting to start" />
              <div style={styles.legendLabel}>Queued — waiting on dependencies</div>
            </div>
            <div style={styles.legendRow}>
              <MiniNode status="active" label="Running now" className="graph-node-active" />
              <div style={styles.legendLabel}>Active — agent is working (pulses)</div>
            </div>
            <div style={styles.legendRow}>
              <MiniNode status="review" label="Under review" />
              <div style={styles.legendLabel}>In Review — self-review step</div>
            </div>
            <div style={styles.legendRow}>
              <MiniNode status="done" label="Finished" />
              <div style={styles.legendLabel}>Done — completed successfully</div>
            </div>
            <div style={styles.legendRow}>
              <MiniNode status="failed" label="Failed" />
              <div style={styles.legendLabel}>Failed — task errored out</div>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Agent badge (colored dot)</div>
            <div style={styles.sectionText}>
              The small colored dot in the top-left corner identifies which agent owns the task.
              Each agent role (backend, frontend, etc.) has its own color.
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(AGENT_COLORS).slice(0, 8).map(([role, color]) => (
                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: colors.textMuted }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                  <span>{role.replace('-', ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Dependencies (arrows)</div>
            <div style={styles.sectionText}>
              Arrows go from the task that must finish first (source) to the task that depends on it (target).
              If A → B, then B cannot start until A is done.
            </div>
            <svg width={320} height={60}>
              <defs>
                <marker id="info-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
                </marker>
              </defs>
              <rect x={10} y={14} width={120} height={32} rx={6} ry={6} fill={STATUS_FILL.done} stroke="#2a2a3a" />
              <text x={70} y={34} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontFamily="system-ui, sans-serif">Task A (done)</text>
              <rect x={190} y={14} width={120} height={32} rx={6} ry={6} fill={STATUS_FILL.active} stroke="#2a2a3a" />
              <text x={250} y={34} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontFamily="system-ui, sans-serif">Task B (active)</text>
              <path
                d="M 130 30 C 160 30, 160 30, 190 30"
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2}
                markerEnd="url(#info-arrow)"
              />
            </svg>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Hover to trace a chain</div>
            <div style={styles.sectionText}>
              Hover any task to highlight its full dependency chain — every task it depends on (upstream)
              and every task that depends on it (downstream). Everything else dims. Perfect for answering
              "why is this task stuck?"
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Navigation</div>
            <div style={styles.sectionText}>
              <div style={{ marginBottom: '6px' }}>
                <span style={styles.kbd}>scroll</span>
                zoom in / out around the cursor
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span style={styles.kbd}>click + drag</span>
                pan the view
              </div>
              <div>
                <span style={styles.kbd}>Fit to screen</span>
                recenter and fit everything
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

interface GraphNodeProps {
  node: LayoutNode;
  dimmed?: boolean;
  highlighted?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

function GraphNode({ node, dimmed, highlighted, onHoverStart, onHoverEnd }: GraphNodeProps) {
  const { task } = node;
  const fill = STATUS_FILL[task.status];
  const agentColor = AGENT_COLORS[task.assignedAgent] ?? '#666';

  const maxChars = 22;
  const description = task.description.length > maxChars
    ? task.description.slice(0, maxChars - 1) + '…'
    : task.description;

  const opacity = dimmed ? 0.25 : 1;
  const strokeColor = highlighted ? '#3b82f6' : '#2a2a3a';
  const strokeWidth = highlighted ? 2 : 1;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      opacity={opacity}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={task.status === 'active' ? 'graph-node-active' : undefined}
      style={{ cursor: 'pointer', transition: 'opacity 150ms ease' }}
    >
      <rect
        width={node.width}
        height={node.height}
        rx={6}
        ry={6}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{ transition: 'stroke 150ms ease' }}
      />
      <circle cx={10} cy={10} r={5} fill={agentColor} />
      <text
        x={22}
        y={14}
        fill="#94a3b8"
        fontSize="9"
        fontFamily="monospace"
      >
        {task.id}
      </text>
      <text
        x={10}
        y={32}
        fill="#e2e8f0"
        fontSize="11"
        fontFamily="system-ui, sans-serif"
      >
        {description}
      </text>
    </g>
  );
}
