// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useT, setCurrentLanguage } from '../../src/renderer/src/i18n';

function HelloPanel() {
  const t = useT();
  return <div data-testid="label">{t('chat.input.send.aria')}</div>;
}

describe('useT()', () => {
  beforeEach(() => {
    setCurrentLanguage('en');
  });

  it('renders English by default', () => {
    render(<HelloPanel />);
    expect(screen.getByTestId('label').textContent).toBe('Send message');
  });

  it('re-renders when language changes', () => {
    render(<HelloPanel />);
    expect(screen.getByTestId('label').textContent).toBe('Send message');
    act(() => setCurrentLanguage('he'));
    expect(screen.getByTestId('label').textContent).toBe('שלח הודעה');
  });
});
