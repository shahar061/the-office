// Bridges a tap on the interactive QuestionBubble to the React Native host.
// The host's onMessage handler relays the body to `session.sendChat`, which
// sends `{ type: 'chat', v: 2, body, clientMsgId }` upstream — the existing
// answer path. Zero new wire types.
export function sendAnswer(label: string): void {
  const host = (window as unknown as {
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }).ReactNativeWebView;
  if (!host) {
    console.warn('[sendAnswer] no ReactNativeWebView host — answer dropped');
    return;
  }
  host.postMessage(JSON.stringify({ type: 'sendChat', body: label }));
}
