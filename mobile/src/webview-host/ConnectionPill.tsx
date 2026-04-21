import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import type { TransportStatus } from '../transport/transport.interface';

interface Props { status: TransportStatus }

export function ConnectionPill({ status }: Props) {
  let dot: string;
  let label: string;

  switch (status.state) {
    case 'connected':
      if (status.mode === 'lan') { dot = colors.success; label = 'Local'; break; }
      if (status.mode === 'relay') { dot = colors.accent; label = 'Remote'; break; }
      dot = colors.info; label = 'Connected';
      break;
    case 'connecting':
      dot = colors.warning; label = 'Connecting';
      break;
    case 'disconnected':
      dot = colors.error; label = `Offline — ${status.reason}`;
      break;
    case 'error':
      dot = colors.error; label = 'Error';
      break;
    case 'idle':
      dot = colors.textDim; label = 'Idle';
      break;
  }

  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgPill,
    borderColor: 'rgba(59,130,246,0.55)',
    borderWidth: 1,
    borderRadius: radius.round,
  },
  dot: { width: 8, height: 8, borderRadius: radius.round },
  text: { color: colors.info, ...typography.caption },
});
