# Remote Companion — Plan 2 Smoke Test

Manual end-to-end validation of the **Cloudflare relay + remote-mode fallback**. Run on real devices on the branch `remote-companion-plan-2` before merging.

Prerequisites — everything from Plan 1 already smoke-tested and working:
- v2 pairing (QR → SAS → remote consent → session)
- E2E-encrypted LAN traffic
- Upstream phone chat landing in desktop chat store

## Prerequisites

- Desktop and phone on the same Wi-Fi for initial pairing. After pairing, you'll move the phone off-network to verify relay fallback.
- Branch `remote-companion-plan-2` checked out with deps installed.
- Relay deployed to `https://the-office-relay-staging.shahar061.workers.dev` (already done by Task 5). `curl /healthz` should return `ok`.

## Steps

### 1. Pair on LAN with remote allowed

```bash
cd /path/to/the-office && git checkout remote-companion-plan-2
npm install --legacy-peer-deps
npm run dev
```

Open Settings → Integrations → Mobile Pairing → **Generate pairing QR**.

On the phone, launch the mobile app (from the same branch). Walk the v2 pair flow.

- [ ] **Tap "Allow remote" on the phone's RemoteConsent screen.** (Task 10 fallback only kicks in if this flag is true on the stored device.)
- [ ] Desktop shows the paired device. Settings subsection lists it.
- [ ] Phone lands on SessionScreen with connection status reading `Connected · LAN`.

### 2. Verify outbound relay WS is open on desktop

Open the Electron main-process console (DevTools → Console in the main window, or stdout where `npm run dev` runs). You should see:

- [ ] No errors about RelayConnection construction.
- [ ] A log line indicating the relay client connected (from `RelayClient` emits).

Alternatively, on the relay dashboard (`dash.cloudflare.com` → Workers → `the-office-relay-staging`) → **Logs** tab → tail realtime. You should see one `GET /s/<sid>` → 101 when the desktop's RelayConnection starts.

### 3. Token refresh lands

After pairing, the desktop immediately mints and sends a 24h phone relay token via encrypted `ctrl:tokenRefresh`. The mobile app catches it in `SessionScreen`'s message handler and persists to `expo-secure-store`.

On the phone, if you have access to dev tools (React Native debugger or Expo Dev Menu), verify the stored device now has a `relayToken` field. If you can't introspect secure-store directly, just proceed — the next step validates that the token was received.

### 4. Relay fallback — move phone off LAN

Kill the Wi-Fi on the phone, or put it on a different network (cellular, guest Wi-Fi). The LAN WebSocket heartbeat will start failing.

- [ ] Within ~45 seconds (missed heartbeats) the phone's connection banner should transition from `Connected · LAN` → `Connecting…`.
- [ ] After the `LAN_FIRST_TIMEOUT_MS` (10s) since LAN loss, the `CompositeTransport` starts the `RelayWsTransport`.
- [ ] Banner flips to `Connected · Remote` (the `mode` field on `TransportStatus` is `'relay'`).

Watch for:
- [ ] No red-box errors on the phone.
- [ ] Agent events (if an agent is running) resume streaming to the phone over the relay.

### 5. Upstream chat over relay

On the phone (still remote), type a message in the chat composer at the bottom of SessionScreen → Send.

- [ ] Phone shows the message send without error (pending ack logic from Plan 1 Task 19 is LAN-only in v1 — on relay, the phone just assumes success; the message echoes back via `chatFeed` shortly).
- [ ] Desktop chat UI shows the message with `role: user`.
- [ ] Phone's chat feed echoes the message back via the encrypted relay path.

### 6. Desktop restart while phone is remote

Close the desktop app. Watch the phone's connection status.

- [ ] Within ~45s the phone's status flips to `Disconnected: socket-close` or similar.
- [ ] Relay connection tears down cleanly (no hung sockets — check `dash.cloudflare.com` DO Logs).

Relaunch desktop.

- [ ] Desktop's RelayConnection reopens on startup.
- [ ] Phone reconnects via relay within ~30s (backoff applies).
- [ ] Fresh snapshot replays.

### 7. Phone comes home to LAN

Reconnect the phone to the same Wi-Fi as the desktop.

**Known v1 behavior:** `CompositeTransport` is **strict mutually exclusive** — once relay is authoritative, it stays that way until the app is restarted. If you want to verify LAN is reachable, close and reopen the mobile app. On fresh launch, LAN tries first and wins.

- [ ] After app restart, status reads `Connected · LAN` again.
- [ ] All normal LAN behavior (chat, events) works.

### 8. Revoke

In Settings on the desktop, revoke the paired device.

- [ ] Phone's relay connection closes (DO receives `/revoke` and tears down).
- [ ] Mobile app returns to Welcome screen.
- [ ] Secure-store is wiped.

Re-pairing works end-to-end, same as Plan 1's flow.

## Known follow-ups (not blockers for smoke)

1. **`PerConnectionQueue` is not yet wired** into `event-forwarder` / `ws-server`. The utility lands with tests in Task 13 commit `17a9982`, but integration is deferred. No observable effect unless the phone is on a very slow link during a burst.
2. **Chat ack on relay path is not implemented.** The phone assumes success when sending chat over relay. Implementing `chatAck` over the relay requires the desktop's `handleUpstreamChat` to also route via `RelayConnection.sendMessage`. Small follow-up.
3. **CompositeTransport is strict mutually exclusive.** No automatic LAN recovery after relay takes over — user must restart the app. Acceptable for v1; the 5-second overlap dedup the spec described is punted to a future revision.
4. **No WebSocket-layer integration tests for the DO.** The DO's auth gate is covered by 5 unit tests, but the actual forwarding path is only validated via this manual smoke test. `@cloudflare/vitest-pool-workers` setup is available if automated coverage is wanted later.

## If any step fails

Record under **Notes** below with the step number and what happened. Most likely causes:
- Relay token expired (24h) and wasn't refreshed because the phone hasn't been in a LAN session recently. Re-pair or just re-connect on LAN to get a fresh token.
- Cloudflare dashboard → DO → "No bindings" — means the free-plan SQLite migration wasn't applied. Redeploy from `relay/` with `npm run deploy:staging`.
- Phone → relay connection fails with 401 — means the token is invalid or the `pairSignPub` the desktop registered doesn't match. Check `X-PairSign-Pub` header is set.

## Notes from test run

_(fill in during your test)_

- **Tested on:** _device / simulator / date_
- **Desktop OS:** _macOS 25.4 / etc._
- **Mobile OS:** _iOS 18 / Android 14_
- **Findings:** _pass/fail per section_
