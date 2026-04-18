import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import type { PairingQRPayloadV2, PairingQRPayloadV3 } from '@shared/types';
import { colors, spacing, radius } from '../theme';

type ScannedPayload = PairingQRPayloadV2 | PairingQRPayloadV3;

interface Props {
  onScanned: (payload: ScannedPayload) => void;
  onCancel: () => void;
}

type UiState =
  | { kind: 'scanning' }
  | { kind: 'error'; message: string };

export function QRScanScreen({ onScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<UiState>({ kind: 'scanning' });
  const handledRef = useRef(false);

  const parsePayload = useCallback((raw: string):
      | { ok: true; payload: ScannedPayload }
      | { ok: false; message: string } => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return { ok: false, message: 'This QR code is not a valid pairing code.' }; }
    const p = parsed as { v?: number; [k: string]: any };

    if (p.v === 2) {
      if (!p.host || !p.port || !p.desktopIdentityPub || !p.pairingToken || !p.expiresAt) {
        return { ok: false, message: 'Pairing code is missing required fields.' };
      }
      if (p.expiresAt <= Date.now()) return { ok: false, message: 'This pairing code has expired. Please generate a new one on your desktop.' };
      return { ok: true, payload: p as PairingQRPayloadV2 };
    }

    if (p.v === 3) {
      if (p.mode !== 'relay' && p.mode !== 'lan-direct') {
        return { ok: false, message: 'This pairing code uses an unknown mode.' };
      }
      if (!p.roomId || !p.desktopIdentityPub || !p.pairingToken || !p.expiresAt) {
        return { ok: false, message: 'Pairing code is missing required fields.' };
      }
      if (p.mode === 'lan-direct' && (!p.host || !p.port)) {
        return { ok: false, message: 'LAN pairing code is missing host/port.' };
      }
      if (p.expiresAt <= Date.now()) return { ok: false, message: 'This pairing code has expired. Please generate a new one on your desktop.' };
      return { ok: true, payload: p as PairingQRPayloadV3 };
    }

    return { ok: false, message: 'This pairing code is not supported. Update your mobile app.' };
  }, []);

  const handleScanned = useCallback((result: { data: string }) => {
    if (handledRef.current) return;
    handledRef.current = true;
    const parsed = parsePayload(result.data);
    if (!parsed.ok) {
      setState({ kind: 'error', message: parsed.message });
      handledRef.current = false;
      return;
    }
    onScanned(parsed.payload);
  }, [onScanned, parsePayload]);

  const handlePastePayload = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        setState({ kind: 'error', message: 'Clipboard is empty.' });
        return;
      }
      handledRef.current = false;
      handleScanned({ data: text });
    } catch {
      setState({ kind: 'error', message: 'Could not read clipboard.' });
    }
  }, [handleScanned]);

  if (!permission) {
    return <SafeAreaView style={styles.root}><ActivityIndicator /></SafeAreaView>;
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.content}>
          <Text style={styles.body}>Camera access is required to scan the pairing QR code.</Text>
          <Pressable style={styles.button} onPress={() => requestPermission()}>
            <Text style={styles.buttonText}>Grant camera permission</Text>
          </Pressable>
          <Pressable onPress={onCancel}><Text style={styles.link}>Cancel</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={state.kind === 'scanning' ? handleScanned : undefined}
      />
      <View style={styles.overlay}>
        {state.kind === 'scanning' && (
          <>
            <Text style={styles.overlayText}>Scan the QR on your computer</Text>
            <Text style={[styles.overlayText, styles.overlayHint]}>
              You'll check a 6-digit code matches on both screens.
            </Text>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <Text style={[styles.overlayText, styles.errorText]}>{state.message}</Text>
            <Pressable style={styles.button} onPress={() => { handledRef.current = false; setState({ kind: 'scanning' }); }}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.pasteBtn} onPress={handlePastePayload}>
          <Text style={styles.pasteBtnText}>Paste payload from clipboard</Text>
        </Pressable>
        <Pressable onPress={onCancel}><Text style={styles.link}>Cancel</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  body: { color: colors.text, fontSize: 16, textAlign: 'center' },
  overlay: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl,
    backgroundColor: 'rgba(10,10,10,0.6)',
    gap: spacing.lg, alignItems: 'center',
  },
  overlayText: { color: colors.text, fontSize: 16, textAlign: 'center' },
  overlayHint: { fontSize: 13, opacity: 0.75 },
  errorText: { color: colors.error },
  button: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 24, borderRadius: radius.lg },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 15 },
  pasteBtn: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
  },
  pasteBtnText: { color: '#a5b4fc', fontSize: 14, fontWeight: '600' },
});
