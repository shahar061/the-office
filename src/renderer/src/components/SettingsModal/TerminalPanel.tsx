import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settings.store';

export function TerminalPanel() {
  const terminals = useSettingsStore((s) => s.terminals);
  const defaultTerminalId = useSettingsStore((s) => s.defaultTerminalId);
  const removeTerminal = useSettingsStore((s) => s.removeTerminal);
  const setDefault = useSettingsStore((s) => s.setDefault);
  const detectTerminals = useSettingsStore((s) => s.detectTerminals);
  const browseAndAdd = useSettingsStore((s) => s.browseAndAdd);

  const [detectLabel, setDetectLabel] = useState('+ DETECT TERMINALS');

  const handleDetect = async () => {
    const found = await detectTerminals();
    if (found.length === 0) {
      setDetectLabel('None found');
      setTimeout(() => setDetectLabel('+ DETECT TERMINALS'), 1500);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 8,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(42, 42, 74, 0.3)',
    border: '1px solid #2a2a4a',
    borderRadius: 2,
    marginBottom: 6,
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Default Terminal highlight */}
      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>Default Terminal</div>
        {(() => {
          const def = terminals.find(t => t.id === defaultTerminalId);
          if (!def) return null;
          return (
            <div style={{
              ...rowStyle,
              border: '1px solid rgba(74, 222, 128, 0.3)',
              background: 'rgba(74, 222, 128, 0.05)',
              marginBottom: 0,
            }}>
              <span style={{ fontSize: 14 }}>🖥</span>
              <span style={{ fontSize: 12, color: '#e5e5e5', flex: 1 }}>{def.name}</span>
              <span style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#4ade80',
              }}>● DEFAULT</span>
            </div>
          );
        })()}
      </div>

      {/* Terminal list */}
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Available Terminals</div>
        {terminals.map((t) => (
          <div key={t.id} style={rowStyle}>
            <span style={{ fontSize: 14 }}>🖥</span>
            <span style={{ fontSize: 12, color: '#e5e5e5', flex: 1 }}>{t.name}</span>
            {t.id === defaultTerminalId ? (
              <span style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#4ade80',
                background: 'rgba(74, 222, 128, 0.1)',
                padding: '2px 6px',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 2,
              }}>DEFAULT</span>
            ) : (
              <button
                onClick={() => setDefault(t.id)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  border: '1px solid #2a2a4a',
                  borderRadius: 2,
                  background: 'none',
                }}
              >
                SET DEFAULT
              </button>
            )}
            {!t.isBuiltIn && (
              <button
                onClick={() => removeTerminal(t.id)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#6b7280',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleDetect}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'rgba(59, 130, 246, 0.12)',
            border: '2px solid #3b82f6',
            borderRadius: 2,
            color: '#3b82f6',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          [ {detectLabel} ]
        </button>
        <button
          onClick={browseAndAdd}
          style={{
            padding: '8px 12px',
            background: 'rgba(42, 42, 74, 0.3)',
            border: '2px solid #2a2a4a',
            borderRadius: 2,
            color: '#9ca3af',
            fontFamily: 'monospace',
            fontSize: 11,
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          [ BROWSE... ]
        </button>
      </div>
    </div>
  );
}
