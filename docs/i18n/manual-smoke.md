# Hebrew & RTL Manual Smoke Checklist

Run through this whenever you change anything related to i18n, settings, or a core-path component.

## Setup
- [ ] Launch app: `npm run dev`
- [ ] Open Settings → Language → confirm both "English" and "עברית" radios are visible
- [ ] Note the current language (en / he) — start with en for the baseline pass.

## English baseline pass
- [ ] Project picker reads "Open Project", layout LTR, "Recent Projects" header on the same line
- [ ] Icon rail tooltips read English (Chat, Office, Agents, etc.)
- [ ] Phase tabs read "Imagine | War Room | Build | Complete" left-to-right
- [ ] Chat input placeholder reads "Type a message..."
- [ ] Toggle to Hebrew → layout flips, no app restart needed.

## Hebrew chrome pass
- [ ] `<html dir>` in DevTools shows `rtl`, `lang="he"`
- [ ] Project picker reads "פתח פרויקט", layout RTL, "פתח" button alignment flipped
- [ ] Icon rail is on the right side of the screen; tooltips appear to the left of icons
- [ ] Phase tabs read right-to-left (Imagine on the right)
- [ ] Chat input placeholder reads "הקלד הודעה..."
- [ ] Send button (↑) is on the left side of the input
- [ ] Empty state title is "המשרד"
- [ ] Build intro CTA reads "התחל בנייה"

## Hebrew agent pass (real-mode dev-jump)
- [ ] `npm run dev:jump imagine.ui-ux-expert`
- [ ] Open `~/office-dev-project` in the app, press Start
- [ ] CEO greets in Hebrew — chat panel shows Hebrew text aligned RTL
- [ ] Vision-brief written to `docs/office/01-vision-brief.md` is in Hebrew (cat the file)
- [ ] AskUserQuestion options are in Hebrew, with "מומלץ" badge on recommended
- [ ] UI Design Review overlay title reads "עיצובי ממשק — סקירה"; "אישור" approve button

## Hebrew mock-mode pass
- [ ] `npm run dev:jump imagine.ui-ux-expert --mock`
- [ ] Open project in app, press Start
- [ ] Mock scenario fires UI/UX choreography
- [ ] Tool bubbles appear on the LEFT of the character (mirrored from LTR's right)
- [ ] Character popup (click character) anchors upper-LEFT (mirrored)

## Mid-session switch
- [ ] Start a phase in Hebrew → mid-imagine, switch to English in Settings
- [ ] Chrome flips immediately (English labels)
- [ ] Currently running agent finishes in Hebrew (its prompt was Hebrew)
- [ ] Next agent starts in English (orchestrator re-reads OFFICE_LANGUAGE)

## Persistence
- [ ] Set Hebrew, close app, reopen → starts in Hebrew (settings persisted)
- [ ] Set English, close, reopen → starts in English

## Edge cases
- [ ] DevJump panel (with `OFFICE_DEV=1`) stays English even in Hebrew mode (correct by design)
- [ ] Hebrew text bubble with embedded English file path (`01-vision-brief.md`) — file path renders LTR within the RTL paragraph (browser bidi)
- [ ] Audit-only panels (AgentsScreen, StatsPanel, LogViewer, AboutPanel, WorkshopPanel, DiffPanel) layout-mirror correctly under RTL but their strings remain English
