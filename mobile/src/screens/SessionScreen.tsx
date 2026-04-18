import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, Pressable, Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebViewHost } from '../webview-host/WebViewHost';
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
import { LanWsTransport } from '../transport/lan-ws.transport';
import { RelayWsTransport } from '../transport/relay-ws.transport';
import { CompositeTransport } from '../transport/composite.transport';
import type { Transport } from '../transport/transport.interface';
import { useConnectionStore } from '../state/connection.store';
import { useSessionStore } from '../types/shared';
import { loadLastKnown, saveLastKnown } from '../state/cache';
import type { MobileMessageV2 } from '../types/shared';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

interface PendingAck { resolve: (ok: boolean, error?: string) => void; timer: ReturnType<typeof setTimeout>; }

export function SessionScreen({ device, onPairingLost }: Props) {
  const status = useConnectionStore((s) => s.status);
  const transportRef = useRef<Transport | null>(null);
  const pendingAcksRef = useRef<Map<string, PendingAck>>(new Map());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadLastKnown().then((last) => {
      if (last) useSessionStore.getState().hydrateFromCache(last.snapshot);
    });

    const lan = new LanWsTransport({
      host: device.host,
      port: device.port,
      device: {
        deviceId: device.deviceId,
        deviceToken: device.deviceToken,
        identityPriv: device.identityPriv,
        desktopIdentityPub: device.desktopIdentityPub,
      },
    });

    const relay = device.remoteAllowed && device.relayToken
      ? new RelayWsTransport({
          device: {
            deviceId: device.deviceId,
            deviceToken: device.deviceToken,
            identityPriv: device.identityPriv,
            desktopIdentityPub: device.desktopIdentityPub,
            sid: device.sid,
          },
          token: device.relayToken,
        })
      : null;

    const transport = new CompositeTransport(lan, relay);
    transportRef.current = transport;

    const offStatus = transport.on('status', (s) => {
      useConnectionStore.getState().setStatus(s);
      if (s.state === 'disconnected' && (s.reason === 'unknownDevice' || s.reason === 'revoked')) {
        onPairingLost();
      }
    });

    const offMessage = transport.on('message', (m: MobileMessageV2) => {
      const store = useSessionStore.getState();
      switch (m.type) {
        case 'snapshot':
          store.setSnapshot(m.snapshot);
          void saveLastKnown(m.snapshot);
          break;
        case 'event':
          store.appendEvent(m.event);
          break;
        case 'chatFeed':
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
        case 'chatAck': {
          const pending = pendingAcksRef.current.get(m.clientMsgId);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(m.ok, m.error);
            pendingAcksRef.current.delete(m.clientMsgId);
          }
          break;
        }
      }
    });

    transport.connect();

    return () => {
      offStatus();
      offMessage();
      transport.disconnect();
      transportRef.current = null;
      for (const { timer } of pendingAcksRef.current.values()) clearTimeout(timer);
      pendingAcksRef.current.clear();
    };
  }, [device, onPairingLost]);

  const submit = async () => {
    if (!draft.trim() || sending) return;
    const transport = transportRef.current;
    if (!transport) return;
    setSending(true);
    const body = draft.trim();
    const clientMsgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(() => {
        pendingAcksRef.current.delete(clientMsgId);
        resolve({ ok: false, error: 'Timed out waiting for acknowledgment' });
      }, 5000);
      pendingAcksRef.current.set(clientMsgId, {
        resolve: (ok, error) => resolve({ ok, error }),
        timer,
      });
      transport.send({ type: 'chat', v: 2, body, clientMsgId });
    });

    if (ack.ok) {
      setDraft('');
    } else {
      Alert.alert('Send failed', ack.error ?? 'Unknown error');
    }
    setSending(false);
  };

  const canSend = status.state === 'connected' && draft.trim().length > 0 && !sending;

  return (
    <SafeAreaView style={styles.root}>
      <ConnectionBanner status={status} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.webView}>
          <WebViewHost />
        </View>
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Reply to active agent…"
            placeholderTextColor="#6b7280"
            style={styles.input}
            editable={!sending && status.state === 'connected'}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={submit}
            disabled={!canSend}
            style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
          >
            <Text style={canSend ? styles.sendBtnTextActive : styles.sendBtnTextInactive}>
              {sending ? '…' : 'Send'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  webView: { flex: 1 },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    color: '#f5f5f5',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sendBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  sendBtnActive: { backgroundColor: '#6366f1' },
  sendBtnInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  sendBtnTextActive: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sendBtnTextInactive: { color: '#6b7280', fontSize: 14 },
});
