import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortraitOverlays } from '../session/PortraitLayout';

const connectedStatus = { state: 'connected' as const, desktopName: 'D', mode: 'lan' as const };

function renderWith(props: { activeTab: 'chat' | 'office'; onExpand?: () => void }) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 300, height: 600 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <PortraitOverlays
        status={connectedStatus}
        onExpand={props.onExpand ?? (() => {})}
        activeTab={props.activeTab}
      />
    </SafeAreaProvider>,
  );
}

describe('PortraitOverlays — expand button gating', () => {
  it('renders the expand button when activeTab === "office"', () => {
    renderWith({ activeTab: 'office' });
    expect(screen.queryByLabelText('Expand canvas to landscape')).not.toBeNull();
  });

  it('hides the expand button when activeTab === "chat"', () => {
    renderWith({ activeTab: 'chat' });
    expect(screen.queryByLabelText('Expand canvas to landscape')).toBeNull();
  });
});
