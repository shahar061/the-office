import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebViewHost } from '../webview-host/WebViewHost';
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
import { LanWsTransport } from '../transport/lan-ws.transport';
import { useConnectionStore } from '../state/connection.store';
import { useSessionStore } from '../types/shared';
import { loadLastKnown, saveLastKnown } from '../state/cache';
import type { MobileMessage } from '../types/shared';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export function SessionScreen({ device, onPairingLost }: Props) {
  const status = useConnectionStore((s) => s.status);
  const transportRef = useRef<LanWsTransport | null>(null);

  useEffect(() => {
    // Hydrate from cache first so the WebView has something to render immediately.
    loadLastKnown().then((last) => {
      if (last) useSessionStore.getState().hydrateFromCache(last.snapshot);
    });

    const transport = new LanWsTransport({
      host: device.host,
      port: device.port,
      device: { deviceId: device.deviceId, deviceToken: device.deviceToken },
    });
    transportRef.current = transport;

    const offStatus = transport.on('status', (s) => {
      useConnectionStore.getState().setStatus(s);
      if (s.state === 'disconnected' && (s.reason === 'unknownDevice' || s.reason === 'revoked')) {
        onPairingLost();
      }
    });

    const offMessage = transport.on('message', (m: MobileMessage) => {
      const store = useSessionStore.getState();
      switch (m.type) {
        case 'snapshot':
          store.setSnapshot(m.snapshot);
          void saveLastKnown(m.snapshot);
          break;
        case 'event':
          store.appendEvent(m.event);
          break;
        case 'chat':
          store.appendChat(m.messages);
          {
            const snapshot = useSessionStore.getState().snapshot;
            if (snapshot) void saveLastKnown(snapshot);
          }
          break;
        case 'state':
          store.applyStatePatch(m.patch);
          {
            const snapshot = useSessionStore.getState().snapshot;
            if (snapshot) void saveLastKnown(snapshot);
          }
          break;
      }
    });

    transport.connect();

    return () => {
      offStatus();
      offMessage();
      transport.disconnect();
      transportRef.current = null;
    };
  }, [device, onPairingLost]);

  return (
    <SafeAreaView style={styles.root}>
      <ConnectionBanner status={status} />
      <View style={styles.webView}>
        <WebViewHost />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  webView: { flex: 1 },
});
