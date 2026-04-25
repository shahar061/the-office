// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSettingsStore } from '../../src/renderer/src/stores/settings.store';
import { AboutSection } from '../../src/renderer/src/components/SettingsPanel/sections/AboutSection';

declare global {
  // eslint-disable-next-line no-var
  var window: any;
}

function mockOffice() {
  const settings: any = { language: 'en', devMode: false, _isDevMode: false };
  globalThis.window.office = {
    getSettings: vi.fn().mockResolvedValue(settings),
    saveSettings: vi.fn().mockImplementation(async (patch: any) => {
      Object.assign(settings, patch);
      settings._isDevMode = (process.env.OFFICE_DEV === '1') || settings.devMode === true;
      return settings;
    }),
    openExternal: vi.fn(),
  };
}

beforeEach(() => {
  // Reset the Zustand store fully
  useSettingsStore.setState({
    isOpen: false,
    activeSection: 'general',
    settings: { language: 'en', devMode: false, _isDevMode: false } as any,
    versionTapCount: 0,
    versionLastTapAt: null,
    isDevMode: false,
    dismissedFirstRunBannerProjects: new Set(),
  } as any);
  mockOffice();
});

describe('tap-to-unlock', () => {
  it('7 taps flips devMode to true', async () => {
    render(<AboutSection />);
    const versionEl = screen.getByText(/Version/);
    for (let i = 0; i < 7; i++) {
      fireEvent.click(versionEl);
      // give the async store action a tick
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(useSettingsStore.getState().isDevMode).toBe(true);
  });

  it('4 taps then 2.1s wait then 3 taps does not unlock', async () => {
    vi.useFakeTimers();
    render(<AboutSection />);
    const versionEl = screen.getByText(/Version/);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(versionEl);
    }
    vi.advanceTimersByTime(2100);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(versionEl);
    }
    vi.useRealTimers();
    expect(useSettingsStore.getState().isDevMode).toBe(false);
  });

  it('shows "Press 3 more times" toast at tap 4', async () => {
    render(<AboutSection />);
    const versionEl = screen.getByText(/Version/);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(versionEl);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(screen.queryByText(/3 more times/)).not.toBeNull();
  });

  it('shows "Dev mode enabled" toast on the 7th tap', async () => {
    render(<AboutSection />);
    const versionEl = screen.getByText(/Version/);
    for (let i = 0; i < 7; i++) {
      fireEvent.click(versionEl);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(screen.queryByText(/Dev mode enabled/)).not.toBeNull();
  });
});
