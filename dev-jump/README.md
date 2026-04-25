# Dev Jump

Developer tool for jumping into any act of any phase of the Office app, with canned fixtures providing realistic preconditions. Supports real-LLM and fully-mocked agent modes.

## Quick start

```bash
# Real-mode jump (uses your Anthropic key)
npm run dev:jump imagine.ui-ux-expert

# Mock-mode jump (no API calls)
npm run dev:jump imagine.ui-ux-expert --mock
```

Then open `~/office-dev-project` in the Office app and press Start.

For one-click jumping, launch the app with `OFFICE_DEV=1 npm run dev` and use the 🧪 Dev Jump panel.

## Targets

| Target | What it seeds |
|---|---|
| `imagine.ceo` | (nothing — CEO is the first act) |
| `imagine.product-manager` | vision-brief.md |
| `imagine.market-researcher` | + PRD |
| `imagine.ui-ux-expert` | + market analysis |
| `imagine.chief-architect` | + UI designs |
| `warroom.project-manager` | all imagine artifacts |
| `warroom.team-lead` | + plan.md |
| `build.engineering` | all imagine + warroom artifacts |

## Adding a new mock scenario

1. Create `dev-jump/fixtures/scenarios/<agent-role>.ts` exporting a `Scenario`.
2. Register it in `dev-jump/mock/scenarios-registry.ts`.
3. If the agent produces a new output file, add a fixture artifact for it under `dev-jump/fixtures/artifacts/`.

See `ui-ux-expert.ts` for a medium-fidelity example.

## Manual smoke checklist

Run through this after any change to dev-jump internals:

- [ ] `npm run dev:jump imagine.ui-ux-expert` seeds `~/office-dev-project` and exits 0.
- [ ] Opening the seeded project in the app shows archived runs for CEO, PM, Market Researcher in the chat panel.
- [ ] Pressing Start fires a real UI/UX LLM call and the review overlay appears with the fixture mockups.
- [ ] Dev panel: "Jump: UI/UX Expert" in real mode produces the same result without app restart.
- [ ] Dev panel: "Jump: UI/UX Expert" in mock mode fires the authored scenario — no API cost — and the review overlay appears.
- [ ] Back-to-back jumps (real → mock → real) work without app restart.
- [ ] Missing scenario (e.g., CEO in mock mode): logs skeleton warning and still completes.

## Non-goals

- Not a user-facing feature.
- Not a visual regression framework.
- Not a multi-scenario library (one canonical "Habit Streak Tracker").

## Safety

The seed engine refuses to operate on any path other than `~/office-dev-project/` unless `--force --project-dir <dir>` is passed. This is not a robust security boundary — it is a guardrail against accidentally nuking a real project.

## Freshness

Fixture files have a `<!-- last-reviewed: YYYY-MM-DD -->` comment. If you notice a fixture has drifted from what real agents now produce, update the file and bump the date.
