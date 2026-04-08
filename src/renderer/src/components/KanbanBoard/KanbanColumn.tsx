import type { KanbanTask } from '@shared/types';
import { colors } from '../../theme';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  title: string;
  tasks: KanbanTask[];
  accentColor: string;
}

const styles = {
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: '200px',
    maxWidth: '320px',
    background: colors.bgDark,
    borderRadius: '6px',
    overflow: 'hidden',
  },
  header: (accentColor: string) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: `2px solid ${accentColor}`,
    background: `${accentColor}11`,
  }),
  title: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: colors.textMuted,
  },
  count: {
    fontSize: '10px',
    color: colors.textDim,
    background: colors.surface,
    padding: '1px 6px',
    borderRadius: '8px',
  },
  cardList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  empty: {
    fontSize: '11px',
    color: colors.textDim,
    textAlign: 'center' as const,
    padding: '16px 8px',
    fontStyle: 'italic',
  },
} as const;

export function KanbanColumn({ title, tasks, accentColor }: KanbanColumnProps) {
  return (
    <div style={styles.column}>
      <div style={styles.header(accentColor)}>
        <span style={styles.title}>{title}</span>
        <span style={styles.count}>{tasks.length}</span>
      </div>
      <div style={styles.cardList}>
        {tasks.length === 0 ? (
          <div style={styles.empty}>No tasks</div>
        ) : (
          tasks.map(task => <KanbanCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
