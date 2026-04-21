# Cross-Phase Chat History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-tab phase switcher (Imagine / War Room / Build / Complete) to both desktop and mobile chat views so users can browse any phase's history; past phases are read-only; the UI auto-follows on phase transitions when the user was following live.

**Architecture:** Shared protocol gets two additive message types (`getPhaseHistory` / `phaseHistory`) for the phone to pull past-phase history through the existing relay/LAN. Desktop reuses its in-process `chatHistoryStore.getPhaseHistory(phase)`. Both platforms gain a `viewedPhase` UI state distinct from `currentPhase`, a per-phase unread-tracker, and a read-only mode with a "return to current" banner. No protocol version bump.

**Tech Stack:** TypeScript, Electron (main + renderer), Expo (React Native shell) + WebView, Vite for mobile-renderer bundling, Vitest for desktop/shared tests, Jest for mobile shell tests, @testing-library for component tests.

**Spec:** `docs/superpowers/specs/2026-04-21-cross-phase-history-design.md`

---

## File Structure

**Shared protocol:**
- Modify: `shared/types/mobile.ts` — add two types to `MobileMessageV2`.
- Modify: `shared/protocol/mobile.ts` — add entries to `VALID_V2_TYPES`.
- Modify: `shared/stores/session.store.ts` — add `viewedPhase`, `phaseHistoryCache`, `lastVisitedAtByPhase`, auto-follow behavior.
- Test: `shared/stores/__tests__/session.store.test.ts` — extend.

**Desktop main process:**
- Modify: `electron/ipc/state.ts` — expose `getPhaseHistoryForMobile(phase)`.
- Modify: `electron/mobile-bridge/index.ts` — add `onPhoneGetPhaseHistory(handler)` registration + LAN/relay routing for `getPhaseHistory`.
- Modify: `electron/mobile-bridge/ws-server.ts` — route LAN `getPhaseHistory` to handler.
- Modify: `electron/main.ts` — register the handler that calls the helper and sends `phaseHistory` back.
- Test: `electron/mobile-bridge/__tests__/phase-history.test.ts` (new).

**Desktop renderer:**
- Modify: `src/renderer/src/stores/chat.store.ts` — add `viewedPhase`, `lastVisitedAtByPhase`, `pastPhaseHistoryCache`, related actions.
- Create: `src/renderer/src/components/OfficeView/PhaseTabs.tsx` — tab strip component.
- Modify: `src/renderer/src/components/OfficeView/ChatPanel.tsx` — integrate tabs, branch live/past, input disable.
- Test: `tests/renderer/chat-store-phase.test.ts` (new) — extend or new file for the new store behavior.
- Test: `tests/renderer/PhaseTabs.test.tsx` (new).

**Mobile shell (Expo):**
- Modify: `mobile/src/session/useSession.ts` — add `requestPhaseHistory` method + response routing.
- Modify: `mobile/src/webview-host/WebViewHost.tsx` — route webview→shell `requestPhaseHistory` messages; forward `phaseHistoryCache` updates into the webview.
- Modify: `mobile/src/session/SessionScreen.tsx` — wire the callback.
- Test: `mobile/src/__tests__/useSession.test.ts` — extend.

**Mobile renderer (webview):**
- Create: `src/mobile-renderer/sendPhaseHistoryRequest.ts` — helper matching `sendAnswer.ts` / `emitActiveTab.ts` shape.
- Create: `src/mobile-renderer/PhaseTabs.tsx` — webview-styled tab strip.
- Modify: `src/mobile-renderer/ChatView.tsx` — integrate tabs, branch live/past, input disable.
- Modify: `src/mobile-renderer/bridge.ts` — receive `phaseHistory` forwards from the shell, populate shared store.
- Test: `src/mobile-renderer/__tests__/sendPhaseHistoryRequest.test.ts` (new).

**Webview bundle:**
- Regenerate `mobile/assets/webview/index.html` via `npm run build:mobile-all`.

---

## Task 1: Protocol types + validators

**Files:**
- Modify: `shared/types/mobile.ts`
- Modify: `shared/protocol/mobile.ts`
- Test: `shared/protocol/__tests__/mobile.test.ts` (new)

**Intent:** Add two new message types to the v2 union and register them in the validator. Additive only — no protocol-level behavior yet.

- [ ] **Step 1: Write the failing test**

Create `shared/protocol/__tests__/mobile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isMobileMessageV2 } from '../mobile';

describe('isMobileMessageV2 — new phase-history message types', () => {
  it('accepts getPhaseHistory messages', () => {
    expect(isMobileMessageV2({
      type: 'getPhaseHistory', v: 2, phase: 'imagine', requestId: 'r1',
    })).toBe(true);
  });

  it('accepts phaseHistory messages', () => {
    expect(isMobileMessageV2({
      type: 'phaseHistory', v: 2, requestId: 'r1', phase: 'imagine', history: [],
    })).toBe(true);
  });

  it('rejects malformed bogus types at v=2', () => {
    expect(isMobileMessageV2({
      type: 'notARealType', v: 2,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/protocol/__tests__/mobile.test.ts`
Expected: first two cases FAIL — `'getPhaseHistory'` and `'phaseHistory'` aren't in `VALID_V2_TYPES` yet.

- [ ] **Step 3: Add types to the v2 union**

Edit `shared/types/mobile.ts`. Locate `MobileMessageV2` (at the bottom of the file). Add two arms to the union:

```ts
export type MobileMessageV2 =
  // ... existing arms ...
  // Phone → Desktop
  | { type: 'getPhaseHistory'; v: 2; phase: Phase; requestId: string }
  // Desktop → Phone
  | { type: 'phaseHistory'; v: 2; requestId: string; phase: Phase; history: PhaseHistory[] };
```

Add an import near the top of the file for the types referenced:

```ts
import type { Phase, PhaseHistory } from './session';
```

Check the existing imports — if `Phase`/`PhaseHistory` are already imported, just extend the existing statement; don't duplicate.

- [ ] **Step 4: Add a v1 variant for the webview boundary**

The webview's host→webview bridge uses the v1 protocol shape (`MobileMessage`). Since Task 9 pushes `phaseHistory` into the webview via that boundary and Task 13 handles it on the receive side, add the v1 variant alongside the v2 ones so both call sites have a strictly-typed shape to work with:

```ts
export type MobileMessage =
  // ... existing v1 arms ...
  | { type: 'phaseHistory'; v: 1; requestId: string; phase: Phase; history: PhaseHistory[] };
```

- [ ] **Step 5: Add entries to the validators**

Edit `shared/protocol/mobile.ts`. Extend both `VALID_TYPES` (v1) and `VALID_V2_TYPES` (v2):

```ts
const VALID_TYPES = new Set([
  'pair', 'auth', 'paired', 'authed', 'authFailed',
  'snapshot', 'charState', 'event', 'chat', 'state', 'heartbeat',
  'phaseHistory',
]);

const VALID_V2_TYPES = new Set([
  'pair', 'pairConfirm', 'pairRemoteConsent', 'auth', 'chat', 'heartbeat',
  'paired', 'authed', 'authFailed', 'snapshot', 'charState', 'event',
  'chatFeed', 'chatAck', 'state', 'tokenRefresh',
  'getPhaseHistory', 'phaseHistory',
]);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run shared/protocol/__tests__/mobile.test.ts`
Expected: all 3 cases pass.

Full root vitest: `npx vitest run`
Expected: 767 + 3 = 770 green.

- [ ] **Step 7: Commit**

```bash
git add shared/types/mobile.ts shared/protocol/mobile.ts shared/protocol/__tests__/mobile.test.ts
git commit -m "feat(protocol): add getPhaseHistory/phaseHistory message types"
```

---

## Task 2: Desktop bridge — handler registration + routing

**Files:**
- Modify: `electron/mobile-bridge/index.ts` — add `onPhoneGetPhaseHistory(handler)` registration + invoke handler from the relay path.
- Modify: `electron/mobile-bridge/ws-server.ts` — route LAN-authenticated `getPhaseHistory` frames to the handler.
- Test: `electron/mobile-bridge/__tests__/phase-history.test.ts` (new).

