import { render } from '@testing-library/react-native';

// Mock react-native-webview: render a null element but expose its onMessage
// prop to the test so we can fire synthetic messages.
let capturedOnMessage: ((e: { nativeEvent: { data: string } }) => void) | null = null;
jest.mock('react-native-webview', () => {
  return {
    WebView: (props: any) => {
      capturedOnMessage = props.onMessage;
      return null;
    },
  };
});
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ downloadAsync: async () => {}, localUri: 'file:///tmp/idx.html', uri: 'file:///tmp/idx.html' }),
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

import { WebViewHost } from '../webview-host/WebViewHost';

describe('WebViewHost — message routing', () => {
  beforeEach(() => { capturedOnMessage = null; });

  it('calls onActiveTabChange when the webview posts {type:"activeTab", tab}', () => {
    const spy = jest.fn();
    render(
      <WebViewHost
        onPhoneAnswer={async () => ({ ok: true })}
        onActiveTabChange={spy}
      />,
    );
    expect(capturedOnMessage).toBeTruthy();
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({ type: 'activeTab', tab: 'chat' }) } });
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({ type: 'activeTab', tab: 'office' }) } });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 'chat');
    expect(spy).toHaveBeenNthCalledWith(2, 'office');
  });

  it('ignores activeTab messages with invalid tab value', () => {
    const spy = jest.fn();
    render(
      <WebViewHost
        onPhoneAnswer={async () => ({ ok: true })}
        onActiveTabChange={spy}
      />,
    );
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({ type: 'activeTab', tab: 'bogus' }) } });
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls onRequestPhaseHistory when the webview posts requestPhaseHistory', () => {
    const spy = jest.fn();
    render(
      <WebViewHost
        onPhoneAnswer={async () => ({ ok: true })}
        onRequestPhaseHistory={spy}
      />,
    );
    expect(capturedOnMessage).toBeTruthy();
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({
      type: 'requestPhaseHistory', phase: 'imagine', requestId: 'req-42',
    }) } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('imagine', 'req-42');
  });

  it('ignores requestPhaseHistory with invalid phase', () => {
    const spy = jest.fn();
    render(
      <WebViewHost
        onPhoneAnswer={async () => ({ ok: true })}
        onRequestPhaseHistory={spy}
      />,
    );
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({
      type: 'requestPhaseHistory', phase: 'bogus', requestId: 'req-1',
    }) } });
    expect(spy).not.toHaveBeenCalled();
  });
});
