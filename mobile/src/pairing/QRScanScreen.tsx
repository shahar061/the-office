import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { saveDevice, type PairedDeviceCredentials } from './secure-store';
import type { PairingQRPayload, MobileMessage } from '../types/shared';

interface Props {
  onPaired: (device: PairedDeviceCredentials) => void;
  onCancel: () => void;
}

type UiState =
  | { kind: 'scanning' }
  | { kind: 'connecting' }
  | { kind: 'error'; message: string };

export function QRScanScreen({ onPaired, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<UiState>({ kind: 'scanning' });
  const handledRef = useRef(false);

  const handleScanned = useCallback((result: { data: string }) => {
    if (handledRef.current) return;
    handledRef.current = true;

    let payload: PairingQRPayload;
    try {
      payload = JSON.parse(result.data) as PairingQRPayload;
    } catch {
      setState({ kind: 'error', message: 'This QR code is not a valid pairing code.' });
      handledRef.current = false;
      return;
    }
    if (payload.v !== 1) {
      setState({ kind: 'error', message: 'This pairing code version is not supported.' });
      handledRef.current = false;
      return;
    }
    if (payload.expiresAt <= Date.now()) {
      setState({ kind: 'error', message: 'This pairing code has expired. Please generate a new one on your desktop.' });
      handledRef.current = false;
      return;
    }

    setState({ kind: 'connecting' });

    const ws = new WebSocket(`ws://${payload.host}:${payload.port}/office`);
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      setState({ kind: 'error', message: 'Could not reach the desktop. Make sure it is running and on the same WiFi.' });
      handledRef.current = false;
    }, 10_000);

    ws.onopen = () => {
      const deviceName = Device.modelName ?? 'Phone';
      ws.send(JSON.stringify({
        type: 'pair', v: 1, pairingToken: payload.pairingToken, deviceName,
      } as MobileMessage));
    };

    ws.onmessage = async (ev: { data: string }) => {
      let msg: MobileMessage;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type !== 'paired') {
        if (msg.type === 'authFailed') {
          setState({ kind: 'error', message: `Pairing rejected: ${msg.reason}` });
          try { ws.close(); } catch { /* ignore */ }
          handledRef.current = false;
        }
        return;
      }
      clearTimeout(timeout);
      try { ws.close(); } catch { /* ignore */ }

      const device: PairedDeviceCredentials = {
        deviceId: msg.deviceId,
        deviceToken: msg.deviceToken,
        desktopName: msg.desktopName,
        host: payload.host,
        port: payload.port,
      };
      await saveDevice(device);
      onPaired(device);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setState({ kind: 'error', message: 'Could not connect to the desktop.' });
      handledRef.current = false;
    };
  }, [onPaired]);

  const handlePastePayload = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        setState({ kind: 'error', message: 'Clipboard is empty.' });
        return;
      }
      // Reset the handled guard so a paste after a prior error works
      handledRef.current = false;
      handleScanned({ data: text });
    } catch (err) {
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
        {state.kind === 'scanning' && <Text style={styles.overlayText}>Point at the pairing QR</Text>}
        {state.kind === 'connecting' && (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.overlayText}>Pairing…</Text>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <Text style={[styles.overlayText, styles.errorText]}>{state.message}</Text>
            <Pressable style={styles.button} onPress={() => setState({ kind: 'scanning' })}>
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
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  body: { color: '#f5f5f5', fontSize: 16, textAlign: 'center' },
  overlay: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24,
    backgroundColor: 'rgba(10,10,10,0.6)',
    gap: 16, alignItems: 'center',
  },
  overlayText: { color: '#f5f5f5', fontSize: 16, textAlign: 'center' },
  errorText: { color: '#f87171' },
  button: { backgroundColor: '#6366f1', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#6366f1', fontSize: 15 },
  pasteBtn: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1,
    borderColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  pasteBtnText: {
    color: '#a5b4fc',
    fontSize: 14,
    fontWeight: '600',
  },
});
