import React, { useEffect, useRef, useState } from 'react';
import { AGENT_COLORS, type PermissionRequest } from '@shared/types';

export function PermissionPrompt() {
  const [queue, setQueue] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    const unsubscribe = window.office.onPermissionRequest((req) => {
      setQueue((prev) => [...prev, req]);
    });
    return unsubscribe;
  }, []);

  const current = queue[0] ?? null;
  const pendingCount = queue.length - 1;

  const handleRespond = async (approved: boolean) => {
    if (!current) return;
    await window.office.respondPermission(current.requestId, approved);
    setQueue((prev) => prev.slice(1));
  };

  if (!current) return null;

  const roleColor = AGENT_COLORS[current.agentRole] ?? '#9ca3af';
  const inputJson = JSON.stringify(current.input, null, 2);
  const truncatedInput =
    inputJson.length > 200 ? inputJson.slice(0, 200) + '…' : inputJson;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 16,
        width: 360,
        zIndex: 1000,
        background: '#0f0f1a',
        border: `1.5px solid #f59e0b`,
        borderRadius: 8,
        padding: '14px 16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        color: '#e5e5e5',
        fontFamily: 'inherit',
      }}
    >
      {/* Header: role badge + tool name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          style={{
            background: roleColor,
            color: '#000',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          {current.agentRole}
        </span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>wants to run</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#f59e0b',
            fontFamily: 'monospace',
          }}
        >
          {current.toolName}
        </span>
      </div>

      {/* Truncated input JSON */}
      <pre
        style={{
          margin: '0 0 12px',
          padding: '8px 10px',
          background: '#1a1a2e',
          borderRadius: 5,
          fontSize: 11,
          color: '#a5b4fc',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 120,
          overflowY: 'auto',
          lineHeight: 1.5,
        }}
      >
        {truncatedInput}
      </pre>

      {/* Allow / Deny buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleRespond(true)}
          style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: 5,
            border: 'none',
            background: '#16a34a',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Allow
        </button>
        <button
          onClick={() => handleRespond(false)}
          style={{
            flex: 1,
            padding: '7px 0',
            borderRadius: 5,
            border: 'none',
            background: '#dc2626',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Deny
        </button>
      </div>

      {/* Pending count badge */}
      {pendingCount > 0 && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: '#6b7280',
            textAlign: 'right',
          }}
        >
          +{pendingCount} more pending
        </div>
      )}
    </div>
  );
}
