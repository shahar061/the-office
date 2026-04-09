// src/renderer/src/components/SplitLayout/ResizeHandle.tsx

import { useCallback, useRef } from 'react';
import type { SplitDirection } from './layout-types';
import { colors } from '../../theme';

interface ResizeHandleProps {
  direction: SplitDirection;
  onResize: (ratio: number) => void;
}

const HANDLE_SIZE = 4;

export function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const handle = containerRef.current;
    if (!handle) return;

    const parent = handle.parentElement;
    if (!parent) return;

    handle.setPointerCapture(e.pointerId);

    const parentRect = parent.getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      let ratio: number;
      if (direction === 'horizontal') {
        ratio = (ev.clientX - parentRect.left) / parentRect.width;
      } else {
        ratio = (ev.clientY - parentRect.top) / parentRect.height;
      }
      onResize(ratio);
    };

    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }, [direction, onResize]);

  const handleDoubleClick = useCallback(() => {
    onResize(0.5);
  }, [onResize]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      style={{
        [isHorizontal ? 'width' : 'height']: `${HANDLE_SIZE}px`,
        [isHorizontal ? 'minWidth' : 'minHeight']: `${HANDLE_SIZE}px`,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        background: colors.borderLight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accent; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = colors.borderLight; }}
    />
  );
}
