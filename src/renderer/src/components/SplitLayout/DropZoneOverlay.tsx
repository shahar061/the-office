import { useState, useCallback } from 'react';
import { colors } from '../../theme';

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';

interface DropZoneOverlayProps {
  onDrop: (zone: DropZone, panelId: string) => void;
}

function getZone(e: React.DragEvent<HTMLDivElement>): DropZone {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  if (x < 0.2) return 'left';
  if (x > 0.8) return 'right';
  if (y < 0.2) return 'top';
  if (y > 0.8) return 'bottom';
  return 'center';
}

const zoneStyles: Record<DropZone, React.CSSProperties> = {
  left: { left: 0, top: 0, width: '50%', height: '100%' },
  right: { right: 0, top: 0, width: '50%', height: '100%' },
  top: { left: 0, top: 0, width: '100%', height: '50%' },
  bottom: { left: 0, bottom: 0, width: '100%', height: '50%' },
  center: { left: '10%', top: '10%', width: '80%', height: '80%', borderRadius: '8px' },
};

export function DropZoneOverlay({ onDrop }: DropZoneOverlayProps) {
  const [activeZone, setActiveZone] = useState<DropZone | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setActiveZone(getZone(e));
  }, []);

  const handleDragLeave = useCallback(() => {
    setActiveZone(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const panelId = e.dataTransfer.getData('text/plain');
    if (!panelId) return;
    const zone = getZone(e);
    setActiveZone(null);
    onDrop(zone, panelId);
  }, [onDrop]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
      }}
    >
      {activeZone && (
        <div
          style={{
            position: 'absolute',
            ...zoneStyles[activeZone],
            background: `${colors.accent}15`,
            border: `2px dashed ${colors.accent}`,
            pointerEvents: 'none',
            transition: 'all 0.1s ease',
          }}
        />
      )}
    </div>
  );
}
