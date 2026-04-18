import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionPill } from '../webview-host/ConnectionPill';
import { colors, spacing, radius } from '../theme';
import type { TransportStatus } from '../transport/transport.interface';

interface Props {
  status: TransportStatus;
  onOpenChat: () => void;
}

export function LandscapeLayout({ status, onOpenChat }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root} pointerEvents="box-none">
      <StatusBar hidden />
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          left: insets.left + spacing.sm,
        }}
        pointerEvents="box-none"
      >
        <ConnectionPill status={status} />
      </View>
      <Pressable
        onPress={onOpenChat}
        style={[
          styles.fab,
          {
            bottom: insets.bottom + spacing.lg,
            right: insets.right + spacing.lg,
          },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Open chat and return to portrait"
      >
        <Text style={styles.fabGlyph}>💬</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  fab: {
    position: 'absolute',
    width: 56, height: 56,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  fabGlyph: { fontSize: 24, color: '#fff' },
});
