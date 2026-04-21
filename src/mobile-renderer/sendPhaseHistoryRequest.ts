// Asks the RN host to fetch PhaseHistory[] for a given phase. Returns the
// generated requestId so the caller can correlate against a later
// phaseHistory cache update (which arrives via the host→webview message
// channel and populates the shared session store).
export function sendPhaseHistoryRequest(
  phase: 'imagine' | 'warroom' | 'build' | 'complete',
): string {
  const requestId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const host = (window as unknown as {
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }).ReactNativeWebView;
  if (host) {
    host.postMessage(JSON.stringify({ type: 'requestPhaseHistory', phase, requestId }));
  }
  return requestId;
}
