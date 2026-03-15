import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings.store';
import { TerminalPanel } from './TerminalPanel';

export function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const close = useSettingsStore((s) => s.close);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      close();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: 480,
          maxHeight: '80vh',
          background: 'rgba(15, 15, 26, 0.97)',
          border: '2px solid #3b82f6',
          borderRadius: 2,
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.15), 0 8px 32px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '2px solid #2a2a4a',
          background: 'rgba(59, 130, 246, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚙</span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: 700,
              color: '#e5e5e5',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>Settings</span>
          </div>
          <button
            onClick={close}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0 4px',
              border: '1px solid #2a2a4a',
              borderRadius: 2,
              background: 'none',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '2px solid #2a2a4a' }}>
          <div style={{
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#3b82f6',
            borderBottom: '2px solid #3b82f6',
            marginBottom: -2,
            letterSpacing: '0.5px',
          }}>
            TERMINAL
          </div>
          <div style={{
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#4a4a6a',
            letterSpacing: '0.5px',
          }}>
            GENERAL
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TerminalPanel />
        </div>
      </div>
    </div>
  );
}
