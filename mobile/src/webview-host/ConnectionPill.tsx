import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import type { TransportStatus } from '../transport/transport.interface';

interface Props { status: TransportStatus }

export function ConnectionPill({ status }: Props) {
  if (status.state === 'connected') return null;

  let dot = colors.warning;
  let label = 'Connecting';
  if (status.state === 'disconnected') { dot = colors.error; label = `Offline — ${status.reason}`; }
  else if (status.state === 'error') { dot = colors.error; label = 'Error'; }
  else if (status.state === 'idle') { dot = colors.textDim; label = 'Idle'; }

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
