# Post-Deploy Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent post-deploy fixes — mobile PhaseTabs safe-area, SessionDO state persistence across worker redeploys, and removal of the stale-chat mobile cache.

**Architecture:** Three tasks, each self-contained and independently committable. T1 commits an already-prepared CSS + bundle diff. T2 adds lazy DO storage hydration + persistence at the two mutation points. T3 deletes the mobile AsyncStorage cache and prunes dead code in the shared store.

**Tech Stack:** TypeScript, vitest (root + relay workspace), jest (mobile), AsyncStorage (to be removed), Cloudflare Durable Object storage (KV API).

**Spec:** `docs/superpowers/specs/2026-04-24-post-deploy-fixes-design.md`

**Baseline (confirmed in worktree):** vitest 795/795 at root, jest 51/51 in `mobile/`, vitest 30/30 in `relay/`.

---

## File Structure

**Modify:**
- `src/mobile-renderer/style.css` — `.phase-tabs` gains `padding-top: var(--rn-safe-top, 0px)`; `.chat-list` top padding simplified. **Diff is already present in the working tree** (stashed from main then popped into this worktree).
- `mobile/assets/webview/index.html` — regenerated webview bundle. **Diff is already present in the working tree.**
- `relay/src/session-do.ts` — hydrate + persist `pairSignPub` / `epoch`.
- `relay/src/__tests__/session-do.test.ts` — `makeState()` helper grows an in-memory storage mock; four new tests for the storage lifecycle.
- `mobile/src/session/useSession.ts` — drop cache import + load + three save calls.
- `mobile/src/__tests__/useSession.test.ts` — drop cache mock, drop cache-related assertions.
- `mobile/src/__tests__/SessionScreen.test.tsx` — drop cache mock.
- `shared/stores/session.store.ts` — drop orphaned `hydrateFromCache` method (after cache removal it has no callers).

**Delete:**
- `mobile/src/state/cache.ts` — file deleted wholesale.

**Unchanged:**
- All other mobile / desktop / relay source.
- `wrangler.toml` — no migration needed; SQLite storage is already declared.

---

## Task 1: Commit the safe-area diff

**Files:**
- Modify: `src/mobile-renderer/style.css` (already staged in working tree)
- Modify: `mobile/assets/webview/index.html` (already staged in working tree)

- [ ] **Step 1: Verify the working-tree diff matches the spec**

Run:
```bash
git diff --stat src/mobile-renderer/style.css mobile/assets/webview/index.html
```

Expected: both files listed, `style.css` with ~5 lines changed, `index.html` with a larger bundle-sized diff (hundreds of lines — it's a minified build).

If `style.css` doesn't show the diff, open it and confirm:
- `.phase-tabs` has `padding-top: var(--rn-safe-top, 0px);`
- `.chat-list`'s `padding` is simplified to `12px 16px calc(var(--rn-safe-bottom, 0px) + 12px) 16px` (no `var(--rn-safe-top, 0px) + 12px` on the top side).

If the CSS is missing those changes, rebuild from source:
```bash
# Apply the two CSS edits per spec, then:
npm run build:mobile-all
```

- [ ] **Step 2: Quick sanity — rendered webview bundle references the new style**

Run:
```bash
grep -c "padding-top:var(--rn-safe-top" mobile/assets/webview/index.html
```

Expected: at least 1 match. (Vite minifies away the optional space after `:`, so match on that form.)

- [ ] **Step 3: Run the renderer tests that exercise PhaseTabs**

Run: `npx vitest run tests/renderer/PhaseTabs.test.tsx src/mobile-renderer/__tests__/ChatView.test.tsx`

Expected: both green. These tests render the components against jsdom which doesn't enforce CSS — no visual regression expected from the padding change.

- [ ] **Step 4: Run the full desktop vitest suite**

Run: `npx vitest run 2>&1 | tail -5`

Expected: 795 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mobile-renderer/style.css mobile/assets/webview/index.html
git commit -m "fix(mobile): phase tabs respect top safe-area inset"
```

---

## Task 2: Persist `pairSignPub` + `epoch` to DO storage

**Files:**
- Modify: `relay/src/session-do.ts`
- Modify: `relay/src/__tests__/session-do.test.ts`

- [ ] **Step 1: Write the first failing test — storage mock + survive-restart for pairSignPub**

Open `relay/src/__tests__/session-do.test.ts`. Replace the `makeState()` helper at the top with one that includes an in-memory storage mock:

```ts
function makeStorage() {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | undefined> => map.get(key) as T | undefined,
    put: async <T>(key: string, value: T): Promise<void> => { map.set(key, value); },
    delete: async (key: string): Promise<boolean> => map.delete(key),
    _raw: map,  // exposed so tests can assert what was persisted
  };
}

