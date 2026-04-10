import { useProjectStore } from '../../stores/project.store';
import { colors } from '../../theme';
import { CelebrationHeader } from './CelebrationHeader';
import { SummarySection } from './SummarySection';
import { ActionHub } from './ActionHub';

const styles = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.bg,
    overflowY: 'auto' as const,
    height: '100%',
  },
} as const;

export function CompletionPanel() {
  const projectState = useProjectStore((s) => s.projectState);
  const projectName = projectState?.name ?? 'Untitled Project';

  return (
    <div style={styles.root}>
      <CelebrationHeader projectName={projectName} />
      <SummarySection />
      <ActionHub />
    </div>
  );
}
