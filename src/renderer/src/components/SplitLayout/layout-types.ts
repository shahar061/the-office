export type PanelId = 'chat' | 'office' | 'agents' | 'kanban' | 'stats' | 'logs' | 'about' | 'complete' | 'workshop';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  ratio: number;
  children: [LayoutNode, LayoutNode];
}

export interface LeafNode {
  type: 'leaf';
  id: string;
  panelId: PanelId;
}

export type LayoutNode = SplitNode | LeafNode;
