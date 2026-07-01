# Design

## Реализуемые требования

- FR-1 — Stryker mutation via official cucumber-runner (perTest)
- FR-2 — parallel all cores
- FR-3 — stryker-mutation skill + state
- FR-4 — mutation-resistant BDD authoring (§6.5 depth + breadth)
- FR-5 — BDD-quality Haiku judge hook
- FR-6 — path-limited agent commit discipline

## Компоненты

- `stryker.bdd.config.mjs` + `cucumber.json` profile `stryker-bdd` — Stryker cucumber-runner config (perTest, concurrency 100%).
- `.claude/skills/stryker-mutation/SKILL.md` + `tools/stryker-mutation/state.ts` — recipe + atomic state.
- `tools/bdd-quality-judge/{judge.ts,hook.ts}` — Haiku judge + PostToolUse hook (reuses claim-evidence-gate transport).
- `.claude/skills/strong-tests/SKILL.md` §6.5 — coverage-breadth authoring guidance.
- `.claude/agents/bdd-migrator.md` — path-limited commit discipline.

## Где лежит реализация

- App-код: `tools/bdd-quality-judge/`, `tools/stryker-mutation/`, `stryker.bdd.config.mjs`
- Wiring: `.claude/settings.json` + `.claude-plugin/hooks.json` (PostToolUse Write|Edit), `package.json` (`mutation:bdd`)

## Директории и файлы

- `stryker.bdd.config.mjs`, `cucumber.json`
- `tools/bdd-quality-judge/judge.ts`, `tools/bdd-quality-judge/hook.ts`
- `tools/stryker-mutation/state.ts`, `.claude/skills/stryker-mutation/SKILL.md`

## Алгоритм

1. `npm run mutation:bdd` → Stryker instruments the target, spawns one runner per core.
2. cucumber-runner (perTest) runs only the scenarios covering each mutant; NoCoverage mutants are skipped.
3. The state helper records the score; survivors/NoCoverage drive which scenarios to add (§6.5 breadth).
4. On a `.feature`/step-def edit, the PostToolUse hook asks Haiku to score it against §6.5 + emits an advisory.

## Key Decisions

### Decision: official cucumber-runner over the built-in command runner

**Rationale:** perTest coverage + correct kill attribution; the command-runner PoC mis-measured (~20% artifact) and ran 2.5h serial.

**Trade-off:** adds a devDependency (`@stryker-mutator/cucumber-runner`).

**Alternatives considered:**
- command-runner — rejected because exit-code-only, no perTest, serial-slow (2.5h/file).
- narrowing the scenario set — rejected because the bottleneck is scenario execution, not breadth; parallelism (all cores) is the real lever.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed (`@cucumber/cucumber`, `@stryker-mutator/cucumber-runner`)
**Evidence:** `cucumber.json` profile `stryker-bdd`; `tools/bdd-quality-judge/judge.ts` reuses `tools/claim-evidence-gate/meridian-judge.ts`.
**Verdict:** no test-data hooks required — the judge is builtins-only/fail-open; mutation runs use tmpdir fixtures in the existing step-defs.
