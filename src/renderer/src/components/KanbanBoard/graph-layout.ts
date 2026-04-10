import type { KanbanTask } from '../../../../../shared/types';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  task: KanbanTask;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutPhase {
  id: string;
  x: number;
  width: number;
  name: string;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  phases: LayoutPhase[];
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
const COLUMN_GAP = 40;
const ROW_GAP = 16;
const COLUMN_WIDTH = NODE_WIDTH + COLUMN_GAP;
const ROW_HEIGHT = NODE_HEIGHT + ROW_GAP;
const PHASE_HEADER_HEIGHT = 32;

export function computeLayout(tasks: KanbanTask[]): GraphLayout {
  if (tasks.length === 0) {
    return {
      nodes: [],
      edges: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      phases: [],
    };
  }

  // Group tasks by phase in first-encountered order
  const phaseOrder: string[] = [];
  const phaseGroups = new Map<string, KanbanTask[]>();
  for (const task of tasks) {
    if (!phaseGroups.has(task.phaseId)) {
      phaseOrder.push(task.phaseId);
      phaseGroups.set(task.phaseId, []);
    }
    phaseGroups.get(task.phaseId)!.push(task);
  }

  // Assign positions
  const nodes: LayoutNode[] = [];
  const phases: LayoutPhase[] = [];
  phaseOrder.forEach((phaseId, colIndex) => {
    const x = colIndex * COLUMN_WIDTH;
    phases.push({ id: phaseId, x, width: NODE_WIDTH, name: phaseId });

    const group = phaseGroups.get(phaseId)!;
    group.forEach((task, rowIndex) => {
      nodes.push({
        id: task.id,
        x,
        y: PHASE_HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        task,
      });
    });
  });

  // Emit edges from dependsOn (only if target exists in task set)
  const edges: LayoutEdge[] = [];
  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      if (tasks.some(t => t.id === depId)) {
        edges.push({ from: depId, to: task.id });
      }
    }
  }

  // Compute bounds
  const maxX = nodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
  const maxY = nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);

  return {
    nodes,
    edges,
    bounds: { minX: 0, minY: 0, maxX, maxY },
    phases,
  };
}
