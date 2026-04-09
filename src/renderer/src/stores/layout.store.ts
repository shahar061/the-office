// src/renderer/src/stores/layout.store.ts

import { create } from 'zustand';
import type { LayoutNode, PanelId, SplitDirection } from '../components/SplitLayout/layout-types';
import type { Phase } from '../../../../shared/types';
import {
  insertSplit,
  removeLeaf,
  updateRatio,
  replacePanel as replacePanelInTree,
  collectPanelIds,
  getDepth,
  findLeaf,
} from '../components/SplitLayout/layout-utils';
import { getDefaultLayout } from '../components/SplitLayout/default-layouts';

const MAX_DEPTH = 4;

interface LayoutStore {
  tree: LayoutNode;
  focusedPaneId: string | null;

  splitPane(paneId: string, direction: SplitDirection, newPanelId: PanelId, position: 'before' | 'after'): void;
  closePane(paneId: string): void;
  replacePanel(paneId: string, newPanelId: PanelId): void;
  resizePane(splitId: string, ratio: number): void;
  setFocusedPane(paneId: string | null): void;
  resetToDefault(phase: Phase): void;
  loadLayout(tree: LayoutNode): void;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  tree: getDefaultLayout('imagine'),
  focusedPaneId: null,

  splitPane(paneId, direction, newPanelId, position) {
    const { tree } = get();
    if (collectPanelIds(tree).has(newPanelId)) return;
    if (getDepth(tree) >= MAX_DEPTH) return;
    if (!findLeaf(tree, paneId)) return;

    const updated = insertSplit(tree, paneId, direction, newPanelId, position);
    set({ tree: updated });
  },

  closePane(paneId) {
    const { tree } = get();
    const result = removeLeaf(tree, paneId);
    if (result === null) return;
    set({ tree: result, focusedPaneId: null });
  },

  replacePanel(paneId, newPanelId) {
    const { tree } = get();
    set({ tree: replacePanelInTree(tree, paneId, newPanelId) });
  },

  resizePane(splitId, ratio) {
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    set({ tree: updateRatio(get().tree, splitId, clamped) });
  },

  setFocusedPane(paneId) {
    set({ focusedPaneId: paneId });
  },

  resetToDefault(phase) {
    set({ tree: getDefaultLayout(phase), focusedPaneId: null });
  },

  loadLayout(tree) {
    set({ tree, focusedPaneId: null });
  },
}));
