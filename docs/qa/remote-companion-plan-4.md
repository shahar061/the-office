# Remote Companion — Plan 4 Smoke Test

Manual end-to-end validation of **relay-based pairing as default**. LAN-direct pairing becomes opt-in (user types their desktop's IP in Settings → Mobile → Advanced).

Prerequisites:
- Plans 1, 2, 3 already merged to main.
- Branch `remote-companion-plan-4` checked out with deps installed.
- Relay staging deployed at `wss://the-office-relay-staging.shahar061.workers.dev` (Task 4 already confirmed this with curl smoke tests).

## Steps

### 1. Launch

```bash
cd /path/to/the-office && git checkout remote-companion-plan-4
npm install --legacy-peer-deps
npm run dev
```

- [ ] App launches. Settings → **Mobile** tab renders.
- [ ] Scroll to the bottom. A `<details>` element labeled **"Advanced: LAN direct connection"** is present.
- [ ] Expand it. The text input is empty by default.

### 2. Relay pairing (default — no LAN configured)

Leave the LAN host field empty. Click **Pair a phone**.

- [ ] QR renders.
- [ ] Decode the QR (any QR reader, or `console.log` in DevTools). The payload is:
  - `v: 3`
  - `mode: 'relay'`
  - `roomId: "<22-char base64url>"`
  - `desktopIdentityPub: "<base64>"`
  - `pairingToken: "<base64url>"`
  - `expiresAt: <unix-ms>`
  - `host` and `port` are **absent**

Check the desktop main-process console (the terminal running `npm run dev`):

- [ ] A log or no-error indicates a `RendezvousClient` connected to `wss://the-office-relay-staging.shahar061.workers.dev/pair/<roomId>?role=host&token=...`. (Optional: check the Cloudflare dashboard → Workers → Live Logs → `the-office-relay-staging` → you should see the upgrade request.)

On the mobile app:

```bash
cd mobile && npm run ios    # or npm run android
```

- [ ] App loads, Welcome screen.
- [ ] Tap **Start pairing**, grant camera, scan the desktop's QR.
- [ ] Phone transitions to the **SAS confirmation** screen.
- [ ] The SAS code matches what's shown on the desktop (green purple-bordered box under the QR).
- [ ] Tap **Codes match** on the phone.
- [ ] Phone transitions to **Remote access** consent. Tap **Allow remote**.
- [ ] Phone receives encrypted `paired` via the relay, saves credentials, advances to SessionScreen.
- [ ] Desktop's Mobile tab now shows the paired device.

### 3. Relay-only session

After pairing succeeds, immediately:

- [ ] Phone's connection banner reads `● Connected · Remote` (not LAN), because `host === ''` in the stored credentials.
- [ ] `CompositeTransport` skips LAN and goes straight to relay (no 10s LAN timeout — the null-LAN branch from Task 9).
- [ ] Chat composer works; messages travel desktop → relay → phone via `chatFeed`.

### 4. LAN pairing (opt-in — lanHost configured)

In Settings → Mobile → Advanced: type your Mac's WiFi IP (`192.168.1.42` or whatever `ipconfig getifaddr en0` returns). Blur the input.

- [ ] Store refreshes; the field retains the value on the next open.

Revoke the currently paired phone. Generate a fresh QR.

- [ ] QR now has `mode: 'lan-direct'` and `host`/`port` populated.
- [ ] RendezvousClient is still active on the desktop side (hosts both modes simultaneously — v3 lan-direct still includes the roomId).

On the phone, scan. Since v3 lan-direct mode is present with host/port, the phone tries **LAN first** (falls back to relay if LAN fails within 10s).

- [ ] If on the same WiFi: pairing happens over LAN (direct WebSocket), not the relay.
- [ ] Phone's banner reads `● Connected · LAN`.

### 5. LAN fallback to relay

Keep lanHost configured but **kill Wi-Fi on the phone** before scanning. Scan the QR.

- [ ] LAN WS fails within 10s.
- [ ] Phone falls back to relay rendezvous path automatically.
- [ ] Pairing completes over relay. `device.host` is stored with the LAN IP (even though it's currently unreachable) — later sessions will attempt LAN first if reachable.

### 6. Revoke + re-pair cycle

- [ ] Revoke on desktop → phone returns to Welcome.
- [ ] Clear lanHost field → next QR is relay-only again.
- [ ] Re-pair via relay → succeeds.

### 7. Existing paired devices (regression check)

If you have any devices paired from Plan 2 or 3 (before Plan 4), launch the app.

- [ ] They continue to work for post-pair reconnects (Plan 2's `RelayConnection` + session DO path, unchanged).
- [ ] Revoking + re-pairing them now uses the v3 flow with relay default.

## Known follow-ups (not blockers)

1. `CompositeTransport`'s null-LAN branch has no explicit unit test. Safe to add later.
2. Rendezvous envelope heuristic (`parsed.type === undefined` → treat as encrypted) is brittle if new frame shapes are added. A future cleanup would wrap ALL rendezvous frames in a consistent outer type marker.
3. `mode: 'lan-direct'` + no host/port in v3 is validated as malformed. If a desktop ever emits such a payload, the phone rejects it cleanly.
4. The Rendezvous connection is short-lived — once pairing completes, it closes. No keepalive is needed.

## Notes from test run

_(fill in during your test)_

- **Tested on:** _device / simulator / date_
- **Desktop OS:**
- **Mobile OS:**
- **Findings:**
