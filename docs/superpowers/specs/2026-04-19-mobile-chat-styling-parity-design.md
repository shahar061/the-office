# Mobile Chat Styling Parity — Design

**Status:** design approved, pending user review
**Target:** `src/mobile-renderer/` (WebView bundle)
**Decomposition context:** this is sub-project 1 of 3 on the path to full mobile-chat parity with desktop. Sub-project 2 adds live context signals (waiting / activity / phase transitions). Sub-project 3 adds archived runs, uncapped history, and interactive `QuestionBubble`. Each is its own spec + plan.

---

## Problem

Today the mobile companion's Chat tab renders each `ChatMessage` as a minimalist `<div class="chat-message">` with an uppercase role label and a plain-text body. Markdown, code blocks, tables, inline code, timestamps, pretty sender names, and the recently-added `📱 Mobile` badge are all absent. Agent responses that include formatted text or code come out as escaped raw text.

Desktop's chat panel (`ChatPanel` + `MessageBubble` + `MessageRenderer` + `MarkdownContent`) has all of that. The user sees the same conversation as two visually different experiences depending on which device they look at.

## Goal

Make the mobile Chat tab render messages with the same visual fidelity as desktop. Same bubble styling per role, same markdown rendering (markdown, code blocks, tables, inline code, links), same timestamps, same pretty sender names, same `📱 Mobile` badge — powered by the same React components desktop uses.

## Non-Goals

- **Waiting-for-response indicator** ("Awaiting your response" italic line under the last bubble). Sub-project 2.
- **Activity indicator** ("Engineer is reading `foo.ts`…" under the composer). Sub-project 2.
- **Phase transition separators / PhaseActionButton**. Sub-project 2.
- **Archived-runs collapsible sections**. Sub-project 3.
- **Uncapped full-history sync**. Sub-project 3. The 50-message `chatTail` cap stays for now.
- **Interactive `QuestionBubble`** (tap-to-answer from phone). Sub-project 3.
- **Moving chat out of the WebView into React Native.** Evaluated and explicitly rejected for this sub-project; would make "same visual as desktop" strictly harder because RN markdown libraries have fewer features and different styling. If native touch feel becomes a priority later, that's a separate architectural move.

## Architecture

Re-use desktop components directly. No duplication.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ src/mobile-renderer/ChatView.tsx                                            │
│                                                                             │
│   const messages = snapshot?.chatTail ?? [];                                │
│   return messages.map(m => <MessageBubble msg={m} isWaiting={false} />)     │
│                                        │                                    │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │  (import via @/components/...)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ src/renderer/src/components/OfficeView/                                     │
│   MessageBubble.tsx   ──▶ MessageRenderer.tsx ──▶ MarkdownContent.tsx       │
│      │                       │                        │                     │
│      ├── colors, theme       ├── plain text for       ├── react-markdown    │
│      ├── agentDisplayName    │   user / system        ├── remark-gfm        │
│      ├── formatTime          └── MarkdownContent      └── ErrorBoundary     │
│      └── "📱 Mobile" tag         for agent                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why direct import works

- `src/mobile-renderer/vite.config.mobile.ts` already defines `'@' → src/renderer/src`. Imports like `@/components/OfficeView/MessageBubble` resolve cleanly.
- The chain of components (`MessageBubble` → `MessageRenderer` → `MarkdownContent` → `agentDisplayName`, `formatTime`, `colors`) depends only on platform-neutral code (react-markdown, `@shared/types`, theme data, utility functions). Zero Electron / IPC / DOM-desktop-only deps.
- `react-markdown` and `remark-gfm` are already in root `package.json`. `vite-plugin-singlefile` inlines everything into the mobile bundle.

### Data source

Unchanged. `useSessionStore((s) => s.snapshot?.chatTail)`. The Expo-side `useSession` populates this via the existing `chatFeed` → `appendChat` path. Sub-project 1 makes no wire-protocol change.

### Key design decisions

1. **Import, don't duplicate.** The components are already exactly what we want — any future styling or markdown tweak on desktop automatically propagates to mobile.
2. **WebView over native RN.** Same technology as desktop — same CSS, same DOM tree, same markdown output. RN would be a bigger build for strictly worse parity.
3. **`isWaiting={false}` always** in sub-project 1. Sub-project 2 threads real waiting state.

## File Changes

### `src/mobile-renderer/ChatView.tsx` — rewrite

```tsx
import { useEffect, useRef } from 'react';
import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { MessageBubble } from '@/components/OfficeView/MessageBubble';

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

Delta from today:
- Drops the inline `<div class="chat-message">` loop with manual role label + plain text body.
- Imports `MessageBubble` via the `@` alias.
- Always passes `isWaiting={false}` — sub-project 2 introduces real waiting state wiring.

### `src/mobile-renderer/style.css` — add one block

Append near the existing `.chat-list` / `.chat-message` / `.chat-empty` rules:

```css
/* Vertical gap between message bubbles. Desktop's flex gap lives in the
   ChatPanel wrapper; mobile's parent here is `.chat-list` so it owns the
   spacing. */
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Code blocks + tables can easily overflow a phone-width bubble. Horizontal
   scroll inside the block instead of letting the page widen. */
