# Remote Companion — Plan 1 Smoke Test

Manual end-to-end validation of the v2 E2E-encrypted pairing + chat flow landed in Plan 1. **Run on real devices** (or iOS Simulator / Android emulator + Electron on the same machine) before merging the branch.

## Prerequisites

- Desktop machine on the same Wi-Fi as the test phone (or running the mobile app on a simulator on the same machine).
- Both apps built from branch `remote-companion-plan-1`.

## Steps

### 1. Start desktop

```bash
cd /path/to/the-office
git checkout remote-companion-plan-1
npm run dev
```

Open Settings → Integrations → **Mobile Pairing**.

- [ ] Settings panel opens without console errors.
- [ ] If you had any **v1-paired** devices from a previous session, the orange **"Action required"** banner appears at the top of the Mobile Pairing section asking you to re-pair.

### 2. Generate pairing QR

Click **Generate pairing QR** in the Mobile Pairing subsection.

- [ ] QR renders.
- [ ] QR payload (decode with any QR reader or the "Paste payload" flow on the phone) contains `v: 2` and a `desktopIdentityPub` base64 field.
- [ ] No SAS is displayed yet — only after a phone scans.

### 3. Start mobile

```bash
cd mobile && npm start
```

Press `i` (iOS Simulator) or `a` (Android emulator), or scan the Expo Go QR on a physical device.

- [ ] App loads without redbox errors.
- [ ] **Welcome** screen shown (no previously-paired device).
  - If you had a v1 pairing cached, you should land on Welcome (not Session) — the secure-store schema change forces a re-pair.

### 4. Pair

Tap **Start pairing** → grant camera permission → point at the desktop's QR.

- [ ] Phone advances to the **SasConfirmScreen** showing a 6-digit code (formatted `XXX XXX`).
- [ ] Desktop's Mobile Pairing section shows the **same 6-digit code** in a purple-bordered block beneath the QR.
- [ ] Tap **Codes match** on the phone.
- [ ] Phone advances to **RemoteConsentScreen**.
- [ ] Tap **Allow remote** on the phone.
- [ ] Phone transitions to **SessionScreen** with the connection banner reading `Connected`.
- [ ] Desktop's device list shows the phone with today's timestamp, and the orange migration banner (if shown) disappears.

### 5. Chat round-trip

On the desktop, start any session (/imagine or /build).

- [ ] Agent events stream to the phone's WebView (the live pixel office + chat).
- [ ] Type `test from phone` in the phone's composer at the bottom → tap **Send**.
- [ ] The message appears in the desktop chat UI with `role: user`.
- [ ] No error alerts on the phone (the chatAck is implicit — the phone just clears the input on success).

### 6. Restart cycle

Close both apps. Relaunch the desktop (`npm run dev`), then relaunch the mobile app.

- [ ] Phone loads straight into SessionScreen (not Welcome) — pairing persisted.
- [ ] Connection banner transitions from `Connecting…` → `Connected`.
- [ ] A fresh snapshot replays current session state.

### 7. Revoke

In desktop Settings, click **Revoke** on the paired phone.

- [ ] Desktop removes the device from the list.
- [ ] Phone's connection banner flips to `Disconnected: revoked`, then the app returns to the Welcome screen.
- [ ] Phone's secure-store is cleared (verify by relaunching the mobile app — lands on Welcome).

## Known issues / non-blockers

- The `pairConfirm` → `pairRemoteConsent` server-side flow relies on the user taking >~100ms to tap "Allow remote" because `scryptAsync` is still running on the desktop when pairConfirm arrives. A scripted client racing through the flow faster than that could hit a silent teardown. Real humans tap in hundreds of milliseconds, so this isn't a practical concern yet.
- `transport.interface.ts` now types the `message` event as `MobileMessageV2`; the old union `MobileMessage` (v1) still exists in `shared/types/mobile.ts` for backward-compat with callers that haven't migrated. Safe to remove in a follow-up once the codebase has been swept.
- `broadcastToAuthenticated` is now O(N) in the number of connected phones (per-connection encryption). Acceptable for 1–2 phones; revisit if multi-phone setups become common.
- Alert copy on pairing failures surfaces the raw `authFailed.reason` enum (e.g. `unknownDevice`, `sasAbort`, `revoked`). A friendlier mapping is a Plan-3 polish task.

## If any step fails

Record the failure under **Notes** below with the step number and what happened. Then either:
1. Open a fix commit on `remote-companion-plan-1` with the repro + fix.
2. Or revert a specific commit from the chain if the regression is clear.

## Notes from test run

_(fill in during your test)_

- **Tested on:** _device name / simulator / date_
- **Desktop OS:** _macOS 25.4 / etc._
- **Mobile OS:** _iOS 18 / Android 14 / etc._
- **Findings:** _pass/fail per section_
