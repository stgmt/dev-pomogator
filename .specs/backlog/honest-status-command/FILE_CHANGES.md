# File Changes

Planned files для будущей implementation сессии. **Текущая спека НЕ создаёт эти файлы** — это spec-only artifact.

См. также: [README.md](README.md), [TASKS.md](TASKS.md), [DESIGN.md](DESIGN.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/spec-status/SKILL.md` | create | [FR-1](FR.md#fr-1-invocation-surface), [FR-2](FR.md#fr-2-active-spec-auto-detection), [FR-9](FR.md#fr-9-output-format--structured-json--markdown-render), [FR-10](FR.md#fr-10-reuse-spec-statusts-wrapper) — orchestrator skill: parses args, autodetects active spec, wraps spec-status.ts, invokes sub-agent, renders output |
| `.claude/skills/spec-status/references/sub-agent-prompt.md` | create | [FR-3](FR.md#fr-3-sub-agent-delegation), [FR-4](FR.md#fr-4-ac-evidence-classification), [FR-6](FR.md#fr-6-test-body-quality-classification) — sub-agent prompt template (Read AC, classify evidence, audit test quality) |
| `tests/e2e/spec-status.test.ts` | create | All FR — integration tests, 4 it() блока 1:1 с HSCMD001_01..04 BDD scenarios |
| `tests/fixtures/spec-status/mock-spec-partial/` | create | [F-1](FIXTURES.md#f-1-mock-spec--partially-verified) — fixture для UC-1/UC-2 happy path tests |
| `tests/fixtures/spec-status/mock-spec-claimed-only/` | create | [F-2](FIXTURES.md#f-2-mock-spec--all-claimed-no-evidence) — fixture для HSCMD001_02 anti-overclaim verification |
| `tests/fixtures/spec-status/mock-spec-all-verified/` | create | [F-3](FIXTURES.md#f-3-mock-spec--all-verified) — baseline sanity test fixture |
| `tests/fixtures/spec-status/sample-tests/weak.test.ts` | create | [F-4](FIXTURES.md#f-4-sample-test--weak-assertions) — weak assertion patterns для FR-6 audit |
| `tests/fixtures/spec-status/sample-tests/strong.test.ts` | create | [F-5](FIXTURES.md#f-5-sample-test--strong-assertions) — strong assertion patterns для FR-6 audit |
| `tests/fixtures/spec-status/sample-tests/fake-positive.test.ts` | create | [F-6](FIXTURES.md#f-6-sample-test--fake-positive) — fake-positive patterns (mock + tautology) для FR-6 audit |
| `tests/fixtures/spec-status/yaml-samples/status.fresh.yaml` | create | [F-7](FIXTURES.md#f-7-yaml--fresh-state) — fresh state YAML sample для FR-5 |
| `tests/fixtures/spec-status/yaml-samples/status.stale.yaml` | create | [F-8](FIXTURES.md#f-8-yaml--stale-heartbeat) — stale heartbeat sample для UC-3 environmental detection |
| `tests/fixtures/spec-status/yaml-samples/status.completed.yaml` | create | [F-9](FIXTURES.md#f-9-yaml--completed) — completed test results sample |
| `tests/fixtures/spec-status/mock-bin/docker` | create | [F-10](FIXTURES.md#f-10-docker-probe--mock-returns-exit-1) — Docker probe mock script (bash + .bat для Windows) |
| `tests/features/spec-status.feature` | create | BDD scenarios mirror (1:1 с `.specs/honest-status-command/honest-status-command.feature` для tests/ structure) |
