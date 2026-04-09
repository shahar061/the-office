// src/renderer/src/components/SplitLayout/default-layouts.ts

import type { LayoutNode } from './layout-types';
import type { Phase } from '../../../../shared/types';

function leaf(id: string, panelId: string): LayoutNode {
  return { type: 'leaf', id, panelId: panelId as any };
}

function split(id: string, direction: 'horizontal' | 'vertical', ratio: number, children: [LayoutNode, LayoutNode]): LayoutNode {
  return { type: 'split', id, direction, ratio, children };
}

const IMAGINE_DEFAULT: LayoutNode = split('s1', 'horizontal', 0.35, [
  leaf('pane-1', 'chat'),
  leaf('pane-2', 'office'),
]);

const WARROOM_DEFAULT: LayoutNode = split('s1', 'horizontal', 0.35, [
  leaf('pane-1', 'chat'),
  leaf('pane-2', 'office'),
]);

const BUILD_DEFAULT: LayoutNode = split('s1', 'horizontal', 0.25, [
  split('s2', 'vertical', 0.5, [
    leaf('pane-1', 'chat'),
    leaf('pane-2', 'agents'),
  ]),
  split('s3', 'vertical', 0.6, [
    leaf('pane-3', 'kanban'),
    leaf('pane-4', 'office'),
  ]),
]);

const IDLE_DEFAULT: LayoutNode = leaf('pane-1', 'office');

export const DEFAULT_LAYOUTS: Record<string, LayoutNode> = {
  idle: IDLE_DEFAULT,
  imagine: IMAGINE_DEFAULT,
  warroom: WARROOM_DEFAULT,
  build: BUILD_DEFAULT,
  complete: BUILD_DEFAULT,
};

export function getDefaultLayout(phase: Phase): LayoutNode {
  return structuredClone(DEFAULT_LAYOUTS[phase] ?? IDLE_DEFAULT);
}
