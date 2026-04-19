# Mobile Chat Styling Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile WebView's Chat tab render messages with the same visual fidelity as the desktop chat panel (role-colored bubbles, markdown / code blocks / tables, timestamps, pretty sender names, `📱 Mobile` badge).

**Architecture:** Re-use desktop components directly. `src/mobile-renderer/ChatView.tsx` is rewritten to loop `<MessageBubble>` imported from `src/renderer/src/components/OfficeView/`. No wire-protocol change, no new dependency, no duplication. `vite-plugin-singlefile` bundles the shared `react-markdown` + `remark-gfm` into the mobile webview HTML.

**Tech Stack:** React 19, react-markdown 9, remark-gfm 4, Vite 6, vitest (jsdom environment), TypeScript 5.9, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-04-19-mobile-chat-styling-parity-design.md`

---

## File Structure

### Modified files

- `src/mobile-renderer/ChatView.tsx` — swap raw-text loop for a loop over `MessageBubble`. Relative import path used so the same module resolves in both the mobile-renderer Vite build and in vitest (which has a different `@` alias target).
- `src/mobile-renderer/style.css` — append one block: vertical gap between bubbles; horizontal scroll on `pre`/`table`; break long URLs/identifiers.

### New files

- `src/mobile-renderer/__tests__/ChatView.test.tsx` — three vitest tests covering empty state, renders-N-bubbles, and auto-scroll. Mocks `MessageBubble` to isolate ChatView's rendering shape.

### Unchanged but imported

- `src/renderer/src/components/OfficeView/MessageBubble.tsx`
- `src/renderer/src/components/OfficeView/MessageRenderer.tsx`
- `src/renderer/src/components/OfficeView/MarkdownContent.tsx`
- `src/renderer/src/utils.ts` (`agentDisplayName`, `formatTime`)
- `src/renderer/src/theme/index.ts`

### Import path choice

The mobile-renderer's `vite.config.mobile.ts` aliases `@ → src/renderer/src`. Root `vitest.config.ts` aliases `@ → src/`. The two aliases point to different directories, which would break tests if ChatView imported `MessageBubble` via `@/components/OfficeView/MessageBubble`.

**Resolution: use a relative path.** From `src/mobile-renderer/ChatView.tsx`, the relative import `'../renderer/src/components/OfficeView/MessageBubble'` resolves the same way under both build systems.

---

## Task 1: ChatView refactor + tests (TDD)

**Files:**
- Create: `src/mobile-renderer/__tests__/ChatView.test.tsx`
- Modify: `src/mobile-renderer/ChatView.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/mobile-renderer/__tests__/ChatView.test.tsx`:

```tsx
/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useSessionStore } from '../../../shared/stores/session.store';
import type { ChatMessage, SessionSnapshot } from '../../../shared/types';

// Stub MessageBubble so the test isolates ChatView's wiring (empty state
// render, map-over-messages render, auto-scroll effect) from
// react-markdown's DOM output.
vi.mock('../../renderer/src/components/OfficeView/MessageBubble', () => ({
  MessageBubble: ({ msg }: { msg: ChatMessage; isWaiting: boolean }) => (
    <div data-testid="mb" data-msg-id={msg.id}>{msg.text}</div>
  ),
}));

import { ChatView } from '../ChatView';

const BASE_SNAPSHOT: SessionSnapshot = {
  sessionId: 's',
  desktopName: 'test',
  phase: 'idle',
  startedAt: 1,
  activeAgentId: null,
  characters: [],
  chatTail: [],
  sessionEnded: false,
};

function setSnapshot(chatTail: ChatMessage[]): void {
  useSessionStore.setState({ snapshot: { ...BASE_SNAPSHOT, chatTail } });
}

