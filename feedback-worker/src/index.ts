import { verifyTurnstile } from './turnstile';
import { requireAdmin } from './auth';
import { rowToReport, type ReportRow } from './schema';
import type {
  SubmitReportRequest,
  SubmitReportResponse,
  ListReportsResponse,
  UpdateReportRequest,
  Report,
} from '../../shared/types/feedback';
import type {
  TelemetryEventsRequest,
  TelemetryEventsResponse,
  TelemetryErrorRequest,
  TelemetryErrorResponse,
  TelemetrySummary,
} from '../../shared/types/telemetry';

interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  ADMIN_READ_TOKEN: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function validateSubmitPayload(p: any): { ok: true; req: SubmitReportRequest } | { ok: false; field: string } {
  if (!p || typeof p !== 'object') return { ok: false, field: 'body' };
  if (p.type !== 'bug' && p.type !== 'feature') return { ok: false, field: 'type' };
  if (typeof p.title !== 'string' || p.title.trim().length < 1 || p.title.length > 200)
    return { ok: false, field: 'title' };
  if (typeof p.body !== 'string' || p.body.trim().length < 10 || p.body.length > 8000)
    return { ok: false, field: 'body' };
  if (typeof p.appVersion !== 'string' || p.appVersion.length > 50)
    return { ok: false, field: 'appVersion' };
  if (typeof p.osPlatform !== 'string' || p.osPlatform.length > 50)
    return { ok: false, field: 'osPlatform' };
  if (p.language !== 'en' && p.language !== 'he') return { ok: false, field: 'language' };
  if (typeof p.submittedAt !== 'number' || p.submittedAt <= 0)
    return { ok: false, field: 'submittedAt' };
  if (typeof p.turnstileToken !== 'string' || p.turnstileToken.length === 0)
    return { ok: false, field: 'turnstileToken' };

  return { ok: true, req: p as SubmitReportRequest };
}

async function handleListReports(req: Request, env: Env): Promise<Response> {
  const auth = requireAdmin(req, env.ADMIN_READ_TOKEN);
  if (auth) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);

  const where: string[] = [];
  const args: any[] = [];
  if (status) {
    where.push('status = ?');
    args.push(status);
  }
  if (type) {
    where.push('type = ?');
    args.push(type);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT * FROM reports ${whereClause} ORDER BY received_at DESC LIMIT ? OFFSET ?`;

  try {
    const result = await env.DB.prepare(sql).bind(...args, limit, offset).all<ReportRow>();
    const reports: Report[] = (result.results ?? []).map(rowToReport);
    const total = reports.length;
    const resp: ListReportsResponse = { reports, total };
    return json(resp);
  } catch (err) {
    console.error('[feedback-worker] D1 list failed:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

async function handleGetReport(req: Request, env: Env, id: number): Promise<Response> {
  const auth = requireAdmin(req, env.ADMIN_READ_TOKEN);
  if (auth) return auth;

  try {
    const row = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<ReportRow>();
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    return json(rowToReport(row));
  } catch (err) {
    console.error('[feedback-worker] D1 read failed:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

async function handlePatchReport(req: Request, env: Env, id: number): Promise<Response> {
  const auth = requireAdmin(req, env.ADMIN_READ_TOKEN);
  if (auth) return auth;

  let patch: UpdateReportRequest;
  try {
    patch = await req.json() as UpdateReportRequest;
  } catch {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }

  const validStatus = patch.status === undefined
    || ['open', 'in-progress', 'done', 'wont-fix'].includes(patch.status);
  if (!validStatus) {
    return json({ ok: false, error: 'invalid_payload', message: 'invalid status' }, 400);
  }

  // First verify the row exists.
  const existing = await env.DB.prepare('SELECT id FROM reports WHERE id = ?').bind(id).first();
  if (!existing) return json({ ok: false, error: 'not_found' }, 404);

  const sets: string[] = [];
  const args: any[] = [];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    args.push(patch.status);
  }
  if (patch.triageNote !== undefined) {
    sets.push('triage_note = ?');
    args.push(patch.triageNote);
  }
  if (sets.length === 0) {
    return json({ ok: true });
  }

  args.push(id);
  try {
    await env.DB.prepare(`UPDATE reports SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    return json({ ok: true });
  } catch (err) {
    console.error('[feedback-worker] D1 update failed:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

async function handlePostReport(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_payload', message: 'Invalid JSON body.' }, 400);
  }

  const v = validateSubmitPayload(body);
  if (!v.ok) {
    return json(
      { ok: false, error: 'invalid_payload', message: `Field '${v.field}' invalid.` },
      400,
    );
  }
  const r = v.req;

  const remoteIp = req.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  const turnstileOk = await verifyTurnstile(r.turnstileToken, env.TURNSTILE_SECRET, remoteIp);
  if (!turnstileOk) {
    return json({ ok: false, error: 'turnstile_failed', message: 'Captcha verification failed.' }, 400);
  }

  try {
    const result = await env.DB
      .prepare(
        'INSERT INTO reports (type, title, body, app_version, os_platform, language, submitted_at, received_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        r.type,
        r.title.trim(),
        r.body.trim(),
        r.appVersion,
        r.osPlatform,
        r.language,
        r.submittedAt,
        Date.now(),
      )
      .run();

    const resp: SubmitReportResponse = { ok: true, id: Number(result.meta?.last_row_id ?? 0) };
    return json(resp);
  } catch (err) {
    console.error('[feedback-worker] D1 insert failed:', err);
    return json(
      { ok: false, error: 'server_error', message: 'Database write failed.' },
      500,
    );
  }
}

// ── Telemetry ────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  'app:launch',
  'app:closed',
  'project:created',
  'project:opened',
  'phase:started',
  'phase:completed',
  'phase:failed',
  'phase:restarted',
  'request:submitted',
  'request:accepted',
  'request:rejected',
  'language:changed',
  'theme:changed',
  'feature:used',
]);

