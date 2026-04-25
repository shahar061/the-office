import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type {
  SubmitReportRequest,
  SubmitReportResponse,
} from '../../shared/types/feedback';
import { settingsStore } from './state';

const PRODUCTION_WORKER_URL = 'https://office-feedback-worker.shahar061.workers.dev';

export interface FeedbackDeps {
  fetch: typeof globalThis.fetch;
  getAppVersion: () => string;
  getPlatform: () => string;
  getLanguage: () => 'en' | 'he';
  getNow: () => number;
  workerUrl: string;
}

export async function handleSubmitReport(
  req: Pick<SubmitReportRequest, 'type' | 'title' | 'body' | 'turnstileToken'>,
  deps: FeedbackDeps,
): Promise<SubmitReportResponse> {
  const fullReq: SubmitReportRequest = {
    type: req.type,
    title: req.title,
    body: req.body,
    appVersion: deps.getAppVersion(),
    osPlatform: deps.getPlatform(),
    language: deps.getLanguage(),
    submittedAt: deps.getNow(),
    turnstileToken: req.turnstileToken,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await deps.fetch(`${deps.workerUrl}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fullReq),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json() as SubmitReportResponse;
      return json;
    }
    // Try to parse error body
    try {
      const errJson = await res.json() as SubmitReportResponse;
      if (!errJson.ok) return errJson;
    } catch {
      // fall through
    }
    return { ok: false, error: 'server_error', message: `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: 'server_error',
      message: 'No connection to feedback service.',
    };
  }
}

export function initFeedbackHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SUBMIT_FEEDBACK_REPORT,
    async (_evt, req: Parameters<typeof handleSubmitReport>[0]) => {
      const workerUrl = process.env.OFFICE_FEEDBACK_URL || PRODUCTION_WORKER_URL;
      return handleSubmitReport(req, {
        fetch: globalThis.fetch,
        getAppVersion: () => app.getVersion(),
        getPlatform: () => process.platform,
        getLanguage: () => settingsStore.get().language,
        getNow: () => Date.now(),
        workerUrl,
      });
    },
  );
}
