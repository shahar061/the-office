// mobile/src/session/SessionScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
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

  // Apply the OS-level orientation lock whenever `mode` changes.
  useEffect(() => {
    let cancelled = false;
    lockOrientation(mode).finally(() => {
      if (cancelled) return;
      transitioningRef.current = false;
      if (mode === 'portrait' && focusPendingRef.current) {
        focusPendingRef.current = false;
        // One animation frame to let layout settle before focusing.
        requestAnimationFrame(() => composerRef.current?.focusInput());
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

  // Root uses `flexDirection: 'column'` so that in PORTRAIT the composer
  // sits below the canvas (canvas shrinks to the remaining flex:1 space).
  // In LANDSCAPE no composer is rendered, so the canvas takes the whole
  // screen and the floating pill / FAB overlay on top of it.
  //
  // Keeping the WebViewHost at the SAME position in the tree (first child
  // of the root) across both modes means React reconciles it to the same
  // component instance — no re-mount, no canvas flash on rotation.
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
