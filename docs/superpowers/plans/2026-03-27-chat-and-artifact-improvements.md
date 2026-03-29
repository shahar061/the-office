# Chat & Artifact Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent improvements — persist questions in chat after answering, show rich option details in expanded mode, and extract full multi-tile artifacts from the Tiled map.

**Architecture:** Feature 1 injects a question ChatMessage before the user's answer in both renderer and backend. Feature 2 extends the AskQuestion type with optional `recommendation` and per-option `tradeoffs` fields, then renders rich cards in expanded mode only. Feature 3 replaces single-tile extraction with multi-tile Container-based extraction in TiledMapRenderer and updates InteractiveObjects accordingly.

**Tech Stack:** React, TypeScript, PixiJS 8, Zustand, Electron IPC

---

## File Structure

| File | Responsibility | Changed By |
|------|---------------|------------|
| `shared/types.ts` | AskQuestion type extension | Task 2 |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Question persistence + rich expanded cards | Tasks 1, 2 |
| `electron/main.ts` | Backend question persistence in chat history | Task 1 |
| `electron/orchestrator/imagine.ts` | Agent prompt updates for rich question fields | Task 2 |
| `src/renderer/src/office/engine/TiledMapRenderer.ts` | Multi-tile extraction | Task 3 |
| `src/renderer/src/office/InteractiveObjects.ts` | Container-based interactive objects | Task 3 |
| `src/renderer/src/office/OfficeScene.ts` | API call site update | Task 3 |

---

### Task 1: Question Persistence in Chat

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx:440-461` (handleSend)
- Modify: `electron/main.ts:398-416` (USER_RESPONSE handler)

- [ ] **Step 1: Update handleSend() to inject question message before answer**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, replace the `handleSend` function (lines 440-468) with:

```typescript
async function handleSend() {
  const text = inputValue.trim();
  if (!text) return;

  setInputValue('');

  // If answering a question, inject the question as an agent message first
  if (waitingForResponse && waitingSessionId) {
    if (waitingQuestions.length > 0) {
      const questionMsg: ChatMessage = {
        id: `question-${Date.now()}`,
        role: 'agent',
        agentRole: waitingAgentRole ?? undefined,
        text: waitingQuestions[0].question,
        timestamp: Date.now(),
      };
      addMessage(questionMsg);
    }

    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    });

    const answers: Record<string, string> = {};
    if (waitingQuestions.length > 0) {
      answers[waitingQuestions[0].question] = text;
    }
    await window.office.respondToAgent(waitingSessionId, answers);
    setWaiting(null);
    return;
  }

  addMessage({
    id: `user-${Date.now()}`,
    role: 'user',
    text,
    timestamp: Date.now(),
  });

  if (isIdle) {
    await window.office.startImagine(text);
  } else {
    await window.office.sendMessage(text);
  }
}
```

- [ ] **Step 2: Update backend to persist question message in chat history**

In `electron/main.ts`, update the `USER_RESPONSE` handler (lines 398-416) to persist the question text before the user's answer:

```typescript
ipcMain.handle(IPC_CHANNELS.USER_RESPONSE, async (_event, sessionId: string, answers: Record<string, string>) => {
  const pending = pendingQuestions.get(sessionId);
  if (pending) {
    if (chatHistoryStore && currentChatPhase && currentChatAgentRole && currentChatRunNumber > 0) {
      // Persist the question text as an agent message
      const questionText = Object.keys(answers).join('\n');
      if (questionText) {
        const questionMsg: ChatMessage = {
          id: randomUUID(),
          role: 'agent',
          agentRole: currentChatAgentRole,
          text: questionText,
          timestamp: Date.now(),
        };
        chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, questionMsg);
      }

      // Persist user's answer
      const answerText = Object.values(answers).join('\n');
      if (answerText) {
        const userMsg: ChatMessage = {
          id: randomUUID(),
          role: 'user',
          text: answerText,
          timestamp: Date.now(),
        };
        chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, userMsg);
      }
    }

    pendingQuestions.delete(sessionId);
    pending.resolve(answers);
  }
});
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`

Test flow:
1. Open a project, start /imagine phase
2. When CEO asks a question with options, answer it
3. Verify the chat shows: agent question bubble → your answer (two separate messages)
4. Check that archived runs also show the question-answer pair

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx electron/main.ts
git commit -m "feat: persist question text in chat after user answers"
```

---

### Task 2: Rich Expanded Chat Mode

