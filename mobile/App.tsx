import type React from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WelcomeScreen } from './src/pairing/WelcomeScreen';
import { QRScanScreen } from './src/pairing/QRScanScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { loadDevice, clearDevice, type PairedDeviceCredentials } from './src/pairing/secure-store';

type Screen =
  | { kind: 'loading' }
  | { kind: 'welcome' }
  | { kind: 'scanning' }
  | { kind: 'session'; device: PairedDeviceCredentials };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  useEffect(() => {
    loadDevice().then((device) => {
      if (device) setScreen({ kind: 'session', device });
      else setScreen({ kind: 'welcome' });
    });
  }, []);

  const startPairing = () => setScreen({ kind: 'scanning' });
  const cancelPairing = () => setScreen({ kind: 'welcome' });
  const completePairing = (device: PairedDeviceCredentials) => setScreen({ kind: 'session', device });
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
      body = <QRScanScreen onPaired={completePairing} onCancel={cancelPairing} />;
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
