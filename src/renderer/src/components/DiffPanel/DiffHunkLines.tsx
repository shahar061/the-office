import React from 'react';
import type { DiffHunkLine } from '@shared/types';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.5',
  },
  line: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '0 8px',
    whiteSpace: 'pre' as const,
    minHeight: '16px',
  },
  lineAdd: {
    background: 'rgba(34, 197, 94, 0.12)',
    color: '#86efac',
  },
  lineRemove: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#fca5a5',
  },
  lineContext: {
    color: '#94a3b8',
  },
  lineMeta: {
    color: '#64748b',
    fontStyle: 'italic' as const,
    background: 'rgba(100, 116, 139, 0.08)',
  },
  lineNum: {
    color: '#475569',
    minWidth: '28px',
    textAlign: 'end' as const,
    userSelect: 'none' as const,
    flexShrink: 0,
  },
  prefix: {
    width: '10px',
    flexShrink: 0,
    userSelect: 'none' as const,
  },
  content: {
    flex: 1,
    overflowX: 'auto' as const,
  },
} as const;

interface DiffHunkLinesProps {
  hunks: DiffHunkLine[];
}

export function DiffHunkLines({ hunks }: DiffHunkLinesProps) {
  return (
    <div style={styles.container}>
      {hunks.map((line, idx) => {
        let lineStyle: React.CSSProperties = { ...styles.line };
        let prefix = ' ';
        switch (line.type) {
          case 'add':
            lineStyle = { ...lineStyle, ...styles.lineAdd };
            prefix = '+';
            break;
          case 'remove':
            lineStyle = { ...lineStyle, ...styles.lineRemove };
            prefix = '-';
            break;
          case 'context':
            lineStyle = { ...lineStyle, ...styles.lineContext };
            prefix = ' ';
            break;
          case 'meta':
            lineStyle = { ...lineStyle, ...styles.lineMeta };
            prefix = ' ';
            break;
        }
        const lineNum = line.newLine ?? line.oldLine ?? '';
        return (
          <div key={idx} style={lineStyle}>
            <span style={styles.lineNum}>{lineNum || ''}</span>
            <span style={styles.prefix}>{prefix}</span>
            <span style={styles.content}>{line.content}</span>
          </div>
        );
      })}
    </div>
  );
}
