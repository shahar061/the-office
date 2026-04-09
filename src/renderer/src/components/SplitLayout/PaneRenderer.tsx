// src/renderer/src/components/SplitLayout/PaneRenderer.tsx

import { useCallback } from 'react';
import type { LayoutNode, LeafNode } from './layout-types';
import { Pane } from './Pane';
import { ResizeHandle } from './ResizeHandle';
import { useLayoutStore } from '../../stores/layout.store';
import { collectPanelIds } from './layout-utils';

interface PaneRendererProps {
  node: LayoutNode;
  isOnly: boolean; // true if this is the sole leaf in the entire tree
  onSceneReady?: (scene: any) => void;
}

export function PaneRenderer({ node, isOnly, onSceneReady }: PaneRendererProps) {
  const resizePane = useLayoutStore((s) => s.resizePane);

  const handleResize = useCallback((ratio: number) => {
    resizePane(node.id, ratio);
  }, [node.id, resizePane]);

  if (node.type === 'leaf') {
    return (
      <Pane
        paneId={node.id}
        panelId={node.panelId}
        isOnly={isOnly}
        onSceneReady={node.panelId === 'office' ? onSceneReady : undefined}
      />
    );
  }

  const isHorizontal = node.direction === 'horizontal';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: node.ratio, overflow: 'hidden', display: 'flex', minWidth: 0, minHeight: 0 }}>
        <PaneRenderer node={node.children[0]} isOnly={false} onSceneReady={onSceneReady} />
      </div>
      <ResizeHandle direction={node.direction} onResize={handleResize} />
      <div style={{ flex: 1 - node.ratio, overflow: 'hidden', display: 'flex', minWidth: 0, minHeight: 0 }}>
        <PaneRenderer node={node.children[1]} isOnly={false} onSceneReady={onSceneReady} />
      </div>
    </div>
  );
}

export function SplitLayout({ onSceneReady }: { onSceneReady?: (scene: any) => void }) {
  const tree = useLayoutStore((s) => s.tree);
  const isOnly = tree.type === 'leaf';

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <PaneRenderer node={tree} isOnly={isOnly} onSceneReady={onSceneReady} />
    </div>
  );
}
