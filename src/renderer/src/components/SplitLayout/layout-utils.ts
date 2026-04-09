import type { LayoutNode, LeafNode, SplitNode, SplitDirection, PanelId } from './layout-types';

let paneCounter = 0;

export function generatePaneId(): string {
  return `pane-${++paneCounter}`;
}

export function generateSplitId(): string {
  return `split-${++paneCounter}`;
}

export function findLeaf(node: LayoutNode, id: string): LeafNode | null {
  if (node.type === 'leaf') return node.id === id ? node : null;
  return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
}

export function findParent(root: LayoutNode, targetId: string): SplitNode | null {
  if (root.type === 'leaf') return null;
  for (const child of root.children) {
    if (child.id === targetId) return root;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

export function collectPanelIds(node: LayoutNode): Set<PanelId> {
  if (node.type === 'leaf') return new Set([node.panelId]);
  const left = collectPanelIds(node.children[0]);
  const right = collectPanelIds(node.children[1]);
  return new Set([...left, ...right]);
}

export function getDepth(node: LayoutNode): number {
  if (node.type === 'leaf') return 0;
  return 1 + Math.max(getDepth(node.children[0]), getDepth(node.children[1]));
}

export function insertSplit(
  root: LayoutNode,
  targetPaneId: string,
  direction: SplitDirection,
  newPanelId: PanelId,
  position: 'before' | 'after',
): LayoutNode {
  if (root.type === 'leaf') {
    if (root.id !== targetPaneId) return root;
    const newLeaf: LeafNode = { type: 'leaf', id: generatePaneId(), panelId: newPanelId };
    const children: [LayoutNode, LayoutNode] = position === 'before'
      ? [newLeaf, root]
      : [root, newLeaf];
    return { type: 'split', id: generateSplitId(), direction, ratio: 0.5, children };
  }
  return {
    ...root,
    children: [
      insertSplit(root.children[0], targetPaneId, direction, newPanelId, position),
      insertSplit(root.children[1], targetPaneId, direction, newPanelId, position),
    ],
  };
}

export function removeLeaf(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.type === 'leaf') return root.id === targetId ? null : root;

  if (root.children[0].id === targetId) return root.children[1];
  if (root.children[1].id === targetId) return root.children[0];

  const left = removeLeaf(root.children[0], targetId);
  const right = removeLeaf(root.children[1], targetId);

  if (left === null) return right;
  if (right === null) return left;

  return { ...root, children: [left, right] };
}

export function updateRatio(root: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (root.type === 'leaf') return root;
  if (root.id === splitId) return { ...root, ratio };
  return {
    ...root,
    children: [
      updateRatio(root.children[0], splitId, ratio),
      updateRatio(root.children[1], splitId, ratio),
    ],
  };
}

export function replacePanel(root: LayoutNode, paneId: string, newPanelId: PanelId): LayoutNode {
  if (root.type === 'leaf') {
    return root.id === paneId ? { ...root, panelId: newPanelId } : root;
  }
  return {
    ...root,
    children: [
      replacePanel(root.children[0], paneId, newPanelId),
      replacePanel(root.children[1], paneId, newPanelId),
    ],
  };
}

export function findLeafByPanelId(node: LayoutNode, panelId: PanelId): LeafNode | null {
  if (node.type === 'leaf') return node.panelId === panelId ? node : null;
  return findLeafByPanelId(node.children[0], panelId) ?? findLeafByPanelId(node.children[1], panelId);
}