function validateTelemetryEvents(p: any): { ok: true; req: TelemetryEventsRequest } | { ok: false; field: string } {
  if (!p || typeof p !== 'object') return { ok: false, field: 'body' };
  if (typeof p.installId !== 'string' || p.installId.length < 8 || p.installId.length > 64) return { ok: false, field: 'installId' };
  if (typeof p.appVersion !== 'string' || p.appVersion.length > 50) return { ok: false, field: 'appVersion' };
  if (typeof p.osPlatform !== 'string' || p.osPlatform.length > 32) return { ok: false, field: 'osPlatform' };
  if (typeof p.language !== 'string' || p.language.length > 8) return { ok: false, field: 'language' };
  if (p.theme !== undefined && (typeof p.theme !== 'string' || p.theme.length > 24)) return { ok: false, field: 'theme' };
  if (!Array.isArray(p.events) || p.events.length === 0 || p.events.length > 200) return { ok: false, field: 'events' };
  for (const e of p.events) {
    if (!e || typeof e !== 'object') return { ok: false, field: 'events[].shape' };
    if (typeof e.type !== 'string' || !VALID_EVENT_TYPES.has(e.type)) return { ok: false, field: 'events[].type' };
    if (typeof e.clientAt !== 'number' || e.clientAt <= 0) return { ok: false, field: 'events[].clientAt' };
    // payload is freeform but bounded — JSON-encode + size-check below.
  }
  return { ok: true, req: p as TelemetryEventsRequest };
}

async function handleTelemetryEvents(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' } satisfies TelemetryEventsResponse, 400);
  }

  const v = validateTelemetryEvents(body);
  if (!v.ok) return json({ ok: false, error: `invalid_${v.field}` } satisfies TelemetryEventsResponse, 400);
  const { installId, appVersion, osPlatform, language, theme, events } = v.req;

  const now = Date.now();
  try {
    const stmt = env.DB.prepare(
      'INSERT INTO telemetry_events (install_id, event_type, payload, app_version, os_platform, language, theme, client_at, received_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const batch = events.map((e) => {
      const payloadStr = JSON.stringify(e.payload ?? {});
      // 1KB ceiling per event payload; truncate rather than reject so a single
      // outlier doesn't drop the whole batch.
      const payload = payloadStr.length > 1024 ? payloadStr.slice(0, 1024) : payloadStr;
      return stmt.bind(installId, e.type, payload, appVersion, osPlatform, language, theme ?? null, e.clientAt, now);
    });
    await env.DB.batch(batch);
    return json({ ok: true, accepted: events.length } satisfies TelemetryEventsResponse);
  } catch (err) {
    console.error('[telemetry] D1 insert failed:', err);
    return json({ ok: false, error: 'server_error' } satisfies TelemetryEventsResponse, 500);
  }
}

