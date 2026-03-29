# Chat & Artifact Improvements Design

Three independent improvements to the Office plugin: question persistence in chat, rich expanded chat mode, and multi-tile artifact extraction.

---

## Feature 1: Question Persistence in Chat

### Problem

When a user answers an agent's question, the question bubble disappears and only the user's answer appears as a message. The conversation loses context — you can't see what was asked.

### Solution

Inject the question text as an agent `ChatMessage` before the user's answer message on submission.

### Implementation

**Renderer — `OfficeView.tsx` `handleSend()`:**

Before clearing waiting state and adding the user message:

1. Capture `waitingQuestions[0].question` text and `waitingAgentRole`
2. Create a `ChatMessage` with `role: 'agent'`, the agent's role, and the question text
3. Call `addMessage()` with the question message
4. Then add the user's answer message as normal
5. Then call `respondToAgent()` and clear waiting state

**Backend — `main.ts` user response handler:**

When persisting the user's answer to chat history, also persist the question message before it. This ensures archived runs show the full Q&A conversation flow.

### Result

Chat reads as a natural conversation:
```
[CEO] What tech stack do you prefer?
[You] React + TypeScript
```

### Files Changed

- `src/renderer/src/components/OfficeView/OfficeView.tsx` — `handleSend()` injects question message before answer
- `electron/main.ts` — persist question message alongside answer in chat history

---

## Feature 2: Rich Expanded Chat Mode

### Problem

The expanded chat mode shows option buttons with labels only. The `description` field sent by agents is hidden in an invisible tooltip. There's no way to see agent recommendations or tradeoffs for each option.

### Solution

Extend the `AskQuestion` type with `recommendation` and per-option `tradeoffs` fields. Compact mode stays unchanged. Expanded mode renders rich option cards.

### Data Model Changes

**`shared/types.ts`:**

```typescript
interface AskQuestion {
  question: string;
  header: string;
  options: {
    label: string;
    description: string;
    tradeoffs?: string;     // short pros/cons for this option
  }[];
  multiSelect: boolean;
  recommendation?: string;  // which option label the agent recommends
}
```

New fields are optional so existing agent behavior is unaffected.

### Compact Mode (Unchanged)

- Question text + grid of label-only buttons
- Same layout and sizing as today

### Expanded Mode (New Rich Layout)

- Question text at the top
- Each option rendered as a card:
  - **Label** — bold, prominent
  - **Description** — the existing field, now visible (not just tooltip)
  - **Tradeoffs** — short text, dimmer/secondary styling
  - **"Recommended" badge** — shown if `option.label === question.recommendation`
- Single-column card layout (more room for text content)
- Clicking a card sets it as the input value (same behavior as today)

### Agent Prompt Updates

Update agent instructions/prompts that use `AskUserQuestion` to populate the new fields:
- `recommendation`: the label of the option the agent suggests
- `tradeoffs`: a short sentence per option explaining pros/cons

### Files Changed

- `shared/types.ts` — extend `AskQuestion` interface with `recommendation` and option `tradeoffs`
- `src/renderer/src/components/OfficeView/OfficeView.tsx` — new expanded question rendering with card layout
- Agent prompt/instruction files — populate new fields when asking questions

---

## Feature 3: Multi-Tile Artifact Extraction

### Problem

The `precomputeExtractionTargets()` method in `TiledMapRenderer` only extracts a single tile per interactive object (stops at `found = true`). The `InteractiveObjects` class sets hit areas to a single tile. This means multi-tile furniture (whiteboards, bookshelves) only shows one tile as the interactive sprite.

The vision brief artifact works fine because it maps to a single tile. The other three (PRD, Market Analysis, System Design) are multi-tile objects that appear clipped.

### Solution

Extract ALL tiles within each interactive object's Tiled rectangle and compose them into a Container. Update InteractiveObjects to work with Containers instead of single Sprites.

### TiledMapRenderer Changes

**`precomputeExtractionTargets()`:**

- Remove `found = true` early exit — collect ALL non-empty tiles within each interactive rect
- Scan both `furniture-below` and `furniture-above` layers, keeping tiles from both (a furniture object can span both layers — e.g., desk legs below characters, desk surface above)
- Store extraction targets as a map from object name to array of `{ layer, tx, ty }` entries
- Maintain a `Set<string>` of `"layer:tx:ty"` keys to exclude from normal static rendering

**New: `buildExtractedGroups()`:**

- For each interactive object, create a `Container`
- Add all extracted tile sprites positioned relative to the rect's origin (tile 0,0 of the rect)
- Store in `extractedSpriteGroups: Map<string, Container>`
- Position each container at `rect.x * tileSize, rect.y * tileSize` in world space

**API change:**

- Replace `getExtractedSprites(): Map<string, Sprite>` with `getExtractedGroups(): Map<string, Container>`

### InteractiveObjects Changes

**Constructor:**

- Accept `Map<string, Container>` instead of `Map<string, Sprite>`

**`setupSprite()` → `setupObject()`:**

- Work with Container instead of Sprite
- Hit area covers full rect: `new Rectangle(0, 0, rect.width * tileSize, rect.height * tileSize)`
- OutlineFilter applied to the Container (supported in PixiJS 8)
- Tooltip centered above the full container width

### OfficeScene Changes

- Update the call from `getExtractedSprites()` to `getExtractedGroups()`

### Tiled Boundaries

The user needs to verify/adjust the interactive object rectangles in the Tiled editor to fully cover the furniture objects for PRD, Market Analysis, and System Design. Vision brief boundaries are correct.

### Files Changed

- `src/renderer/src/office/engine/TiledMapRenderer.ts` — multi-tile extraction, Container per object
- `src/renderer/src/office/InteractiveObjects.ts` — accept Container, full-region hit area and tooltip
- `src/renderer/src/office/OfficeScene.ts` — update API call site
- `src/renderer/src/assets/maps/office.tmj` — user adjusts boundaries in Tiled editor