function makeState(storage = makeStorage()): any {
  return {
    id: { name: 'test', toString: () => 'test' },
    storage,
  };
}
```

Existing tests still call `makeState()` without args — they'll auto-create a fresh storage each call, same behavior as before for fields they don't touch.

Then append this new `describe` block at the end of the file, before the closing `});` of the outermost describe:

```ts
describe('SessionDO — storage persistence', () => {
  it('persists pairSignPub on first-desktop-connect so a fresh isolate authenticates a phone without another desktop connect', async () => {
    const storage = makeStorage();
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);

    // First isolate: desktop connects, token is good, pairSignPub gets set.
    const first = new SessionDO(makeState(storage), {} as any);
    const desktopToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 1, exp: Date.now() + 60_000,
    });
    const firstRes = await first.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${desktopToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    expect(firstRes.status).toBe(101);
    expect(await storage.get('pairSignPub')).toBeInstanceOf(Uint8Array);

    // Second isolate against the SAME storage: simulates a worker redeploy.
    const second = new SessionDO(makeState(storage), {} as any);
    const phoneToken = signToken(priv, {
      sid: 'abc', role: 'phone', epoch: 1, exp: Date.now() + 60_000,
    });
    const secondRes = await second.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        // Phone does NOT send X-PairSign-Pub; it's only for first-connect.
        'Sec-WebSocket-Protocol': `token.${phoneToken}`,
      },
    }));
    expect(secondRes.status).toBe(101);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd relay && npx vitest run src/__tests__/session-do.test.ts`

Expected: the new test fails. The second isolate hits the `if (!this.pairSignPub)` branch and rejects with 401 because the field is only in-memory. The first isolate's assertion on `storage.get('pairSignPub')` also fails — no `storage.put` is wired up yet.

- [ ] **Step 3: Implement the hydrate + persist logic in `session-do.ts`**

Open `relay/src/session-do.ts`. Add a `hydrated` flag next to the other private fields (around line 28):

```ts
  private hydrated = false;
```

Add a `hydrate` method below the constructor. Place it just above `async fetch(req: Request): Promise<Response> {`:

```ts
  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const [pub, ep] = await Promise.all([
      this.state.storage.get<Uint8Array>('pairSignPub'),
      this.state.storage.get<number>('epoch'),
    ]);
    if (pub) this.pairSignPub = pub;
    if (typeof ep === 'number') this.epoch = ep;
    this.hydrated = true;
  }
```

At the very top of `fetch(req)`, add:

```ts
  async fetch(req: Request): Promise<Response> {
    await this.hydrate();
    // ... rest unchanged
```

On the first-connect path — locate the block that currently reads (around line 81):

```ts
      this.pairSignPub = pub;
      this.cachedSid = sid;
      role = 'desktop';
```

Change it to:

```ts
      this.pairSignPub = pub;
      this.cachedSid = sid;
      role = 'desktop';
      await this.state.storage.put('pairSignPub', pub);
      await this.state.storage.put('epoch', this.epoch);
```

On the revoke path — locate `this.epoch++;` inside `handleRevoke` (around line 210):

```ts
    this.epoch++;
```

Change it to:

```ts
    this.epoch++;
    await this.state.storage.put('epoch', this.epoch);
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `cd relay && npx vitest run src/__tests__/session-do.test.ts`

Expected: the new test passes. All prior tests still pass (they use `makeState()` without args, which now creates an isolated storage per call — unchanged from the prior no-op).

- [ ] **Step 5: Add the second test — epoch survives restart**

Append inside the new `describe('SessionDO — storage persistence', ...)` block:

```ts
  it('persists epoch after revoke so a fresh isolate rejects tokens signed with the old epoch', async () => {
    const storage = makeStorage();
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);

    // Establish pairSignPub and bump the epoch via revoke.
    const first = new SessionDO(makeState(storage), {} as any);
    const desktopToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 1, exp: Date.now() + 60_000,
    });
    await first.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${desktopToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    const revokeRes = await first.fetch(new Request('https://test/s/abc/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${desktopToken}` },
    }));
    expect(revokeRes.status).toBe(200);
    expect(await storage.get('epoch')).toBe(2);

    // Second isolate — stale epoch=1 token must be rejected.
    const second = new SessionDO(makeState(storage), {} as any);
    const staleToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 1, exp: Date.now() + 60_000,
    });
    const secondRes = await second.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${staleToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    expect(secondRes.status).toBe(401);

    // Fresh epoch=2 token from the same identity must work.
    const freshToken = signToken(priv, {
      sid: 'abc', role: 'desktop', epoch: 2, exp: Date.now() + 60_000,
    });
    const freshRes = await second.fetch(new Request('https://test/s/abc', {
      headers: {
        Upgrade: 'websocket',
        Authorization: `Bearer ${freshToken}`,
        'X-PairSign-Pub': b64url(pub),
      },
    }));
    expect(freshRes.status).toBe(101);
  });
