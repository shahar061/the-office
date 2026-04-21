// Emits the current active tab to the React Native host so the shell can
// gate tab-scoped chrome (the expand-to-landscape button, specifically).
// Mirrors sendAnswer.ts: one message type, one module, no state.
export function emitActiveTab(tab: 'chat' | 'office'): void {
  const host = (window as unknown as {
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }).ReactNativeWebView;
  if (!host) return;
  host.postMessage(JSON.stringify({ type: 'activeTab', tab }));
}
