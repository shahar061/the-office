// tests/stores/layout.store.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../../src/renderer/src/stores/layout.store';
import type { LayoutNode, LeafNode, SplitNode } from '../../src/renderer/src/components/SplitLayout/layout-types';

describe('LayoutStore', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetToDefault('imagine');
  });

  it('starts with imagine default (chat + office)', () => {
    const { tree } = useLayoutStore.getState();
    expect(tree.type).toBe('split');
    const s = tree as SplitNode;
    expect((s.children[0] as LeafNode).panelId).toBe('chat');
    expect((s.children[1] as LeafNode).panelId).toBe('office');
  });

  it('splitPane creates a new split', () => {
    const { tree } = useLayoutStore.getState();
    const officePaneId = ((tree as SplitNode).children[1] as LeafNode).id;

    useLayoutStore.getState().splitPane(officePaneId, 'vertical', 'kanban', 'after');

    const updated = useLayoutStore.getState().tree as SplitNode;
    expect(updated.children[1].type).toBe('split');
    const rightSplit = updated.children[1] as SplitNode;
    expect((rightSplit.children[0] as LeafNode).panelId).toBe('office');
    expect((rightSplit.children[1] as LeafNode).panelId).toBe('kanban');
  });

  it('splitPane rejects if panelId already in tree', () => {
    const { tree } = useLayoutStore.getState();
    const officePaneId = ((tree as SplitNode).children[1] as LeafNode).id;

    useLayoutStore.getState().splitPane(officePaneId, 'vertical', 'chat', 'after');

    const updated = useLayoutStore.getState().tree;
    expect(updated.type).toBe('split');
    expect((updated as SplitNode).children[1].type).toBe('leaf');
  });

  it('splitPane rejects if max depth exceeded', () => {
    const deep: LayoutNode = {
      type: 'split', id: 's1', direction: 'horizontal', ratio: 0.5,
      children: [
        { type: 'split', id: 's2', direction: 'vertical', ratio: 0.5,
          children: [
            { type: 'split', id: 's3', direction: 'horizontal', ratio: 0.5,
              children: [
                { type: 'split', id: 's4', direction: 'vertical', ratio: 0.5,
                  children: [
                    { type: 'leaf', id: 'p1', panelId: 'chat' },
                    { type: 'leaf', id: 'p2', panelId: 'office' },
                  ],
                },
                { type: 'leaf', id: 'p3', panelId: 'agents' },
              ],
            },
            { type: 'leaf', id: 'p4', panelId: 'kanban' },
          ],
        },
        { type: 'leaf', id: 'p5', panelId: 'stats' },
      ],
    };
    useLayoutStore.getState().loadLayout(deep);

    useLayoutStore.getState().splitPane('p1', 'horizontal', 'logs', 'after');

    const result = useLayoutStore.getState().tree;
    expect(result).toEqual(deep);
  });

  it('closePane removes pane and merges sibling', () => {
    const { tree } = useLayoutStore.getState();
    const chatPaneId = ((tree as SplitNode).children[0] as LeafNode).id;

    useLayoutStore.getState().closePane(chatPaneId);

    const updated = useLayoutStore.getState().tree;
    expect(updated.type).toBe('leaf');
    expect((updated as LeafNode).panelId).toBe('office');
  });

  it('closePane does nothing on last pane', () => {
    useLayoutStore.getState().loadLayout({ type: 'leaf', id: 'p1', panelId: 'chat' });
    useLayoutStore.getState().closePane('p1');
    expect(useLayoutStore.getState().tree.type).toBe('leaf');
  });

  it('replacePanel swaps the panel in a pane', () => {
    const { tree } = useLayoutStore.getState();
    const chatPaneId = ((tree as SplitNode).children[0] as LeafNode).id;

    useLayoutStore.getState().replacePanel(chatPaneId, 'agents');

    const updated = useLayoutStore.getState().tree as SplitNode;
    expect((updated.children[0] as LeafNode).panelId).toBe('agents');
  });

  it('resizePane updates the split ratio', () => {
    const { tree } = useLayoutStore.getState();
    const splitId = tree.id;

    useLayoutStore.getState().resizePane(splitId, 0.6);

    const updated = useLayoutStore.getState().tree as SplitNode;
    expect(updated.ratio).toBe(0.6);
  });

  it('resizePane clamps ratio to valid range', () => {
    const { tree } = useLayoutStore.getState();
    useLayoutStore.getState().resizePane(tree.id, 1.5);
    expect((useLayoutStore.getState().tree as SplitNode).ratio).toBe(0.85);

    useLayoutStore.getState().resizePane(tree.id, -0.5);
    expect((useLayoutStore.getState().tree as SplitNode).ratio).toBe(0.15);
  });

  it('resetToDefault loads the phase default', () => {
    useLayoutStore.getState().resetToDefault('build');
    const { tree } = useLayoutStore.getState();
    expect(tree.type).toBe('split');
    const leaves: string[] = [];
    function walk(n: LayoutNode) {
      if (n.type === 'leaf') leaves.push(n.panelId);
      else { walk(n.children[0]); walk(n.children[1]); }
    }
    walk(tree);
    expect(leaves).toEqual(['chat', 'agents', 'kanban', 'office']);
  });

  it('focusedPaneId tracks the active pane', () => {
    expect(useLayoutStore.getState().focusedPaneId).toBeNull();
    useLayoutStore.getState().setFocusedPane('pane-1');
    expect(useLayoutStore.getState().focusedPaneId).toBe('pane-1');
  });
});