describe('ChatView', () => {
  beforeEach(() => {
    useSessionStore.setState({ snapshot: null, pendingEvents: [] });
  });

  it('renders the empty state when chatTail is empty', () => {
    setSnapshot([]);
    const { getByText } = render(<ChatView />);
    expect(getByText('No messages yet.')).toBeTruthy();
  });

  it('renders one MessageBubble per message in chatTail', () => {
    setSnapshot([
      { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
      { id: 'm2', role: 'agent', agentRole: 'ceo', text: 'hello', timestamp: 20 },
      { id: 'm3', role: 'system', text: '---', timestamp: 30 },
    ]);
    const { getAllByTestId } = render(<ChatView />);
    const bubbles = getAllByTestId('mb');
    expect(bubbles).toHaveLength(3);
    expect(bubbles.map((b) => b.getAttribute('data-msg-id'))).toEqual(['m1', 'm2', 'm3']);
  });

  it('auto-scrolls the list to the bottom when a new message arrives', () => {
    setSnapshot([{ id: 'm1', role: 'user', text: 'hi', timestamp: 10 }]);
    const { container, rerender } = render(<ChatView />);
    const list = container.querySelector('.chat-list') as HTMLDivElement;
    // jsdom computes 0 for both values; force non-zero so the assertion is meaningful.
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 });
    list.scrollTop = 0;
    setSnapshot([
      { id: 'm1', role: 'user', text: 'hi', timestamp: 10 },
      { id: 'm2', role: 'agent', text: 'yo', timestamp: 20 },
    ]);
    rerender(<ChatView />);
    expect(list.scrollTop).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office && npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx
```

Expected: FAIL — ChatView still uses the old rendering that emits `<div class="chat-message">` tags, so `getAllByTestId('mb')` finds nothing. Test 2 fails (`toHaveLength(3)` vs 0). Test 1 may pass accidentally (empty state is unchanged); test 3 fails because the current ChatView's effect already sets scrollTop but the map loop structure is different.

If `@testing-library/react` isn't installed as a devDep at the repo root, the import will fail with a module-not-found. In that case, install it:

```
npm install --save-dev --legacy-peer-deps @testing-library/react
```

and re-run the tests.

- [ ] **Step 3: Rewrite `ChatView.tsx`**

Replace the full contents of `src/mobile-renderer/ChatView.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '../renderer/src/components/OfficeView/MessageBubble';

export function ChatView(): React.JSX.Element {
  const snapshot = useSessionStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [snapshot?.chatTail.length]);

  const messages = snapshot?.chatTail ?? [];
  if (messages.length === 0) {
    return <div className="chat-empty">No messages yet.</div>;
  }

  return (
    <div className="chat-list" ref={listRef}>
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} isWaiting={false} />
      ))}
    </div>
  );
}
```

Note the relative import path `'../renderer/src/components/OfficeView/MessageBubble'` — this resolves identically under the mobile-renderer Vite build (root: `src/mobile-renderer/`) and vitest (root: `.`). Do not switch to `'@/...'` — those aliases point to different directories under the two build systems.

- [ ] **Step 4: Run the tests — confirm they pass**

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office && npx vitest run src/mobile-renderer/__tests__/ChatView.test.tsx
```

Expected: PASS (3 tests).

Also run the broader mobile-renderer suite to confirm no regressions:

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office && npx vitest run src/mobile-renderer/__tests__/
```

Expected: all pre-existing tests (`bridge.test.ts`, `PortraitCamera.test.ts`) still pass.

- [ ] **Step 5: tsc check**

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office && npx tsc --noEmit -p . 2>&1 | grep -E "ChatView|mobile-renderer" | head
```

Expected: no new errors. Pre-existing errors in unrelated files are fine.

- [ ] **Step 6: Commit**

```bash
git add src/mobile-renderer/ChatView.tsx src/mobile-renderer/__tests__/ChatView.test.tsx package.json package-lock.json
git commit -m "mobile-renderer(chat): render MessageBubble from desktop; add 3 ChatView tests"
```

(Omit `package.json` / `package-lock.json` from the stage if `@testing-library/react` was already installed.)

---

## Task 2: CSS overflow rules for phone-width bubbles

**Files:**
- Modify: `src/mobile-renderer/style.css`

- [ ] **Step 1: Append the new CSS block**

Edit `src/mobile-renderer/style.css`. Append at the end of the file:

```css
/* Chat — mobile bubble adjustments for phone-width rendering ────────────── */

/* Stack message bubbles with a uniform 8px gap. The list itself owns the
   spacing (unlike desktop where ChatPanel's flex-gap parent handles it). */
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Code blocks and markdown tables routinely exceed a phone-width bubble.
   Scroll horizontally inside the block instead of blowing out the page. */
.chat-list pre,
.chat-list table {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

/* Long URLs and identifiers in inline code break at character boundaries so
   they don't push the bubble wider than the viewport. */
.chat-list a,
.chat-list code {
  overflow-wrap: anywhere;
}
```

