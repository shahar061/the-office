<!-- last-reviewed: 2026-04-24 -->
# UI Designs — Habit Streak Tracker

## Design Direction
A calming, low-chrome mobile design. Large streak counter as the visual anchor. Single primary action per screen. Palette: warm neutrals with a single accent color tied to the habit.

### 1. Home (daily check-in)
File: ./01-home.html

The primary screen. Shows the habit name, the streak count in large type, and a single check-in button. If already checked in today, the button shows a confirmation state.

### 2. Dashboard (history view)
File: ./02-dashboard.html

A monthly grid of check-ins. Days are circles — filled if checked in, empty if missed. Tapping a circle shows the date; no edit.

### 3. Settings
File: ./03-settings.html

Rename habit, reset streak, pick reminder time, toggle strict/lenient mode.
