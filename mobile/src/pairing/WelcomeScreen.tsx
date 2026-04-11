import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '700', color: '#f5f5f5', marginBottom: 12 },
  subtitle: { fontSize: 18, color: '#aaa', marginBottom: 24 },
  body: { fontSize: 15, color: '#999', lineHeight: 22, marginBottom: 32 },
  button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
