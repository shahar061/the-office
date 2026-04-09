import { describe, it, expect } from 'vitest';
import {
  findLeaf,
  findParent,
  collectPanelIds,
  insertSplit,
  removeLeaf,
  updateRatio,
  generatePaneId,
  getDepth,
} from '../../../../src/renderer/src/components/SplitLayout/layout-utils';
import type { LayoutNode, LeafNode, SplitNode } from '../../../../src/renderer/src/components/SplitLayout/layout-types';

const leaf = (id: string, panelId: string): LeafNode => ({
  type: 'leaf', id, panelId: panelId as any,
});

const split = (id: string, dir: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode]): SplitNode => ({
  type: 'split', id, direction: dir, ratio, children,
});

describe('layout-utils', () => {
  describe('findLeaf', () => {
    it('finds a leaf by id in a single leaf tree', () => {
      const tree = leaf('p1', 'chat');
      expect(findLeaf(tree, 'p1')).toBe(tree);
    });

    it('finds a leaf nested in splits', () => {
      const target = leaf('p2', 'office');
      const tree = split('s1', 'horizontal', 0.5, [leaf('p1', 'chat'), target]);
      expect(findLeaf(tree, 'p2')).toBe(target);
    });

    it('returns null for missing id', () => {
      const tree = leaf('p1', 'chat');
      expect(findLeaf(tree, 'missing')).toBeNull();
    });
  });

  describe('findParent', () => {
    it('returns null for root leaf', () => {
      const tree = leaf('p1', 'chat');
      expect(findParent(tree, 'p1')).toBeNull();
    });

    it('returns the parent split node', () => {
      const tree = split('s1', 'horizontal', 0.5, [leaf('p1', 'chat'), leaf('p2', 'office')]);
      const result = findParent(tree, 'p2');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('s1');
    });
  });

  describe('collectPanelIds', () => {
    it('returns single panelId from leaf', () => {
      expect(collectPanelIds(leaf('p1', 'chat'))).toEqual(new Set(['chat']));
    });

    it('collects all panelIds from nested tree', () => {
      const tree = split('s1', 'horizontal', 0.5, [
        leaf('p1', 'chat'),
        split('s2', 'vertical', 0.5, [leaf('p2', 'office'), leaf('p3', 'kanban')]),
      ]);
      expect(collectPanelIds(tree)).toEqual(new Set(['chat', 'office', 'kanban']));
    });
  });

  describe('insertSplit', () => {
    it('replaces a leaf with a split containing old + new leaf', () => {
      const tree = leaf('p1', 'chat');
      const result = insertSplit(tree, 'p1', 'horizontal', 'office', 'after');
      expect(result.type).toBe('split');
      const s = result as SplitNode;
      expect(s.direction).toBe('horizontal');
      expect(s.ratio).toBe(0.5);
      expect((s.children[0] as LeafNode).panelId).toBe('chat');
      expect((s.children[1] as LeafNode).panelId).toBe('office');
    });

    it('inserts before when position is before', () => {
      const tree = leaf('p1', 'chat');
      const result = insertSplit(tree, 'p1', 'vertical', 'kanban', 'before');
      const s = result as SplitNode;
      expect((s.children[0] as LeafNode).panelId).toBe('kanban');
      expect((s.children[1] as LeafNode).panelId).toBe('chat');
    });
  });

  describe('removeLeaf', () => {
    it('returns sibling when removing from a two-leaf split', () => {
      const tree = split('s1', 'horizontal', 0.5, [leaf('p1', 'chat'), leaf('p2', 'office')]);
      const result = removeLeaf(tree, 'p1');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('leaf');
      expect((result as LeafNode).panelId).toBe('office');
    });

    it('returns null when trying to remove the only leaf', () => {
      const tree = leaf('p1', 'chat');
      expect(removeLeaf(tree, 'p1')).toBeNull();
    });

    it('preserves rest of tree when removing from nested split', () => {
      const tree = split('s1', 'horizontal', 0.5, [
        leaf('p1', 'chat'),
        split('s2', 'vertical', 0.5, [leaf('p2', 'office'), leaf('p3', 'kanban')]),
      ]);
      const result = removeLeaf(tree, 'p2')!;
      expect(result.type).toBe('split');
      const s = result as SplitNode;
      expect((s.children[0] as LeafNode).panelId).toBe('chat');
      expect((s.children[1] as LeafNode).panelId).toBe('kanban');
    });
  });

  describe('getDepth', () => {
    it('returns 0 for a single leaf', () => {
      expect(getDepth(leaf('p1', 'chat'))).toBe(0);
    });

    it('returns correct depth for nested tree', () => {
      const tree = split('s1', 'horizontal', 0.5, [
        leaf('p1', 'chat'),
        split('s2', 'vertical', 0.5, [leaf('p2', 'office'), leaf('p3', 'kanban')]),
      ]);
      expect(getDepth(tree)).toBe(2);
    });
  });

  describe('generatePaneId', () => {
    it('returns unique ids on successive calls', () => {
      const a = generatePaneId();
      const b = generatePaneId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^pane-/);
    });
  });
});