- [ ] **Step 2: Rebuild the webview bundle**

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office && npm run build:mobile-all
```

Expected: the build succeeds, producing a fresh `mobile/assets/webview/index.html`. Bundle grows by ~300–500 KB compared to the previous build (react-markdown + remark-gfm now inlined). Still well under the 1 MB per-post message limit for the WebView.

If the build fails complaining about react-markdown import resolution, verify the root `package.json` already has `react-markdown` and `remark-gfm` as deps:

```
grep -E '"react-markdown"|"remark-gfm"' /Users/shahar/Projects/my-projects/office\ plugin/the-office/package.json
```

Both must be present. If either is missing, install it and re-run the build:

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office && npm install --legacy-peer-deps react-markdown remark-gfm
```

- [ ] **Step 3: Commit**

```bash
git add src/mobile-renderer/style.css mobile/assets/webview/index.html
git commit -m "mobile-renderer(chat): CSS gap + horizontal scroll for code/tables on phone widths"
```

If `package.json` / `package-lock.json` changed in Step 2, include them in the stage.

---

## Task 3: Manual QA

**Files:** none (behavioral gate only).

- [ ] **Step 1: Start Metro with a clean cache**

```
cd /Users/shahar/Projects/my-projects/office\ plugin/the-office/mobile && npx expo start --clear
```

- [ ] **Step 2: Reload the mobile app**

Force-quit the Expo / dev-client app on the phone, reopen, re-pair if needed. Otherwise the phone keeps serving the old cached webview HTML.

- [ ] **Step 3: Walk the QA checklist**

Tap the Chat tab in the WebView (between the canvas and the native chat composer). Verify each item:

- **3a. Empty state.** Fresh session with no chat history → shows `"No messages yet."` centered in the panel.
- **3b. Plain user message from phone.** Type a message in the native composer → hit Send → the message appears in Chat as a styled bubble with `You` label, the `📱 Mobile` badge next to it, the timestamp below.
- **3c. Agent response with markdown.** Trigger an agent response that includes markdown (**bold**, a list, inline `code`) — e.g., ask `"list 3 pros of X"` to the CEO. The response bubble renders the markdown formatted, not as escaped plain text.
- **3d. Code block.** Get an agent response containing a triple-backtick code block ~120 characters wide (e.g., a JS snippet) → swipe horizontally inside the code block to see the rest; the page itself stays at viewport width.
- **3e. Long URL.** Paste or craft a message containing an 80-character URL → the URL wraps at the bubble edge instead of pushing it wider than the viewport.

- [ ] **Step 4: If all five pass, mark complete**

No commit needed for Step 3 — this is a behavioral gate, not a code change. If anything fails, file a follow-up or fix inline in Task 1 / Task 2.

---

## Self-Review (plan vs. spec)

**Spec coverage:**

| Spec requirement | Covered by |
| --- | --- |
| ChatView re-uses desktop `MessageBubble` via import | Task 1 Step 3 |
| Always-false `isWaiting` prop for sub-project 1 | Task 1 Step 3 |
| Auto-scroll to bottom on new messages | Task 1 Step 3 (useEffect) + Task 1 Step 1 test |
| Empty state `"No messages yet."` | Task 1 Step 3 + Task 1 Step 1 test |
| CSS vertical gap between bubbles | Task 2 Step 1 |
| Horizontal scroll on `pre` + `table` | Task 2 Step 1 |
| Word-break on long URLs / inline code | Task 2 Step 1 |
| WebView bundle rebuild | Task 2 Step 2 |
| Data source unchanged (`snapshot.chatTail`) | Task 1 Step 3 (uses `useSessionStore` selector) |
| Manual QA checklist (5 items from spec §Testing Strategy) | Task 3 Step 3 (a–e, one-to-one mapping) |
| Three automated tests (empty / N bubbles / auto-scroll) | Task 1 Step 1 |

All spec items accounted for.

**Placeholder scan:** no occurrences of TBD / TODO / "implement later" / "similar to Task N". Every code step shows complete code; the one conditional install fallback (`@testing-library/react` / `react-markdown`) is explicit with exact commands and a verification grep.

**Type consistency:**
- `MessageBubble` props `{ msg: ChatMessage; isWaiting: boolean }` used in the mock in Task 1 Step 1 and the call site in Task 1 Step 3 — match desktop's signature.
- `useSessionStore` selector shape `(s) => s.snapshot` — matches all prior sub-projects' usage.
- `ChatMessage` type from `shared/types` — unchanged, has the `source?: 'mobile'|'desktop'` field added in the preceding "📱 Mobile" badge commit.
- Relative import path `'../renderer/src/components/OfficeView/MessageBubble'` — consistent between mock target and real import, confirmed to resolve identically in both build systems.
