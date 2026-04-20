import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { useSessionStore } from '../types/shared';
import type { MobileMessage } from '../types/shared';

interface Props {
  style?: any;
  onPhoneAnswer: (body: string) => Promise<{ ok: boolean; error?: string }>;
}

export function WebViewHost({ style, onPhoneAnswer }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [assetUri, setAssetUri] = useState<string | null>(null);

  // Load the bundled HTML asset once
  useEffect(() => {
    (async () => {
      try {
        const asset = Asset.fromModule(require('../../assets/webview/index.html'));
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        console.log('[WebViewHost] asset resolved', uri);
        setAssetUri(uri);
      } catch (err) {
        console.warn('[WebViewHost] asset load failed', err);
      }
    })();
  }, []);

  const [ready, setReady] = useState(false);

  // Subscribe to session store and forward events to the WebView, but only
  // after the WebView bridge signals it's ready. Before that, postMessage is
  // dropped silently because the in-page `message` listener isn't installed yet.
  useEffect(() => {
    if (!ready) {
      console.log('[WebViewHost] subscribe waiting (ready=false)');
      return;
    }
    console.log('[WebViewHost] ready → replaying snapshot + subscribing');
    const post = (msg: MobileMessage) => {
      webViewRef.current?.postMessage(JSON.stringify(msg));
    };
    const current = useSessionStore.getState().snapshot;
    console.log('[WebViewHost] replay snapshot?', !!current, current ? `chars=${current.characters.length}` : '');
    if (current) post({ type: 'snapshot', v: 1, snapshot: current });
    const pending = useSessionStore.getState().drainPendingEvents();
    console.log('[WebViewHost] replay events count', pending.length);
    for (const event of pending) post({ type: 'event', v: 1, event });
    const initialStates = useSessionStore.getState().characterStates;
    if (initialStates.size > 0) {
      console.log('[WebViewHost] replay charState count=', initialStates.size);
      post({
        type: 'charState',
        v: 1,
        ts: useSessionStore.getState().lastCharStateTs,
        characters: [...initialStates.values()],
      });
    }

    const unsub = useSessionStore.subscribe((state, prev) => {
      if (state.snapshot && state.snapshot !== prev.snapshot) {
        console.log('[WebViewHost] forward snapshot chars=', state.snapshot.characters.length);
        post({ type: 'snapshot', v: 1, snapshot: state.snapshot });
      }
      if (state.pendingEvents !== prev.pendingEvents && state.pendingEvents.length > 0) {
        const events = useSessionStore.getState().drainPendingEvents();
        console.log('[WebViewHost] forward events', events.length);
        for (const event of events) post({ type: 'event', v: 1, event });
      }
      if (state.characterStates !== prev.characterStates) {
        console.log('[WebViewHost] forward charState count=', state.characterStates.size);
        post({
          type: 'charState',
          v: 1,
          ts: state.lastCharStateTs,
          characters: [...state.characterStates.values()],
        });
      }
    });
    return unsub;
  }, [ready]);

  return (
    <WebView
      ref={webViewRef}
      style={[styles.root, style]}
      source={assetUri ? { uri: assetUri } : { uri: 'about:blank' }}
      originWhitelist={['*']}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      onLoadStart={() => console.log('[WebViewHost] WV loadStart')}
      onLoadEnd={() => console.log('[WebViewHost] WV loadEnd')}
      onError={(e) => console.log('[WebViewHost] WV error', e.nativeEvent.description)}
      onHttpError={(e) => console.log('[WebViewHost] WV httpError', e.nativeEvent.statusCode, e.nativeEvent.url)}
      onRenderProcessGone={() => console.log('[WebViewHost] WV renderProcessGone')}
      // Forward console.log from inside the WebView to Metro via a helper
      injectedJavaScriptBeforeContentLoaded={`
        (function(){
          const origLog = console.log.bind(console);
          console.log = function(...args) {
            origLog(...args);
            try {
              const body = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: '__console', level: 'log', body: body }));
            } catch (e) {}
          };
          window.addEventListener('error', function(e) {
            try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: '__console', level: 'error', body: 'window.error: ' + (e && e.message) + ' @ ' + (e && e.filename) + ':' + (e && e.lineno) })); } catch(_) {}
          });
        })();
        true;
      `}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (data?.type === '__console') {
            console.log('[WV:' + (data.level || 'log') + ']', data.body);
            return;
          }
          if (data?.type === 'ready') {
            console.log('[WebViewHost] got ready');
            setReady(true);
            return;
          }
          if (data?.type === 'sendChat' && typeof data.body === 'string') {
            void onPhoneAnswer(data.body).then((result) => {
              if (!result.ok) console.warn('[WebViewHost] sendChat failed', result.error);
            });
            return;
          }
        } catch { /* ignore non-JSON */ }
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
});
