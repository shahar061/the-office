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
