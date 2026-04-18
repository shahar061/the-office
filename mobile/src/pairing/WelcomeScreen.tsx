import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';

interface Props {
  onStartPairing: () => void;
}

export function WelcomeScreen({ onStartPairing }: Props) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>The Office</Text>
        <Text style={styles.subtitle}>
          Watch your desktop's live agent office from your phone.
        </Text>
        <Text style={styles.body}>
          Open The Office on your desktop, go to Settings → Mobile Pairing, and tap "Generate pairing QR". Then scan the code with this app.
        </Text>
        <Pressable style={styles.button} onPress={onStartPairing}>
          <Text style={styles.buttonText}>Scan QR Code</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  subtitle: { fontSize: 18, color: '#aaa', marginBottom: spacing.xl },
  body: { fontSize: 15, color: '#999', lineHeight: 22, marginBottom: spacing.xxl },
  button: { backgroundColor: colors.accent, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center' },
  buttonText: { color: colors.text, fontSize: 17, fontWeight: '600' },
});
