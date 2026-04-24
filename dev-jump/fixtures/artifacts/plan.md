<!-- last-reviewed: 2026-04-24 -->
# Build Plan — Habit Streak Tracker

## Phase 1: Foundation
- Scaffold cross-platform project (React Native).
- Set up SQLite persistence layer.
- Build habit-entity data model and migration.

## Phase 2: Check-in flow
- Home screen with habit name and streak counter.
- Check-in button with once-per-day guard.
- Streak computation from check_ins table.

## Phase 3: History & settings
- Dashboard grid view of monthly check-ins.
- Settings screen (rename, reset, reminder time, mode toggle).
- Local notification scheduling.

## Milestones
- M1: skeleton project compiles and runs.
- M2: daily check-in flow works end-to-end.
- M3: history and settings complete.

## Risks
- Platform notification APIs diverge between iOS and Android — allocate a day for parity.