.chat-list pre,
.chat-list table {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

/* Long unbreakable tokens (URLs, long identifiers in inline code) break at
   character boundaries instead of pushing bubble width. */
.chat-list a,
.chat-list code {
  overflow-wrap: anywhere;
}
```

Existing `.chat-message` rule becomes redundant once `MessageBubble` provides its own bubble styling via inline React styles. Leave it in place — doesn't hurt and will eventually fade as no element references the class. Explicit removal is a nice-to-have cleanup, not required for the sub-project.

### No other files change

- `MobileApp.tsx` — already renders `<ChatView />` when the Chat tab is active.
- `vite.config.mobile.ts` — the `@` alias already exists.
- Root `package.json` — `react-markdown` and `remark-gfm` are already deps.

## Edge Cases

**Long unbreakable tokens** — `overflow-wrap: anywhere` on `.chat-list a, .chat-list code` lets URLs/long identifiers break at character boundaries rather than pushing the bubble wider than the viewport.

**Wide code blocks and tables** — `overflow-x: auto` + `-webkit-overflow-scrolling: touch` gives momentum-scrolling horizontal overflow inside the block. User swipes horizontally within the block to see the rest; the page width doesn't grow.

**Very long messages** — `chatTail` is capped at 50 entries by the data structure. Individual message bodies can be any length; bubble height isn't capped. Auto-scroll pins to bottom on new messages.

**Markdown rendering failure** — `MarkdownContent.tsx` already wraps its react-markdown call in an `ErrorBoundary` that falls back to plain text. Ported for free.

**Inline styles conflicting with our CSS** — the ported components use inline `React.CSSProperties` on *wrapper* elements and rely on default HTML output for inner tags (`<pre>`, `<code>`, `<table>`). Our CSS class selectors target those default tags, so they don't fight wrapper inline styles. If a future change adds inline styles to the targeted tags, the implementer can add `!important` or move the wrapper rules into the CSS file.

**Scroll position during live updates** — existing behavior: `scrollTop = scrollHeight` on every chatTail length change. User scrolled up → new message → snaps back to bottom. Matches desktop's current behavior. Smarter "sticky" scrolling (only snap if already near bottom) is out of scope.

**Empty state** — `"No messages yet."` rendered via the existing `.chat-empty` class. Unchanged.

## Testing Strategy

### Automated (jest, mobile/)

**`src/mobile-renderer/__tests__/ChatView.test.tsx`** — three tests covering the rendering-shape change.

1. Empty state — `snapshot.chatTail = []` → renders a div with text `"No messages yet."`.
2. Renders N `MessageBubble`s — three messages in `chatTail` → component renders three `MessageBubble` stubs (mock the import) with the matching message props.
3. Auto-scroll — when `chatTail.length` grows from 1 to 2, `listRef.current.scrollTop` is set to `listRef.current.scrollHeight`.

MessageBubble's deep rendering (react-markdown output, styling correctness) is **not** tested at the mobile layer — desktop's component tests (if any) cover it; we're just wiring the import.

### Manual QA (end-of-implementation gate)

1. **Empty state** — fresh pair, Chat tab → "No messages yet."
2. **Plain user message** — send from phone → styled bubble with `You` label, `📱 Mobile` badge, timestamp.
3. **Agent response with markdown** — bold / bullet list / inline code → renders formatted, not escaped.
4. **Code block** — agent message containing a ~120-char triple-backtick block → horizontal scroll inside the block; page width stays at viewport width.
5. **Long URL** — message with an 80-char URL → wraps at the bubble edge.

Pass all five → sub-project 1 done.

### Not tested

- Visual pixel parity with desktop — subjective; covered by side-by-side manual comparison during QA.
- WebView rendering quirks across iOS + Android versions — device matrix out of scope. Tested on whichever device runs QA.

## Implementation Order (preview for writing-plans)

Four tasks. Each small.

1. **Refactor `ChatView.tsx`** to use the imported `MessageBubble`. Preserve the empty state + auto-scroll effect. Pass `isWaiting={false}`.
2. **Add the CSS block to `style.css`** — `.chat-list` flex gap, `pre`/`table` horizontal scroll, `overflow-wrap` on `a`/`code`.
3. **Write `ChatView.test.tsx`** — three tests. Mock `MessageBubble` as a stub to isolate ChatView's rendering shape.
4. **Rebuild the webview bundle** (`npm run build:mobile-all`), commit, run the 5-item manual QA checklist.

Writing-plans turns these into bite-sized TDD steps with full code and commands.
