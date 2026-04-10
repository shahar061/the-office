import { useEffect, useRef } from 'react';
import { colors } from '../../theme';
import { useRequestStore } from '../../stores/request.store';
import { useProjectStore } from '../../stores/project.store';
import { RequestComposer } from './RequestComposer';
import { RequestList } from './RequestList';
import { ScanMenu } from './ScanMenu';
import { GitRecoveryBanners } from './GitRecoveryBanners';
import { GitIdentityChip } from './GitIdentityChip';
import { FirstRunIdentityBanner } from './FirstRunIdentityBanner';

const styles = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    background: colors.bg,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px 12px 0',
  },
} as const;

export function WorkshopPanel() {
  const load = useRequestStore((s) => s.load);

  // Load requests on mount
  useEffect(() => {
    load();
  }, [load]);

  const scanStatus = useProjectStore((s) => s.projectState?.scanStatus);
  const scanTriggeredRef = useRef(false);

  // Auto-trigger the scan when scanStatus is 'pending'
  useEffect(() => {
    if (scanStatus === 'pending' && !scanTriggeredRef.current) {
      scanTriggeredRef.current = true;
      window.office.runOnboardingScan();
    }
    if (scanStatus !== 'pending' && scanStatus !== 'in_progress') {
      scanTriggeredRef.current = false;
    }
  }, [scanStatus]);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <ScanMenu />
      </div>
      <GitIdentityChip />
      <FirstRunIdentityBanner />
      <GitRecoveryBanners />
      <RequestComposer />
      <RequestList />
    </div>
  );
}