```

- [ ] **Step 6: Run the suite — all tests including the new epoch test should pass**

Run: `cd relay && npx vitest run src/__tests__/session-do.test.ts`

Expected: the test passes. Full relay suite: `cd relay && npx vitest run` → 32 passing (30 baseline + 2 new).

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add relay/src/session-do.ts relay/src/__tests__/session-do.test.ts
git commit -m "feat(relay): persist SessionDO pairSignPub and epoch to storage"
```

---

## Task 3: Remove the mobile snapshot cache

**Files:**
- Delete: `mobile/src/state/cache.ts`
- Modify: `mobile/src/session/useSession.ts`
- Modify: `mobile/src/__tests__/useSession.test.ts`
- Modify: `mobile/src/__tests__/SessionScreen.test.tsx`
- Modify: `shared/stores/session.store.ts`

- [ ] **Step 1: Delete `mobile/src/state/cache.ts`**

```bash
cd "$(git rev-parse --show-toplevel)"
rm mobile/src/state/cache.ts
```

- [ ] **Step 2: Edit `mobile/src/session/useSession.ts`**

Remove the import (currently line 6):

```ts
import { loadLastKnown, saveLastKnown } from '../state/cache';
```

Remove the `loadLastKnown` hydration block inside the effect (currently lines 52-56):

```ts
    // Hydrate from cache asynchronously — best effort, doesn't block mount.
    loadLastKnown().then((last) => {
      if (last) useSessionStore.getState().hydrateFromCache(last.snapshot);
    });
```

The effect now opens directly with `const transport = createTransportForDevice(deviceRef.current);`.

Remove the three `saveLastKnown` calls:

- Line ~76, in the `snapshot` case:
  ```ts
          void saveLastKnown(m.snapshot);
  ```
- Line ~87, in the `chatFeed` case:
  ```ts
          if (snap) void saveLastKnown(snap);
  ```
- Line ~94, in the `state` case:
  ```ts
            if (snap) void saveLastKnown(snap);
  ```

Also remove the now-orphaned debug log lines around the `chatFeed` case if they only exist to observe the cache path. Concretely, leave these in place:

```ts
        case 'chatFeed': {
          const pre = useSessionStore.getState().snapshot;
          console.log('[useSession] chatFeed got', m.messages.length, 'msgs; snapshot?', !!pre, 'tailBefore=', pre?.chatTail.length ?? 'n/a');
          store.appendChat(m.messages);
          const snap = useSessionStore.getState().snapshot;
          console.log('[useSession] chatFeed after appendChat tailAfter=', snap?.chatTail.length ?? 'n/a');
          break;
        }
```

(The two `console.log` lines are useful for debugging the production-relevant `chatFeed` flow; only delete the `saveLastKnown` line between them. The `snap` variable is still used by the `tailAfter` log, so keep the assignment.)

And for the `state` case, keep the snapshot block structure but drop the save:

```ts
        case 'state':
          store.applyStatePatch(m.patch);
          break;
```

(The inline `{ const snap = ... if (snap) void saveLastKnown(snap) }` block is fully removed; nothing else inside it.)

- [ ] **Step 3: Edit `shared/stores/session.store.ts` — drop the orphaned `hydrateFromCache` method**

Remove from the interface (around line 23):

```ts
  hydrateFromCache: (s: SessionSnapshot) => void;
```

Remove from the implementation (around line 70):

```ts
  hydrateFromCache: (snapshot) => set({ snapshot }),
```

Leave a trailing comma / structural context consistent with what's around those lines. Sanity-check by grepping:

