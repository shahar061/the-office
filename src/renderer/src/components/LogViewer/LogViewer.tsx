import { useEffect, useRef } from 'react';
import { useLogStore, type LogEntry } from '../../stores/log.store';
import { AGENT_COLORS } from '@shared/types';
import { agentDisplayName } from '../../utils';
import { colors } from '../../theme';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.borderLight}`,
    fontSize: '9px',
    color: colors.textDim,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 10px',
    fontFamily: 'monospace',
    fontSize: '10px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderTop: `1px solid ${colors.borderLight}`,
    flexShrink: 0,
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: colors.success,
  },
  footerText: {
    fontSize: '9px',
    color: colors.textDark,
  },
} as const;

function EntryRow({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const agentColor = entry.agentRole ? AGENT_COLORS[entry.agentRole] ?? colors.textMuted : colors.accent;
  const agentName = entry.agentRole ? agentDisplayName(entry.agentRole) : 'You';

  if (entry.type === 'phase-transition') {
    return (
      <div style={{ padding: '6px 0', color: colors.textDim, fontSize: '10px', textAlign: 'center', borderTop: `1px solid ${colors.borderLight}`, borderBottom: `1px solid ${colors.borderLight}`, margin: '4px 0' }}>
        ═══ Phase: {entry.text} ═══
      </div>
    );
  }

  if (entry.type === 'user-message') {
    return (
      <div style={{ padding: '2px 0' }}>
        <div>
          <span style={{ color: colors.textDark }}>{time}</span>
          {' '}
          <span style={{ color: colors.accent, fontWeight: 600 }}>You</span>
          <span style={{ color: colors.textDim }}> → message</span>
        </div>
        {entry.text && (
          <div style={{ paddingLeft: '60px', color: colors.textDim, fontStyle: 'italic', fontSize: '9px' }}>
            &ldquo;{entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text}&rdquo;
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'agent-message') {
    return (
      <div style={{ padding: '2px 0' }}>
        <div>
          <span style={{ color: colors.textDark }}>{time}</span>
          {' '}
          <span style={{ color: agentColor, fontWeight: 600 }}>{agentName}</span>
          <span style={{ color: colors.textDim }}> → message</span>
        </div>
        {entry.text && (
          <div style={{ paddingLeft: '60px', color: colors.textDim, fontStyle: 'italic', fontSize: '9px' }}>
            &ldquo;{entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text}&rdquo;
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'tool-start' || entry.type === 'tool-done') {
    const isDone = entry.type === 'tool-done';
    return (
      <div style={{ padding: '2px 0' }}>
        <span style={{ color: colors.textDark }}>{time}</span>
        {' '}
        <span style={{ color: agentColor, fontWeight: 600 }}>{agentName}</span>
        {' '}
        <span style={{ color: isDone ? colors.success : colors.warning }}>
          {isDone ? '✓' : '⟳'}
        </span>
        {' '}
        <span style={{ color: isDone ? colors.success : colors.warning }}>
          {entry.toolName}
        </span>
        {' '}
        <span style={{ color: colors.textDim }}>
          {entry.target !== entry.toolName ? entry.target : ''}
        </span>
      </div>
    );
  }

  // agent-lifecycle
  return (
    <div style={{ padding: '2px 0' }}>
      <span style={{ color: colors.textDark }}>{time}</span>
      {' '}
      <span style={{ color: agentColor, fontWeight: 600 }}>{agentName}</span>
      <span style={{ color: colors.textDim }}> — {entry.text}</span>
    </div>
  );
}

export function LogViewer() {
  const entries = useLogStore((s) => s.entries);
  const clearUnread = useLogStore((s) => s.clearUnread);
  const listRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Clear unread on mount
  useEffect(() => {
    clearUnread();
  }, []);

  // Also clear unread whenever entries change while this component is mounted
  useEffect(() => {
    clearUnread();
  }, [entries.length]);

  // Auto-scroll when new entries arrive, if user is at bottom
  useEffect(() => {
    if (isAtBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  function handleScroll() {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    isAtBottomRef.current = scrollTop + clientHeight >= scrollHeight - 50;
  }

  const sessionDate = entries.length > 0
    ? new Date(entries[0].timestamp).toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })
    : new Date().toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });

  const sessionTime = entries.length > 0
    ? new Date(entries[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        SESSION LOG — {sessionDate}{sessionTime ? ` ${sessionTime}` : ''}
      </div>
      <div ref={listRef} style={styles.list} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <div style={{ color: colors.textDark, textAlign: 'center', padding: '24px', fontSize: '11px' }}>
            No log entries yet. Activity will appear here as agents work.
          </div>
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>
      <div style={styles.footer}>
        <div style={styles.liveDot} />
        <span style={styles.footerText}>Live — auto-scrolling</span>
        <span style={{ ...styles.footerText, marginLeft: 'auto' }}>{entries.length} entries</span>
      </div>
    </div>
  );
}
