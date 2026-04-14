import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { useSessionStore } from '../types/shared';
import type { MobileMessage } from '../types/shared';

interface Props {
  style?: any;
}

export function WebViewHost({ style }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [assetUri, setAssetUri] = useState<string | null>(null);

  // Load the bundled HTML asset once
  useEffect(() => {
    (async () => {
      try {
        const asset = Asset.fromModule(require('../../assets/webview/index.html'));
        await asset.downloadAsync();
        setAssetUri(asset.localUri ?? asset.uri);
      } catch (err) {
        console.warn('[WebViewHost] asset load failed', err);
      }
    })();
  }, []);

  // Subscribe to session store and forward events to the WebView
  useEffect(() => {
    const post = (msg: MobileMessage) => {
      webViewRef.current?.postMessage(JSON.stringify(msg));
    };
    const unsub = useSessionStore.subscribe((state, prev) => {
      if (state.snapshot && state.snapshot !== prev.snapshot) {
        post({ type: 'snapshot', v: 1, snapshot: state.snapshot });
      }
      if (state.pendingEvents !== prev.pendingEvents && state.pendingEvents.length > 0) {
        // Forward each event individually
        const events = useSessionStore.getState().drainPendingEvents();
        for (const event of events) post({ type: 'event', v: 1, event });
      }
    });
    return unsub;
  }, []);

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
      onMessage={() => { /* v1: no messages from WebView */ }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
});
