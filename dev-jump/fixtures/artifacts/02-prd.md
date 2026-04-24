<!-- last-reviewed: 2026-04-24 -->
# PRD — Habit Streak Tracker

## Overview
A single-habit tracking app with a focus on streak momentum. See vision brief for goals.

## User flows
1. **First run:** user picks a habit name (text input) → lands on dashboard with streak counter at 0.
2. **Daily check-in:** dashboard shows today's check-in button; pressing it increments streak and logs timestamp.
3. **Settings:** rename habit, reset streak, toggle reminder time.

## Functional requirements
- User can create exactly one habit (renaming allowed).
- Check-in is allowed once per local day.
- Streak is the count of consecutive days checked in.
- Missing a day resets the streak to 0 (strict mode). A setting toggles to lenient mode (one grace day per week).
- Local reminder notification at a user-chosen time.

## Non-functional
- Works offline. All state local.
- No account required for v1.
- Target platforms: iOS and Android via cross-platform framework.

## Metrics
- Daily active users.
- Average streak length.
- Retention at day 7 and day 30.
