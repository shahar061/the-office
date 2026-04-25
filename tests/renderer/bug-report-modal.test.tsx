// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BugReportModal } from '../../src/renderer/src/components/BugReportModal';
import { useBugReportStore } from '../../src/renderer/src/stores/bug-report.store';

declare global {
  // eslint-disable-next-line no-var
  var window: any;
}

beforeEach(() => {
  globalThis.window.office = {
    feedback: {
      submitReport: vi.fn(),
    },
  };

  useBugReportStore.setState({
    isOpen: false,
    type: 'bug',
    title: '',
    body: '',
    turnstileToken: null,
    submitting: false,
    result: null,
  } as any);
});

describe('BugReportModal', () => {
  it('does not render when isOpen=false', () => {
    render(<BugReportModal />);
    expect(screen.queryByText(/Report a Bug/)).toBeNull();
  });

  it('renders when isOpen=true', () => {
    useBugReportStore.setState({ isOpen: true });
    render(<BugReportModal />);
    expect(screen.queryByText(/Report a Bug/)).not.toBeNull();
  });

  it('Submit button is disabled when title empty', () => {
    useBugReportStore.setState({ isOpen: true, body: 'a'.repeat(20), turnstileToken: 'TT' });
    render(<BugReportModal />);
    const submit = screen.getByRole('button', { name: /Submit/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('Submit button is disabled when no Turnstile token', () => {
    useBugReportStore.setState({ isOpen: true, title: 'X', body: 'a'.repeat(20) });
    render(<BugReportModal />);
    const submit = screen.getByRole('button', { name: /Submit/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('Submit calls IPC and shows success', async () => {
    (globalThis.window.office.feedback.submitReport as any).mockResolvedValue({ ok: true, id: 7 });
    useBugReportStore.setState({
      isOpen: true,
      title: 'A title',
      body: 'A long enough description.',
      turnstileToken: 'TT',
    });
    render(<BugReportModal />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(globalThis.window.office.feedback.submitReport).toHaveBeenCalled();
    expect(screen.queryByText(/Report submitted/)).not.toBeNull();
  });

  it('Submit error stays open and shows error', async () => {
    (globalThis.window.office.feedback.submitReport as any).mockResolvedValue({
      ok: false, error: 'rate_limited', message: 'Slow down',
    });
    useBugReportStore.setState({
      isOpen: true,
      title: 'A title',
      body: 'A long enough description.',
      turnstileToken: 'TT',
    });
    render(<BugReportModal />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(/Slow down/)).not.toBeNull();
    expect(useBugReportStore.getState().isOpen).toBe(true);
  });
});
