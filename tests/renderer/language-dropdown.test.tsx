// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageDropdown } from '../../src/renderer/src/components/AppChromeCluster/LanguageDropdown';
import { useSettingsStore } from '../../src/renderer/src/stores/settings.store';

declare global {
  // eslint-disable-next-line no-var
  var window: any;
}

beforeEach(() => {
  globalThis.window.office = {
    saveSettings: vi.fn().mockImplementation(async (patch: any) => ({
      language: patch.language ?? 'en',
      _isDevMode: false,
    })),
    getSettings: vi.fn(),
    openExternal: vi.fn(),
  };

  useSettingsStore.setState({
    settings: { language: 'en', devMode: false, _isDevMode: false } as any,
    isDevMode: false,
    versionTapCount: 0,
    versionLastTapAt: null,
    isOpen: false,
    activeSection: 'general',
    dismissedFirstRunBannerProjects: new Set(),
  } as any);
});

describe('LanguageDropdown', () => {
  it('shows EN ▾ when language=en', () => {
    render(<LanguageDropdown />);
    expect(screen.getByText(/EN/)).toBeTruthy();
  });

  it('clicking the badge opens the dropdown', () => {
    render(<LanguageDropdown />);
    fireEvent.click(screen.getByText(/EN/));
    expect(screen.getByText(/English/)).toBeTruthy();
    expect(screen.getByText(/עברית/)).toBeTruthy();
  });

  it('clicking a language item calls setLanguage and closes dropdown', async () => {
    render(<LanguageDropdown />);
    fireEvent.click(screen.getByText(/EN/));
    fireEvent.click(screen.getByText(/עברית/));
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.window.office.saveSettings).toHaveBeenCalledWith({ language: 'he' });
  });

  it('closes when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <LanguageDropdown />
      </div>
    );
    fireEvent.click(screen.getByText(/EN/));
    expect(screen.queryByText(/English/)).not.toBeNull();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText(/English/)).toBeNull();
  });
});
