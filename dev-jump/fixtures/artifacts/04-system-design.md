<!-- last-reviewed: 2026-04-24 -->
# System Design — Habit Streak Tracker

## Architecture
Local-first mobile app. No backend for v1.

- **Client:** cross-platform framework (React Native or Flutter — decided during warroom).
- **Persistence:** local SQLite with a single `habit` row and a `check_ins` table.
- **Notifications:** platform-native scheduled notifications.

## Data model
- `habit(id, name, created_at, reminder_time, mode)` — exactly one row.
- `check_ins(id, habit_id, date, created_at)` — unique on (habit_id, date).

## Key decisions
- Single habit limit enforced at the data layer (`id = 1` only).
- Streak computed on read from `check_ins` — no materialized column.
- Grace-day logic evaluates the past 7 days, allows one gap.

## Out of scope
- Cloud sync (future).
- Multi-user (future).
