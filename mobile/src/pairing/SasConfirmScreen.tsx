import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  sas: string;                 // "428 193"
  onMatch: () => void;
  onCancel: () => void;
}

export function SasConfirmScreen({ sas, onMatch, onCancel }: Props) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>Check the code matches</Text>
        <Text style={styles.body}>Look at the code on your computer screen. It should match this one exactly.</Text>
        <Text style={styles.sas}>{sas}</Text>
        <Text style={styles.warn}>⚠ If the codes differ, someone may be trying to intercept your connection. Cancel and try pairing again.</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={onMatch}><Text style={styles.primaryText}>Codes match</Text></Pressable>
        <Pressable style={styles.secondary} onPress={onCancel}><Text style={styles.secondaryText}>Don't match — Cancel</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0e', padding: 24 },
  content: { flex: 1, justifyContent: 'center', gap: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '600' },
  body: { color: '#9ca3af', fontSize: 14, lineHeight: 20 },
  sas: { color: '#fff', fontFamily: 'Menlo', fontSize: 40, fontWeight: '700', letterSpacing: 4, textAlign: 'center', backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)', borderWidth: 1, borderRadius: 12, paddingVertical: 20 },
  warn: { color: '#fdba74', fontSize: 12, lineHeight: 18 },
  actions: { gap: 10 },
  primary: { backgroundColor: '#6366f1', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondary: { borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  secondaryText: { color: '#e5e7eb', fontSize: 15, fontWeight: '600' },
});
