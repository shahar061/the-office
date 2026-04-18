import { useState } from 'react';
import { useKanbanStore } from '../../stores/kanban.store';
import { useProjectStore } from '../../stores/project.store';
import { colors } from '../../theme';
import { KanbanColumn } from './KanbanColumn';
import { BuildFailureModal } from './BuildFailureModal';
import { BuildIntro } from './BuildIntro';
import { DependencyGraph } from './DependencyGraph';
import type { BuildConfig } from '@shared/types';

const COLUMNS = [
  { status: 'queued' as const, title: 'Queued', accent: colors.accent },
  { status: 'active' as const, title: 'Active', accent: colors.warning },
  { status: 'review' as const, title: 'In Review', accent: '#a855f7' },
  { status: 'done' as const, title: 'Done', accent: colors.success },
] as const;

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: colors.bg,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  progressBar: {
    height: '4px',
    background: colors.bgDark,
    flexShrink: 0,
  },
  progressFill: (percent: number) => ({
    height: '100%',
    width: `${percent}%`,
    background: percent === 100 ? colors.success : colors.warning,
    transition: 'width 0.5s ease, background 0.3s',
    borderRadius: '0 2px 2px 0',
  }),
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.text,
  },
  headerStats: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  viewToggle: {
    display: 'flex',
    gap: '2px',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    padding: '2px',
  },
  viewToggleButton: (active: boolean) => ({
    padding: '4px 10px',
    border: 'none',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? colors.accent : 'transparent',
    color: active ? '#fff' : colors.textMuted,
    fontFamily: 'inherit',
  }),
  board: {
    flex: 1,
    display: 'flex',
    gap: '10px',
    padding: '0 16px 16px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '16px',
  },
  emptyText: {
    fontSize: '14px',
    color: colors.textDim,
  },
  startButton: {
    padding: '10px 24px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    background: colors.accent,
    color: '#fff',
    fontFamily: 'inherit',
  },
} as const;

export function KanbanBoard() {
  const kanban = useKanbanStore((s) => s.kanban);
  const failedTask = useKanbanStore((s) => s.failedTask());
  const projectState = useProjectStore((s) => s.projectState);
  const phaseInfo = useProjectStore((s) => s.currentPhase);
  const [viewMode, setViewMode] = useState<'board' | 'graph'>('board');

  const hasTasks = kanban.tasks.length > 0;
  const buildStarting = phaseInfo?.phase === 'build' && phaseInfo?.status === 'starting';
  const doneCount = kanban.tasks.filter(t => t.status === 'done').length;

  // Show intro when build is in 'starting' status (waiting for intro completion)
  if (buildStarting) {
    return (
      <div style={styles.root}>
        <BuildIntro onComplete={() => window.office.buildIntroDone()} />
      </div>
    );
  }

  // Empty state — no tasks loaded yet
  if (!hasTasks) {
    const canStart = projectState?.completedPhases.includes('warroom');
    return (
      <div style={styles.root}>
        <div style={styles.emptyState}>
          <div style={{ fontSize: '48px' }}>📋</div>
          <div style={styles.emptyText}>
            {canStart
              ? 'Ready to build. Tasks from the War Room are waiting.'
              : 'Complete the War Room phase first to generate tasks.'}
          </div>
          {canStart && (
            <button
              style={styles.startButton}
              onClick={() => {
                const config: BuildConfig = {
                  modelPreset: 'default',
                  retryLimit: 2,
                  permissionMode: 'auto-all',
                };
                window.office.startBuild(config);
              }}
            >
              Start Build
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Progress bar */}
      <div style={styles.progressBar}>
        <div style={styles.progressFill(kanban.completionPercent)} />
      </div>

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Build</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={styles.headerStats}>{doneCount} / {kanban.tasks.length} tasks</span>
          <div style={styles.viewToggle}>
            <button
              style={styles.viewToggleButton(viewMode === 'board')}
              onClick={() => setViewMode('board')}
            >
              Board
            </button>
            <button
              style={styles.viewToggleButton(viewMode === 'graph')}
              onClick={() => setViewMode('graph')}
            >
              Graph
            </button>
          </div>
        </div>
      </div>

      {/* Main content — board or graph */}
      {viewMode === 'board' ? (
        <div style={styles.board} className="hide-scrollbar">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.status}
              title={col.title}
              tasks={kanban.tasks.filter(t =>
                t.status === col.status || (t.status === 'failed' && col.status === 'active')
              )}
              accentColor={col.accent}
            />
          ))}
        </div>
      ) : (
        <DependencyGraph />
      )}

      {/* Failure modal */}
      {kanban.failed && failedTask && (
        <BuildFailureModal
          failedTask={failedTask}
          onResume={() => window.office.resumeBuild()}
          onRestart={() => {
            const config: BuildConfig = {
              modelPreset: 'default',
              retryLimit: 2,
              permissionMode: 'auto-all',
            };
            window.office.restartBuild(config);
          }}
          onBackToWarroom={() => {
            window.office.restartPhase({ targetPhase: 'warroom' });
          }}
        />
      )}
    </div>
  );
}
