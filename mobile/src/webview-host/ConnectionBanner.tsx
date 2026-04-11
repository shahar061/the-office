import { View, Text, StyleSheet } from 'react-native';
import type { TransportStatus } from '../transport/transport.interface';

interface Props {
  status: TransportStatus;
}

export function ConnectionBanner({ status }: Props) {
  if (status.state === 'connected') return null;

  let text: string;
  let color: string;
  switch (status.state) {
    case 'idle':
      return null;
    case 'connecting':
      text = 'Connecting…';
      color = '#f59e0b';
      break;
    case 'disconnected':
      text = `Not connected — ${status.reason}`;
      color = '#ef4444';
      break;
    case 'error':
      text = `Error — ${status.error.message}`;
      color = '#ef4444';
      break;
  }

  return (
    <View style={[styles.banner, { backgroundColor: color }]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
