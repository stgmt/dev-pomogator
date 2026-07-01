# Spec Generator V4

> **Status:** 🚀 **LIVE on `feat/phase-2a-mcp-server-and-hooks` / PR #32** — Phase 0/1/2/3/4/6/7 shipped (Phase 5 migration helper landed; Phase 4 SQLite gated behind opt-in flag). 33 commits, 159 files, +20,394/-137 lines, **188 tests PASS**, **PR mergeable + CI green**.
> **Implementation timeline:** approved 2026-05-18 → in active polish through 2026-06-02.

---

## TL;DR — что умеет уже сегодня

Один MCP-сервер + 8 авто-резолверов + детектор cross-spec несоответствий + LSP wiki-links + hooks которые блокируют поломанные правки до save. Цель — **AI агент видит весь спек целиком за один вызов и не галлюцинирует над спеками**.

```bash
# В Claude Code:
/spec-backlog              # посмотреть очередь несоответствий
/cross-spec-reconcile      # запустить full детектор
/cross-spec-resolve        # interactive walker по findings
```

---

## Changelog — последние изменения первыми

### 2026-06-02 — Round 4: PR cleanup pass (commits `85275d4`, `1db9233`, `5a19b03`, `7284f4a`, `38a8510`, `8d332e0`)

**+2 новых резолвера в registry (6 → 8):**

- **`cross-ref-linker`** — закрывает silent-skip баг: 70 findings `cross-spec/missing-cross-ref` раньше уходили в never-implemented AUTO_FIX rule (0 применено). Теперь оборачивает первое упоминание spec slug в markdown link `[slug](../slug/FR.md)`. Idempotent (bail на already-linked / inside-code-fence). 7/7 тестов, 18 реальных edit'ов на dogfood corpus.
- **`wrap-deprecated-ref`** — wraps removed v1 production files `~~src/installer/foo.ts~~ (removed in v2 — no canonical replacement)`. Сохраняет traceability для OWNERSHIP_RECOMMENDATION.md артефактов без потери ссылок. 7/7 тестов.

**+3 новых BacklogCategory:** `ambiguous-link`, `missing-cross-ref`, `deprecated-ref` (плюс существующие 7).

**MCP method-name false-positive fix:** детектор больше не ругается на `tools/list`, `resources/list`, `prompts/list`, `roots/list`, `notifications/initialized` и ещё 8 MCP JSON-RPC методов. Экономит ~17 ложных findings.

**Resolution Patterns закодированы в `.claude/skills/cross-spec-reconcile/SKILL.md`:** 5 паттернов (WRAP-deprecated / DELETE-redirect / RECREATE-as-skip / DEFER-spec / MCP-exclusion) + полный catalog в `references/reference_resolution-patterns.md`.

**Реальные правки на dogfood корпусе:** 322 spec edits applied across 3 rounds:
- Round 1: 89 RENAME (v1 path → v2 canonical-plugin path) + 64 DELETE/WRAP (v1 refs) в 41 файле
- Round 2: 133 cleanup edits в 50 файлах (GROUP_C rename + 7 DELETE × ~21 refs каждый + 25 SKIP re-pass + table-cell rewriter)
- Round 3: 195 edits в 92 файлах (12 needs-human decisions applied: WRAP/DELETE/RECREATE-stub/DEFER + FIELD_VERIFICATION_FINAL.md fixed from false-PASS to honest PLANNED status)

**Аналитические артефакты:**
- `MISSING_FILE_REPORT.md` (395 строк) — 965 битых ссылок сгруппировано по 5 dimensions, классифицировано на 5 buckets (UNCLEAR 57.7% / RENAME_UPDATE 16.4% / DELETE_REFERENCE 14.8% / RECREATE 10.3% / OUT_OF_SCOPE 0.8%)
- `MISSING_FILE_PATCHES_REVIEW.md` (465 строк) — per-bucket sample diffs + Round 1+2+3 finalization + 10 codified patterns для future pipeline
- `NEEDS_HUMAN_REVIEW_PACKET.md` — review table для 12 needs-human items с per-target recommendations

### 2026-05-30/31 — Batches 21-27 (commits `0b1f6fd`..`f2b397c`): honest-audit noise reduction

User caught a flawed "89% reduction" claim — 3878 residual findings still ~63% noise. Six batches of triage-by-sampling:

