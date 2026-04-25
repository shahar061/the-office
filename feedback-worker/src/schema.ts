import type { Report, ReportStatus, ReportType, ReportLanguage } from '../../shared/types/feedback';

export interface ReportRow {
  id: number;
  type: ReportType;
  title: string;
  body: string;
  app_version: string;
  os_platform: string;
  language: ReportLanguage;
  submitted_at: number;
  received_at: number;
  status: ReportStatus;
  triage_note: string | null;
}

export function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    appVersion: row.app_version,
    osPlatform: row.os_platform,
    language: row.language,
    submittedAt: row.submitted_at,
    receivedAt: row.received_at,
    status: row.status,
    triageNote: row.triage_note ?? undefined,
  };
}