```bash
grep -rn "hydrateFromCache" mobile/ electron/ shared/ src/ tests/
```

Expected: zero matches after the edits.

- [ ] **Step 4: Edit `mobile/src/__tests__/useSession.test.ts`**

Remove the cache mock block (lines 9-12):

```ts
jest.mock('../state/cache', () => ({
  loadLastKnown: jest.fn().mockResolvedValue(null),
  saveLastKnown: jest.fn().mockResolvedValue(undefined),
}));
```

Remove the import (line 19):

```ts
import { saveLastKnown } from '../state/cache';
```

Remove the `saveLastKnown` reset in `beforeEach` (line 57):

```ts
    (saveLastKnown as jest.Mock).mockReset();
```

Update the three tests that assert on `saveLastKnown`:

- `it('routes snapshot messages to the store and cache', ...)` — rename to `it('routes snapshot messages to the store', ...)` and remove the `expect(saveLastKnown).toHaveBeenCalledWith(snapshot);` line.
- `it('chatFeed appends messages and re-saves the snapshot', ...)` — rename to `it('chatFeed appends messages to the snapshot chatTail', ...)`, remove the `(saveLastKnown as jest.Mock).mockClear();` line and the `expect(saveLastKnown).toHaveBeenCalledTimes(1);` line.
- `it('state patch updates the snapshot and re-saves it', ...)` — rename to `it('state patch updates the snapshot', ...)`, remove the `(saveLastKnown as jest.Mock).mockClear();` line and the `expect(saveLastKnown).toHaveBeenCalledTimes(1);` line.

The core behavioral assertions (`useSessionStore.getState().snapshot` matches, `chatTail` gets a new entry, `phase` updates) stay.

- [ ] **Step 5: Edit `mobile/src/__tests__/SessionScreen.test.tsx`**

Remove the cache mock block (around lines 10-13):

```ts
jest.mock('../state/cache', () => ({
  loadLastKnown: jest.fn().mockResolvedValue(null),
  saveLastKnown: jest.fn().mockResolvedValue(undefined),
}));
```

No other edits to this file.

- [ ] **Step 6: Run mobile tests**

```bash
cd mobile && npx jest
```

Expected: all suites pass, 51 tests (same count — we renamed three tests rather than deleting them).

If a test fails because `useSession` still imports `../state/cache` (will produce a resolver error since the file is deleted), re-check Step 2.

- [ ] **Step 7: Run shared-store tests and the desktop suite**

```bash
cd "$(git rev-parse --show-toplevel)"
npx vitest run
```

Expected: 795 passing. The shared store's tests (if any exercise `hydrateFromCache`) should continue passing after the method is removed — or fail cleanly if they do; in that case, remove the stale test cases too.

- [ ] **Step 8: Final grep — no `cache` references leak**

Run:
```bash
grep -rn "state/cache\|loadLastKnown\|saveLastKnown\|lastKnownState" \
     mobile/ electron/ shared/ src/ tests/ 2>/dev/null
```

Expected: zero matches.

- [ ] **Step 9: Commit**

```bash
git add -A mobile/src/state mobile/src/session/useSession.ts \
          mobile/src/__tests__/useSession.test.ts mobile/src/__tests__/SessionScreen.test.tsx \
          shared/stores/session.store.ts
git commit -m "refactor(mobile): remove stale-chat AsyncStorage cache"
```

`git add -A mobile/src/state` captures the deletion of `cache.ts`.

---

## Post-task verification

After all three tasks commit cleanly, run a final sweep:

- [ ] **Full test sweep**

```bash
cd "$(git rev-parse --show-toplevel)"
npx vitest run && (cd mobile && npx jest) && (cd relay && npx vitest run)
```

Expected: 795 + 51 + 32 passing. Zero failures.

- [ ] **Branch commit audit**

```bash
git log --oneline main..HEAD
```

Expected: three commits plus this plan file — `fix(mobile): phase tabs ...`, `feat(relay): persist SessionDO ...`, `refactor(mobile): remove stale-chat ...`.

- [ ] **Manual QA (deferred to user):**
  1. Rebuild mobile Expo client, launch → confirm tabs sit below status bar.
  2. Deploy new relay to staging (`cd relay && npm run deploy:staging`), confirm a fresh phone connect doesn't 401.
  3. Force-quit mobile app → relaunch → confirm IdleScreen appears (not ghost chat) until desktop snapshot arrives.
