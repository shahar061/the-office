# feedback-worker

Cloudflare Worker for The Office's bug-report submission and admin triage.

## Endpoints

| Method + Path | Auth | Purpose |
|---|---|---|
| `POST /reports` | Edge rate limit + Turnstile token | Submit a new report from the Electron app |
| `GET /reports?status=open&type=bug&limit=50&offset=0` | `Authorization: Bearer ADMIN_READ_TOKEN` | List reports for the admin dashboard |
| `GET /reports/:id` | Same | Single report |
| `PATCH /reports/:id` | Same | Update status / triage note |

## Local development

```bash
cd feedback-worker
npm install
npm run db:migrate:local                    # Creates the local SQLite DB and applies the schema
npm run dev                                 # Starts wrangler dev on http://localhost:8787
```

Test with `curl`:
```bash
# (Turnstile will reject a fake token in real flow; for local testing,
# point the Worker at the Cloudflare Turnstile test secret key
# 1x0000000000000000000000000000000AA which always succeeds.)
curl -X POST http://localhost:8787/reports \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "bug",
    "title": "Test",
    "body": "Local smoke test of the report endpoint.",
    "appVersion": "1.0.0",
    "osPlatform": "darwin",
    "language": "en",
    "submittedAt": 0,
    "turnstileToken": "TEST"
  }'
```

## Provisioning (one-time, M5 of the implementation plan)

1. Sign up for Cloudflare (free tier).
2. `wrangler login`.
3. `wrangler d1 create office-feedback` — copy the returned `database_id` into `wrangler.toml`.
4. `npm run db:migrate:prod` — applies migrations to the production D1.
5. Set up Turnstile site at https://dash.cloudflare.com/?to=/:account/turnstile (managed challenge mode). Save the site key (public; embedded in the app) and secret key.
6. `wrangler secret put TURNSTILE_SECRET` — paste the secret.
7. `wrangler secret put ADMIN_READ_TOKEN` — generate a random 32-byte hex string (`openssl rand -hex 32`); paste.
8. `wrangler deploy` — deploys the Worker to `https://office-feedback-worker.<account>.workers.dev`.
9. Update `electron/feedback/config.ts` (Task 28 of the plan) to use this URL as the production constant.

## Schema migrations

New migrations go in `migrations/0002_*.sql` etc. Apply locally with `npm run db:migrate:local`, deploy with `npm run db:migrate:prod` after pushing the file to git.

## Privacy

- No IP address is stored in D1; only used by the edge rate limiter.
- No user-identifying data beyond what the form explicitly collects (title, body, type, app version, OS platform, language, timestamp).
- See `docs/superpowers/specs/2026-04-25-dev-mode-bug-report-design.md` for the full privacy stance.