function validateTelemetryError(p: any): { ok: true; req: TelemetryErrorRequest } | { ok: false; field: string } {
  if (!p || typeof p !== 'object') return { ok: false, field: 'body' };
  if (typeof p.installId !== 'string' || p.installId.length < 8 || p.installId.length > 64) return { ok: false, field: 'installId' };
  if (typeof p.appVersion !== 'string' || p.appVersion.length > 50) return { ok: false, field: 'appVersion' };
  if (typeof p.osPlatform !== 'string' || p.osPlatform.length > 32) return { ok: false, field: 'osPlatform' };
  if (p.process !== 'main' && p.process !== 'renderer') return { ok: false, field: 'process' };
  if (typeof p.message !== 'string' || p.message.length === 0 || p.message.length > 4000) return { ok: false, field: 'message' };
  if (p.stack !== undefined && (typeof p.stack !== 'string' || p.stack.length > 16000)) return { ok: false, field: 'stack' };
  if (p.breadcrumbs !== undefined && (typeof p.breadcrumbs !== 'string' || p.breadcrumbs.length > 8000)) return { ok: false, field: 'breadcrumbs' };
  if (typeof p.fingerprint !== 'string' || p.fingerprint.length === 0 || p.fingerprint.length > 128) return { ok: false, field: 'fingerprint' };
  if (typeof p.clientAt !== 'number' || p.clientAt <= 0) return { ok: false, field: 'clientAt' };
  return { ok: true, req: p as TelemetryErrorRequest };
}

async function handleTelemetryError(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' } satisfies TelemetryErrorResponse, 400);
  }

  const v = validateTelemetryError(body);
  if (!v.ok) return json({ ok: false, error: `invalid_${v.field}` } satisfies TelemetryErrorResponse, 400);
  const r = v.req;
  const now = Date.now();
  try {
    const result = await env.DB.prepare(
      'INSERT INTO telemetry_errors (install_id, fingerprint, process, message, stack, breadcrumbs, app_version, os_platform, client_at, received_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      r.installId,
      r.fingerprint,
      r.process,
      r.message,
      r.stack ?? null,
      r.breadcrumbs ?? null,
      r.appVersion,
      r.osPlatform,
      r.clientAt,
      now,
    ).run();
    return json({ ok: true, id: result.meta?.last_row_id as number | undefined } satisfies TelemetryErrorResponse);
  } catch (err) {
    console.error('[telemetry] D1 error insert failed:', err);
    return json({ ok: false, error: 'server_error' } satisfies TelemetryErrorResponse, 500);
  }
}

