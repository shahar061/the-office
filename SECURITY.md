# Security Policy

## Supported versions

The Office is in pre-release (v0.x). **Only the most recent release receives security fixes.** Once we hit v1.0 we'll publish a longer support window here.

| Version | Supported |
|---|---|
| Latest `0.x` | ✅ |
| Older `0.x`  | ❌ — please upgrade |

## Reporting a vulnerability

**Please do not open public GitHub issues for security problems.** Public reports give attackers a head start.

Use one of these private channels instead:

1. **Preferred — [Open a private security advisory](https://github.com/shahar061/the-office/security/advisories/new) on GitHub.** This stays visible only to maintainers and is the cleanest path to a coordinated fix.
2. **Backup — Direct message [@shahar061](https://github.com/shahar061) on GitHub** with the details.

In your report, please include:

- A clear description of the vulnerability and the impact.
- Steps to reproduce (a proof-of-concept is gold; a description is fine).
- The version of The Office it affects (`Settings → About`).
- Your platform (macOS / Windows / Linux + version).
- Optionally, suggested mitigations.

## What you can expect

- **Acknowledgement within 5 days.** We'll confirm receipt and a rough triage.
- **A fix and disclosure timeline within 30 days** for confirmed issues. We aim for faster but we're a small team — be patient if a fix needs design work.
- **Public credit** in the release notes when the fix ships, unless you'd rather stay anonymous.
- **Coordinated disclosure.** We'll work with you on a sensible reveal date so users have time to upgrade.

## What's in scope

- The desktop app (`electron/`, `src/renderer/`, the bundled installers from GitHub Releases).
- The mobile companion (`mobile/`).
- The relay infrastructure (`relay/`) and feedback worker (`feedback-worker/`, `feedback-admin/`).
- The landing site (`landing/`).

## What's out of scope

- **Third-party services** we depend on (Anthropic, GitHub, Vercel, Cloudflare). Report those upstream.
- **Issues that require the attacker to already own the local machine.** A locally-stored API key being readable by an attacker who has shell access is the user's OS doing what an OS does.
- **Social-engineering attacks** against contributors or users (phishing, etc.).
- **Vulnerabilities in unsupported / older versions.** Upgrade first.

## Hall of fame

Once we receive our first valid report, contributors who responsibly disclose vulnerabilities will be credited here (with their permission).
