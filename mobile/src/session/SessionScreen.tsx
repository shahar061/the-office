// mobile/src/session/SessionScreen.tsx
import { View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { PortraitLayout } from './PortraitLayout';
import { colors } from '../theme';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export function SessionScreen({ device, onPairingLost }: Props) {
  const session = useSession({ device, onPairingLost });

  // Landscape mode + orientation transitions land in Task 10 — for now
  // the shell only renders portrait chrome.
  const onExpand = () => { /* wired up in Task 10 */ };

  return (
    <View style={styles.root}>
      <WebViewHost />
      <PortraitLayout session={session} onExpand={onExpand} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
