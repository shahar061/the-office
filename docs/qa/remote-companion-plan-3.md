# Remote Companion — Plan 3 Smoke Test

Manual end-to-end validation of the **UI refresh**: top-level Mobile tab in Settings, HeaderStatusPill + popover in the main window, inline-rename/remote-toggle/revoke on device cards, and the v1 re-pair banner.

Prerequisites:
- Plan 1 (v2 pairing) and Plan 2 (relay) already merged. Paired devices can pair + authenticate + chat.
- Branch `remote-companion-plan-3` checked out with deps installed.

## Steps

### 1. Launch

```bash
cd /path/to/the-office && git checkout remote-companion-plan-3
npm install --legacy-peer-deps
npm run dev
```

- [ ] App launches. No console errors related to this branch (pre-existing unrelated TS errors in `OfficeScene.ts` etc. are OK).
- [ ] The **HeaderStatusPill** appears in the top-right corner of the main window. With no devices paired, it reads `📱 Pair a phone` with a muted outline.

### 2. Settings → Mobile (top-level tab)

Open Settings. Observe the sidebar:

- [ ] Nav items are: **General, Agents, Workspace, Mobile, Integrations, About** — Mobile is between Workspace and Integrations.
- [ ] **Integrations** tab no longer contains the old Mobile Pairing subsection — instead shows a dashed-border note: *"Mobile pairing moved to its own tab — check the Mobile section in the sidebar."*
- [ ] Click **Mobile** → the new MobileSection renders:
  - Header: *"Mobile Companion"* + subtitle *"Pair your phone to watch agents run and reply on the go."*
  - A **Pair a phone** primary button.
  - Empty state card: *"📱 Get agent updates on your phone."*
  - Relay status footer: `● Relay disabled (no remote devices)` in muted gray.

### 3. Pair a phone

Click **Pair a phone**.

- [ ] The inline **PairingView** renders: QR code on the left, instruction text + countdown on the right, Cancel button.
- [ ] Countdown ticks down from 5:00 once a second.
- [ ] On the mobile app, scan the QR. Phone advances through SAS → RemoteConsent → Session.
- [ ] As soon as the phone scans, **PairingView** shows the SAS code in a purple-bordered block between the instructions and the countdown.
- [ ] **Tap "Allow remote" on the phone.**

Back on the desktop:

- [ ] PairingView dismisses (or the user manually hits Cancel after pairing succeeds).
- [ ] The **Paired devices (1)** section appears with a single **DeviceCard**:
  - Phone icon + editable name
  - Status dot + text: `● Active now · LAN`
  - Right side: `☑ Remote access` checkbox (checked), `Revoke…` link (red)
- [ ] Relay status footer flips to `● Relay ready` (green).

### 4. HeaderStatusPill + popover

Close Settings. Look at the pill top-right.

- [ ] Pill now reads `● iPhone · LAN` with a green dot.
- [ ] Click the pill → a popover opens immediately below (width ~320px).
- [ ] Popover contents (in order):
  - Device row: green dot + `iPhone` + `LAN` on the right
  - Thin divider
  - `⏸ Pause remote access` button
  - `Pair another phone` link
  - `Manage in Settings…` link
- [ ] Click outside the popover → it closes.

### 5. Pause remote access

Open the popover again. Click **Pause remote access**.

- [ ] Background tints indigo; label changes to `⏸ Remote access paused`.
- [ ] Relay status in Settings flips to `⏸ Relay paused` (indigo).
- [ ] On the desktop (check main-process log or DevTools), the RelayConnection for this device stops.

Click again to resume.

- [ ] Label flips back to `⏸ Pause remote access`.
- [ ] Relay status back to `● Relay ready`.

### 6. Pair-another link

With 1 device already paired, click **Pair another phone** in the popover.

- [ ] Popover closes, Settings opens on the **Mobile** tab.
- [ ] A new QR is generated automatically (PairingView visible).

Cancel the new pairing; don't actually pair a second phone.

### 7. Device list actions

Back in the Mobile tab.

**Rename:** click the device name → inline edit → change to "Work iPhone" → Tab/Enter/blur.

- [ ] Name updates immediately in the card.
- [ ] Pill text flips to `● Work iPhone · LAN`.

**Remote toggle:** uncheck the `Remote access` checkbox.

- [ ] Relay connection for this device stops (check logs or curl the relay).
- [ ] Pill mode flips to `● Work iPhone · Idle` if the phone loses network in the meantime (otherwise stays `LAN`).
- [ ] Re-check the box → relay reconnects.

**Revoke:** click `Revoke…`.

- [ ] Browser `confirm()` dialog: *"Revoke this phone? It will stop receiving updates. You can re-pair anytime."*
- [ ] Click OK. Device disappears from the list. Pill flips to `📱 Pair a phone`. Mobile app returns to Welcome.

### 8. v1 migration banner

This is hard to trigger without rolling back to v1. To test:
1. Stop the desktop app.
2. Manually edit the settings JSON at `~/Library/Application Support/the-office/settings.json` (or platform equivalent) to add a `devices[]` entry with only v1 fields (`deviceId`, `deviceName`, `deviceTokenHash`, `pairedAt`, `lastSeenAt` — no `phoneIdentityPub`).
3. Restart the app.
4. Open Settings → Mobile.

- [ ] Orange **"Action required"** banner appears at the top of MobileSection saying the phone needs to re-pair.
- [ ] After clearing the synthetic v1 record via Revoke (or pairing a new phone fresh), the banner disappears.

Skip this step if you don't want to hand-edit settings.

### 9. Multi-device test (optional)

Pair a second phone. Confirm:

- [ ] Pill shows `📱 2 phones · LAN+Remote` (or whatever combination of modes).
- [ ] Popover lists both devices with their individual mode dots.
- [ ] DeviceCard list in Settings shows both cards.

### 10. Close + reopen app

Close the desktop app. Relaunch.

- [ ] Pill shows the currently-paired device's status after a short hydration delay (the bridge refreshes on mount via App.tsx's useEffect).
- [ ] Mobile tab remembers the paired device list.

## Known follow-ups (not blockers)

1. **PairingView auto-dismiss after pair success** — currently the QR view stays until the user clicks Cancel. Could auto-dismiss on successful pair. Small polish.
2. **Pause timed options** — plan mentioned a "Pause until…" timed choice (30 min, 1h, indefinite). We shipped only indefinite (`Number.MAX_SAFE_INTEGER`). A dropdown with preset durations is a small follow-up.
3. **Location hint on DeviceCard** — the plan's original DeviceCard mockup included location like `Tel Aviv` in the last-seen line. The MobileBridge's `getStatus()` doesn't expose IP-geolocation yet. Out of scope for this plan.
4. **Relay dashboard integration** — no way from the UI to view relay analytics. Out of scope.

## If any step fails

Record under **Notes** below with the step number.

## Notes from test run

_(fill in during your test)_

- **Tested on:** _device / simulator / date_
- **Desktop OS:** _macOS 25.4 / etc._
- **Mobile OS:** _iOS 18 / Android 14_
- **Findings:** _pass/fail per section_
