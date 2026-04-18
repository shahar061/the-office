import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import { x25519 } from '@noble/curves/ed25519';

import { WelcomeScreen } from './src/pairing/WelcomeScreen';
import { QRScanScreen } from './src/pairing/QRScanScreen';
import { SasConfirmScreen } from './src/pairing/SasConfirmScreen';
import { RemoteConsentScreen } from './src/pairing/RemoteConsentScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { loadDevice, saveDevice, clearDevice, type PairedDeviceCredentials } from './src/pairing/secure-store';

import { deriveSessionKeys } from '@shared/crypto/noise';
import { deriveSas } from '@shared/crypto/sas';
import { RecvStream } from '@shared/crypto/secretstream';
import { decodeV2 } from '@shared/protocol/mobile';
import type { PairingQRPayloadV2, PairingQRPayloadV3 } from '@shared/types';
import { RELAY_URL } from '@shared/types';

type Screen =
  | { kind: 'loading' }
  | { kind: 'welcome' }
  | { kind: 'scanning' }
  | { kind: 'sas'; sas: string }
  | { kind: 'remoteConsent' }
  | { kind: 'pairing' }   // transient after remote consent, awaiting paired
  | { kind: 'session'; device: PairedDeviceCredentials };

function b64encode(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return globalThis.btoa ? globalThis.btoa(s) : Buffer.from(u).toString('base64');
}

interface PairingInFlight {
  ws: WebSocket;
  phonePriv: Uint8Array;
  phonePub: Uint8Array;
  desktopPub: Uint8Array;
  sendKey: Uint8Array;
  recvKey: Uint8Array;
  recv: RecvStream;
  payload: PairingQRPayloadV2;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const pairingRef = useRef<PairingInFlight | null>(null);

  useEffect(() => {
    loadDevice().then((device) => {
      if (device) setScreen({ kind: 'session', device });
      else setScreen({ kind: 'welcome' });
    });
  }, []);

  const resetPairing = () => {
    const p = pairingRef.current;
    if (p) { try { p.ws.close(); } catch { /* ignore */ } }
    pairingRef.current = null;
  };

  const startPairing = () => setScreen({ kind: 'scanning' });

  const cancelToWelcome = () => {
    resetPairing();
    setScreen({ kind: 'welcome' });
  };

  const handleScanned = (payload: PairingQRPayloadV2 | PairingQRPayloadV3) => {
    if (payload.v === 2) return handleLanScanned(payload);
    // v3
    if (payload.mode === 'lan-direct' && payload.host && payload.port) {
      // User configured LAN direct — use LAN path with v3 host/port
      return handleLanScanned({
        v: 2,
        host: payload.host,
        port: payload.port,
        desktopIdentityPub: payload.desktopIdentityPub,
        pairingToken: payload.pairingToken,
        expiresAt: payload.expiresAt,
      });
    }
    // relay mode
    return handleRelayScanned(payload);
  };