**Intent:** Mirror the existing `onPhoneChat` pattern. Both LAN and relay inbound `getPhaseHistory` invoke a registered handler that returns `PhaseHistory[]`; the bridge wraps the response in a `phaseHistory` frame and sends it back on the same channel.

- [ ] **Step 1: Write the failing test**

Create `electron/mobile-bridge/__tests__/phase-history.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import { RelayConnection } from '../relay-connection';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { SendStream } from '../../../shared/crypto/secretstream';
import { encodeV2 } from '../../../shared/protocol/mobile';
import type { MobileMessageV2, PairedDevice, PhaseHistory } from '../../../shared/types';

function b64(u: Uint8Array): string { return Buffer.from(u).toString('base64'); }

function makeKeys() {
  const desktopPriv = x25519.utils.randomPrivateKey();
  const desktopPub = x25519.getPublicKey(desktopPriv);
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  const pairSignPriv = ed25519.utils.randomPrivateKey();
  const pairSignPub = ed25519.getPublicKey(pairSignPriv);
  return { desktopPriv, desktopPub, phonePriv, phonePub, pairSignPriv, pairSignPub };
}

function makeDevice(keys: ReturnType<typeof makeKeys>): PairedDevice {
  return {
    deviceId: 'd1', deviceName: 'iPhone', deviceTokenHash: 'h',
    pairedAt: 1, lastSeenAt: 1,
    phoneIdentityPub: b64(keys.phonePub),
    pairSignPriv: b64(keys.pairSignPriv),
    pairSignPub: b64(keys.pairSignPub),
    sid: 'SID', remoteAllowed: true, epoch: 1,
  };
}

describe('RelayConnection — getPhaseHistory routing', () => {
  it('invokes the registered handler and sends phaseHistory back on relay', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const stubHistory: PhaseHistory[] = [
      { agentRole: 'ceo', runs: [{ runNumber: 1, messages: [] }] },
    ];
    const handler = vi.fn().mockReturnValue(stubHistory);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });
    conn.onPhoneGetPhaseHistory(handler);

    const sent: MobileMessageV2[] = [];
    conn.on('message', () => {}); // prevent EventEmitter from erroring on unlisted
    const origSendMessage = conn.sendMessage.bind(conn);
    conn.sendMessage = (msg: MobileMessageV2) => { sent.push(msg); return origSendMessage(msg); };

    // Emit a 'connect' so streams are ready.
    const client: any = (conn as any).client;
    client.emit('connect');

    // Encrypt a getPhaseHistory frame from the phone side.
    const keysForPhone = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
    const phoneSend = new SendStream(keysForPhone.sendKey);
    function encFrame(msg: MobileMessageV2): string {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = phoneSend.encrypt(plain);
      return JSON.stringify({
        v: 2, sid: device.sid!, seq: 0, kind: 'data',
        ct: Buffer.from(ct).toString('base64'),
      });
    }
    client.emit('message', encFrame({
      type: 'getPhaseHistory', v: 2, phase: 'imagine', requestId: 'req-xyz',
    }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('imagine');
    // RelayConnection should have called sendMessage with the phaseHistory response.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: 'phaseHistory', v: 2, requestId: 'req-xyz', phase: 'imagine', history: stubHistory,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/mobile-bridge/__tests__/phase-history.test.ts`
Expected: FAIL — `conn.onPhoneGetPhaseHistory is not a function`.

- [ ] **Step 3: Implement on RelayConnection + bridge**

Edit `electron/mobile-bridge/relay-connection.ts`. Near the top-level class body, add a handler slot and public registration method:

```ts
  private phaseHistoryHandler: ((phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>) | null = null;

  onPhoneGetPhaseHistory(handler: (phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>): void {
    this.phaseHistoryHandler = handler;
  }
```

Add imports for `Phase` and `PhaseHistory` at the top if missing.

Inside `onRawFrame`, after the existing decode + decrypt that results in `msg`, and after `this.emit('message', msg, this.deviceId);`, add a branch BEFORE the emit that intercepts the request type. Actually easier: after the emit, check type and route:

```ts
  private onRawFrame(raw: string): void {
    // ... existing parse + decrypt + emit ...
    if (msg) {
      this.emit('message', msg, this.deviceId);
      if (msg.type === 'getPhaseHistory' && this.phaseHistoryHandler) {
        void (async () => {
          try {
            const history = await this.phaseHistoryHandler!(msg.phase);
            this.sendMessage({
              type: 'phaseHistory', v: 2,
              requestId: msg.requestId, phase: msg.phase, history,
            });
          } catch (err) {
            console.warn('[relay-conn]', this.deviceId, 'phase-history handler failed:', (err as Error).message);
          }
        })();
      }
    }
  }
```

This pattern means the handler is invoked only for `getPhaseHistory` messages, and the `phaseHistory` response goes out through `sendMessage` (which handles seq increment + encryption).

- [ ] **Step 4: Wire into MobileBridge interface**

Edit `electron/mobile-bridge/index.ts`. Add to the `MobileBridge` interface:

```ts
  onPhoneGetPhaseHistory(handler: (phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>): () => void;
```

In the returned object near the other `on*` methods, add:

```ts
    onPhoneGetPhaseHistory(handler) {
      phaseHistoryHandlers.add(handler);
      // Attach to every current and future relay connection.
      for (const conn of relayConnections.values()) conn.onPhoneGetPhaseHistory(handler);
      return () => {
        phaseHistoryHandlers.delete(handler);
      };
    },
```

And near the top of the `createMobileBridge` body, alongside `phoneChatHandlers`, add:

```ts
  const phaseHistoryHandlers = new Set<(phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>>();
```

Inside `syncRelayConnections` where a new `RelayConnection` is created, register the current handler(s):

```ts
  for (const h of phaseHistoryHandlers) conn.onPhoneGetPhaseHistory(h);
```

Also, in the same file, update `WsServerOptions` passed to `new WsServer({ ... })` to include `onPhoneGetPhaseHistory`:

```ts
    onPhoneGetPhaseHistory: async (phase) => {
      for (const h of phaseHistoryHandlers) {
        try { return await h(phase); }
        catch (err) { console.warn('[mobile-bridge] phase-history handler failed (lan)', err); }
      }
      return [];
    },
```

- [ ] **Step 5: Wire LAN routing in ws-server.ts**

Edit `electron/mobile-bridge/ws-server.ts`.

First, extend `WsServerOptions` (near the top of the file, in the opts type) to include:

```ts
  onPhoneGetPhaseHistory: (phase: Phase) => Promise<PhaseHistory[]>;
```

In `handleMessage` inside the `case 'authenticated':` switch arm, add a new branch alongside the existing `'chat'` handler:

```ts
      case 'authenticated':
        if (msg.type === 'chat') { await this.handleUpstreamChat(conn, msg); return; }
        if (msg.type === 'getPhaseHistory') {
          const history = await this.opts.onPhoneGetPhaseHistory(msg.phase);
          this.sendEncrypted(conn, {
            type: 'phaseHistory', v: 2,
            requestId: msg.requestId, phase: msg.phase, history,
          });
          return;
        }
        break;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run electron/mobile-bridge/__tests__/phase-history.test.ts`
Expected: PASS.

Full vitest: `npx vitest run`
Expected: 770 green (baseline 767 + 3 from Task 1 wait — plus 0 from Task 2 since test already counted).

Actually recompute: after Task 1 was 770. Task 2 adds 1 new test. So 771 green.

- [ ] **Step 7: Commit**

```bash
git add electron/mobile-bridge/relay-connection.ts electron/mobile-bridge/index.ts electron/mobile-bridge/ws-server.ts electron/mobile-bridge/__tests__/phase-history.test.ts
git commit -m "feat(mobile-bridge): route getPhaseHistory on LAN+relay to registered handler"
```

---

## Task 3: Main process wiring — state helper + handler registration

**Files:**
- Modify: `electron/ipc/state.ts` — add `getPhaseHistoryForMobile(phase)` helper.
- Modify: `electron/main.ts` — register the handler on the bridge.

**Intent:** Connect the bridge to the existing `chatHistoryStore`. One small helper + one `bridge.onPhoneGetPhaseHistory(...)` call during bridge init.

