import { render, screen } from '@testing-library/react-native';
import { ConnectionPill } from '../webview-host/ConnectionPill';

describe('ConnectionPill', () => {
  it('renders "Local" when connected on LAN', () => {
    render(<ConnectionPill status={{ state: 'connected', desktopName: 'D', mode: 'lan' }} />);
    expect(screen.queryByText('Local')).not.toBeNull();
  });

  it('renders "Remote" when connected via relay', () => {
    render(<ConnectionPill status={{ state: 'connected', desktopName: 'D', mode: 'relay' }} />);
    expect(screen.queryByText('Remote')).not.toBeNull();
  });

  it('renders "Connected" when connected with unknown mode', () => {
    render(<ConnectionPill status={{ state: 'connected', desktopName: 'D' }} />);
    expect(screen.queryByText('Connected')).not.toBeNull();
  });

  it('renders "Connecting" for state=connecting', () => {
    render(<ConnectionPill status={{ state: 'connecting' }} />);
    expect(screen.queryByText('Connecting')).not.toBeNull();
  });

  it('renders "Offline — <reason>" for state=disconnected', () => {
    render(<ConnectionPill status={{ state: 'disconnected', reason: 'timeout' }} />);
    expect(screen.queryByText('Offline — timeout')).not.toBeNull();
  });

  it('renders "Error" for state=error', () => {
    render(<ConnectionPill status={{ state: 'error', error: new Error('x') }} />);
    expect(screen.queryByText('Error')).not.toBeNull();
  });

  it('renders "Idle" for state=idle', () => {
    render(<ConnectionPill status={{ state: 'idle' }} />);
    expect(screen.queryByText('Idle')).not.toBeNull();
  });
});
