import { SettingsButton } from './SettingsButton';
import { LanguageDropdown } from './LanguageDropdown';
import { StatusSlot } from './StatusSlot';

const styles = {
  cluster: {
    position: 'fixed' as const,
    top: 10,
    insetInlineEnd: 14,
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    pointerEvents: 'auto' as const,
  },
} as const;

export function AppChromeCluster() {
  return (
    <div style={styles.cluster}>
      <SettingsButton />
      <LanguageDropdown />
      <StatusSlot />
    </div>
  );
}
