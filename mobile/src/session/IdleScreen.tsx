import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TransportStatus } from '../transport/transport.interface';
import { colors, spacing, radius } from '../theme';

interface Props {
  desktopName: string;
  /** Current transport state — used to distinguish "desktop idle" from "desktop offline". */
  status: TransportStatus;
}

export function IdleScreen({ desktopName, status }: Props) {
  const offline = status.state !== 'connected';
  const body = offline
    ? `${desktopName} is offline.`
    : `Open a project on ${desktopName} to continue.`;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Waiting for {desktopName}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓ Trusted device</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.lg, textAlign: 'center' },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(99,102,241,0.15)',
    marginBottom: spacing.xl,
  },
  badgeText: { color: '#a5b4fc', fontSize: 13, fontWeight: '600' },
  body: { fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
});
