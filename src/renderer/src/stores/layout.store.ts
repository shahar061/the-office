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
  findLeafByPanelId,
  firstLeaf,
  hasDuplicatePanels,
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
    if (!findLeaf(tree, paneId)) return;

    // If the panel is already open elsewhere, this is a MOVE (drag a pane header
    // to another pane's edge). Remove it from its source before splitting.
    const existingLeaf = findLeafByPanelId(tree, newPanelId);
    if (existingLeaf) {
      // No-op if dropping on the same pane (can't split a pane with itself)
      if (existingLeaf.id === paneId) return;
      const removed = removeLeaf(tree, existingLeaf.id);
      if (removed === null) return;
      // After removal, the target pane may have been promoted/reparented but its
      // id is stable — findLeaf still works.
      if (!findLeaf(removed, paneId)) return;
      if (getDepth(removed) >= MAX_DEPTH) return;
      const updated = insertSplit(removed, paneId, direction, newPanelId, position);
      set({ tree: updated });
      return;
    }

    if (getDepth(tree) >= MAX_DEPTH) return;
    const updated = insertSplit(tree, paneId, direction, newPanelId, position);
    set({ tree: updated });
  },

  closePane(paneId) {
    const { tree } = get();
    const result = removeLeaf(tree, paneId);
    if (result === null) return;
    // Auto-focus the nearest surviving leaf
    const nextFocus = firstLeaf(result).id;
    set({ tree: result, focusedPaneId: nextFocus });
  },

  replacePanel(paneId, newPanelId) {
    const { tree } = get();
    const existingLeaf = findLeafByPanelId(tree, newPanelId);
    if (existingLeaf) {
      // Panel already in the tree — if it's the same pane, nothing to do
      if (existingLeaf.id === paneId) return;
      // Otherwise swap: source pane gets the target's current panel
      const targetLeaf = findLeaf(tree, paneId);
      if (!targetLeaf) return;
      let updated = replacePanelInTree(tree, paneId, newPanelId);
      updated = replacePanelInTree(updated, existingLeaf.id, targetLeaf.panelId);
      set({ tree: updated });
      return;
    }
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
    // Reject corrupted layouts with duplicate panels
    if (hasDuplicatePanels(tree)) return;
    set({ tree, focusedPaneId: null });
  },
}));

// ── Auto-save on tree changes ──

let _currentPhase: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function setCurrentLayoutPhase(phase: string): void {
  _currentPhase = phase;
}

function debouncedSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const { tree } = useLayoutStore.getState();
    if (!_currentPhase) return;
    try {
      const existing = (await window.office.getLayouts()) ?? {};
      existing[_currentPhase] = tree;
      await window.office.saveLayouts(existing);
    } catch {
      // Save failed — not critical
    }
  }, 500);
}

useLayoutStore.subscribe((state, prev) => {
  if (state.tree !== prev.tree) debouncedSave();
});
