import { useEffect } from 'react';
import { colors } from '../../theme';
import { useRequestStore } from '../../stores/request.store';
import { RequestComposer } from './RequestComposer';
import { RequestList } from './RequestList';

const styles = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.bg,
    height: '100%',
    overflow: 'hidden',
  },
} as const;

export function WorkshopPanel() {
  const load = useRequestStore((s) => s.load);

  // Load requests on mount
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={styles.root}>
      <RequestComposer />
      <RequestList />
    </div>
  );
}
