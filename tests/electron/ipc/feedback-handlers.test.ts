import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Electron must be mocked before feedback-handlers.ts is imported, because
//    it transitively imports state.ts which calls app.getPath() at module-eval time.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/feedback-test-data', getVersion: () => '0.0.0' },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { handleSubmitReport, type FeedbackDeps } from '../../../electron/ipc/feedback-handlers';

describe('handleSubmitReport', () => {
  let fetchMock: any;
  let deps: FeedbackDeps;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: 42 }), { status: 200 }),
    );
    deps = {
      fetch: fetchMock,
      getAppVersion: () => '1.0.0',
      getPlatform: () => 'darwin',
      getLanguage: () => 'en',
      getNow: () => 1234567890,
      workerUrl: 'https://worker.example.com',
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('posts the full payload to the Worker URL', async () => {
    const result = await handleSubmitReport(
      { type: 'bug', title: 'X', body: 'Reproduce by Y.', turnstileToken: 'TT' },
      deps,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://worker.example.com/reports');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      type: 'bug',
      title: 'X',
      body: 'Reproduce by Y.',
      appVersion: '1.0.0',
      osPlatform: 'darwin',
      language: 'en',
      submittedAt: 1234567890,
      turnstileToken: 'TT',
    });
    expect(result).toEqual({ ok: true, id: 42 });
  });

  it('returns server_error on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const result = await handleSubmitReport(
      { type: 'bug', title: 'X', body: 'Reproduce.', turnstileToken: 'TT' },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('server_error');
  });

  it('passes through Worker error responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'turnstile_failed', message: 'fail' }), { status: 400 }),
    );
    const result = await handleSubmitReport(
      { type: 'bug', title: 'X', body: 'Reproduce.', turnstileToken: 'TT' },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('turnstile_failed');
  });
});
