// mobile/src/session/SessionScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { IdleScreen } from './IdleScreen';
import { PortraitOverlays, PortraitComposer, type PortraitComposerHandle } from './PortraitLayout';
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
  const composerRef = useRef<PortraitComposerHandle>(null);
  const focusPendingRef = useRef(false);

  const changeMode = (next: Mode) => {
    if (transitioningRef.current || next === mode) return;
    transitioningRef.current = true;
    if (next === 'landscape') Keyboard.dismiss();
    if (next === 'portrait') focusPendingRef.current = true;
    setMode(next);
  };

  useEffect(() => {
    let cancelled = false;
    lockOrientation(mode).finally(() => {
      if (cancelled) return;
      transitioningRef.current = false;
      if (mode === 'portrait' && focusPendingRef.current) {
        focusPendingRef.current = false;
        requestAnimationFrame(() => composerRef.current?.focusInput());
      }
    });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => () => { resetOrientation().catch(() => {}); }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') lockOrientation(mode).catch(() => {});
    });
    return () => sub.remove();
  }, [mode]);

  // Lobby / idle: the bridge told us the desktop is not in a session. Unmount
  // the entire WebView + overlay tree so the next `sessionActive=true` hydrates
  // from scratch. Transport stays connected (useSession is still mounted)
  // so we receive the next snapshot without reconnecting.
  if (!session.sessionActive) {
    return (
      <IdleScreen
        desktopName={device.desktopName}
        status={session.status}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.canvasArea}>
        <WebViewHost onPhoneAnswer={session.sendChat} />
        {mode === 'portrait'
          ? <PortraitOverlays status={session.status} onExpand={() => changeMode('landscape')} />
          : <LandscapeLayout status={session.status} onOpenChat={() => changeMode('portrait')} />}
      </View>
      {mode === 'portrait' && <PortraitComposer ref={composerRef} session={session} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, flexDirection: 'column' },
  // flex:1 so the canvas area takes all remaining vertical space after the
  // composer (portrait) or all of it (landscape).
  canvasArea: { flex: 1, position: 'relative' },
});