- [ ] **Step 1: Add the helper**

Edit `electron/ipc/state.ts`. After the existing helpers (alongside `sendChat`, `refreshMobileArchivedRuns`), add:

```ts
export function getPhaseHistoryForMobile(phase: Phase): PhaseHistory[] {
  if (!chatHistoryStore) return [];
  return chatHistoryStore.getPhaseHistory(phase);
}
```

Ensure `PhaseHistory` is imported in the file's imports from `'../../shared/types'` if not already (Phase probably is).

- [ ] **Step 2: Register on bridge start**

Edit `electron/main.ts`. Locate the bridge-init block (around lines 199-228):

```ts
const bridge = createMobileBridge({ ... });
await bridge.start();
setMobileBridge(bridge);
// ... existing onChange + onPhoneChat registrations ...
```

Add after `bridge.onPhoneChat(...)`:

```ts
bridge.onPhoneGetPhaseHistory((phase) => getPhaseHistoryForMobile(phase));
```

Import `getPhaseHistoryForMobile` from `./ipc/state` at the top of the file (extend the existing import line from `./ipc/state`).

- [ ] **Step 3: Manual sanity check via tests**

Run: `npx vitest run`
Expected: still 771 green — no new tests, but shouldn't regress.

TypeScript: `npx tsc --noEmit 2>&1 | grep -E "state.ts|main.ts|mobile-bridge"`
Expected: no new errors on these files.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/state.ts electron/main.ts
git commit -m "feat(main): wire chatHistoryStore to bridge getPhaseHistory handler"
```

---

## Task 4: Shared session store — `viewedPhase`, cache, auto-follow

**Files:**
- Modify: `shared/stores/session.store.ts`
- Test: `shared/stores/__tests__/session.store.test.ts`

**Intent:** Extend the mobile-renderer session store with `viewedPhase`, `phaseHistoryCache`, and the auto-follow rule. Clear on scope change (per the per-session pairing contract).

- [ ] **Step 1: Write the failing test**

Append to `shared/stores/__tests__/session.store.test.ts`:

```ts
describe('session.store — viewedPhase + phase history cache', () => {
  beforeEach(() => {
    useSessionStore.setState({
      snapshot: null,
      viewedPhase: null,
      phaseHistoryCache: {},
      lastVisitedAtByPhase: {},
    });
  });

  it('setViewedPhase updates state and records lastVisitedAt', () => {
    useSessionStore.getState().setViewedPhase('warroom');
    const state = useSessionStore.getState();
    expect(state.viewedPhase).toBe('warroom');
    expect(typeof state.lastVisitedAtByPhase.warroom).toBe('number');
  });

  it('setPhaseHistory populates the cache', () => {
    const stub = [{ agentRole: 'ceo' as const, runs: [{ runNumber: 1, messages: [] }] }];
    useSessionStore.getState().setPhaseHistory('imagine', stub);
    expect(useSessionStore.getState().phaseHistoryCache.imagine).toBe(stub);
  });

  it('auto-follows when viewedPhase equals old currentPhase in setSnapshot', () => {
    const initial = { ...BASE, phase: 'imagine' as const, sessionActive: true, sessionId: 's' };
    useSessionStore.getState().setSnapshot(initial);
    useSessionStore.getState().setViewedPhase('imagine');

    const next = { ...BASE, phase: 'warroom' as const, sessionActive: true, sessionId: 's' };
    useSessionStore.getState().setSnapshot(next);
    expect(useSessionStore.getState().viewedPhase).toBe('warroom');
  });

  it('does NOT auto-follow when viewedPhase was already a past phase', () => {
    const initial = { ...BASE, phase: 'warroom' as const, sessionActive: true, sessionId: 's' };
    useSessionStore.getState().setSnapshot(initial);
    useSessionStore.getState().setViewedPhase('imagine'); // user browsing past

    const next = { ...BASE, phase: 'build' as const, sessionActive: true, sessionId: 's' };
    useSessionStore.getState().setSnapshot(next);
    expect(useSessionStore.getState().viewedPhase).toBe('imagine');
  });

  it('clears viewedPhase + phaseHistoryCache when snapshot flips to sessionActive=false', () => {
    const initial = { ...BASE, phase: 'warroom' as const, sessionActive: true, sessionId: 's' };
    useSessionStore.getState().setSnapshot(initial);
    useSessionStore.getState().setViewedPhase('imagine');
    useSessionStore.getState().setPhaseHistory('imagine', []);

    const idle = { ...BASE, phase: 'idle' as const, sessionActive: false, sessionId: null };
    useSessionStore.getState().setSnapshot(idle);
    const state = useSessionStore.getState();
    expect(state.viewedPhase).toBeNull();
    expect(state.phaseHistoryCache).toEqual({});
    expect(state.lastVisitedAtByPhase).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: first test fails — `setViewedPhase is not a function`.

- [ ] **Step 3: Implement the store extensions**

Edit `shared/stores/session.store.ts`. Extend the interface + initial state + `setSnapshot` body:

```ts
import type {
  AgentEvent, CharacterState, ChatMessage, Phase, PhaseHistory,
  SessionSnapshot, SessionStatePatch,
} from '../types';

interface SessionState {
  snapshot: SessionSnapshot | null;
  pendingEvents: AgentEvent[];
  characterStates: Map<string, CharacterState>;
  lastCharStateTs: number;
  // NEW for cross-phase history:
  viewedPhase: Phase | null;
  phaseHistoryCache: Partial<Record<Phase, PhaseHistory[]>>;
  lastVisitedAtByPhase: Partial<Record<Phase, number>>;
  setSnapshot: (s: SessionSnapshot) => void;
  hydrateFromCache: (s: SessionSnapshot) => void;
  appendEvent: (e: AgentEvent) => void;
  drainPendingEvents: () => AgentEvent[];
  appendChat: (messages: ChatMessage[]) => void;
  applyStatePatch: (patch: SessionStatePatch) => void;
  applyCharState: (ts: number, states: CharacterState[]) => void;
  clearCharStates: () => void;
  clear: () => void;
  // NEW methods:
  setViewedPhase: (phase: Phase) => void;
  setPhaseHistory: (phase: Phase, history: PhaseHistory[]) => void;
}
```

Update `useSessionStore` initial state with the three new fields (all default empty).

Modify `setSnapshot` to handle auto-follow + scope-change clear:

```ts
  setSnapshot: (snapshot) => set((state) => {
    const oldPhase = state.snapshot?.phase ?? null;
    const newPhase = snapshot.phase;

    // Scope change to inactive clears all view state.
    if (!snapshot.sessionActive) {
      return {
        snapshot,
        pendingEvents: [],
        viewedPhase: null,
        phaseHistoryCache: {},
        lastVisitedAtByPhase: {},
      };
    }

    // Auto-follow rule: if user was on the old current phase, advance.
    let viewedPhase = state.viewedPhase;
    if (viewedPhase === null) {
      viewedPhase = newPhase;
    } else if (oldPhase !== null && viewedPhase === oldPhase && oldPhase !== newPhase) {
      viewedPhase = newPhase;
    }

    return { snapshot, pendingEvents: [], viewedPhase };
  }),
```

Add the two new methods near the other setters:

```ts
  setViewedPhase: (phase) => set((state) => ({
    viewedPhase: phase,
    lastVisitedAtByPhase: { ...state.lastVisitedAtByPhase, [phase]: Date.now() },
  })),

  setPhaseHistory: (phase, history) => set((state) => ({
    phaseHistoryCache: { ...state.phaseHistoryCache, [phase]: history },
  })),
```

Also update `clear()` to reset the new fields:

```ts
  clear: () => set({
    snapshot: null, pendingEvents: [],
    viewedPhase: null, phaseHistoryCache: {}, lastVisitedAtByPhase: {},
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared/stores/__tests__/session.store.test.ts`
Expected: all existing + new tests pass.

Full vitest: `npx vitest run`
Expected: 771 + 5 = 776 green.

- [ ] **Step 5: Commit**

```bash
git add shared/stores/session.store.ts shared/stores/__tests__/session.store.test.ts
git commit -m "feat(session-store): viewedPhase + phaseHistoryCache with auto-follow"
```

---

## Task 5: Desktop chat store — viewedPhase + cache + unread tracking

**Files:**
- Modify: `src/renderer/src/stores/chat.store.ts`
- Test: `tests/renderer/chat-store-phase.test.ts` (new)

**Intent:** Desktop renderer's chat store gets the same view-state extensions as the shared session store, but scoped to the desktop-only chat state. Different store because desktop holds current-run `messages` separately from archivedRuns; shared session store holds the whole snapshot.

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/chat-store-phase.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../src/renderer/src/stores/chat.store';
import type { Phase } from '../../shared/types';

beforeEach(() => {
  useChatStore.setState({
    messages: [], archivedRuns: [],
    waitingForResponse: false, waitingAgentRole: null,
    waitingSessionId: null, waitingQuestions: [],
    viewedPhase: null,
    pastPhaseHistoryCache: {},
    lastVisitedAtByPhase: {},
  });
});

describe('chat.store — phase view state', () => {
  it('setViewedPhase stores the phase and timestamps the visit', () => {
    useChatStore.getState().setViewedPhase('warroom');
    const s = useChatStore.getState();
    expect(s.viewedPhase).toBe('warroom');
    expect(typeof s.lastVisitedAtByPhase.warroom).toBe('number');
  });

  it('setPastPhaseHistory populates cache', () => {
    const stub = [{ agentRole: 'ceo' as const, runs: [{ runNumber: 1, messages: [] }] }];
    useChatStore.getState().setPastPhaseHistory('imagine', stub);
    expect(useChatStore.getState().pastPhaseHistoryCache.imagine).toBe(stub);
  });

  it('handleCurrentPhaseChange applies the auto-follow rule', () => {
    useChatStore.getState().setViewedPhase('imagine');
    useChatStore.getState().handleCurrentPhaseChange('imagine', 'warroom');
    expect(useChatStore.getState().viewedPhase).toBe('warroom');
  });

  it('handleCurrentPhaseChange leaves viewedPhase when browsing past', () => {
    useChatStore.getState().setViewedPhase('imagine');
    useChatStore.getState().handleCurrentPhaseChange('warroom', 'build');
    expect(useChatStore.getState().viewedPhase).toBe('imagine');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/chat-store-phase.test.ts`
Expected: FAIL — `setViewedPhase is not a function`.

- [ ] **Step 3: Implement**

Edit `src/renderer/src/stores/chat.store.ts`. Extend the interface:

```ts
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion, PhaseHistory, ArchivedRun, Phase } from '@shared/types';

interface ChatStore {
  messages: ChatMessage[];
  archivedRuns: ArchivedRun[];
  waitingForResponse: boolean;
  waitingAgentRole: AgentRole | null;
  waitingSessionId: string | null;
  waitingQuestions: AskQuestion[];
  // NEW:
  viewedPhase: Phase | null;
  pastPhaseHistoryCache: Partial<Record<Phase, PhaseHistory[]>>;
  lastVisitedAtByPhase: Partial<Record<Phase, number>>;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  loadHistory: (history: PhaseHistory[]) => void;
  setWaiting: (payload: AgentWaitingPayload | null) => void;
  // NEW:
  setViewedPhase: (phase: Phase) => void;
  setPastPhaseHistory: (phase: Phase, history: PhaseHistory[]) => void;
  handleCurrentPhaseChange: (oldPhase: Phase, newPhase: Phase) => void;
}
```

Extend the store implementation:

```ts
export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  archivedRuns: [],
  waitingForResponse: false,
  waitingAgentRole: null,
  waitingSessionId: null,
  waitingQuestions: [],
  viewedPhase: null,
  pastPhaseHistoryCache: {},
  lastVisitedAtByPhase: {},
  // ... existing methods unchanged ...

  setViewedPhase: (phase) => set((state) => ({
    viewedPhase: phase,
    lastVisitedAtByPhase: { ...state.lastVisitedAtByPhase, [phase]: Date.now() },
  })),

  setPastPhaseHistory: (phase, history) => set((state) => ({
    pastPhaseHistoryCache: { ...state.pastPhaseHistoryCache, [phase]: history },
  })),

  handleCurrentPhaseChange: (oldPhase, newPhase) => set((state) => {
    if (state.viewedPhase === oldPhase && oldPhase !== newPhase) {
      return { viewedPhase: newPhase };
    }
    return state;
  }),
}));
```

Update `clearMessages` to also reset the view state:

```ts
  clearMessages: () => set({
    messages: [], archivedRuns: [],
    waitingForResponse: false, waitingAgentRole: null, waitingSessionId: null, waitingQuestions: [],
    viewedPhase: null, pastPhaseHistoryCache: {}, lastVisitedAtByPhase: {},
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/chat-store-phase.test.ts`
Expected: all 4 pass.

Full vitest: `npx vitest run`
Expected: 776 + 4 = 780 green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/chat.store.ts tests/renderer/chat-store-phase.test.ts
git commit -m "feat(chat-store): add viewedPhase + past-phase cache + auto-follow"
```

---

## Task 6: Desktop `PhaseTabs` component

**Files:**
- Create: `src/renderer/src/components/OfficeView/PhaseTabs.tsx`
- Test: `tests/renderer/PhaseTabs.test.tsx` (new)

**Intent:** Pure presentational component. Renders four tabs with disabled/active/badged state. No store coupling.

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/PhaseTabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhaseTabs } from '../../src/renderer/src/components/OfficeView/PhaseTabs';

describe('PhaseTabs', () => {
  const noUnread = { idle: false, imagine: false, warroom: false, build: false, complete: false };

  it('renders four tabs with their labels', () => {
    render(<PhaseTabs
      currentPhase="imagine"
      viewedPhase="imagine"
      completedPhases={[]}
      unreadByPhase={noUnread}
      onSelect={() => {}}
    />);
    expect(screen.queryByText('Imagine')).not.toBeNull();
    expect(screen.queryByText('War Room')).not.toBeNull();
    expect(screen.queryByText('Build')).not.toBeNull();
    expect(screen.queryByText('Complete')).not.toBeNull();
  });

  it('disables unreached phases', () => {
    render(<PhaseTabs
      currentPhase="imagine"
      viewedPhase="imagine"
      completedPhases={[]}
      unreadByPhase={noUnread}
      onSelect={() => {}}
    />);
    const build = screen.getByText('Build').closest('button');
    const warroom = screen.getByText('War Room').closest('button');
    expect(build?.disabled).toBe(true);
    expect(warroom?.disabled).toBe(true);
  });

  it('enables current and completed phases', () => {
    render(<PhaseTabs
      currentPhase="build"
      viewedPhase="build"
      completedPhases={['imagine', 'warroom']}
      unreadByPhase={noUnread}
      onSelect={() => {}}
    />);
    expect(screen.getByText('Imagine').closest('button')?.disabled).toBe(false);
    expect(screen.getByText('War Room').closest('button')?.disabled).toBe(false);
    expect(screen.getByText('Build').closest('button')?.disabled).toBe(false);
    expect(screen.getByText('Complete').closest('button')?.disabled).toBe(true);
  });

  it('fires onSelect with the clicked phase', () => {
    const onSelect = vi.fn();
    render(<PhaseTabs
      currentPhase="warroom"
      viewedPhase="warroom"
      completedPhases={['imagine']}
      unreadByPhase={noUnread}
      onSelect={onSelect}
    />);
    fireEvent.click(screen.getByText('Imagine'));
    expect(onSelect).toHaveBeenCalledWith('imagine');
  });

  it('shows a badge dot on unread tabs', () => {
    const { container } = render(<PhaseTabs
      currentPhase="warroom"
      viewedPhase="imagine"
      completedPhases={['imagine']}
      unreadByPhase={{ ...noUnread, warroom: true }}
      onSelect={() => {}}
    />);
    // One badge dot expected on the War Room tab.
    const badges = container.querySelectorAll('[data-testid="phase-tab-badge"]');
    expect(badges.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/PhaseTabs.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/OfficeView/PhaseTabs.tsx`:

```tsx
import type { Phase } from '@shared/types';

const PHASE_ORDER: Phase[] = ['imagine', 'warroom', 'build', 'complete'];
const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

interface Props {
  currentPhase: Phase;
  viewedPhase: Phase;
  completedPhases: Phase[];
  unreadByPhase: Record<Phase, boolean>;
  onSelect: (phase: Phase) => void;
}

export function PhaseTabs({
  currentPhase, viewedPhase, completedPhases, unreadByPhase, onSelect,
}: Props) {
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(15,15,26,0.6)',
    }}>
      {PHASE_ORDER.map((phase) => {
        const isActive = viewedPhase === phase;
        const isEnabled = completedPhases.includes(phase) || phase === currentPhase;
        const isUnread = !!unreadByPhase[phase];
        return (
          <button
            key={phase}
            onClick={() => isEnabled && onSelect(phase)}
            disabled={!isEnabled}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
              color: !isEnabled ? '#475569' : isActive ? '#fff' : '#9ca3af',
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              cursor: isEnabled ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              position: 'relative',
            }}
          >
            {PHASE_LABELS[phase]}
            {isUnread && (
              <span
                data-testid="phase-tab-badge"
                style={{
                  position: 'absolute',
                  top: 6, right: 6,
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#ef4444',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/PhaseTabs.test.tsx`
Expected: all 5 pass.

Full vitest: `npx vitest run`
Expected: 780 + 5 = 785 green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/PhaseTabs.tsx tests/renderer/PhaseTabs.test.tsx
git commit -m "feat(phase-tabs): desktop PhaseTabs component"
```

---

## Task 7: Desktop `ChatPanel` integration

**Files:**
- Modify: `src/renderer/src/components/OfficeView/ChatPanel.tsx`

**Intent:** Render `PhaseTabs` above the message list, branch rendering between live (current-phase) and past-phase views, disable the input with a "Return to <current>" action when viewing a past phase, and wire auto-follow from `project.store.currentPhase` changes into `chat.store.handleCurrentPhaseChange`.

- [ ] **Step 1: Read the current file end-to-end**

Open `src/renderer/src/components/OfficeView/ChatPanel.tsx` and familiarize yourself with the existing render tree. The file is ~300 lines and integrates several stores.

- [ ] **Step 2: Wire the imports**

At the top of the file, add these imports (extend existing import lines when possible; don't duplicate):

```ts
import { PhaseTabs } from './PhaseTabs';
import type { Phase, PhaseHistory } from '@shared/types';
```

- [ ] **Step 3: Pull new state from the chat store**

Inside the component body, alongside the existing destructure of `useChatStore`, add:

```ts
  const viewedPhase = useChatStore((s) => s.viewedPhase);
  const pastPhaseHistoryCache = useChatStore((s) => s.pastPhaseHistoryCache);
  const lastVisitedAtByPhase = useChatStore((s) => s.lastVisitedAtByPhase);
  const setViewedPhase = useChatStore((s) => s.setViewedPhase);
  const setPastPhaseHistory = useChatStore((s) => s.setPastPhaseHistory);
  const handleCurrentPhaseChange = useChatStore((s) => s.handleCurrentPhaseChange);
```

- [ ] **Step 4: Auto-follow on currentPhase change**

Add this `useEffect` near the existing effects (after the "Load chat history" effect at line ~164):

```ts
  // Auto-follow: when the project advances to a new phase, bump viewedPhase
  // iff the user was on the old current phase.
  const currentPhaseRef = useRef<Phase | null>(null);
  useEffect(() => {
    const cp = projectState?.currentPhase ?? null;
    if (currentPhaseRef.current !== null && cp !== null && currentPhaseRef.current !== cp) {
      handleCurrentPhaseChange(currentPhaseRef.current, cp);
    }
    currentPhaseRef.current = cp;
  }, [projectState?.currentPhase, handleCurrentPhaseChange]);
```

Add `useRef` to the React imports at the top if not already there.

- [ ] **Step 5: Default viewedPhase on first load**

Extend the existing "Load chat history" effect (around line 164) to also set `viewedPhase` to the current phase on project open:

```ts
  useEffect(() => {
    if (!projectState || projectState.currentPhase === 'idle') return;

    // Default the viewed tab to the current phase.
    if (viewedPhase === null) {
      setViewedPhase(projectState.currentPhase);
    }

    let cancelled = false;
    window.office.getChatHistory(projectState.currentPhase).then((history) => {
      if (!cancelled && history.length > 0) {
        loadHistory(history);
      }
    });

    return () => { cancelled = true; };
  }, [projectState?.path, projectState?.currentPhase]);
```

- [ ] **Step 6: Fetch past-phase history on demand**

Add an effect that fires when `viewedPhase !== currentPhase` and the cache is empty:

```ts
  useEffect(() => {
    if (!projectState || viewedPhase === null) return;
    if (viewedPhase === projectState.currentPhase) return;
    if (pastPhaseHistoryCache[viewedPhase]) return; // already cached
    let cancelled = false;
    window.office.getChatHistory(viewedPhase).then((history) => {
      if (!cancelled) setPastPhaseHistory(viewedPhase, history);
    });
    return () => { cancelled = true; };
  }, [projectState?.path, projectState?.currentPhase, viewedPhase, pastPhaseHistoryCache, setPastPhaseHistory]);
```

- [ ] **Step 7: Derive unreadByPhase**

Above the return statement, compute the unread map. For MVP, mark a phase as unread iff `lastVisitedAtByPhase[phase]` is undefined (never visited) AND that phase has any messages in live state:

```ts
  const unreadByPhase: Record<Phase, boolean> = {
    idle: false,
    imagine: false,
    warroom: false,
    build: false,
    complete: false,
  };
  if (projectState?.currentPhase && projectState.currentPhase !== viewedPhase) {
    // The current phase has the latest message; if the user hasn't visited
    // its tab since the last message arrived, mark unread.
    const latest = messages[messages.length - 1]?.timestamp ?? 0;
    const lastVisit = lastVisitedAtByPhase[projectState.currentPhase] ?? 0;
    if (latest > lastVisit) unreadByPhase[projectState.currentPhase] = true;
  }
```

- [ ] **Step 8: Render the tab strip and branch the body**

Rewrite the JSX return so `PhaseTabs` sits at the top and the body renders either live-view or past-view. This touches the existing render tree — show only the changed pieces:

Above the existing `messageList` div, add:

```tsx
<PhaseTabs
  currentPhase={projectState?.currentPhase ?? 'idle'}
  viewedPhase={viewedPhase ?? projectState?.currentPhase ?? 'idle'}
  completedPhases={projectState?.completedPhases ?? []}
  unreadByPhase={unreadByPhase}
  onSelect={setViewedPhase}
/>
```

Compute `isLive` and wrap the existing rendering in a conditional. Keep the existing live-view JSX verbatim — just wrap it. Add the past-phase branch as a parallel sibling:

```tsx
const isLive = viewedPhase === null || !projectState || viewedPhase === projectState.currentPhase;
const pastFlattened: ChatMessage[] = [];
if (!isLive && projectState && viewedPhase) {
  const cached = pastPhaseHistoryCache[viewedPhase];
  if (cached) {
    for (const entry of cached) for (const run of entry.runs) pastFlattened.push(...run.messages);
    pastFlattened.sort((a, b) => a.timestamp - b.timestamp);
  }
}

// Inside the return JSX, replace the existing messageList conditional with:
{isLive ? (
  // ── UNCHANGED: existing live-view JSX that renders messages, archivedRuns, waiting ──
  // Leave the existing tree in place; do not extract into a helper.
  <div style={styles.messageList}>
    {/* existing mapping over messages + archivedRuns */}
  </div>
) : !pastPhaseHistoryCache[viewedPhase!] ? (
  <div style={styles.emptyState}>Loading…</div>
) : pastFlattened.length === 0 ? (
  <div style={styles.emptyState}>No messages in {viewedPhase}.</div>
) : (
  <div style={styles.messageList}>
    {pastFlattened.map((m) => <MessageBubble key={m.id} msg={m} isWaiting={false} />)}
  </div>
)}
```

**Do not extract the existing live-view into a function** — leave the existing JSX as-is inside the `isLive` branch. This keeps the diff surgical.

Disable the input + render a return banner in past-phase view:

```tsx
{(viewedPhase && projectState && viewedPhase !== projectState.currentPhase) ? (
  <div style={styles.inputArea}>
    <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
      Viewing {viewedPhase} history — read-only.
    </div>
    <button
      onClick={() => setViewedPhase(projectState.currentPhase)}
      style={{
        width: '100%', padding: 8, background: '#6366f1', color: '#fff',
        border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      Return to {projectState.currentPhase}
    </button>
  </div>
) : (
  // existing input region unchanged
  renderInput()
)}
```

Since this is a large JSX edit, use targeted `Edit` tool calls rather than `Write` to avoid touching unrelated sections. After you're done, read the file top-to-bottom once to sanity-check.

- [ ] **Step 9: Run TypeScript + tests**

```bash
npx tsc --noEmit 2>&1 | grep "ChatPanel"
```
Expected: no new errors (pre-existing path-alias errors elsewhere OK).

```bash
npx vitest run
```
Expected: 785 green (no new tests; no regression).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/components/OfficeView/ChatPanel.tsx
git commit -m "feat(chat-panel): phase tabs + live/past branch + return-to-current banner"
```

---

## Task 8: Mobile shell — `useSession.requestPhaseHistory`

**Files:**
- Modify: `mobile/src/session/useSession.ts`
- Test: `mobile/src/__tests__/useSession.test.ts`

**Intent:** Add a method to `useSession` that sends a `getPhaseHistory` request over the transport and returns a promise that resolves when the matching `phaseHistory` response arrives. Track pending requests in a `Map<requestId, Deferred>`; time out after 10 s.

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/__tests__/useSession.test.ts`:

```ts
it('requestPhaseHistory sends getPhaseHistory and resolves on matching phaseHistory', async () => {
  const fake = makeFakeTransport();
  (createTransportForDevice as jest.Mock).mockReturnValue(fake);
  const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));

  let resolved: any = null;
  const promise = result.current.requestPhaseHistory('imagine').then((h) => { resolved = h; });

  // Transport received a getPhaseHistory frame with a requestId.
  expect(fake.sent).toHaveLength(1);
  const sent = fake.sent[0] as any;
  expect(sent.type).toBe('getPhaseHistory');
  expect(sent.phase).toBe('imagine');
  expect(typeof sent.requestId).toBe('string');

  // Respond with a phaseHistory frame carrying the same requestId.
  const stubHistory = [{ agentRole: 'ceo' as const, runs: [{ runNumber: 1, messages: [] }] }];
  act(() => {
    fake.emitMessage({
      type: 'phaseHistory', v: 2,
      requestId: sent.requestId,
      phase: 'imagine',
      history: stubHistory,
    });
  });

  await promise;
  expect(resolved).toEqual(stubHistory);
});

it('requestPhaseHistory rejects after 10 s if no response arrives', async () => {
  jest.useFakeTimers();
  try {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));

    const promise = result.current.requestPhaseHistory('imagine');
    jest.advanceTimersByTime(10_001);
    await expect(promise).rejects.toThrow(/timeout/i);
  } finally {
    jest.useRealTimers();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts -t "requestPhaseHistory"`
Expected: FAIL — `result.current.requestPhaseHistory is not a function`.

- [ ] **Step 3: Implement**

Edit `mobile/src/session/useSession.ts`.

Extend the `UseSessionReturn` interface:

```ts
export interface UseSessionReturn {
  status: ReturnType<typeof useConnectionStore.getState>['status'];
  sessionActive: boolean;
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  canSend: boolean;
  submit: () => Promise<{ ok: boolean; error?: string }>;
  sendChat: (body: string) => Promise<{ ok: boolean; error?: string }>;
  requestPhaseHistory: (phase: Phase) => Promise<PhaseHistory[]>;
}
```

Add imports at the top:

```ts
import type { Phase, PhaseHistory, MobileMessageV2 } from '../types/shared';
```

Add a pending-requests map, reset via `useRef`:

```ts
  const pendingHistoryReqsRef = useRef<Map<string, { resolve: (h: PhaseHistory[]) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>>(new Map());
```

Inside the `offMessage` handler, add a case for the new response:

```ts
        case 'phaseHistory': {
          const pending = pendingHistoryReqsRef.current.get(m.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(m.history);
            pendingHistoryReqsRef.current.delete(m.requestId);
          }
          // Also populate the shared cache so the webview side sees the data.
          useSessionStore.getState().setPhaseHistory(m.phase, m.history);
          break;
        }
```

Add the `requestPhaseHistory` function near `sendChat`:

```ts
  const requestPhaseHistory = useCallback((phase: Phase): Promise<PhaseHistory[]> => {
    const transport = transportRef.current;
    if (!transport) return Promise.reject(new Error('no transport'));
    const requestId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise<PhaseHistory[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingHistoryReqsRef.current.delete(requestId);
        reject(new Error('timeout'));
      }, 10_000);
      pendingHistoryReqsRef.current.set(requestId, { resolve, reject, timer });
      transport.send({ type: 'getPhaseHistory', v: 2, phase, requestId });
    });
  }, []);
```

Add `requestPhaseHistory` to the return object:

```ts
  return { status, sessionActive, draft, setDraft, sending, canSend, submit, sendChat, requestPhaseHistory };
```

Also extend the cleanup logic at the end of the mount effect to cancel pending history requests:

```ts
    return () => {
      offStatus();
      offMessage();
      transport.disconnect();
      transportRef.current = null;
      for (const { timer } of pendingAcksRef.current.values()) clearTimeout(timer);
      pendingAcksRef.current.clear();
      // ADD:
      for (const { timer } of pendingHistoryReqsRef.current.values()) clearTimeout(timer);
      pendingHistoryReqsRef.current.clear();
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts`
Expected: all existing + 2 new tests pass.

Full mobile jest: `cd mobile && npx jest`
Expected: 47 + 2 = 49 green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/useSession.ts mobile/src/__tests__/useSession.test.ts
git commit -m "feat(mobile-useSession): requestPhaseHistory request/response helper"
```

---

## Task 9: WebViewHost — forward `phaseHistoryCache` + route `requestPhaseHistory`

**Files:**
- Modify: `mobile/src/webview-host/WebViewHost.tsx`
- Modify: `mobile/src/session/SessionScreen.tsx`

**Intent:** The webview needs to (a) emit `requestPhaseHistory` messages to trigger a fetch, (b) receive `phaseHistory` responses to render them. Plumbing through the shell's existing `post(...)` + `onMessage` pattern.

- [ ] **Step 1: Extend `WebViewHost` props**

Edit `mobile/src/webview-host/WebViewHost.tsx`. Extend the `Props` interface:

```ts
interface Props {
  style?: any;
  onPhoneAnswer: (body: string) => Promise<{ ok: boolean; error?: string }>;
  onActiveTabChange?: (tab: 'chat' | 'office') => void;
  onRequestPhaseHistory?: (phase: 'imagine' | 'warroom' | 'build' | 'complete', requestId: string) => void;
}
```

Destructure in the function signature.

- [ ] **Step 2: Route the inbound webview message**

In the `onMessage` body, add a branch after the existing `activeTab` branch:

```ts
        if (data?.type === 'requestPhaseHistory' && typeof data.requestId === 'string'
            && (data.phase === 'imagine' || data.phase === 'warroom' || data.phase === 'build' || data.phase === 'complete')) {
          onRequestPhaseHistory?.(data.phase, data.requestId);
          return;
        }
```

- [ ] **Step 3: Forward cache updates into the webview**

Extend the existing `useSessionStore.subscribe(...)` block to also propagate `phaseHistoryCache` changes. Inside the subscribe callback:

```ts
      if (state.phaseHistoryCache !== prev.phaseHistoryCache) {
        for (const phase of Object.keys(state.phaseHistoryCache) as Array<'imagine'|'warroom'|'build'|'complete'>) {
          if (prev.phaseHistoryCache[phase] !== state.phaseHistoryCache[phase]) {
            post({
              type: 'phaseHistory',
              v: 1,
              requestId: 'cache-push',
              phase,
              history: state.phaseHistoryCache[phase]!,
            } as any);
          }
        }
      }
```

(Task 1 already extended the v1 `MobileMessage` union with `phaseHistory`, so `post(...)` type-checks here without a cast.)

- [ ] **Step 4: Wire the callback in SessionScreen**

Edit `mobile/src/session/SessionScreen.tsx`. Access `session.requestPhaseHistory` and pass a handler to `WebViewHost`:

```tsx
<WebViewHost
  onPhoneAnswer={session.sendChat}
  onActiveTabChange={setActiveTab}
  onRequestPhaseHistory={(phase, requestId) => {
    void session.requestPhaseHistory(phase).catch((err) => {
      console.warn('[session] phase-history request failed', err);
    });
  }}
/>
```

(The webview's `requestId` is advisory — the shell generates its own in `useSession`. The cache update flows back via the store subscription.)

- [ ] **Step 5: Type-check + tests**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -E "WebViewHost|SessionScreen" | head
```
Expected: no new errors.

```bash
cd mobile && npx jest
```
Expected: 49 green.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/webview-host/WebViewHost.tsx mobile/src/session/SessionScreen.tsx
git commit -m "feat(webview-host): route phaseHistory requests + cache pushes"
```

---

## Task 10: Webview `sendPhaseHistoryRequest` helper

**Files:**
- Create: `src/mobile-renderer/sendPhaseHistoryRequest.ts`
- Test: `src/mobile-renderer/__tests__/sendPhaseHistoryRequest.test.ts` (new)

**Intent:** One-function module mirroring `sendAnswer.ts` and `emitActiveTab.ts`. Generates a requestId and posts `{type:'requestPhaseHistory', phase, requestId}` to the RN host.

- [ ] **Step 1: Write the failing test**

Create `src/mobile-renderer/__tests__/sendPhaseHistoryRequest.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendPhaseHistoryRequest } from '../sendPhaseHistoryRequest';

beforeEach(() => {
  (window as any).ReactNativeWebView = undefined;
});

describe('sendPhaseHistoryRequest', () => {
  it('posts the request with a generated requestId', () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };

    const requestId = sendPhaseHistoryRequest('warroom');
    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(sent.type).toBe('requestPhaseHistory');
    expect(sent.phase).toBe('warroom');
    expect(sent.requestId).toBe(requestId);
    expect(typeof requestId).toBe('string');
  });

  it('is a safe no-op when ReactNativeWebView is absent', () => {
    expect(() => sendPhaseHistoryRequest('build')).not.toThrow();
  });
});
```

- [ ] **Step 2: Verify failing**

Run: `npx vitest run src/mobile-renderer/__tests__/sendPhaseHistoryRequest.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/mobile-renderer/sendPhaseHistoryRequest.ts`:

```ts
// Asks the RN host to fetch PhaseHistory[] for a given phase. Returns the
// generated requestId so the caller can correlate against a later
// phaseHistory cache update (which arrives via the host→webview message
// channel and populates the shared session store).
export function sendPhaseHistoryRequest(
  phase: 'imagine' | 'warroom' | 'build' | 'complete',
): string {
  const requestId = `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const host = (window as unknown as {
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }).ReactNativeWebView;
  if (host) {
    host.postMessage(JSON.stringify({ type: 'requestPhaseHistory', phase, requestId }));
  }
  return requestId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/mobile-renderer/__tests__/sendPhaseHistoryRequest.test.ts`
Expected: 2 pass.

Full vitest: `npx vitest run`
Expected: 785 + 2 = 787 green.

- [ ] **Step 5: Commit**

```bash
git add src/mobile-renderer/sendPhaseHistoryRequest.ts src/mobile-renderer/__tests__/sendPhaseHistoryRequest.test.ts
git commit -m "feat(mobile-renderer): sendPhaseHistoryRequest helper"
```

---

## Task 11: Webview `PhaseTabs` component

**Files:**
- Create: `src/mobile-renderer/PhaseTabs.tsx`

**Intent:** Same shape as the desktop `PhaseTabs` but CSS classes / styling appropriate for the webview's DOM-based UI (no React Native). Mirrors the existing `TabBar.tsx` webview component pattern.

- [ ] **Step 1: Write the component**

Create `src/mobile-renderer/PhaseTabs.tsx`:

```tsx
import type { Phase } from '../../shared/types';

const PHASE_ORDER: Phase[] = ['imagine', 'warroom', 'build', 'complete'];
const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

interface Props {
  currentPhase: Phase;
  viewedPhase: Phase;
  completedPhases: Phase[];
  unreadByPhase: Record<Phase, boolean>;
  onSelect: (phase: Phase) => void;
}

export function PhaseTabs({
  currentPhase, viewedPhase, completedPhases, unreadByPhase, onSelect,
}: Props) {
  return (
    <div className="phase-tabs">
      {PHASE_ORDER.map((phase) => {
        const isActive = viewedPhase === phase;
        const isEnabled = completedPhases.includes(phase) || phase === currentPhase;
        const isUnread = !!unreadByPhase[phase];
        const className = [
          'phase-tab',
          isActive && 'active',
          !isEnabled && 'disabled',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={phase}
            type="button"
            className={className}
            disabled={!isEnabled}
            onClick={() => isEnabled && onSelect(phase)}
          >
            {PHASE_LABELS[phase]}
            {isUnread && <span className="phase-tab-badge" data-testid="phase-tab-badge" />}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add minimal styles**

Append to `src/mobile-renderer/style.css`:

```css
.phase-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 15, 26, 0.6);
  flex-shrink: 0;
}
.phase-tab {
  flex: 1;
  padding: 10px 4px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #9ca3af;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  position: relative;
}
.phase-tab.active {
  background: rgba(99, 102, 241, 0.15);
  border-bottom-color: #6366f1;
  color: #fff;
  font-weight: 600;
}
.phase-tab.disabled {
  color: #475569;
  cursor: not-allowed;
}
.phase-tab-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}
```

No unit test for this component in isolation — it's covered by the existing `ChatView` tests extended in Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/mobile-renderer/PhaseTabs.tsx src/mobile-renderer/style.css
git commit -m "feat(mobile-renderer): PhaseTabs component"
```

---

## Task 12: Webview `ChatView` — integrate tabs, branch live/past

**Files:**
- Modify: `src/mobile-renderer/ChatView.tsx`

**Intent:** Wire the tab strip at top; branch rendering between live (current-phase) and past-phase (cache lookup + fetch trigger) views; disable the input with a "Return to current" button in past-phase view.

- [ ] **Step 1: Extend `ChatView`**

Edit `src/mobile-renderer/ChatView.tsx`. Import the new helpers:

```ts
import { PhaseTabs } from './PhaseTabs';
import { sendPhaseHistoryRequest } from './sendPhaseHistoryRequest';
```

Use store selectors for the new state:

```ts
  const viewedPhase = useSessionStore((s) => s.viewedPhase);
  const phaseHistoryCache = useSessionStore((s) => s.phaseHistoryCache);
  const lastVisitedAtByPhase = useSessionStore((s) => s.lastVisitedAtByPhase);
  const setViewedPhase = useSessionStore((s) => s.setViewedPhase);
  const currentPhase: Phase = snapshot?.phase ?? 'idle';
  const effectiveViewedPhase: Phase = viewedPhase ?? currentPhase;
  const isLive = effectiveViewedPhase === currentPhase;
```

Derive `completedPhases` from the snapshot — actually, the snapshot doesn't currently carry `completedPhases`. For mobile, approximate from phase ordering: any phase that comes before `currentPhase` in the ordering is "completed" for UI purposes.

```ts
  const PHASE_ORDER_LOCAL: Phase[] = ['imagine', 'warroom', 'build', 'complete'];
  const completedPhases: Phase[] = (() => {
    const idx = PHASE_ORDER_LOCAL.indexOf(currentPhase);
    if (idx <= 0) return [];
    return PHASE_ORDER_LOCAL.slice(0, idx);
  })();
```

Derive unreadByPhase (similar rule to desktop — if currentPhase != viewedPhase and the last live message is newer than the last visit):

```ts
  const unreadByPhase: Record<Phase, boolean> = {
    idle: false, imagine: false, warroom: false, build: false, complete: false,
  };
  if (currentPhase !== effectiveViewedPhase) {
    const lastMsgTs = snapshot?.chatTail?.[snapshot.chatTail.length - 1]?.timestamp ?? 0;
    const lastVisit = lastVisitedAtByPhase[currentPhase] ?? 0;
    if (lastMsgTs > lastVisit) unreadByPhase[currentPhase] = true;
  }
```

Trigger a fetch on past-phase select if not cached. Since `ChatView` renders often, use a `useEffect` with `[effectiveViewedPhase, phaseHistoryCache]` deps:

```ts
  useEffect(() => {
    if (isLive) return;
    if (phaseHistoryCache[effectiveViewedPhase]) return;
    sendPhaseHistoryRequest(effectiveViewedPhase as 'imagine'|'warroom'|'build'|'complete');
  }, [isLive, effectiveViewedPhase, phaseHistoryCache]);
```

Render the tabs + branch the body:

```tsx
  return (
    <>
      <PhaseTabs
        currentPhase={currentPhase}
        viewedPhase={effectiveViewedPhase}
        completedPhases={completedPhases}
        unreadByPhase={unreadByPhase}
        onSelect={(p) => setViewedPhase(p)}
      />
      {isLive ? (
        // existing chat-list rendering unchanged
        <div className="chat-list" ref={listRef}>{rendered}</div>
      ) : (
        (() => {
          const cached = phaseHistoryCache[effectiveViewedPhase];
          if (!cached) return <div className="chat-empty">Loading {effectiveViewedPhase}…</div>;
          const flattened: ChatMessage[] = [];
          for (const entry of cached) for (const run of entry.runs) flattened.push(...run.messages);
          flattened.sort((a, b) => a.timestamp - b.timestamp);
          if (flattened.length === 0) return <div className="chat-empty">No messages in {effectiveViewedPhase}.</div>;
          return (
            <div className="chat-list" ref={listRef}>
              {flattened.map((m) => <MessageBubble key={m.id} msg={m} isWaiting={false} />)}
            </div>
          );
        })()
      )}
      {isLive ? <ActivityFooter /> : (
        <div className="past-phase-footer">
          <button
            className="return-to-current"
            onClick={() => setViewedPhase(currentPhase)}
          >
            Return to {currentPhase}
          </button>
        </div>
      )}
    </>
  );
```

Add styles for `.past-phase-footer` and `.return-to-current` to `src/mobile-renderer/style.css`:

```css
.past-phase-footer {
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.return-to-current {
  width: 100%;
  padding: 10px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/mobile-renderer`
Expected: all existing webview tests green (`ChatView.test.tsx` may need a small snapshot update if it asserts on exact tree shape; adjust in place).

If `ChatView.test.tsx` has a "No messages yet." empty-state assertion, it now gets `PhaseTabs` above it — the existing test should still work since `queryByText('No messages yet.')` still resolves, but double-check.

- [ ] **Step 3: Commit**

```bash
git add src/mobile-renderer/ChatView.tsx src/mobile-renderer/style.css
git commit -m "feat(mobile-renderer-chat): phase tabs + live/past branch + return-to-current"
```

---

## Task 13: `bridge.ts` receive — populate shared store from host

**Files:**
- Modify: `src/mobile-renderer/bridge.ts`

**Intent:** The shell pushes `phaseHistory` messages into the webview via `post(...)`. The webview's `bridge.ts` already handles `snapshot` / `event` / `chat` / `state` / `charState`. Add a case for `phaseHistory` that calls `setPhaseHistory` on the shared store.

- [ ] **Step 1: Implement**

Edit `src/mobile-renderer/bridge.ts`. Inside the `switch (msg.type)` block in `handleRawMessage`, add a new case:

```ts
    case 'phaseHistory':
      // Populate the shared cache. `requestId` is unused here — the shell
      // already resolved its Promise; this is just the cache-push path.
      store.setPhaseHistory((msg as any).phase, (msg as any).history);
      break;
```

Task 1 already extended the v1 `MobileMessage` union and `VALID_TYPES` with `phaseHistory`, so `msg` is strictly typed in this switch. No cast needed:

```ts
    case 'phaseHistory':
      store.setPhaseHistory(msg.phase, msg.history);
      break;
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run shared/protocol src/mobile-renderer`
Expected: all green.

Full vitest: `npx vitest run`
Expected: 787 green (no new tests added here).

- [ ] **Step 3: Commit**

```bash
git add src/mobile-renderer/bridge.ts
git commit -m "feat(webview-bridge): handle phaseHistory message into shared cache"
```

---

## Task 14: Rebuild webview bundle

**Files:**
- Regenerate: `mobile/assets/webview/index.html`.

- [ ] **Step 1: Build**

From the repo root:

```bash
npm run build:mobile-all
```

Expected: completes; bundle size similar to before (~1.3 MB inlined).

- [ ] **Step 2: Verify**

```bash
git status | grep webview
```
Expected: shows `mobile/assets/webview/index.html` modified.

```bash
grep -c "requestPhaseHistory\|PhaseTabs" mobile/assets/webview/index.html
```
Expected: > 0 (both identifiers inlined in the bundle).

- [ ] **Step 3: Commit**

```bash
git add mobile/assets/webview
git commit -m "chore(mobile): rebuild webview bundle with cross-phase history UI"
```

---

## Task 15: End-to-end validation

**Files:** None — validation only.

- [ ] **Step 1: Run the full suites**

```bash
npx vitest run
cd mobile && npx jest && cd ..
```

Expected:
- Root vitest: **787** (767 baseline + 3 + 1 + 5 + 4 + 5 + 2 + extras — actual count depends on how each task added tests).
- Mobile jest: **49** (47 baseline + 2).

If counts differ from expectation but both suites pass, accept and update this doc post-hoc.

- [ ] **Step 2: Manual QA — desktop**

1. Open a project mid-build (has Imagine + War Room history on disk).
2. Confirm the phase tab strip appears at the top of the chat panel with Imagine + War Room enabled, Build highlighted as current, Complete disabled.
3. Click Imagine → past-phase view appears read-only, "Return to build" banner at the bottom, input disabled.
4. Click Return to build → snaps back to live view, input re-enabled.
5. Trigger a new agent message in Build while tab is on Imagine (via a tool invocation) — confirm the Build tab gets an unread badge dot.

- [ ] **Step 3: Manual QA — mobile**

1. Phone paired + connected, desktop in Build phase.
2. Confirm phase tab strip in the Chat tab — tabs rendered, current phase highlighted.
3. Tap Imagine → loading placeholder → past-phase history renders. Bottom shows "Return to build" button. Input hidden or disabled.
4. Tap Return → back to live Build.
5. Leave tab on Imagine; trigger a message on desktop. Confirm Build tab gets unread badge.

- [ ] **Step 4: Nothing to commit unless QA surfaces issues.**

---

## Spec Coverage Checklist

| Spec requirement | Task(s) |
|---|---|
| Two new protocol message types | 1, 13 (v1 variant for webview boundary) |
| `viewedPhase` state on desktop | 5 |
| `viewedPhase` + cache on mobile | 4 |
| Auto-follow rule | 4, 5 |
| Tab UI on desktop | 6, 7 |
| Tab UI on mobile (webview) | 11, 12 |
| Read-only past-phase view | 7, 12 |
| Return-to-current banner | 7, 12 |
| Unread badge tracking | 5, 6, 7, 11, 12 |
| Desktop uses existing `getChatHistory` IPC | 7 |
| Mobile on-demand fetch via new message types | 8, 9, 10, 12 |
| Desktop bridge handler routing + response | 2, 3 |
| Cache cleared on scope change | 4 |
| No protocol version bump | 1 (additive only) |
| No changes to chat-history file format | All (none of the file-structure items touch chat-history-store.ts's storage layer) |
| No changes to `archivedRuns` within-phase behavior | All |
| Webview bundle rebuild | 14 |
| E2E validation | 15 |
