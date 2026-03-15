import React from 'react';
import { useSessionStore } from '../../stores/session.store';
import { useAppStore } from '../../stores/app.store';
import type { SessionListItem } from '../../../../shared/types';

const STATUS_COLORS: Record<SessionListItem['status'], string> = {
  busy: '#4ade80',
  waiting: '#f59e0b',
  stale: '#6b7280',
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  opencode: { label: 'OC', color: '#06b6d4' },
  'claude-code': { label: 'CC', color: '#8b5cf6' },
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SessionCard({ session }: { session: SessionListItem }) {
  const navigateToOffice = useAppStore((s) => s.navigateToOffice);
  const statusColor = STATUS_COLORS[session.status];
  const badge = SOURCE_BADGE[session.source] ?? { label: '??', color: '#6b7280' };

  return (
    <button
      onClick={() => navigateToOffice(session.sessionId, session.title)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: 'rgba(42, 42, 74, 0.3)',
        border: '1px solid #2a2a4a',
        borderRadius: 6,
        color: '#e5e5e5',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(42, 42, 74, 0.6)';
        e.currentTarget.style.borderColor = '#4a4a6a';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(42, 42, 74, 0.3)';
        e.currentTarget.style.borderColor = '#2a2a4a';
      }}
    >
      <span style={{
        position: 'absolute',
        top: 6,
        right: 8,
        fontSize: 9,
        fontWeight: 700,
        color: badge.color,
        background: `${badge.color}18`,
        padding: '1px 5px',
        borderRadius: 3,
        letterSpacing: '0.03em',
      }}>
        {badge.label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: statusColor,
          boxShadow: session.status === 'busy' ? `0 0 6px ${statusColor}` : 'none',
        }} />
        <span style={{ fontWeight: 600, fontSize: 12 }}>{session.projectName}</span>
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 30 }}>
        {session.title}
      </div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>
        {timeAgo(session.lastUpdated)}
      </div>
    </button>
  );
}

type FilterValue = 'all' | 'opencode' | 'claude-code';
const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'opencode', label: 'OC' },
  { value: 'claude-code', label: 'CC' },
];

export function SessionPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const filter = useSessionStore((s) => s.filter);
  const setFilter = useSessionStore((s) => s.setFilter);

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.source === filter);

  const grouped = filtered.reduce<Record<string, SessionListItem[]>>((acc, s) => {
    const key = s.directory;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const handleFilterClick = (value: FilterValue) => {
    setFilter(filter === value ? 'all' : value);
  };

  return (
    <div style={{
      width: 320,
      minWidth: 320,
      borderRight: '1px solid #2a2a4a',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #2a2a4a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>Sessions</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterClick(f.value)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: filter === f.value ? '1px solid #3b82f6' : '1px solid #2a2a4a',
                background: filter === f.value ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: filter === f.value ? '#3b82f6' : '#6b7280',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, marginTop: 40 }}>
            No active sessions
          </div>
        ) : (
          Object.entries(grouped).map(([dir, items]) => (
            <div key={dir} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 2px' }}>
                {items[0].projectName}
              </div>
              {items.map((session) => (
                <SessionCard key={session.sessionId} session={session} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