async function handleTelemetrySummary(req: Request, env: Env): Promise<Response> {
  const auth = requireAdmin(req, env.ADMIN_READ_TOKEN);
  if (auth) return auth;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  try {
    const [
      totalInstallsRow,
      weeklyActiveRow,
      modeCountsRow,
      funnelRow,
      errorsRow,
      langRows,
      themeRows,
    ] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(DISTINCT install_id) as c FROM telemetry_events`).first<{ c: number }>(),
      env.DB.prepare(`SELECT COUNT(DISTINCT install_id) as c FROM telemetry_events WHERE received_at >= ?`).bind(sevenDaysAgo).first<{ c: number }>(),
      env.DB.prepare(
        `SELECT
           SUM(CASE WHEN json_extract(payload, '$.mode') = 'greenfield' THEN 1 ELSE 0 END) as greenfield,
           SUM(CASE WHEN json_extract(payload, '$.mode') = 'workshop' THEN 1 ELSE 0 END) as workshop
         FROM telemetry_events WHERE event_type = 'project:created'`,
      ).first<{ greenfield: number | null; workshop: number | null }>(),
      env.DB.prepare(
        `SELECT
           SUM(CASE WHEN event_type='phase:started'   AND json_extract(payload,'$.phase')='imagine' THEN 1 ELSE 0 END) as imagine_started,
           SUM(CASE WHEN event_type='phase:completed' AND json_extract(payload,'$.phase')='imagine' THEN 1 ELSE 0 END) as imagine_completed,
           SUM(CASE WHEN event_type='phase:completed' AND json_extract(payload,'$.phase')='warroom' THEN 1 ELSE 0 END) as warroom_completed,
           SUM(CASE WHEN event_type='phase:completed' AND json_extract(payload,'$.phase')='build'   THEN 1 ELSE 0 END) as build_completed
         FROM telemetry_events`,
      ).first<{ imagine_started: number | null; imagine_completed: number | null; warroom_completed: number | null; build_completed: number | null }>(),
      env.DB.prepare(`SELECT COUNT(*) as c FROM telemetry_errors WHERE received_at >= ?`).bind(sevenDaysAgo).first<{ c: number }>(),
      env.DB.prepare(
        `SELECT language, COUNT(DISTINCT install_id) as count FROM telemetry_events GROUP BY language ORDER BY count DESC`,
      ).all<{ language: string; count: number }>(),
      env.DB.prepare(
        `SELECT theme, COUNT(DISTINCT install_id) as count FROM telemetry_events WHERE theme IS NOT NULL GROUP BY theme ORDER BY count DESC`,
      ).all<{ theme: string; count: number }>(),
    ]);

    const summary: TelemetrySummary = {
      totalInstalls: totalInstallsRow?.c ?? 0,
      weeklyActiveInstalls: weeklyActiveRow?.c ?? 0,
      greenfieldProjects: modeCountsRow?.greenfield ?? 0,
      workshopProjects: modeCountsRow?.workshop ?? 0,
      phaseFunnel: {
        imagineStarted: funnelRow?.imagine_started ?? 0,
        imagineCompleted: funnelRow?.imagine_completed ?? 0,
        warroomCompleted: funnelRow?.warroom_completed ?? 0,
        buildCompleted: funnelRow?.build_completed ?? 0,
      },
      errorsLast7Days: errorsRow?.c ?? 0,
      byLanguage: langRows.results ?? [],
      byTheme: themeRows.results ?? [],
      generatedAt: Date.now(),
    };
    return json(summary);
  } catch (err) {
    console.error('[telemetry] summary failed:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

async function handleTelemetryDeleteByInstall(req: Request, env: Env, installId: string): Promise<Response> {
  // Anyone with the install id can ask for their data to be deleted —
  // it's a private secret known only to that user. No admin token required.
  if (installId.length < 8 || installId.length > 64) {
    return json({ ok: false, error: 'invalid_install_id' }, 400);
  }
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM telemetry_events WHERE install_id = ?`).bind(installId),
      env.DB.prepare(`DELETE FROM telemetry_errors WHERE install_id = ?`).bind(installId),
    ]);
    return json({ ok: true });
  } catch (err) {
    console.error('[telemetry] delete failed:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/reports') {
      return handlePostReport(req, env);
    }

    if (req.method === 'GET' && url.pathname === '/reports') {
      return handleListReports(req, env);
    }

    const reportIdMatch = url.pathname.match(/^\/reports\/(\d+)$/);
    if (req.method === 'GET' && reportIdMatch) {
      return handleGetReport(req, env, Number(reportIdMatch[1]));
    }

    const reportIdMatchPatch = url.pathname.match(/^\/reports\/(\d+)$/);
    if (req.method === 'PATCH' && reportIdMatchPatch) {
      return handlePatchReport(req, env, Number(reportIdMatchPatch[1]));
    }

    // Telemetry
    if (req.method === 'POST' && url.pathname === '/telemetry/events') {
      return handleTelemetryEvents(req, env);
    }
    if (req.method === 'POST' && url.pathname === '/telemetry/errors') {
      return handleTelemetryError(req, env);
    }
    if (req.method === 'GET' && url.pathname === '/telemetry/summary') {
      return handleTelemetrySummary(req, env);
    }
    const deleteByInstallMatch = url.pathname.match(/^\/telemetry\/installs\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'DELETE' && deleteByInstallMatch) {
      return handleTelemetryDeleteByInstall(req, env, deleteByInstallMatch[1]);
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
};
