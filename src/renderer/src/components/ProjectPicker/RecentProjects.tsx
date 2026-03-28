import React, { useState } from 'react';
import { formatAge, shortPath } from '../../utils';
import { colors } from '../../theme';
import type { ProjectInfo } from '@shared/types';

// ── Styles ──

const S = {
  recentList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxHeight: 200,
    overflowY: 'auto' as const,
    scrollbarWidth: 'none' as const,
  },
  recentItem: (disabled: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.borderLight,
    background: 'rgba(255,255,255,0.02)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'background 0.12s, border-color 0.12s',
  }),
  recentItemHover: {
    background: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  recentName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#e5e5e5',
  },
  recentPath: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 340,
  },
  recentTime: {
    fontSize: 11,
    color: colors.textDark,
    flexShrink: 0,
    marginLeft: 8,
  },
  emptyState: {
    fontSize: 12,
    color: colors.textDark,
    textAlign: 'center' as const,
    padding: '12px 0',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.1)',
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
    flexShrink: 0,
  },
};

function Spinner() {
  return <span style={S.spinner} />;
}

// ── Component ──

export interface RecentProjectsProps {
  projects: ProjectInfo[];
  loading: boolean;
  disabled: boolean;
  onOpen: (path: string) => void;
  openingPath: string | null;
}

export function RecentProjects({ projects, loading, disabled, onOpen, openingPath }: RecentProjectsProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ ...S.emptyState, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Spinner /> Loading recent projects...
      </div>
    );
  }

  if (projects.length === 0) {
    return <div style={S.emptyState}>No recent projects</div>;
  }

  return (
    <div style={S.recentList}>
      {projects.map((p) => {
        const isOpening = openingPath === p.path;
        const isDisabled = disabled || openingPath !== null;
        return (
          <div
            key={p.path}
            style={{
              ...S.recentItem(isDisabled),
              ...(hoveredPath === p.path && !isDisabled ? S.recentItemHover : {}),
            }}
            onClick={() => !isDisabled && onOpen(p.path)}
            onMouseEnter={() => setHoveredPath(p.path)}
            onMouseLeave={() => setHoveredPath(null)}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={S.recentName}>{p.name}</div>
                {p.lastPhase && (
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.15)',
                    color: colors.accent,
                    fontWeight: 500,
                  }}>
                    {p.lastPhase}
                  </span>
                )}
              </div>
              <div style={S.recentPath}>{shortPath(p.path)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {isOpening && <Spinner />}
              <div style={S.recentTime}>{formatAge(p.lastOpened)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
