# Bug Report — Manual Smoke Checklist

Run when changing anything related to the feedback feature.

## Local development setup

- [ ] `cd feedback-worker && npm run db:migrate:local && npm run dev` (Worker on :8787)
- [ ] `cd feedback-admin && npm run dev` (Admin on :8788)
- [ ] `OFFICE_FEEDBACK_URL=http://localhost:8787 npm run dev` (Electron)

## Local end-to-end

- [ ] Settings → About → tap "Version 1.0.0" 7 times → toast at taps 4-6 ("Press N more times…"), success toast at tap 7 ("✓ Dev mode enabled")
- [ ] IconRail bottom shows ⚙️ + 🐞
- [ ] Click 🐞 → modal opens, autofocus on title
- [ ] Submit disabled until title (≥1 char) + body (≥10 chars) + Turnstile complete
- [ ] Submit → success modal "✓ Report submitted (#N). Thanks!" auto-closes after 2s
- [ ] Visit http://localhost:8788 → row appears at the top of the list
- [ ] Click row → detail page → change status to "in-progress" → Save → reload → persisted
- [ ] Settings → About → "Disable" → 🐞 disappears
- [ ] Re-tap 7 → 🐞 returns

## Hebrew RTL

- [ ] Switch language to Hebrew
- [ ] Tap version 7 times → toasts in Hebrew, IconRail mirrored
- [ ] Bug report modal labels in Hebrew, RTL layout
- [ ] Submit → admin dashboard shows language=he

## OFFICE_DEV env var (force-on, runtime-only)

- [ ] Launch with `OFFICE_DEV=1 npm run dev` from a clean settings (or with `devMode=false`)
- [ ] IconRail shows 🧪 + 🐞 immediately, no tapping needed
- [ ] Settings → About: "Disable" link replaced with "Dev mode forced on by OFFICE_DEV environment variable."
- [ ] Restart without `OFFICE_DEV` → dev mode off (settings.devMode unchanged on disk — env var is pure runtime override, never persists)

## Error paths

- [ ] Stop the local Worker (Ctrl-C). Submit a report → "No connection to feedback service. Check your network and try again." Modal stays open.
- [ ] In `feedback-worker/.dev.vars`, set `TURNSTILE_SECRET=2x0000000000000000000000000000000AA` (Cloudflare's test secret that ALWAYS FAILS). Restart Worker. Submit a report → "Captcha verification failed." Reset back to `1x...` after.
- [ ] Send 11+ requests in 60s from one IP — 11th gets a 429 / rate-limited message (need real production worker for this; skip locally).

## Production smoke (after M5 provisioning)

- [ ] App pointed at production Worker URL (no `OFFICE_FEEDBACK_URL` set)
- [ ] Submit a "production smoke test" report
- [ ] Visit https://office-feedback-admin.pages.dev → log in via Cloudflare Access OAuth → see the report
- [ ] Edit status → save → persists

## Privacy

- [ ] Auto-attached `<details>` panel in the form shows ONLY: app version, platform, language. Nothing else hidden in the payload.
- [ ] No project name, project path, log lines, chat content, or IP address visible in either the form or the admin dashboard.
- [ ] D1 has no `ip` column; only edge rate limiter sees the source IP and never persists it.
