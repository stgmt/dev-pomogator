# Research

## Контекст

Incident 2026-05-10 в session fix-bg-output-loss v0.3.0: главный AI заявил "всё проверено и пушнуто" хотя 4 проверки (Docker ajv, generic в Linux, adapter reliability в Linux, FR-17 через real SessionStart) были blocked WSL/Docker environmental issues. Pattern: AI с goal-completion focus склонен treat "code committed" как proxy for "verified working" даже когда verification gate blocked.

Нужна команда которая (a) делегирует проверку **независимому** sub-agent (fresh context = no completion bias), (b) разделяет verified evidence от claimed assertions, (c) проверяет тесты на quality не только на pass/fail, (d) явно flags environmental blockers vs real failures.

## Источники

- Incident transcript fix-bg-output-loss v0.3.0 (2026-05-11) — exact moment main AI overclaimed Docker validation
- Existing `strong-tests` skill (.claude/skills/strong-tests/) — 12-point test quality checklist
- Existing `tests-create-update` skill — 7 anti-pattern rules (fake-positive detection)
- `extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts` — YAML status schema (.test-status YAML)
- `.dev-pomogator/tools/specs-generator/spec-status.ts` — existing read-only spec progress reporter (potential reuse)
- Anthropic Agent tool docs — sub-agent subagent_type semantics, context isolation

## Технические находки

### Existing spec-status.ts (specs-generator)

`.dev-pomogator/tools/specs-generator/spec-status.ts` уже отдаёт markdown report по .progress.json + AC checklist. **Reuse**: новый `/spec-status` skill может wrap этот скрипт + добавить delegation в sub-agent для verification audit.

### Sub-agent context budget

Agent tool spawns isolated Claude. Context bundle ≤4KB достаточно для self-contained brief (spec slug, plan path, file paths). Sub-agent сам читает большие файлы через свой Read tool — main AI context остаётся compact.

### Test quality detection — reuse strong-tests

strong-tests skill detects: weak assertions (`toBeDefined`/`toBeTruthy` only), mock-heavy (`vi.mock` for production paths), missing edge cases (no boundary/null/error tests), test naming mismatches с feature scenarios. Sub-agent grep-and-classify по 7 patterns — не нужно перепридумывать.

### .test-status YAML staleness signal

`yaml_writer.ts` updates `updated_at` каждые 2s heartbeat при state=running. Если mtime YAML >5 min ago при `state: running` → process dead (likely environmental). Это direct signal для UC-3.

## Где лежит реализация

- Skill дир: `.claude/skills/spec-status/SKILL.md` (новый)
- Reuse spec-status.ts: `.dev-pomogator/tools/specs-generator/spec-status.ts`
- Sub-agent prompt template: `.claude/skills/spec-status/references/sub-agent-prompt.md` (новый)
- Test quality patterns: импорт из `.claude/skills/strong-tests/` + `tests-create-update/`

## Выводы

1. **Не строить с нуля** — reuse spec-status.ts + strong-tests checklist.
2. **Critical design choice**: sub-agent delegation = главное отличие от existing spec-status.ts. Это новая ценность.
3. **Output format**: structured JSON от sub-agent + markdown render для AI/user readability.
4. **Auto-detect active spec**: mtime-based + plan path matching — простая эвристика, не AI-driven.
5. **No external deps**: всё внутри dev-pomogator infrastructure — нет npm install, нет new packages.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | Skill ОБЯЗАН перечислять все используемые tools в frontmatter | Skill creation | FR-N (skill declares Agent, Bash, Read, Glob, Grep) |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Длинные операции не блокировать сессию | Sub-agent invocation | NFR-Performance (sub-agent timeout, async где можно) |
| proactive-investigation | `.claude/rules/plan-pomogator/proactive-investigation.md` | Не спрашивать разрешение исследовать, каждое утверждение с evidence | Sub-agent output format | FR (sub-agent ОБЯЗАН attaching evidence path/line к каждому claim) |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Tests ОБЯЗАНЫ быть интеграционными | Test quality audit logic | FR (audit классифицирует unit-only без integration parallel как concern) |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| spec-status.ts | `.dev-pomogator/tools/specs-generator/spec-status.ts` | Existing markdown reporter по .progress.json + AC | Direct reuse — wrap не replace |
| strong-tests skill | `.claude/skills/strong-tests/SKILL.md` | 12-point test quality checklist | Import patterns для sub-agent audit |
| tests-create-update | `.claude/skills/tests-create-update/SKILL.md` | 7 anti-pattern rules для test bodies | Reuse для fake-positive detection |
| Agent tool | Claude Code built-in | Sub-agent invocation с fresh context | Core mechanism для US-1 |
| yaml_writer | `extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts` | YAML status schema + heartbeat | Source signal для staleness detection (UC-3) |

### BDD Framework Detection

- **Language**: TypeScript
- **Framework**: vitest (BDD-style через describe/it + @featureN теги)
- **Evidence**: `tests/e2e/*.test.ts` + `vitest.config.ts`
- **Install**: already installed
- **Hook convention**: tests/e2e per-file beforeEach/afterEach (no global setup для этой фичи)

### Architectural Constraints Summary

- Skill реализация в `.claude/skills/spec-status/` + reuse `.dev-pomogator/tools/specs-generator/spec-status.ts`
- Sub-agent через built-in Agent tool — no new infrastructure
- Sub-agent context budget ≤4KB (lean brief, фигня читает сама)
- Output format: structured JSON + markdown render
- No new npm packages — use existing fs/glob/grep

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sub-agent тоже bias-ed — Agent tool spawns Claude который может overclaim как parent | Medium | High | В prompt sub-agent явно "report только evidence-backed claims; mark ❌ если нет evidence file path"; verify через mock spec где AC заведомо unverified |
| Test quality audit false-positives — strong assertion может выглядеть weak (e.g. `expect(x).toBe(0)` валидный) | Medium | Medium | Использовать heuristics из strong-tests skill (12-point checklist), не raw regex; flag только high-confidence weak patterns |
| Active spec auto-detection ambiguous — multiple recent .progress.json | Low | Medium | Tie-break по mtime + по git modified scope overlap; если ambiguous — prompt user choice |
| Slow execution — sub-agent + grep tests + git status может занять 30s+ | Medium | Low | Sub-agent timeout 60s; parallel collection где можно; cache git/test results |
| Environmental detection false-negative — Docker hang без error, выглядит как running | Low | High | Pulse check: tail .test-status YAML mtime; если >5 min без update при running state → mark stale |
