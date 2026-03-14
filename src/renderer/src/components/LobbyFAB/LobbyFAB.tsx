import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/app.store';

type Tool = 'opencode' | 'claude-code';

const TOOLS: { id: Tool; label: string; enabled: boolean }[] = [
  { id: 'opencode', label: 'OpenCode', enabled: true },
  { id: 'claude-code', label: 'Claude Code', enabled: false },
];

export function LobbyFAB() {
  const [open, setOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool>('opencode');
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const createSession = useAppStore((s) => s.createSession);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('keydown', handleKey);
      document.addEventListener('mousedown', handleClick);
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const handlePickDir = async () => {
    if (!window.office?.pickDirectory) return;
    const dir = await window.office.pickDirectory();
    if (dir) setSelectedDir(dir);
  };

  const handleStart = async () => {
    if (!selectedDir) return;
    if (window.office?.createSession) {
      await window.office.createSession(selectedTool, selectedDir);
    }
    createSession(selectedTool, selectedDir);
    setOpen(false);
    setSelectedDir(null);
  };

  const truncatedDir = selectedDir
    ? selectedDir.split('/').pop() || selectedDir
    : null;

  return (
    <div ref={popoverRef} style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 20 }}>
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 56,
          right: 0,
          background: 'rgba(15, 15, 26, 0.95)',
          border: '1px solid #2a2a4a',
          borderRadius: 8,
          padding: 12,
          minWidth: 220,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tool
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => tool.enabled && setSelectedTool(tool.id)}
                disabled={!tool.enabled}
                title={!tool.enabled ? 'Coming soon' : undefined}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: selectedTool === tool.id ? '1px solid #3b82f6' : '1px solid #2a2a4a',
                  background: selectedTool === tool.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(42, 42, 74, 0.3)',
                  color: !tool.enabled ? '#4a4a6a' : selectedTool === tool.id ? '#3b82f6' : '#9ca3af',
                  fontSize: 11,
                  cursor: tool.enabled ? 'pointer' : 'not-allowed',
                }}
              >
                {tool.label}
              </button>
            ))}
          </div>

          <button
            onClick={handlePickDir}
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #2a2a4a',
              background: 'rgba(42, 42, 74, 0.3)',
              color: selectedDir ? '#e5e5e5' : '#9ca3af',
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncatedDir || 'Choose Folder...'}
          </button>

          <button
            onClick={handleStart}
            disabled={!selectedDir}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              background: selectedDir ? '#3b82f6' : '#2a2a4a',
              color: selectedDir ? '#fff' : '#6b7280',
              fontSize: 12,
              fontWeight: 500,
              cursor: selectedDir ? 'pointer' : 'not-allowed',
            }}
          >
            Start
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #2a2a4a',
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#3b82f6',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          whiteSpace: 'nowrap',
        }}
      >
        New Session
      </button>
    </div>
  );
}
