import React from 'react';
import type { DiffFile as DiffFileType } from '@shared/types';
import { useDiffReviewStore } from '../../stores/diff-review.store';
import { DiffHunkLines } from './DiffHunkLines';
import { colors } from '../../theme';

const styles = {
  root: {
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '6px',
    marginBottom: '8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: colors.bgDark,
    borderBottom: `1px solid ${colors.borderLight}`,
    fontSize: '11px',
  },
  statusIcon: {
    fontSize: '10px',
    fontWeight: 700 as const,
    padding: '1px 5px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
  },
  statusAdded: { background: 'rgba(34,197,94,0.2)', color: '#86efac' },
  statusRemoved: { background: 'rgba(239,68,68,0.2)', color: '#fca5a5' },
  statusModified: { background: 'rgba(59,130,246,0.2)', color: '#93c5fd' },
  statusRenamed: { background: 'rgba(168,85,247,0.2)', color: '#d8b4fe' },
  statusBinary: { background: 'rgba(100,116,139,0.2)', color: '#cbd5e1' },
  path: {
    flex: 1,
    fontFamily: 'monospace',
    color: colors.text,
    wordBreak: 'break-all' as const,
  },
  stats: {
    fontSize: '10px',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap' as const,
  },
  insertions: { color: '#86efac' },
  deletions: { color: '#fca5a5' },
  body: {
    background: 'rgba(15,15,26,0.4)',
    overflow: 'auto',
  },
  placeholder: {
    padding: '12px',
    fontSize: '11px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },
  expandBtn: {
    background: 'transparent',
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '4px',
    color: colors.textMuted,
    fontSize: '10px',
    padding: '3px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginLeft: '8px',
  },
} as const;

function statusStyle(status: DiffFileType['status']): React.CSSProperties {
  const styleMap: Record<DiffFileType['status'], React.CSSProperties> = {
    'added': styles.statusAdded,
    'removed': styles.statusRemoved,
    'modified': styles.statusModified,
    'renamed': styles.statusRenamed,
    'binary': styles.statusBinary,
  };
  return styleMap[status];
}

function statusLabel(status: DiffFileType['status']): string {
  const labelMap: Record<DiffFileType['status'], string> = {
    'added': 'new',
    'removed': 'del',
    'modified': 'mod',
    'renamed': 'ren',
    'binary': 'bin',
  };
  return labelMap[status];
}

interface DiffFileProps {
  file: DiffFileType;
}

export function DiffFile({ file }: DiffFileProps) {
  const expanded = useDiffReviewStore((s) => s.expandedFiles.has(file.path));
  const toggleExpand = useDiffReviewStore((s) => s.toggleExpandFile);

  const showExpandButton = file.truncated && !expanded;
  const showHunks = file.status !== 'binary' && (!file.truncated || expanded);
  const totalChanges = file.insertions + file.deletions;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={{ ...styles.statusIcon, ...statusStyle(file.status) }}>
          {statusLabel(file.status)}
        </span>
        <span style={styles.path}>
          {file.oldPath && file.status === 'renamed' ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        {file.status !== 'binary' && (
          <span style={styles.stats}>
            <span style={styles.insertions}>+{file.insertions}</span>
            {' '}
            <span style={styles.deletions}>−{file.deletions}</span>
          </span>
        )}
        {showExpandButton && (
          <button style={styles.expandBtn} onClick={() => toggleExpand(file.path)}>
            Show anyway
          </button>
        )}
      </div>
      <div style={styles.body}>
        {file.status === 'binary' && (
          <div style={styles.placeholder}>Binary file — not shown</div>
        )}
        {file.truncated && !expanded && (
          <div style={styles.placeholder}>
            {totalChanges} lines changed — diff hidden by default. Click "Show anyway" to view.
          </div>
        )}
        {showHunks && file.hunks.length > 0 && <DiffHunkLines hunks={file.hunks} />}
        {showHunks && file.hunks.length === 0 && file.status !== 'binary' && (
          <div style={styles.placeholder}>No diff content (empty file change)</div>
        )}
      </div>
    </div>
  );
}
