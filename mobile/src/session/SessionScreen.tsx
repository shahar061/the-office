// mobile/src/session/SessionScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, ToastAndroid, View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { useSessionStore } from '../types/shared';
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
  const [activeTab, setActiveTab] = useState<'chat' | 'office'>('office');
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

  // Toast when the phone transitions from idle → active ("Now connected to [Project]").
  // wasActiveRef tracks the previous value so we fire only on the false → true edge.
  const projectName = useSessionStore((s) => s.snapshot?.projectName);
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = !wasActiveRef.current && session.sessionActive;
    wasActiveRef.current = session.sessionActive;
    if (!becameActive || !projectName) return;
    const msg = `Now connected to ${projectName}`;
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      // iOS: no platform-level toast API in RN; a cross-platform toast component
      // is a future enhancement (tracked in the design doc). Log for observability.
      console.log('[session]', msg);
    }
  }, [session.sessionActive, projectName]);

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
        <WebViewHost
          onPhoneAnswer={session.sendChat}
          onActiveTabChange={setActiveTab}
          onRequestPhaseHistory={(phase, _requestId) => {
            // Fire-and-forget: useSession handles the Promise internally; the
            // cache populates via the phaseHistory message handler, and
            // WebViewHost's subscribe forwards the cache entry into the webview.
            void session.requestPhaseHistory(phase).catch((err) => {
              console.warn('[session] phase-history request failed', err);
            });
          }}
        />
        {mode === 'portrait'
          ? <PortraitOverlays
              status={session.status}
              activeTab={activeTab}
              onExpand={() => changeMode('landscape')}
            />
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
