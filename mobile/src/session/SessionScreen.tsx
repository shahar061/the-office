// mobile/src/session/SessionScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { PortraitLayout, type PortraitLayoutHandle } from './PortraitLayout';
import { LandscapeLayout } from './LandscapeLayout';
import { lockOrientation, resetOrientation } from './orientation';
import { colors } from '../theme';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

type Mode = 'portrait' | 'landscape';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export function SessionScreen({ device, onPairingLost }: Props) {
  const session = useSession({ device, onPairingLost });
  const [mode, setMode] = useState<Mode>('portrait');
  const transitioningRef = useRef(false);
  const portraitRef = useRef<PortraitLayoutHandle>(null);
  const focusPendingRef = useRef(false);

  const changeMode = (next: Mode) => {
    if (transitioningRef.current || next === mode) return;
    transitioningRef.current = true;
    if (next === 'landscape') Keyboard.dismiss();
    if (next === 'portrait') focusPendingRef.current = true;
    setMode(next);
  };

  // Apply the OS-level orientation lock whenever `mode` changes.
  useEffect(() => {
    let cancelled = false;
    lockOrientation(mode).finally(() => {
      if (!cancelled) transitioningRef.current = false;
      if (mode === 'portrait' && focusPendingRef.current) {
        focusPendingRef.current = false;
        // One animation frame to let layout settle before focusing.
        requestAnimationFrame(() => portraitRef.current?.focusInput());
      }
    });
    return () => { cancelled = true; };
  }, [mode]);

  // Reset orientation when SessionScreen unmounts (e.g. pairing lost).
  useEffect(() => () => { resetOrientation().catch(() => {}); }, []);

  // Re-apply the lock when the app returns to the foreground — iOS/Android
  // can reset orientation on app-switch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') lockOrientation(mode).catch(() => {});
    });
    return () => sub.remove();
  }, [mode]);

  return (
    <View style={styles.root}>
      <WebViewHost />
      {mode === 'portrait' ? (
        <PortraitLayout
          ref={portraitRef}
          session={session}
          onExpand={() => changeMode('landscape')}
        />
      ) : (
        <LandscapeLayout
          status={session.status}
          onOpenChat={() => changeMode('portrait')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
