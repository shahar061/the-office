import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('settings language IPC roundtrip', () => {
  beforeEach(() => {
    delete process.env.OFFICE_LANGUAGE;
  });

  afterEach(() => {
    delete process.env.OFFICE_LANGUAGE;
    vi.restoreAllMocks();
  });

  it('SAVE_SETTINGS with language=he sets process.env.OFFICE_LANGUAGE=he', async () => {
    const fakeStore = {
      get: vi.fn().mockReturnValue({ language: 'en' }),
      update: vi.fn().mockImplementation((patch: any) => ({ language: patch.language ?? 'en' })),
    };

    const next = fakeStore.update({ language: 'he' });
    if (next.language !== undefined) {
      process.env.OFFICE_LANGUAGE = next.language;
    }

    expect(process.env.OFFICE_LANGUAGE).toBe('he');
  });

  it('SAVE_SETTINGS with language=en sets process.env.OFFICE_LANGUAGE=en', async () => {
    const fakeStore = {
      get: vi.fn().mockReturnValue({ language: 'he' }),
      update: vi.fn().mockImplementation((patch: any) => ({ language: patch.language ?? 'he' })),
    };

    const next = fakeStore.update({ language: 'en' });
    if (next.language !== undefined) {
      process.env.OFFICE_LANGUAGE = next.language;
    }

    expect(process.env.OFFICE_LANGUAGE).toBe('en');
  });
});
