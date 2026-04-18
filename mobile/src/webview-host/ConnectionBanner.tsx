// mobile/src/webview-host/ConnectionBanner.tsx
import { View, Text, StyleSheet } from 'react-native';
import type { TransportStatus } from '../transport/transport.interface';
import { colors, spacing, typography } from '../theme';

interface Props { status: TransportStatus }

export function ConnectionBanner({ status }: Props) {
  if (status.state === 'connected') return null;

  let text: string;
  let color: string;
  switch (status.state) {
    case 'idle': return null;
    case 'connecting': text = 'Connecting…'; color = colors.warning; break;
    case 'disconnected': text = `Not connected — ${status.reason}`; color = colors.error; break;
    case 'error': text = `Error — ${status.error.message}`; color = colors.error; break;
  }

  return (
    <View style={[styles.banner, { backgroundColor: color }]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  text: { color: '#fff', ...typography.label },
});
