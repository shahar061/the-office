# Changelog

All notable changes to **The Office** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While we're in pre-1.0, expect some churn — breaking changes will be called out explicitly in the version notes.

## [Unreleased]

### Added
- Marketing landing page deployed at <https://landing-alpha-cyan.vercel.app>: 6-locale i18n (en/he/es/it/pt/de), real screenshots and a hero clip, OS-aware download buttons that link directly to the latest GitHub Release assets.
- Landing analytics via Vercel Web Analytics — privacy-friendly, no cookies, no PII.
- `dev-jump` mock scenarios for every agent role (CEO, PM, Market Researcher, UI/UX Expert, Chief Architect, Project Manager, Team Lead, all six engineering roles). Interactive agents now ask user questions in mock mode; autonomous agents play through Read/Write/Edit/Bash patterns. Build phase mock includes a 12-task fixture across 4 phases for kanban demos.

### Fixed
- `tasks.yaml` fixture rewritten to match the format the build orchestrator parses (snake_case `assigned_agent` + `depends_on`, nested by phase).
- Landing dictionary type narrowed so production builds typecheck cleanly.

## [0.1.1] – 2026-05-04

### Added
- Custom pixel-art app icon (`build/icon.png`) — chunky pixel-art office building with three silhouetted agents inside a lit boardroom window, on a deep night-purple squircle. `electron-builder` auto-derives `.icns` and `.ico` from this single PNG.

### Fixed
- Removed the npm `directories` field from `package.json` that conflicted with `electron-builder`'s own `directories` config and broke the v0.1.0 release pipeline.
- Lockfile sync for `electron-builder` so `npm ci` succeeds in CI.

## [0.1.0] – 2026-05-04

First public beta release.

### Added
- **GitHub Actions release pipeline** that builds installers for macOS, Windows, and Linux on tag push. Outputs `.dmg` (x64 + arm64), `.zip`, `.exe` (NSIS), and `.AppImage`. Uploads to a draft GitHub Release.
- **`electron-builder.yml` config** for cross-platform packaging, output to `release/`, GitHub draft publish.
- **README sections** for building installers locally and cutting a release.

### Known limitations
- All installers are **unsigned** in v0.1.x. macOS users see a Gatekeeper warning ("right-click → Open" the first time). Windows users see SmartScreen ("More info → Run anyway"). Code signing is on the roadmap.
- Auto-update via `electron-updater` is **not yet wired** — users currently re-download installers manually for new versions.
- Mobile companion app (`mobile/`) is functional but UX is rough; pairing flow and polish are coming.

[Unreleased]: https://github.com/shahar061/the-office/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/shahar061/the-office/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/shahar061/the-office/releases/tag/v0.1.0
