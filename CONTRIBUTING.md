# Contributing to The Office

Thanks for being here. The README has the **why** and the **where we need help** — this file is the **how**: dev setup, workflow conventions, and what good PRs look like.

If you're new, start with the [`good first issue`](https://github.com/shahar061/the-office/labels/good%20first%20issue) label. If nothing fits and you have an idea, open a Discussion or a "proposal" issue first — it saves both of us from rework.

---

## Dev setup

### Prerequisites

- **Node.js 20+** (Node 22.x is what the maintainers use; `nvm use 22`)
- **macOS, Linux, or Windows** — the desktop app builds on all three (CI verifies)
- A **Claude API key** OR an active [Claude Code](https://docs.anthropic.com/en/docs/claude-code) subscription — the app will guide you through wiring one up on first launch
- Optional but recommended: **VS Code** with the ESLint + Tailwind CSS extensions

### One-time setup

```bash
git clone https://github.com/shahar061/the-office.git
cd the-office
npm install
```

### Running the desktop app

```bash
npm run dev          # electron-vite dev — opens the app, hot-reloads renderer
```

### Working on the landing page (separate Next.js app)

```bash
cd landing
npm install
npm run dev          # Next dev on http://localhost:3000
```

### Tests

```bash
npm test             # vitest single run
npm run test:watch   # watch mode
```

Add tests for non-trivial logic, especially anything touching the orchestrator, git flows, or the seat/clone manager. Snapshot tests are fine; behavioral assertions are better.

### Useful dev tools

```bash
npm run dev:jump <target> -- --mock
# Jumps the project to a specific phase/agent state with mocked agents.
# Skip the slow real-LLM run while you're iterating on UI.
# Targets: imagine.ceo, imagine.product-manager, imagine.market-researcher,
#          imagine.ui-ux-expert, imagine.chief-architect,
#          warroom.project-manager, warroom.team-lead, build.engineering
```

---

## PR workflow

1. **Open an issue first** for anything non-trivial — even a one-line "I'd like to try X, sound good?" works. This avoids the "I built X, but we wanted Y" outcome.
2. **Fork → branch → PR.** Branch names that mirror the area help: `feat/kanban-graph-zoom`, `fix/mr-desk-pathfinding`, `i18n/he-onboarding`.
3. **Keep PRs focused.** A small, well-tested change lands in days; a sprawling one stalls. If you find a related issue while implementing, open a separate PR for it.
4. **Run tests + typecheck** locally before pushing: `npm test && npx tsc --noEmit`.
5. **Self-review your diff** before requesting review. About half of the comments most maintainers leave are things the author would have caught on a second pass.
6. **Reference the issue** in the PR description: `Closes #123`. Auto-closes the issue on merge.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) — informally:

```
<type>(<scope>): <short summary in imperative mood>

<longer body explaining the why if non-obvious>
```

Common types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `i18n`. Common scopes: `orchestrator`, `i18n`, `kanban`, `landing`, `release`, `mock`, `office-view`.

Examples that have landed in the repo:
- `feat(i18n): localise phase-advance prompts (imagine→warroom, warroom→build)`
- `fix(office-view): remove redundant header auth dot (overlapped cluster in RTL)`
- `refactor(appearance): drop the 60s preview, persist theme on click`

---

## Code style

This project deliberately keeps things **plain TypeScript with low ceremony**.

### Conventions in use

- **Functions over classes.** Classes appear only where state genuinely belongs together (e.g., `ArtifactStore`, `PermissionHandler`).
- **Comments explain *why*, not *what*.** Names should already explain the *what*.
- **Tailwind for styling.** Inline `style={}` only when the value is dynamic (animated colors, computed positions).
- **`zustand` for renderer state.** Avoid prop-drilling; avoid global mutable singletons.
- **`async/await`**, never raw `.then()` chains.
- **Explicit types at module boundaries.** Internal inference is fine.
- **No `any` without an inline comment** explaining why a tighter type wasn't possible.

### Don'ts

- **Don't add features that need their own README section** in a single PR. Split landing-the-feature from landing-the-config-surface from landing-the-docs.
- **Don't refactor unrelated code in feature PRs.** Save it for a `refactor:` PR — easier to review, easier to revert.
- **Don't introduce telemetry.** "No telemetry" is a stated promise of this project.
- **Don't commit anything that requires Anthropic-internal credentials** to test.

---

## Architecture quick map

If you're touching one of these areas, here's what the file you probably want is:

| Area | Path |
|---|---|
| Main process entry | `electron/main.ts` |
| Orchestrator (per-phase) | `electron/orchestrator/{imagine,warroom,build,workshop}.ts` |
| Agent SDK bridge | `electron/sdk/sdk-bridge.ts` |
| IPC channels | `electron/ipc/` |
| Renderer entry | `src/renderer/main.tsx` |
| Office canvas (Pixi) | `src/renderer/src/scene/` |
| Stores | `src/renderer/src/stores/` |
| i18n dictionaries | `src/renderer/src/i18n/dictionaries/` |
| Agent prompts | `agents/` |
| Mock scenarios for dev-jump | `dev-jump/fixtures/scenarios/` |
| Landing page | `landing/` |

---

## Reporting bugs

Two ways:

1. **Inside the app** — top-right icon rail → 🐛 → "Report a bug." Auto-attaches your platform, app version, and language. Goes straight into the bug tracker.
2. **GitHub issues** — for things that block you right now, where you want public discussion. Use the **Bug report** template.

For security issues, **don't open a public issue**. Email the maintainer (shahar061 on GitHub) or open a [private security advisory](https://github.com/shahar061/the-office/security/advisories/new).

---

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Short version: be kind, be specific, assume good faith. We're building this for fun and for craft — let's keep it that way.

---

## Getting your PR merged faster

A few patterns that consistently work:

- **Show a screenshot or screencast** for any UI change.
- **Cite the issue number** in commits + PR description.
- **Mark the PR as draft** while you're still iterating; flip to "ready for review" when you'd like a look.
- **Be explicit about what you'd like reviewed**: "specifically curious about the way I handled the cleanup in Y."
- **Tag the maintainer** if you're stuck for >48h.

Welcome aboard. Looking forward to seeing what you build.