| Batch | Что закрыто |
|------|---|
| 21 | ownership-conflict на удалённых v1 paths (444 → 30 через `fs.existsSync`) · concept-overlap opt-in default off (2082 → 0) · missing-cross-ref ≥2 mentions (293 → 187) |
| 22 | nested category dir filtered (`backlog` больше не treated как spec) · contradictory-nfr opt-in default off |
| 23 | specs-validator prompt-spam ~150 → 2 lines/prompt · auto-generated `OWNERSHIP_RECOMMENDATION.md` excluded from missing-cross-ref (circular noise) |
| 24 | per-spec `printPhaseStatus` aggregated (4 lines × N → 1 line total) |
| 25 | dead-link strip fenced + skip regex/placeholder targets · orphan-task accepts `@featureN` |
| 26 | missing-cross-ref strip INLINE backticks |
| 27 | CHANGELOG honest summary |

**Cumulative dogfood:** 38,453 → **1,185 findings** (-96.9%). CRITICAL: 33,860 → **32** (-99.9%). Actionability: 37% → **~91%**.

### Earlier (Phase 0..7 ship) — commits `9dd58d0`..`43e5397`

- **Phase 0 — Cucumber-JS BDD foundation** (FR-1): real `@cucumber/cucumber` runner with NDJSON output to `.dev-pomogator/.last-test-run.ndjson`, mandatory additive for TS target projects
- **Phase 1 — In-memory SpecGraph** (FR-2, FR-3): typed graph builder over `unified+remark` (MD) + `@cucumber/gherkin` (.feature) + `@cucumber/messages` (NDJSON). **Cold start ≤2s for 30 specs**, incremental ≤100ms p95. Dual-anchor headings: `### FR-001: Login` registers BOTH `FR-001` и `fr-001-login`. Legacy v3 `### Requirement: FR-N` triple-anchor — backward compat без миграции.
- **Phase 2 — MCP server + hooks + Marksman** (FR-4..7, FR-27):
  - `dev-pomogator-specs` stdio MCP server с **11 read-only tools**: `get_trace` (primary) · `find_by_tags` · `conformance_check` · `search` · `get_node` · `list_phase_tasks` · `get_test_result` · `find_orphans` · `get_coverage_summary` · `validate_anchor` · `list_specs`
  - **PreToolUse hard hook** `spec-conformance-guard`: DENY на write/edit спек если detected `DUPLICATE_DEFINITION` / `MALFORMED_FRONTMATTER` / `MALFORMED_GHERKIN` / `INVALID_ANCHOR_PATTERN`
  - **PostToolUse soft hook** `spec-conformance-push`: aggregated findings в `<system-reminder>` с **3-second fixed-window throttle** (FR-28)
  - **Marksman LSP** bundled install с sha256 verification per FR-27 — wiki-link navigation в любом LSP-compatible редакторе
