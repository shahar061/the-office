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

    return json({ ok: false, error: 'not_found' }, 404);
  },
};