  const handleLanScanned = (payload: PairingQRPayloadV2) => {
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const desktopPub = new Uint8Array(Buffer.from(payload.desktopIdentityPub, 'base64'));
    const { sendKey, recvKey } = deriveSessionKeys(phonePriv, desktopPub, 'initiator');
    const recv = new RecvStream(recvKey);
    const sas = deriveSas(desktopPub, phonePub, payload.pairingToken);

    const ws = new WebSocket(`ws://${payload.host}:${payload.port}/office`);
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      Alert.alert('Could not reach desktop', 'Make sure it is running and on the same Wi-Fi.');
      cancelToWelcome();
    }, 10_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      const deviceName = Device.modelName ?? 'Phone';
      ws.send(JSON.stringify({
        type: 'pair', v: 2,
        pairingToken: payload.pairingToken,
        devicePub: b64encode(phonePub),
        deviceName,
      }));
      // Transition to SAS screen
      setScreen({ kind: 'sas', sas });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      Alert.alert('Connection error', 'Could not connect to the desktop.');
      cancelToWelcome();
    };

    // Binary frames = encrypted (only `paired` is encrypted pre-session)
    ws.onmessage = async (ev: { data: unknown }) => {
      const p = pairingRef.current;
      if (!p) return;
      try {
        let plainJson: string | null = null;
        if (typeof ev.data === 'string') {
          // Plain text = authFailed
          plainJson = ev.data;
        } else {
          // Binary = encrypted, decrypt
          const ab = ev.data as ArrayBuffer | Uint8Array | { _data?: any };
          let bytes: Uint8Array;
          if (ab instanceof ArrayBuffer) bytes = new Uint8Array(ab);
          else if (ab instanceof Uint8Array) bytes = ab;
          else if (typeof (ab as any).arrayBuffer === 'function') {
            bytes = new Uint8Array(await (ab as Blob).arrayBuffer());
          } else {
            return;
          }
          const plain = p.recv.decrypt(bytes);
          plainJson = new TextDecoder().decode(plain);
        }
        const msg = decodeV2(plainJson);
        if (!msg) return;
        if (msg.type === 'authFailed') {
          Alert.alert('Pairing rejected', msg.reason);
          cancelToWelcome();
          return;
        }
        if (msg.type === 'paired') {
          const credentials: PairedDeviceCredentials = {
            deviceId: msg.deviceId,
            deviceToken: msg.deviceToken,
            desktopName: msg.desktopName,
            host: p.payload.host,
            port: p.payload.port,
            identityPriv: b64encode(p.phonePriv),
            identityPub: b64encode(p.phonePub),
            desktopIdentityPub: p.payload.desktopIdentityPub,
            sid: msg.sid,
            remoteAllowed: (p as any).remoteAllowed ?? true,
          };
          await saveDevice(credentials);
          try { p.ws.close(); } catch { /* ignore */ }
          pairingRef.current = null;
          setScreen({ kind: 'session', device: credentials });
        }
      } catch (err) {
        console.warn('[pairing] message handler error', err);
        cancelToWelcome();
      }
    };

    pairingRef.current = {
      ws, phonePriv, phonePub, desktopPub,
      sendKey, recvKey, recv, payload,
    };
  };

  const handleRelayScanned = (payload: PairingQRPayloadV3) => {
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const desktopPub = new Uint8Array(Buffer.from(payload.desktopIdentityPub, 'base64'));
    const { sendKey, recvKey } = deriveSessionKeys(phonePriv, desktopPub, 'initiator');
    const recv = new RecvStream(recvKey);
    const sas = deriveSas(desktopPub, phonePub, payload.pairingToken);

    const url = `${RELAY_URL}/pair/${encodeURIComponent(payload.roomId)}?role=guest&token=${encodeURIComponent(payload.pairingToken)}`;
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      Alert.alert('Could not reach the relay', 'Check your internet connection.');
      cancelToWelcome();
    }, 10_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      const deviceName = Device.modelName ?? 'Phone';
      ws.send(JSON.stringify({
        type: 'pair', v: 2,
        pairingToken: payload.pairingToken,
        devicePub: b64encode(phonePub),
        deviceName,
      }));
      setScreen({ kind: 'sas', sas });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      Alert.alert('Relay connection error', 'Could not connect to the pairing relay.');
      cancelToWelcome();
    };

    ws.onmessage = async (ev: { data: unknown }) => {
      const p = pairingRef.current;
      if (!p) return;
      try {
        // All rendezvous frames are text. Encrypted `paired` is wrapped as {ct: "<b64>"}.
        if (typeof ev.data !== 'string') return;
        let plainJson: string;
        let parsed: any;
        try { parsed = JSON.parse(ev.data); } catch { return; }
        if (parsed && typeof parsed.ct === 'string' && parsed.type === undefined) {
          // Encrypted envelope
          const ct = new Uint8Array(Buffer.from(parsed.ct, 'base64'));
          const plain = p.recv.decrypt(ct);
          plainJson = new TextDecoder().decode(plain);
        } else {
          // Plain MobileMessageV2
          plainJson = ev.data;
        }
        const msg = decodeV2(plainJson);
        if (!msg) return;
        if (msg.type === 'authFailed') {
          Alert.alert('Pairing rejected', msg.reason);
          cancelToWelcome();
          return;
        }
        if (msg.type === 'paired') {
          const credentials: PairedDeviceCredentials = {
            deviceId: msg.deviceId,
            deviceToken: msg.deviceToken,
            desktopName: msg.desktopName,
            host: payload.host ?? '',     // v3 may have no host — store empty (SessionScreen gates LAN on host)
            port: payload.port ?? 0,
            identityPriv: b64encode(phonePriv),
            identityPub: b64encode(phonePub),
            desktopIdentityPub: payload.desktopIdentityPub,
            sid: msg.sid,
            remoteAllowed: (pairingRef.current as any).remoteAllowed ?? true,
          };
          await saveDevice(credentials);
          try { ws.close(); } catch { /* ignore */ }
          pairingRef.current = null;
          setScreen({ kind: 'session', device: credentials });
        }
      } catch (err) {
        console.warn('[relay-pairing] message handler error', err);
        cancelToWelcome();
      }
    };

    // Stash in pairingRef so SAS / consent handlers can reuse ws. Synthesize a
    // v2-shaped payload; handleSasMatch/handleRemoteConsent only use ws via the ref.
    pairingRef.current = {
      ws, phonePriv, phonePub, desktopPub,
      sendKey, recvKey, recv,
      payload: {
        v: 2,
        host: payload.host ?? '',
        port: payload.port ?? 0,
        desktopIdentityPub: payload.desktopIdentityPub,
        pairingToken: payload.pairingToken,
        expiresAt: payload.expiresAt,
      },
    };
  };

  const handleSasMatch = () => {
    const p = pairingRef.current;
    if (!p) return cancelToWelcome();
    p.ws.send(JSON.stringify({ type: 'pairConfirm', v: 2 }));
    setScreen({ kind: 'remoteConsent' });
  };

  const handleRemoteConsent = (remoteAllowed: boolean) => {
    const p = pairingRef.current;
    if (!p) return cancelToWelcome();
    p.ws.send(JSON.stringify({ type: 'pairRemoteConsent', v: 2, remoteAllowed }));
    // Stash the user's choice on pairingRef so we can persist it when `paired` arrives.
    (p as any).remoteAllowed = remoteAllowed;
    setScreen({ kind: 'pairing' });
  };

  const pairingLost = async () => {
    await clearDevice();
    setScreen({ kind: 'welcome' });
  };

  let body: React.JSX.Element;
  switch (screen.kind) {
    case 'loading':
      body = (
        <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      );
      break;
    case 'welcome':
      body = <WelcomeScreen onStartPairing={startPairing} />;
      break;
    case 'scanning':
      body = <QRScanScreen onScanned={handleScanned} onCancel={cancelToWelcome} />;
      break;
    case 'sas':
      body = <SasConfirmScreen sas={screen.sas} onMatch={handleSasMatch} onCancel={cancelToWelcome} />;
      break;
    case 'remoteConsent':
      body = <RemoteConsentScreen onDecide={handleRemoteConsent} />;
      break;
    case 'pairing':
      body = (
        <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#6366f1" />
        </View>
      );
      break;
    case 'session':
      body = <SessionScreen device={screen.device} onPairingLost={pairingLost} />;
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {body}
    </SafeAreaProvider>
  );
}