- **Phase 3 — LLM-as-judge + multi-language** (FR-8, FR-9, FR-26): `claude -p` subprocess wrapper с FR-26 deny-list (никаких `.env`/secrets/tokens в LLM prompts) + sha256 cache. Multi-language adapters: Reqnroll (C#) · behave (Python) · Cucumber-JVM (Java) — все emit Cucumber Messages NDJSON.
- **Phase 4 — SQLite + JSONL log + Codespaces** (FR-10, FR-15, FR-16): better-sqlite3 WAL + FTS5 (opt-in `storage.sqlite_enabled = true`) · append-only JSONL spec-check-log с 10MB rotation · Codespaces auto-start MCP через `.devcontainer/scripts/post-start.sh`
- **Phase 5 — Migration helper v3→v4** (FR-11): CLI `dev-pomogator-migrate-v3-to-v4` с `--suggest-only` mode + interactive prompt с 30-second default-skip timeout. Atomic spec MD rewrite + `.progress.json` version 3 → 4 bump
- **Phase 6 — architecture-research-workflow skill** (FR-12): 7-stage greenfield architecture-decision flow (problem framing → pain validation → research → variants → decisions → rollout → hand-off). Auto-invoked by `create-spec` complexity heuristic. **3-rewind hard limit** prevents infinite Stage 5 loops.
- **Phase 7 — Cross-spec reconcile/resolve** (FR-17, FR-18):
  - `.claude/skills/cross-spec-reconcile/` — **28 finding codes** across 7 categories (uncovered / contradiction / runtime-identifier-drift / architectural-decision-vs-reality / concept-overlap / spec-only / schema-drift). YAML output + **SARIF 2.1.0** + JSONL audit log
  - `.claude/skills/cross-spec-resolve/` — interactive 7-step walker с 5-field explanation block (code/severity/class — files+lines — plain — WHY — options). Path A/B/C dispatch для архитектурных развилок. Foreign-spec extra-confirm banner

---

## Что в registry сегодня (8 резолверов)

| Resolver | Category | Что делает |
|---|---|---|
| `ac-author` | `missing-fr-section` | Создаёт ACCEPTANCE_CRITERIA.md skeleton с AC-N (FR-N) per FR |
| `link-fixer` | `dead-link-typo` | Typo correction в markdown links (по basename glob) |
| `scenario-writer` | `missing-test` | Создаёт .feature scenarios для не покрытых FR |
| `fr-author` | `missing-fr-section` | Создаёт FR.md skeleton с FR-N headings |
| `decision-arbiter` | `contradictory-nfr` | DECISION_RECOMMENDATION.md с frequency tally (Node fs walker, портативный) |
| `owner-picker` | `ownership-conflict` | OWNERSHIP_RECOMMENDATION.md по git-history first-commit-date proximity |
| `cross-ref-linker` ★ | `missing-cross-ref` | Wraps spec slug mentions в markdown links |
| `wrap-deprecated-ref` ★ | `deprecated-ref` | Strikethrough для removed v1 production refs |

★ — новые в Round 4.

## Test posture

| Suite | Status |
|---|---|
| Classifier evals | **35/35 PASS** (`tools/spec-backlog/evals/run-classifier-evals.ts`) |
| Reconcile detector | **77/77 PASS** (`.claude/skills/cross-spec-reconcile/scripts/__tests__/reconcile.test.ts`) |
| spec-backlog suite | **76/76 PASS** (7 resolver tests files + smoke) |
| E2E pipeline | **9/9 assertions, 43ms** (`tools/spec-backlog/evals/e2e-pipeline.ts`) |
| **Total** | **188 PASS** |
| Legacy v3 regression | **28/28 PASS** (form-guards survived FR-25 additive merge — soft tier preserved) |

## Performance (NFR budgets)

| Workload | Target | Actual | Status |
|---|---|---|---|
| Cold start, 30 specs | ≤2s (NFR-1) | ~142ms | **99.3% under budget** |
| 100 specs cold ingest | — | 436ms (was 1811ms, batch-17 perf) | 4.2× |
| 100 specs warm-dedup | — | **104ms** (was 2865ms) | **27×** |
| Incremental update single file | ≤100ms p95 (NFR-2) | not measured this session | — |

## Cross-spec consistency дitector (live результат)

Сегодня на 49 спеках dev-pomogator:

| Code | Count | Severity | Real signal? |
|---|---:|---|---|
| `impl-drift/missing-file` | 982 | WARNING | 100% real (классифицируются в NOISE — backtick refs без resolver) |
| `cross-spec/missing-cross-ref` | 70 → 77 (re-detected) | INFO/WARNING | ~80% real (resolver применяет) |
| `spec-only/unreachable-task` | 65 | INFO | 100% intentional |
| `cross-spec/module-ownership-conflict` | 32 | WARNING | 100% real |
| `spec-only/orphan-task` | 30 | WARNING | ~95% real |
| `impl-drift/test-result-stale` | 25 | INFO | 100% — CI gotcha |
| `impl-drift/dead-link` | 6 | WARNING | ~85% real |
| `spec-only/orphan-FR` | 3 | WARNING | 100% real |
| `spec-only/duplicate-fr-id` | 2 | CRITICAL | 100% real |

**Open backlog: 151 entries** (после Round 3) — это уже team work, не bugs.

---

## Где код

| Что | Где |
|---|---|
| SpecGraph builder | `tools/spec-graph/` (types + parsers/{md,gherkin,ndjson}.ts + builder.ts + conformance.ts + incremental.ts) |
| MCP server + 11 tools | `tools/spec-mcp-server/` |
| PreToolUse hard hook | `tools/spec-conformance-guard/` |
| PostToolUse push | `tools/spec-conformance-push/` |
| LLM-as-judge bridge | `tools/spec-llm-judge/` |
| Marksman installer | `tools/marksman-installer/` |
| Migration v3→v4 | `tools/migrate-v3-to-v4/` |
| Cross-spec detector | `.claude/skills/cross-spec-reconcile/scripts/reconcile.ts` (~2000 lines) |
| Cross-spec resolve loop | `.claude/skills/cross-spec-resolve/` |
| 8 resolvers + registry | `tools/spec-backlog/resolvers/{ac-author,link-fixer,scenario-writer,fr-author,decision-arbiter,owner-picker,cross-ref-linker,wrap-deprecated-ref}.ts` |
| Classifier + CLI | `tools/spec-backlog/{classifier.ts,cli.ts,bin.cjs}` |
| Shared FR-parser | `tools/_shared/fr-parser.ts` (dedup 3 inline regexes) |
| architecture-research-workflow | `.claude/skills/architecture-research-workflow/` (7-stage templates + scripts) |
| Backlog JSONL | `.dev-pomogator/.specs-backlog/<YYYY-MM-DD>.jsonl` (append-only, deterministic entryId = sha256 first-12-hex) |
| Codespaces autostart | `.devcontainer/scripts/post-start.sh` |

---

## Phases overview (статус каждой)

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 0** | Cucumber-JS BDD migration | ✅ SHIPPED |
| **Phase 1** | SpecGraph builder + 3 parsers + conformance | ✅ SHIPPED |
| **Phase 2** | MCP server + hooks + Marksman | ✅ SHIPPED |
| **Phase 3** | LLM-as-judge + multi-language (C#/Python/Java) | ✅ SHIPPED |
| **Phase 4** | SQLite (opt-in) + JSONL log + Codespaces | ✅ SHIPPED |
| **Phase 5** | Migration helper v3→v4 | ✅ SHIPPED |
| **Phase 6** | architecture-research-workflow skill | ✅ SHIPPED |
| **Phase 7** | Cross-spec reconcile + resolve (28 finding codes) | ✅ SHIPPED — 8 resolvers · live dogfood proven · 322 spec edits applied |

---

## Honest gaps (не сделано)

- **3 из 7 v4.0.1 deferred items** (commit `85275d4`):
  - `readSpecMd cache` — DECLINED: `filesBySlug` Map уже cached single-pass; адddding `Map<string,string>` = duplicate caching без выгоды
  - `NFR multi-token context matching` — план готов (regex extension + unit normalization), workflow conditional-skip bug помешал
  - `24 MEDIUM/LOW eval gaps` — CHANGELOG ссылается на workflow ID `w0w45s96f` но список 24 items нигде в репе не enumerated
- **38 GROUP_C DELETE markdown-table-cell SKIPs** — нужен table-aware handler (Round 4 codebase fix)
- **2 GROUP_C RENAME `needs_human`** (`src/installer/claude.ts` + `src/installer/memory.ts`) — нет canonical replacement, остаются WRAP'нутыми
- **10 multi-spec human-triage items** обработаны как Round 3 batch — но 3 из них (#5, #6, #9 strong-tests/settings-protection) сделаны как stubs с `it.skip()` + TODO для будущей реализации

---

## Deep links (полный контент)

- [USER_STORIES.md](USER_STORIES.md) — 20 user stories
- [USE_CASES.md](USE_CASES.md) — 15 UCs + 12 edge cases
- [RESEARCH.md](RESEARCH.md) — 1300+ lines, 17 appendices
- [FR.md](FR.md) — 18 FRs + 3 OUT_OF_SCOPE
- [NFR.md](NFR.md) — 25 NFRs (Performance/Security/Reliability/Usability)
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 51 EARS ACs
- [DESIGN.md](DESIGN.md) — Components + Algorithm + API + Key Decisions
- [spec-generator-v4_SCHEMA.md](spec-generator-v4_SCHEMA.md) — 7 entities + 28 finding codes + SARIF mapping
- [FILE_CHANGES.md](FILE_CHANGES.md) — 87 files across 8 phases
- [spec-generator-v4.feature](spec-generator-v4.feature) — 54 SPECGEN004 scenarios
- [TASKS.md](TASKS.md) — 64 tasks TDD-ordered
- [CHANGELOG.md](CHANGELOG.md) — full per-batch ledger
- [MISSING_FILE_REPORT.md](MISSING_FILE_REPORT.md) — 965 битых ссылок analyzed
- [MISSING_FILE_PATCHES_REVIEW.md](MISSING_FILE_PATCHES_REVIEW.md) — Round 1+2+3 finalization
- [NEEDS_HUMAN_REVIEW_PACKET.md](NEEDS_HUMAN_REVIEW_PACKET.md) — 12 multi-spec triage decisions

---

## v3 → v4 doc reorganization

The v3 ROADMAP referenced a central rule file at `.claude/rules/specs-workflow/specs-management.md` that documented the spec author's Phase 1 (Discovery) → Phase 2 (Requirements + Design) → Phase 3 (Finalization) workflow in one place. **That file was a v3 planning artifact and was NEVER shipped to live `.claude/rules/` installations.**

In v4 the same workflow is distributed across three skills:

- `create-spec` — drives the 4-phase STOP-confirmed workflow (Discovery → Context → Requirements + Design → Finalization)
- `cross-spec-reconcile` — invoked from `create-spec` Phase 2 step 4d, Phase 3 step 1c, Phase 3+ Audit
- `cross-spec-resolve` — invoked explicitly via `/cross-spec-resolve`