**Files:**
- Modify: `shared/types.ts:132-138` (AskQuestion interface)
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx:241-277,611-650` (styles + renderQuestionBubble)
- Modify: `electron/orchestrator/imagine.ts:14-31,37-53,87-103` (agent prompts)

- [ ] **Step 1: Extend AskQuestion type**

In `shared/types.ts`, replace the `AskQuestion` interface (lines 133-138) with:

```typescript
export interface AskQuestion {
  question: string;
  header: string;
  options: { label: string; description: string; tradeoffs?: string }[];
  multiSelect: boolean;
  recommendation?: string;
}
```

- [ ] **Step 2: Add expanded card styles to OfficeView**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, add these new style entries to the `styles` object, after the `questionHint` entry (after line 277):

```typescript
// Expanded question card styles
expandedQuestionCard: (isRecommended: boolean) => ({
  padding: '14px 16px',
  background: isRecommended ? '#1a1a3e' : '#151528',
  border: isRecommended ? '1px solid #6366f188' : '1px solid #333',
  borderRadius: '10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '6px',
  transition: 'border-color 0.15s',
}),
expandedCardLabel: {
  fontSize: '13px',
  fontWeight: 700,
  color: '#e2e8f0',
},
expandedCardDescription: {
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: 1.4,
},
expandedCardTradeoffs: {
  fontSize: '11px',
  color: '#64748b',
  lineHeight: 1.4,
  fontStyle: 'italic' as const,
},
expandedCardBadge: (accentColor: string) => ({
  display: 'inline-block',
  fontSize: '9px',
  fontWeight: 700,
  color: accentColor,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  marginBottom: '2px',
}),
```

- [ ] **Step 3: Update renderQuestionBubble for expanded mode**

Replace the `renderQuestionBubble` function (lines 611-650) with:

```typescript
function renderQuestionBubble() {
  if (!waitingForResponse || waitingQuestions.length === 0 || waitingQuestions[0].options.length === 0) {
    return null;
  }

  const question = waitingQuestions[0];
  const accentColor = waitingAgentRole ? AGENT_COLORS[waitingAgentRole] : '#94a3b8';

  return (
    <div
      className="bubble-waiting"
      style={{
        ...styles.questionBubble(accentColor),
        '--accent-color': accentColor,
      } as React.CSSProperties}
    >
      <div style={styles.questionText(isExpanded)}>
        {question.question}
      </div>

      {isExpanded ? (
        /* Expanded mode: rich cards with description, tradeoffs, recommendation */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {question.options.map((opt) => {
            const isRecommended = question.recommendation === opt.label;
            return (
              <button
                key={opt.label}
                onClick={() => {
                  setInputValue(opt.label);
                  inputRef.current?.focus();
                }}
                style={styles.expandedQuestionCard(isRecommended)}
              >
                {isRecommended && (
                  <span style={styles.expandedCardBadge(accentColor)}>
                    ★ Recommended
                  </span>
                )}
                <span style={styles.expandedCardLabel}>{opt.label}</span>
                {opt.description && (
                  <span style={styles.expandedCardDescription}>{opt.description}</span>
                )}
                {opt.tradeoffs && (
                  <span style={styles.expandedCardTradeoffs}>{opt.tradeoffs}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* Compact mode: label-only buttons (unchanged) */
        <div style={styles.questionOptionsGrid(false)}>
          {question.options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                setInputValue(opt.label);
                inputRef.current?.focus();
              }}
              title={opt.description}
              style={styles.questionOption(false)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div style={styles.questionHint(accentColor)}>
        Click to select or type your own answer
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update agent prompts to populate rich fields**

In `electron/orchestrator/imagine.ts`, update the CEO prompt (lines 15-25) to instruct agents to use the new fields:

```typescript
await runAgentSession({
  agentName: 'ceo',
  agentsDir,
  prompt: [
    'You are the CEO leading the Discovery phase.',
    'Ask the user clarifying questions to understand their idea deeply.',
    'Use AskUserQuestion to ask structured questions with options when possible.',
    'For each option, include a description explaining it and tradeoffs (short pros/cons).',
    'Set recommendation to the label of the option you think is best.',
    'When you have enough understanding, write the vision brief to docs/office/01-vision-brief.md.',
    '',
    `The user's idea: ${userIdea}`,
  ].join('\n'),
  cwd: projectDir,
  env,
  expectedOutput: 'docs/office/01-vision-brief.md',
  onEvent,
  onWaiting,
});
```

Update the PM prompt (lines 37-48):

```typescript
await runAgentSession({
  agentName: 'product-manager',
  agentsDir,
  prompt: [
    'You are the Product Manager leading the Definition phase.',
    'Based on the vision brief below, ask the user questions to refine requirements.',
    'Use AskUserQuestion for structured questions when possible.',
    'For each option, include a description explaining it and tradeoffs (short pros/cons).',
    'Set recommendation to the label of the option you think is best.',
    'Produce a detailed PRD and write it to docs/office/02-prd.md.',
    '',
    '## Vision Brief',
    visionBrief,
  ].join('\n'),
  cwd: projectDir,
  env,
  expectedOutput: 'docs/office/02-prd.md',
  onEvent,
  onWaiting,
});
```

Update the Chief Architect prompt (lines 87-97):

```typescript
await runAgentSession({
  agentName: 'chief-architect',
  agentsDir,
  prompt: [
    'You are the Chief Architect leading the Architecture phase.',
    'Based on the design documents below, ask the user about tech stack preferences.',
    'Use AskUserQuestion for structured questions when possible.',
    'For each option, include a description explaining it and tradeoffs (short pros/cons).',
    'Set recommendation to the label of the option you think is best.',
    'Design the system architecture and write it to docs/office/04-system-design.md.',
    '',
    allDocs,
  ].join('\n'),
  cwd: projectDir,
  env,
  expectedOutput: 'docs/office/04-system-design.md',
  onEvent,
  onWaiting,
});
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`

Test flow:
1. Start a project and begin /imagine
2. When agent asks a question, toggle to expanded mode
3. Verify expanded mode shows cards with description, tradeoffs, and recommended badge
4. Verify compact mode still shows label-only buttons
5. Verify clicking a card populates the input field

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts src/renderer/src/components/OfficeView/OfficeView.tsx electron/orchestrator/imagine.ts
git commit -m "feat: rich expanded chat mode with descriptions, tradeoffs, and recommendations"
```

---

### Task 3: Multi-Tile Artifact Extraction

**Files:**
- Modify: `src/renderer/src/office/engine/TiledMapRenderer.ts:89-246` (extraction logic)
- Modify: `src/renderer/src/office/InteractiveObjects.ts` (Container support)
- Modify: `src/renderer/src/office/OfficeScene.ts:138-147` (API call site)

- [ ] **Step 1: Refactor TiledMapRenderer for multi-tile extraction**

In `src/renderer/src/office/engine/TiledMapRenderer.ts`, replace the extraction-related fields and methods.

First, update the class fields (around lines 89-91):

Replace:
```typescript
private extractedSprites: Map<string, Sprite> = new Map()
/** Pre-computed "layer:tx:ty" → objectName for tile extraction */
private extractionTargets: Map<string, string> = new Map()
```

With:
```typescript
private extractedGroups: Map<string, Container> = new Map()
/** Set of "layer:tx:ty" keys to skip in normal rendering */
private extractionSkips: Set<string> = new Set()
/** Collected tiles per interactive object: objectName → array of { layer, tx, ty } */
private extractionCollected: Map<string, { layer: string; tx: number; ty: number }[]> = new Map()
```

Next, replace the `precomputeExtractionTargets` method (lines 218-246) with:

```typescript
/**
 * Collect ALL tiles within each interactive object's rect,
 * from both furniture-below and furniture-above layers.
 */
private collectExtractionTargets(): void {
  for (const layerName of ['furniture-below', 'furniture-above'] as const) {
    const layer = this.findLayer(layerName, 'tilelayer')
    if (!layer?.data) continue

    for (const [name, rect] of this.interactiveObjects) {
      for (let dy = 0; dy < rect.height; dy++) {
        for (let dx = 0; dx < rect.width; dx++) {
          const tx = rect.x + dx
          const ty = rect.y + dy
          if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue
          const rawId = layer.data[ty * this.width + tx]
          if ((rawId & TILE_ID_MASK) !== 0) {
            const key = `${layerName}:${tx}:${ty}`
            this.extractionSkips.add(key)
            if (!this.extractionCollected.has(name)) {
              this.extractionCollected.set(name, [])
            }
            this.extractionCollected.get(name)!.push({ layer: layerName, tx, ty })
          }
        }
      }
    }
  }
}
```

Update the constructor (line 106) to call the renamed method:

Replace:
```typescript
this.precomputeExtractionTargets()
```

With:
```typescript
this.collectExtractionTargets()
```

Replace the `getExtractedSprites` method (lines 209-211) with:

```typescript
getExtractedGroups(): Map<string, Container> {
  return this.extractedGroups
}
```

- [ ] **Step 2: Update buildTileLayers to extract multi-tile groups**

In the `buildTileLayers` method (lines 257-338), update the extraction check inside the tile loop.

Replace these lines (around 320-326):
```typescript
// Extract tiles that overlap interactive objects instead of
// rendering them into the static layer (pre-computed targets)
const interactiveName = this.extractionTargets.get(`${layerName}:${x}:${y}`)

if (interactiveName) {
  this.extractedSprites.set(interactiveName, sprite)
} else {
  container.addChild(sprite)
}
```

With:
```typescript
// Skip tiles collected for interactive object extraction
const skipKey = `${layerName}:${x}:${y}`
if (this.extractionSkips.has(skipKey)) {
  // Will be added to extracted groups below
  continue
}

container.addChild(sprite)
```

Then, at the end of `buildTileLayers` (right before the closing `}`), add the group assembly:

```typescript
// Assemble extracted groups from collected tiles
for (const [name, tiles] of this.extractionCollected) {
  const rect = this.interactiveObjects.get(name)
  if (!rect) continue

  const group = new Container()
  group.label = name
  group.x = rect.x * this.tileSize
  group.y = rect.y * this.tileSize

  for (const tile of tiles) {
    const layer = this.findLayer(tile.layer, 'tilelayer')
    if (!layer?.data) continue

    const raw = layer.data[tile.ty * this.width + tile.tx]
    if (raw === 0) continue

    const flippedH = (raw & FLIPPED_H_FLAG) !== 0
    const flippedV = (raw & FLIPPED_V_FLAG) !== 0
    const flippedD = (raw & FLIPPED_D_FLAG) !== 0
    const tileId = raw & TILE_ID_MASK

    const resolved = this.resolveTileset(tileId)
    if (!resolved) continue

    const { tileset, texture } = resolved
    const cols = tileset.columns ?? 16
    const tw = tileset.tilewidth ?? this.tileSize
    const th = tileset.tileheight ?? this.tileSize
    const localId = tileId - tileset.firstgid
    const srcX = (localId % cols) * tw
    const srcY = Math.floor(localId / cols) * th

    const frame = new Rectangle(srcX, srcY, tw, th)
    const tileTexture = new Texture({ source: texture.source, frame })
    const sprite = new Sprite(tileTexture)

    // Position relative to group origin
    const relX = (tile.tx - rect.x) * this.tileSize
    const relY = (tile.ty - rect.y) * this.tileSize

    if (flippedH || flippedV || flippedD) {
      sprite.anchor.set(0.5, 0.5)
      sprite.x = relX + this.tileSize / 2
      sprite.y = relY + this.tileSize / 2
      if (flippedD) {
        if (flippedH && !flippedV) {
          sprite.rotation = Math.PI / 2
        } else if (!flippedH && flippedV) {
          sprite.rotation = -Math.PI / 2
        } else if (flippedH && flippedV) {
          sprite.rotation = Math.PI / 2
          sprite.scale.y = -1
        } else {
          sprite.rotation = Math.PI / 2
          sprite.scale.x = -1
        }
      } else {
        if (flippedH) sprite.scale.x = -1
        if (flippedV) sprite.scale.y = -1
      }
    } else {
      sprite.x = relX
      sprite.y = relY
    }

    group.addChild(sprite)
  }

  this.extractedGroups.set(name, group)
}
```

- [ ] **Step 3: Update InteractiveObjects to accept Container**

Replace the entire `src/renderer/src/office/InteractiveObjects.ts` with:

```typescript
import { Container, Text, Graphics, Rectangle } from 'pixi.js';
import { OutlineFilter } from 'pixi-filters';
import type { ZoneRect } from './engine/TiledMapRenderer';
import { AGENT_COLORS, type AgentRole } from '../../../../shared/types';

interface InteractiveObjectConfig {
  name: string;
  label: string;
  agentRole: AgentRole;
  rect: ZoneRect;
}

interface ObjectState {
  config: InteractiveObjectConfig;
  group: Container;
  outlineFilter: OutlineFilter;
  tooltip: Container;
  available: boolean;
  hovered: boolean;
}

const ARTIFACT_MAP: Record<string, { label: string; agentRole: AgentRole }> = {
  'artifact-vision-brief': { label: 'Vision Brief', agentRole: 'ceo' },
  'artifact-prd': { label: 'PRD', agentRole: 'product-manager' },
  'artifact-market-analysis': { label: 'Market Analysis', agentRole: 'market-researcher' },
  'artifact-system-design': { label: 'System Design', agentRole: 'chief-architect' },
};

export class InteractiveObjects {
  readonly container: Container;
  private states: Map<string, ObjectState> = new Map();
  private tileSize: number;
  private onClick: (artifactKey: string) => void;

  constructor(
    interactiveRects: Map<string, ZoneRect>,
    extractedGroups: Map<string, Container>,
    tileSize: number,
    onClick: (artifactKey: string) => void,
  ) {
    this.container = new Container();
    this.container.label = 'interactive-objects';
    this.tileSize = tileSize;
    this.onClick = onClick;

    for (const [name, rect] of interactiveRects) {
      const info = ARTIFACT_MAP[name];
      if (!info) continue;

      const group = extractedGroups.get(name);
      if (!group) continue;

      const config: InteractiveObjectConfig = { name, label: info.label, agentRole: info.agentRole, rect };
      const state = this.setupObject(config, group);
      this.states.set(name, state);
    }
  }

  private setupObject(config: InteractiveObjectConfig, group: Container): ObjectState {
    const color = AGENT_COLORS[config.agentRole];
    const colorNum = parseInt(color.slice(1), 16);

    this.container.addChild(group);

    // Create outline filter (hidden by default via alpha 0)
    const outlineFilter = new OutlineFilter({
      thickness: 2,
      color: colorNum,
      alpha: 0,
      quality: 0.5,
    });
    group.filters = [outlineFilter];

    // Hit area covers the full multi-tile region (relative to container origin)
    const hitW = config.rect.width * this.tileSize;
    const hitH = config.rect.height * this.tileSize;
    group.hitArea = new Rectangle(0, 0, hitW, hitH);

    // Disabled until available
    group.eventMode = 'none';
    group.cursor = 'default';

    // Tooltip above the group
    const tooltip = this.createTooltip(config, group, color, colorNum);
    this.container.addChild(tooltip);

    // Events
    group.on('pointerover', () => this.onHover(config.name, true));
    group.on('pointerout', () => this.onHover(config.name, false));
    group.on('pointertap', () => {
      const key = config.name.replace('artifact-', '');
      this.onClick(key);
    });

    return {
      config,
      group,
      outlineFilter,
      tooltip,
      available: false,
      hovered: false,
    };
  }

  private createTooltip(
    config: InteractiveObjectConfig,
    group: Container,
    color: string,
    colorNum: number,
  ): Container {
    const tooltip = new Container();
    tooltip.visible = false;

    const tooltipText = new Text({
      text: config.label,
      style: { fontSize: 9, fill: color, fontFamily: 'monospace' },
    });
    const tooltipPadX = 6;
    const tooltipPadY = 3;
    const tooltipW = tooltipText.width + tooltipPadX * 2;
    const tooltipH = tooltipText.height + tooltipPadY * 2;

    const tooltipBg = new Graphics();
    tooltipBg.setStrokeStyle({ width: 1, color: colorNum });
    tooltipBg.roundRect(0, 0, tooltipW, tooltipH, 3);
    tooltipBg.fill({ color: 0x1a1a2e });
    tooltipBg.stroke();

    tooltipText.x = tooltipPadX;
    tooltipText.y = tooltipPadY;

    tooltip.addChild(tooltipBg, tooltipText);

    // Position centered above the full group width
    const groupW = config.rect.width * this.tileSize;
    tooltip.x = group.x + groupW / 2 - tooltipW / 2;
    tooltip.y = group.y - tooltipH - 4;

    return tooltip;
  }

  private onHover(name: string, hovered: boolean): void {
    const state = this.states.get(name);
    if (!state || !state.available) return;
    state.hovered = hovered;
    state.tooltip.visible = hovered;
    state.outlineFilter.alpha = hovered ? 1 : 0;
  }

  setAvailable(objectName: string, available: boolean): void {
    const state = this.states.get(objectName);
    if (!state) return;
    state.available = available;
    state.group.eventMode = available ? 'static' : 'none';
    state.group.cursor = available ? 'pointer' : 'default';
    if (!available) {
      state.tooltip.visible = false;
      state.outlineFilter.alpha = 0;
      state.hovered = false;
    }
  }

  update(_dt: number): void {
    // No-op for now
  }
}
```

- [ ] **Step 4: Update OfficeScene to use getExtractedGroups**

In `src/renderer/src/office/OfficeScene.ts`, replace line 141:

```typescript
this.mapRenderer.getExtractedSprites(),
```

With:
```typescript
this.mapRenderer.getExtractedGroups(),
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`

Test flow:
1. Open a project — the office canvas should render without errors
2. Start /imagine — when artifacts become available, hover over each one
3. Verify the outline covers the full multi-tile object (not just one tile)
4. Verify tooltips are centered above the full object
5. Verify clicking opens the artifact overlay
6. Vision brief should still work correctly (single tile)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/office/engine/TiledMapRenderer.ts src/renderer/src/office/InteractiveObjects.ts src/renderer/src/office/OfficeScene.ts
git commit -m "feat: multi-tile artifact extraction with full-region hit areas"
```
