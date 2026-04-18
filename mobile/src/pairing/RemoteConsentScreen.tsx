import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';

interface Props {
  onDecide: (remoteAllowed: boolean) => void;
}

export function RemoteConsentScreen({ onDecide }: Props) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Allow remote access?</Text>
        <Text style={styles.body}>When you're on the same Wi-Fi as your computer, this phone connects directly over your local network.</Text>
        <Text style={styles.body}>Turn on remote access to also stay connected when you're away — for example from a cafe or on cellular.</Text>
        <View style={styles.note}>
          <Text style={styles.noteText}>Your messages are encrypted end-to-end. They pass through our relay, but we can't read them.</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => onDecide(true)}>
          <Text style={styles.primaryText}>Allow remote</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => onDecide(false)}>
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  content: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '600' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  note: { backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.2)', borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  noteText: { color: '#c4b5fd', fontSize: 12, lineHeight: 18 },
  actions: { gap: 10 },
  primary: { backgroundColor: colors.accent, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center' },
  primaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  secondary: { borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center' },
  secondaryText: { color: '#e5e7eb', fontSize: 15, fontWeight: '600' },
});
