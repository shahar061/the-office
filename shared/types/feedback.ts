// Wire format shared between the Electron renderer/main and the Cloudflare Worker.

export type ReportType = 'bug' | 'feature';
export type ReportStatus = 'open' | 'in-progress' | 'done' | 'wont-fix';
export type ReportLanguage = 'en' | 'he';

export interface SubmitReportRequest {
  type: ReportType;
  title: string;
  body: string;
  appVersion: string;
  osPlatform: string;
  language: ReportLanguage;
  submittedAt: number;       // unix ms
  turnstileToken: string;
}

export type SubmitReportError =
  | 'invalid_payload'
  | 'turnstile_failed'
  | 'rate_limited'
  | 'server_error';

export type SubmitReportResponse =
  | { ok: true; id: number }
  | { ok: false; error: SubmitReportError; message: string };

export interface Report {
  id: number;
  type: ReportType;
  title: string;
  body: string;
  appVersion: string;
  osPlatform: string;
  language: ReportLanguage;
  submittedAt: number;
  receivedAt: number;
  status: ReportStatus;
  triageNote?: string;
}

export interface ListReportsRequest {
  status?: ReportStatus;
  type?: ReportType;
  limit?: number;     // default 50, max 200
  offset?: number;    // default 0
}

export interface ListReportsResponse {
  reports: Report[];
  total: number;
}

export interface UpdateReportRequest {
  status?: ReportStatus;
  triageNote?: string;
}
