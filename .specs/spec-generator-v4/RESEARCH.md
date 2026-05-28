# Research

## Контекст

`spec-generator-v3` решил проблему **структуры одиночной спеки** (USER_STORIES form, CHK matrix, Risk Assessment, task table) через 6 PreToolUse form-guards. Однако осталась **глубже лежащая проблема**: набор MD-файлов с cross-links — это **плоская структура для AI-агента**, даже если ссылки расставлены.

Симптомы (озвучены пользователем):
- Агент **догадывается** как читается кусок теста, **но не сопоставляет** его с куском требования.
- Тест часто **не соответствует** требованию — агент **не видит** и **не проверяет**.
- Task в TASKS.md часто **не соответствует** FR — агент **не видит**.
- Приходится **носом тыкать** ручками.

Гипотеза: причина — у агента **нет специализированного инструмента** для query графа `FR → AC → Scenario → TestCase → TestResult → Code`. Все эти связи технически уже есть в репо (через `@featureN` теги, FR-N якоря, файловые пути) — но представлены как **plain MD**, который агент читает линейно и теряет.

Цель v4: построить **компилируемый/синхронизируемый граф спеки + MCP-сервер + enforcement hook**, чтобы агент **не мог** работать со спекой не сверившись с графом, а scope check `test conforms to FR` стал **автоматическим**.

## Источники

См. `## Технические находки` ниже — каждая находка содержит inline-ссылки с маркерами `[VERIFIED]`/`[NEEDS_CONFIRMATION]`/`[UNVERIFIED]`.

## Технические находки

### Тема 0 — Внешнее подтверждение pain'а (OpenSpec issue #901)

Даже у OpenSpec (48k⭐, top-1 SDD framework) есть [issue #901 "Automatic spec catalog discovery during proposal creation"](https://github.com/Fission-AI/OpenSpec/issues/901), дословно описывающий ту же проблему:

> "For enterprise scale with dozens of capabilities across multiple domains, an AI agent scanning 30+ spec directories and reading full files burns significant context just for discovery, and without structured discovery, capabilities get duplicated or contradicted across changes."

Их proposal — лишь lightweight CLI catalog (`openspec list --specs --json --detail` возвращает `id/title/overview/requirementCount`). Это **каталог, не граф**. Никто из крупных SDD-проектов (spec-kit, Kiro, BMAD, Tessl, Antigravity) задачу полностью не решил. `[VERIFIED: issue 901 + augment.code SDD comparison]`

**Вывод**: v4 занимает реальную нишу — никто из competitors не дошёл до уровня агент-quoted spec graph с conformance checks.

### Тема 1 — OpenSpec artifact-graph (closest analogue, MIT, можно forkнуть)

**[Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)** — 48k⭐, TypeScript, MIT, pushed `2026-05-14`. Содержит спецификацию [`openspec/specs/artifact-graph/spec.md`](https://github.com/Fission-AI/OpenSpec/blob/main/openspec/specs/artifact-graph/spec.md) с requirements:

- **Schema Loading** — YAML schema (`schemas/spec-driven/schema.yaml` + `workspace-planning/schema.yaml`) описывает artifact dependencies
- **Build Order Calculation** — топологический порядок (linear chain / diamond / independent)
- **State Detection** — file/glob completion check
- **Ready Artifact Query** — `getNextArtifacts()` возвращает не-blocked
- **Completion Check** — `isComplete()` для всего графа
- **Blocked Query** — `getBlocked()` возвращает unmet dependencies
- **Cyclic dependencies detection** — error с listing artifact IDs в cycle
- **Duplicate artifact IDs rejection**

`[VERIFIED: github file content]`

**Ограничение**: граф только на **artifact**-уровне (5 нод/change: proposal → specs → design → tasks). Не на **requirement/scenario**-уровне. Это базис, но не достаточен.

### Тема 2 — Markdown AST tooling (unified/remark/mdast)

**[unified/remark](https://github.com/unifiedjs/unified)** — экосистема 500+ пакетов, де-факто стандарт для MD как структурированной data:

- Парсинг MD → mdast JSON AST → round-trip → MD
- `unist-util-visit` для AST traversal с единым API
- `remark-frontmatter` — YAML/TOML frontmatter extraction
- `remark-stringify` — обратная сериализация
- Production-grade, используется в MDX, Astro, Docusaurus, Gatsby

`[VERIFIED: unifiedjs/unified docs + ryanfiller.com tutorial]`

**Применение для v4**: парсить `.specs/**/*.md` в JSON AST, извлекать headings `### Requirement: FR-N` / `#### Scenario: SCEN-x` как nodes, ссылки/anchors как edges.

### Тема 3 — Cross-reference validators

**[remark-validate-links](https://github.com/remarkjs/remark-validate-links)** — валидатор cross-references в Git-repo:

- Heading anchors (`[link](#heading)`)
- Cross-file references (`readme.md#heading`)
- Definition links
- Расширяется через `node.data.id` / `node.data.hProperties.id` — **позволяет кастомные ID-схемы типа `FR-001`, `AC-3`, `SCEN-foo`**
- Library (ESM) + CLI
- Output через vfile reporting

`[VERIFIED: github README + remarkjs/remark-validate-links docs]`

Связанные инструменты:
- **[markdownlint MD051](https://github.com/DavidAnson/markdownlint/blob/main/doc/md051.md)** — broken section links
- **[eslint/markdown no-missing-link-fragments](https://github.com/eslint/markdown)** — link fragment validation
- **[skill-validator (agent-ecosystem)](https://github.com/agent-ecosystem/skill-validator)** — Skill spec quality check + LLM-as-judge scoring (готовый паттерн для семантического conformance)

### Тема 4 — Cucumber Messages — готовый schema для BDD trace

**[cucumber/messages](https://github.com/cucumber/messages)** — формальная Protocol Buffers schema + NDJSON serialization для всего жизненного цикла BDD-теста.

**21 Envelope subtypes** (полное перечисление из `jsonschema/messages.md` — verified 2026-05-18 в Phase 1 spec-review):

| Type | Назначение | ID-relations |
|------|-----------|-------------|
| `meta` | Metadata о runner | — |
| `source` | Сырой `.feature` file | — |
| `gherkinDocument` | AST Gherkin документа | ref → source |
| `pickle` | Скомпилированный scenario (с inherited tags) | ref → gherkinDocument |
| `parameterType` | Custom parameter types | — |
| `parseError` | Syntax errors при парсинге | — |
| `stepDefinition` | Code mapping для step | — |
| `undefinedParameterType` | Unmatched param | — |
| `hook` | Before/After hook definition | — |
| `attachment` | Screenshots/logs (deprecated в пользу externalAttachment) | ref → testStep/testCase |
| `externalAttachment` | Внешние attachments (URL) | ref → testStep/testCase |
| `suggestion` | Snippet suggestions | — |
| `testRunStarted` | Start of run | — |
| `testRunFinished` | End of run | — |
| `testRunHookStarted` | Run-level hook start | — |
| `testRunHookFinished` | Run-level hook end | — |
| `testCase` | Runtime test instance | ref → pickle |
| `testCaseStarted` | Test case execution start | ref → testCase |
| `testCaseFinished` | Test case execution end | ref → testCaseStarted |
| `testStepStarted` | Step execution start | ref → testCaseStarted, testStep |
| `testStepFinished` | Step execution end + TestStepResult (status + duration + exception) | ref → testStepStarted |

`[VERIFIED: jsonschema/messages.md в cucumber/messages]`

**Tag propagation** (полный путь tag-а от .feature к TestResult):
- `Feature: ... @tag1` → `Scenario: ... @tag2` (Gherkin AST) →
- `Pickle` (с union тегов `[@tag1, @tag2]` — *inherited tags*) →
- `TestCase` (ref → pickle) →
- `TestCaseStarted/Finished` → `TestStepStarted/Finished` (с `TestStepResult.status`)

Тэг **достижим** на каждом узле графа через ID-цепочку.

`[VERIFIED: gherkin-utils docs + cucumber/messages relations.md (через WebSearch summary)]`

**Reqnroll v3+ генерит `reqnroll_report.ndjson`** — этот же формат, по умолчанию в project output folder. Configurable через `outputFilePath`. `[VERIFIED: Reqnroll v3.0 release notes 2025-08, docs.reqnroll.net/reporting/reqnroll-formatters.html]`

**[@cucumber/messages](https://github.com/cucumber/messages)** package — type-safe parser/serializer для NDJSON, доступен в JS/TS/Java/.NET/Ruby/Python/PHP/Go/C++/Elixir/Perl.

**Применение для v4**: запустили тесты → распарсили `reqnroll_report.ndjson` → получили полный граф `FR-N (тэг) → Scenario → TestCase → Pass/Fail/Skipped + exception` бесплатно.

### Тема 5 — Markdown indexing MCP servers (готовый базис для MCP-уровня)

**[markdown-vault-mcp](https://github.com/pvliesdonk/markdown-vault-mcp)** — production-ready MCP server, **самый близкий fit** для v4:

- **30 MCP tools, видимых LLM**:
  - Search (hybrid FTS5 + semantic via FastEmbed/Ollama/OpenAI)
  - Document ops: read, write, edit, delete, rename
  - **Link analysis: `get_backlinks`, `get_outlinks`, `get_broken_links`, `get_context`, `connection_paths`**
  - **Graph ops: `similar_notes`, `orphan_detection`, `most_linked_ranking`**
  - Git integration: history, diff, sync
- **SQLite FTS5** с BM25 + porter stemming
- **Frontmatter-aware indexing** — `MARKDOWN_VAULT_MCP_INDEXED_FIELDS` (configurable promoted fields → tag index)
- **`MARKDOWN_VAULT_MCP_REQUIRED_FIELDS`** — enforces frontmatter presence
- **Adaptive heading-level chunking** (H1→H6, configurable word budget, default 400)
- **Incremental reindexing** через hash-based change detection (manual `reindex` или periodic check; **auto-watch не встроен**)
- **Production**: 47 releases, CI/CD, Docker, systemd, OIDC auth

`[VERIFIED: github README + WebFetch summary]`

**Ограничение**: нет понимания семантики dev-pomogator spec format (`### Requirement: FR-N`, `#### Scenario:`). Это нужно добавить в fork-е/extension-е.

**Alternative MCP servers** (рассмотрены, менее подходят):
- [`markdown-frontmatter-mcp`](https://github.com/caffeinatedwes/markdown-frontmatter-mcp) — frontmatter query only, lightweight
- [`qmd`](https://github.com/ehc-io/qmd) — hybrid (BM25 + vector + reranker), generic
- [`MCP-Markdown-RAG`](https://github.com/Zackriya-Solutions/MCP-Markdown-RAG) — semantic + Milvus
- [Notes MCP Server (boazy)](https://mcpservers.org/servers/boazy/notes-mcp) — ripgrep-based

### Тема 6 — Markdown LSP с cross-ref (Marksman)

**[Marksman](https://github.com/artempyanykh/marksman)** — F# LSP для Markdown:

- **3 типа links** с completion/hover/goto-definition/find-references:
  - Inline links: `[label](/file.md#heading)` + `[label](#heading)`
  - Reference links: `[reference]: /url "Title"`
  - **Wiki-links**: `[[note]]`, `[[note#heading]]`, `[[#heading]]`
- **Diagnostics**: broken wiki-link refs + duplicate/ambiguous headings
- LSP — встраивается в любой совместимый редактор/агент
- **Нет MCP wrapper** — `[GAP]` который v4 может закрыть

`[VERIFIED: github README via WebFetch]`

**Ограничение**: pure LSP, нет JSON dump API из коробки. Но LSP requests типа `textDocument/documentSymbol`, `workspace/symbol`, `textDocument/references` доступны программно — можно обернуть в MCP-server.

### Тема 7 — Pact / OpenAPI conformance pattern (для FR↔Scenario contract testing)

**[Pact](https://docs.pact.io/)** — code-first contract testing:

> "Contract tests assert that inter-application messages conform to a shared understanding that is documented in a contract."

Прямой аналог для spec↔test: FR (= contract) + Scenario (= consumer) + TestCase (= provider verification).

**[PactFlow AI](https://pactflow.io/ai/)** — bi-directional contract testing + **drift detection** + AI test generation. Pattern: store contract in central place + CI checks conformance + alert on drift.

`[VERIFIED: pact.io docs + pactflow.io/ai page]`

**[OpenAPI ecosystem](https://github.com/python-openapi/openapi-spec-validator)** — validator + style validator + code generators. Тот же pattern: spec — central artefact + tooling enforces spec ↔ code conformance.

**Применение для v4**:
- Pact-style "spec ↔ test drift detection" — при изменении FR-N проверять что @FR-N scenarios всё ещё проходят
- Conformance check как gate: scenario без `@FR-N` тэга на любой FR-N → блок
- LLM-as-judge для семантического соответствия (текст Given/When/Then соответствует тексту FR)

### Тема 8 — File watching + incremental reindex

**Стандартные библиотеки**:
- [`chokidar`](https://github.com/paulmillr/chokidar) (JS) — де-факто стандарт для FS watching, cross-platform
- [`notify`](https://github.com/notify-rs/notify) (Rust) — для если нужна high-performance
- LSP `textDocument/didChange` — live updates прямо из IDE

**Examples из MCP экосистемы** (паттерны, которые можно заимствовать):
- [`qartez-mcp`](https://github.com/kuberstar/qartez-mcp) — file watcher keeps indexes fresh, re-parses files whose modification time changed, background re-indexing
- [`ClawMem`](https://github.com/yoloshii/ClawMem) — file watcher daemon command + incremental re-scan + full reindex
- markdown-vault-mcp — hash-based change detection

`[VERIFIED: github READMEs]`

### Тема 9 — Что НЕ подходит (для документирования rejected альтернатив)

| Подход | Почему отклонён |
|--------|-----------------|
| **Graphiti / Cognee MCP** (knowledge graph memory) | KG-память для агента; не приспособлен под structured spec semantics; overhead (Neo4j/FalkorDB); user feedback: «не о том» |
| **AWS Kiro spec format** | Closed-source IDE-only; MD без graph (по информации пользователя); lock-in на Anthropic models через AWS |
| **Microsoft GraphRAG** | Heavy infra (DuckDB + clustering + LLM summarization); подходит для >100 файлов corpus, overkill для 30 specs |
| **JSON-LD / RDF / OWL** | Industrial heavyweight; нет established LLM tooling вокруг |
| **ReqIF (XML)** | Industrial standard, ancient XML, нет AI-friendly tooling |
| **TLA+ / Alloy** | Formal methods, не LLM-friendly |
| **AGENTS.md** (Linux Foundation, 2025-12) | Старее spec-driven подхода, плоский MD, ортогонален задаче (instructions for agent, not spec graph) |
| **BMAD-METHOD** | Multi-agent role-based ceremony; не решает spec-graph; противоречит «легковесности» dev-pomogator |
| **Tessl Framework** | Open framework, но spec registry — commercial. MCP-compatible, но нет spec-graph функциональности |

## Где лежит реализация

### Existing dev-pomogator artefacts to leverage (NOT rewrite)

- **Spec scaffold**: `extensions/specs-workflow/tools/specs-generator/scaffold-spec.ts` — генерит 15 файлов
- **Validators**: `extensions/specs-workflow/tools/specs-generator/validate-spec.ts` + `audit-spec.ts` — structural checks
- **Form-guards (v3)**: 6 PreToolUse hooks в `extensions/specs-workflow/tools/specs-generator/` — proven enforcement pattern
- **BDD framework detector**: `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts`
- **Variant matrix builder (v3)**: `tools/specs-generator/variant-matrix/`
- **Spec convention**: `### Requirement: FR-N` headings, `#### Scenario: ...`, `@featureN` теги — уже совместимо с OpenSpec convention, и cucumber gherkin tag inheritance работает поверх

### External libraries (npm) для v4

| Package | Purpose | License |
|---------|---------|---------|
| `unified` + `remark-parse` + `remark-stringify` + `remark-frontmatter` | MD↔AST round-trip | MIT |
| `unist-util-visit` | AST traversal | MIT |
| `@cucumber/gherkin` + `@cucumber/gherkin-utils` | Gherkin parser + AST walker | MIT |
| `@cucumber/messages` | NDJSON parser для Reqnroll output | MIT |
| `remark-validate-links` | Cross-ref validator (kustomisable для FR-N IDs) | MIT |
| `chokidar` | FS watcher для incremental reindex | MIT |
| `better-sqlite3` или `sql.js` | FTS5 index (опционально) | MIT |
| `@modelcontextprotocol/sdk` (TypeScript) | MCP server scaffold | MIT |

### Reference fork candidate

[`markdown-vault-mcp`](https://github.com/pvliesdonk/markdown-vault-mcp) — fork → добавить:
1. dev-pomogator spec semantic parser (`### Requirement: FR-N` / `#### Scenario:`)
2. Cucumber Messages NDJSON ingestion
3. Conformance check API
4. PreToolUse hook `spec-conformance-guard`

## Выводы

### Что точно нужно сделать в v4

1. **Graph builder** — TypeScript module, парсит `.specs/**/*.md` через `unified/remark`, `.feature` через `@cucumber/gherkin`, `reqnroll_report.ndjson` через `@cucumber/messages`. Output: in-memory `SpecGraph` объект с типизированными nodes (FR / AC / Scenario / Task / TestCase / File) и edges (`covers` / `tagged-by` / `tested-by` / `refs` / `implements`).

2. **MCP server `dev-pomogator-specs`** — exposes минимум 7 tools агенту:
   - `find_fr(id)` — FR + связанные AC + Scenarios + Tasks + TestResults
   - `test_for_fr(id)` — Scenarios + последний TestResult
   - `tasks_for_fr(id)`
   - `conformance_check(scope?)` — список нарушений
   - `blast_radius(fr_id)` — что сломается при изменении
   - `unlinked(file)` — orphan items
   - `git_diff_impact(commit)` — какие FR затронуты + повлекут test failures

3. **Conformance checker** — новый класс checks (validate-spec.ts проверяет структуру, v4 — соответствие):
   - `UNCOVERED_FR` — FR без @FR-N scenario
   - `ORPHAN_TASK` — task без FR ref
   - `FR_REGRESSION` — pass-проходивший scenario сломался после edit FR
   - `BROKEN_REF` — wiki-link / anchor не существует
   - `SEMANTIC_DRIFT` (опционально, LLM-as-judge) — Scenario Given/When/Then перестали соответствовать FR text

4. **PreToolUse hook `spec-conformance-guard`** — паттерн из v3:
   - Перед Write/Edit на `.specs/**/*.md` или `**/*.feature` → incremental reindex + conformance check
   - Новый Scenario без `@FR-N` тэга → DENY с hint «add @FR-N matching one of: ...»
   - Изменение FR-N без обновления связанных Scenarios → DENY с hint «modify these scenarios too: ...»
   - Не env-var bypass-абельный (как и v3 form-guards)

5. **File watcher** — `chokidar` daemon в background, hash-based incremental reindex.

### Рекомендованный variant: **V4B (MCP server + hook)**

Из 4 рассмотренных вариантов:

| Variant | Стек | Effort | Risk | Pay-off |
|---------|------|--------|------|---------|
| V4A — JSON sidecar | Build step → `.graph.json` рядом с MD | 1-2 нед | Low | Low (агент по-прежнему чтит plain JSON, нет enforcement) |
| **V4B — MCP server + hook** ← рекомендую | Fork markdown-vault-mcp + custom schema + NDJSON ingest + PreToolUse guard | 3-5 нед | Medium | **High** — true agent tool + enforced trace |
| V4C — Marksman + MCP wrapper | F# LSP backend + MCP wrap + Gherkin extension | 4-6 нед | Medium (F# unfamiliar) | High — shared IDE+agent backend |
| V4D — Custom graph DB (Neo4j/Kuzu) | Full custom + DB | 6-10 нед | High | Highest, overkill для 30 specs |

**Обоснование V4B**:
- `markdown-vault-mcp` уже даёт ~80% (backlinks, broken_links, frontmatter, FTS5, incremental, 30 tools). Fork → добавить spec semantics + Cucumber ingest + conformance API.
- Pattern hook `spec-conformance-guard` копирует proven v3 form-guards (6 working hooks в production).
- Backward compat: текущие 30+ specs парсятся как есть (`### Requirement:` convention совпадает с OpenSpec).
- TypeScript stack — homogenous с остальным dev-pomogator.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — source of truth; обновлять files/rules/tools/hooks при изменениях | new MCP server + hook | FR-MCP, FR-HOOK |
| extension-layout | `.claude/rules/extension-layout.md` | Rules/skills в `.claude/{rules,skills}/`, tools в `extensions/{name}/tools/` | new extension `dev-pomogator-specs` | FR-MCP |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` спецификаторы в `extensions/**/*.ts` (Node 22.6+ native strip-types) | new TS code | FR-GRAPH |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp file + atomic move | graph index persistence | NFR-Reliability |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | При тестах в File Changes — спеки обязательны; BDD .feature при багфиксах | v4 enforces same rule at runtime | FR-CONFORM |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты intergration через runInstaller/spawnSync; unit допустим как доп | v4 self-tests | NFR-Reliability |
| no-blocking-on-tests | `.claude/rules/pomogator/no-blocking-on-tests.md` | Background tests + persistent log | v4 conformance check perf | NFR-Performance |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | extension.json hooks: 3 формата (string/object/array) | spec-conformance-guard registration | FR-HOOK |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| spec-generator-v3 form-guards | `extensions/specs-workflow/tools/specs-generator/` (6 hooks) | Proven PreToolUse DENY pattern, audit log, no env bypass | Direct copy для `spec-conformance-guard` |
| validate-spec.ts | `extensions/specs-workflow/tools/specs-generator/validate-spec.ts` | Structural MD validation, vfile reporting | Расширить для conformance checks |
| audit-spec.ts | `extensions/specs-workflow/tools/specs-generator/audit-spec.ts` | Cross-reference audit, categorized findings | Усилить графовой моделью |
| bdd-framework-detector.ts | `extensions/specs-workflow/tools/specs-generator/bdd-framework-detector.ts` | Auto-detect Reqnroll/SpecFlow/Cucumber | Re-use для NDJSON path discovery |
| variant-matrix-build skill | `.claude/skills/variant-matrix-build/` | Skill вызываемая из Phase 2 для polymorphic FRs | Pattern для `conformance-build` skill |
| Existing 30+ specs | `.specs/*/` | Convention: `### Requirement: FR-N`, `#### Scenario:`, `@featureN` теги | Backward compat — v4 ingest as-is |
| **devcontainer extension** | `extensions/devcontainer/` | Existing devcontainer setup logic в dev-pomogator distribution | Reuse для US-14 / US-16 (Codespaces) post-install MCP startup |
| **plan-pomogator extension** | `extensions/plan-pomogator/` | Plan format, validation logic, prompt-isolation, worktree handling | Reference for v4 worktree multi-session lock pattern |
| **tui-test-runner extension** | `extensions/tui-test-runner/` | Centralized test wrapper, YAML status, persistent log | Bash hook source для post-test NDJSON ingest (UC-10) |
| **onboard-repo extension** | `extensions/onboard-repo/` | `.specs/.onboarding.json` artifact, repo-context detection | Reference для v4 plugin install + per-project MCP config |
| **reqnroll-ce-guard extension** | `extensions/reqnroll-ce-guard/` | Reqnroll-specific step pattern guard (CE vs regex) | Relevant if target project uses Reqnroll (Phase 3 multi-lang) |
| **test-quality extension** | `extensions/test-quality/` | Test code quality rules, helper deduplication | Reference for Phase 2 test fixture quality |
| **specs-workflow extension** | `extensions/specs-workflow/` | Whole specs management infrastructure (THIS is being modified by v4) | Direct modification target — v4 adds MCP server + extends form-guards |
| **claude-mem-health extension** | `extensions/claude-mem-health/` | MCP-server lifecycle health monitoring | Pattern для MCP server health-check + auto-restart |

### BDD framework detection (Step 4a — verified 2026-05-18)

Auto-detection ран на `.` (project root):

```json
{
  "language": "csharp",
  "framework": "Reqnroll",
  "evidence": ["Reqnroll detected in tests\\fixtures\\steps-validator\\csharp\\Project.csproj:11"]
}
```

⚠️ **Note**: detector нашёл Reqnroll в `tests/fixtures/` (test fixture, не actual test infrastructure). Реальное состояние:

| Component | Current | Target (Phase 0) |
|-----------|---------|------------------|
| dev-pomogator own test framework | vitest (TypeScript) + Reqnroll fixtures для steps-validator | + cucumber-js (additive) |
| Target TS projects test framework | varies (vitest / jest / mocha + custom BDD) | cucumber-js mandatory (additive) |
| Target .NET projects test framework | Reqnroll v3+ (already emits NDJSON) | no migration needed |
| Target Python projects test framework | behave (если есть BDD) | behave с message formatter (Phase 3+) |

**Phase 0 action**: устанавливаем `@cucumber/cucumber` + `@cucumber/messages` в dev-pomogator package.json, migrate vitest pseudo-BDD на real Cucumber-JS NDJSON.

### Architectural Constraints Summary

- **Schema стабильность**: Cucumber Messages — protobuf-based, semver-versioned. Версия Reqnroll v3+ обязательна для NDJSON output. → FR-NDJSON-INGEST зависит от env requirement.
- **Backward compat обязательна**: 30+ existing specs не трогать. → FR-PARSER должен принимать current convention без миграции.
- **Hook enforcement без bypass**: pattern v3 (`SPEC_FORM_GUARDS_DISABLE` не существует). → NFR-Security: no env-var bypass, meta-guard защищает extension.json.
- **Migration guard**: v4 active только при `.progress.json.version >= 4` (analogue v3 migration). → existing v1/v2/v3 specs pass-through.
- **TypeScript stack**: homogenous с остальным dev-pomogator. Node 22.6+ для native strip-types.
- **No persistent DB**: in-memory graph rebuild на старте; опционально SQLite FTS5 для perf (как markdown-vault-mcp). → NFR-Performance: graph build <2s для 30 specs.

## Risk Assessment

> Auto-populated by Skill `discovery-forms` during Phase 1. Hook `risk-assessment-guard` enforces:
> when `## Risk Assessment` heading is present, the table below must have ≥2 non-placeholder rows
> with Likelihood ∈ {Low, Medium, High}, Impact ∈ {Low, Medium, High}, and non-empty Mitigation.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| markdown-vault-mcp fork diverges from upstream — security/perf fixes upstream придётся cherry-pick'ать вручную | Medium | Medium | Минимизировать changes — добавлять spec-semantics через extension point (frontmatter fields + custom validator), не патчить core. Документировать upstream commit hash на каждом merge. Альтернатива: написать v4 MCP с нуля используя `@modelcontextprotocol/sdk` (отказ от fork-а — больше работы, меньше maintenance burden) |
| Cucumber Messages NDJSON ingestion ломается при breaking changes в Reqnroll (v4 → v5) | Low | High | Pin `@cucumber/messages` package version в package.json. CI test против multiple Reqnroll versions. Graceful degradation: если NDJSON отсутствует или unparseable — disable test-related conformance checks, не блокировать spec workflow целиком |
| LLM-as-judge semantic conformance check ненадёжен (false positives / negatives) | High | Medium | Сделать semantic check **opt-in** через config flag (default off). Default — только structural checks (UNCOVERED_FR / ORPHAN_TASK / BROKEN_REF). Semantic check — отдельный skill вызываемый явно (`/spec-review` уже существует — расширить, не дублировать) |
| Hook latency на каждом Write/Edit замедляет агента (incremental reindex >500ms) | Medium | High | Hash-based incremental reindex (markdown-vault-mcp паттерн): только изменённый файл → пересборка только affected subgraph. Background daemon mode для file-watching вместо on-demand reindex. Benchmark target: <100ms p95 на single-file change для 30 specs |
| Migration guard ломается — v3 specs неожиданно начинают валидироваться v4 правилами | Low | High | Жёсткая проверка `progress.json.version >= 4` в каждом v4 hook entry-point. Test suite: regression на v3 specs (read-only verification). Versioned migration script `migrate-v3-to-v4.ts` явно поднимает version field только когда spec ready. Audit log записывает каждый attempt пересечь version boundary |
| Backward compat: existing `### Requirement: FR-N` convention в 30+ specs не совпадает с реальным parser-output (edge cases в numbering / kebab-case / suffix) | Medium | Medium | Parser развивать через test-first: pre-write parser → run на всех existing `.specs/*/FR.md` → fix edge cases пока 100% корректно индексируется. Fail-loud при parse failures (не silent skip) — добавить test fixture для каждого discovered edge case |
| MCP server должен deployment-friendly — текущие пользователи не хотят разворачивать отдельный процесс | Medium | Medium | Bundle MCP server в `dev-pomogator` npm package как existing pattern. Auto-start через `.claude/settings.local.json` `mcpServers` entry при installer-е. Health check + auto-restart hook. Альтернатива (rejected): stdio MCP — но это блокирует agent thread на каждый call |
| Phase 6: `architecture-research-workflow` overhead для маленьких фич — юзер не хочет 7 stages для bugfix | High | Medium | create-spec heuristic detects complexity (keywords "архитектур", "v2/v3/v4", "rebuild", ≥3 components); small features → existing `research-workflow` path; explicit user override flag `--use-arch-research` для force |
| Phase 6: Stage rewind logic loops infinitely при agent indecision (FR ↔ Variants ↔ Decisions endless cycle) | Medium | High | Hard limit 3 rewinds per spec; after 3rd `restart-from-stage` — DENY with user prompt «too many rewinds, manual intervention required»; audit trail в decisions-locked.md записывает каждый rewind с reason |
| Phase 6: `.architecture-research/` folder pollutes spec history — committable 7 stage files на каждую major фичу | Low | Low | Optional `dev-pomogator cleanup-arch-research <slug>` команда после Stage 7 merge; default keep для audit trail; .gitignore не нужен потому что content полезен для team review через недели/месяцы |
| Phase 6: Skill creep — добавляем ещё stages в ответ на feedback, скил пухнет до 1500+ строк | Medium | Medium | Lock skill scope в SKILL.md frontmatter (7 stages, no more); new patterns extract в **separate** sub-skills (pattern из Q.8 bonus: `iterative-refinement`, `edge-case-catalog`, `pain-validator`); SKILL.md max 600 строк hard limit |
| Phase 6: create-spec recursion — `architecture-research-workflow` вызывает create-spec, create-spec вызывает arch-research → infinite loop | Low | High | Flag `--research-done` set в Stage 7 hand-off context; create-spec checks flag в Phase 1 step 5 — если установлен, skip own research invocation; integration test покрывает recursion path |

## Appendix A: Multi-file mdast workspace index

mdast сам парсит один файл; для cross-file links нужен workspace-level индекс. Алгоритм:

1. **Per-file parse**: glob `.specs/**/*.md` + `tests/**/*.feature`, для каждого файла unified/remark → mdast tree (для `.feature` — `@cucumber/gherkin`).
2. **Definitions table**: обходим все trees, для каждого heading `### Requirement: FR-N` / `#### Scenario: SCEN-X` → `definitions.set(id, { file, line, type, title })`. Размер для 30 specs: ~200 anchors.
3. **References table**: для каждого inline link `[text](./file.md#anchor)`, wiki-link `[[FR-N]]`, и Gherkin tag `@FR-N` → `references.push({ from: {file, line, scope}, toAnchor, edgeType })`. Размер: ~800 edges.
4. **Backlinks index** (reverse): для каждого `references.toAnchor` → list of `from` locations. Прямой ответ на «кто на меня ссылается».
5. **Validation step**: каждый reference резолвится в definitions; не разрешённые → `BROKEN_REF`.
6. **Incremental rebuild**: на `chokidar` change события только affected файл переразбирается, definitions/references из него обновляются, backlinks для затронутых anchors пересчитываются.

**Wiki-links vs inline-links**: wiki-style `[[FR-001]]` не зависит от файловых путей — резолвер сам находит heading в любом файле workspace-а. Для v4 предпочтительнее — переименование файла не ломает ссылки.

**Размеры в памяти для 30 specs (~300 MD + 50 .feature + 1 ndjson)**:
- mdast trees: 5-10 MB
- workspace index (defs + refs + backlinks): ~500 KB
- Full rebuild cold: 1-2s
- Incremental (single file change): <50ms

## Appendix B: Tag propagation Feature → Pickle → TestResult

Полный путь @FR-N от .feature до runtime результата в `reqnroll_report.ndjson`:

```
.feature файл
    @FR-001                       ← в Gherkin AST это Tag node
    Scenario: Login OK
       │
       │ при parse: Pickle inheritance — tags Feature ∪ Scenario
       ▼
{pickle, id:"p1", tags:[{name:"@FR-001"}], astNodeIds:["scenario-id"]}
       │
       │ runtime testCase создаётся из pickle
       ▼
{testCase, id:"tc1", pickleId:"p1", testSteps:[{id:"s1",...}]}
       │
       │ run lifecycle
       ▼
{testCaseStarted, id:"tcs1", testCaseId:"tc1"}
{testStepStarted, testCaseStartedId:"tcs1", testStepId:"s1"}
{testStepFinished, testCaseStartedId:"tcs1", testStepId:"s1",
   testStepResult:{status:"PASSED", duration:{seconds:0,nanos:120000000}}}
{testCaseFinished, testCaseStartedId:"tcs1"}
```

**JOIN keys для построения графа FR ↔ Result**:
1. `pickle.tags[].name === "@FR-N"` — связка FR ↔ Pickle
2. `testCase.pickleId === pickle.id` — связка Pickle ↔ TestCase
3. `testCaseStarted.testCaseId === testCase.id` — связка TestCase ↔ run instance
4. `testStepFinished.testCaseStartedId === testCaseStarted.id` — связка run ↔ step result

После прогона тестов парсер NDJSON наполняет node `Scenario "SCEN-x"` полями `{ lastResult: "PASSED|FAILED|SKIPPED", lastRunAt: timestamp, duration_ms, failingStep?: {keyword,text,exception} }`.

## Appendix C: Agent enforcement practices ("заставить агента использовать MCP как LSP")

Проблема: MCP-сервер существует, но агент может его игнорировать и читать `.md` напрямую (как сейчас). Нужны механизмы которые сделают использование MCP **естественным** или **обязательным**.

**6 практик, ранжированы по силе принуждения**:

| Сила | Механизм | Как работает | Pros | Cons |
|------|----------|--------------|------|------|
| Самое мягкое | **Tool description engineering** | В MCP tool description явно прописать «MUST use before reading .specs/**/*.md» + примеры | Zero infra, агент сам решает | Может игнорировать |
| Мягкое | **CLAUDE.md правило / skill description** | Записать в always-apply правило: «при работе со спекой — сначала `spec_overview` потом `get_fr`» | Совместимо с rules-системой | Агент проигнорирует если торопится |
| Среднее | **Skill `spec-context-prelude`** | Auto-triggered при первом упоминании `.specs/*` в reply, инжектирует результат `spec_overview` в контекст | Pull-based, не блокирует | Не покрывает «забыл вызвать tool на конкретный FR» |
| Сильное | **PreToolUse hook: blocked direct Read** | Hook intercepts `Read .specs/**/*.md` → возвращает stub message «use `get_fr(id)` instead» + список доступных FR | Прямой forcing — нельзя обойти | Может мешать legitimate cases (читать README) |
| Очень сильное | **PostToolUse hook: validate after Edit** | После Write/Edit на спеку — авто-запуск `conformance_check` → если найдены нарушения → возвращает их в контекст агента сразу | Reactive validation, обязательный feedback | Latency на каждый write |
| Жёсткое | **PreToolUse: deny если spec не fetched** | Запрет Write/Edit на `.specs/{slug}/*.md` если в session-context не было call `get_fr` / `spec_overview` за последние N tool calls | Forces awareness | Сложно реализовать (нужен session state tracking) |

**Рекомендуемая комбинация для v4** (стек, не каждое отдельно):
1. **Sticky skill** `spec-context-prelude` — auto-trigger при упоминании `.specs/` или `FR-` в user message; инжектирует `spec_overview(slug)`
2. **PreToolUse soft hint** на `Read .specs/**/*.md` — НЕ блокирует, но добавляет в context: «consider `get_fr("FR-N")` for structured view including tests/tasks/backlinks»
3. **PostToolUse mandatory** на `Write .specs/**/*.md` или `**/*.feature` — auto-run `conformance_check(affected_scope)`, return findings в agent context. Если нарушения — agent **видит** их немедленно
4. **PreToolUse hard deny** только на специфичные нарушения: scenario без `@FR-N` tag, FR-N edit без paired scenario update (как v3 form-guards)

Это паттерн «**LSP-like push diagnostics**» — каждое изменение немедленно проверяется и feedback приходит сразу, агент **не может** забыть как сейчас (validate-spec.ts запускается только если агент вспомнит).

## Appendix D: Variant C deep — Marksman + Gherkin/ndjson ingest

Marksman из коробки решает только MD-часть workspace-индекса. Для Gherkin и Reqnroll NDJSON нужен дополнительный слой. Два подхода:

### Approach C1: side-by-side (рекомендован для C)

Marksman работает как black-box LSP subprocess; v4 MCP server runs **рядом** свой Gherkin+ndjson индекс; MCP-tool handler **merge**-ит результаты.

```
                          dev-pomogator-specs MCP server
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
       ┌──────────────┐         ┌────────────────┐      ┌──────────────────┐
       │ Marksman LSP │         │ Gherkin parser │      │ NDJSON ingester  │
       │ subprocess   │         │ (in-process,   │      │ (in-process, JS) │
       │ (stdio LSP)  │         │  JS)           │      │                  │
       └──────┬───────┘         └────────┬───────┘      └────────┬─────────┘
              │                          │                       │
   workspace/symbol                 .feature AST        reqnroll_report.ndjson
   textDocument/references          + tags              → testResults
   textDocument/definition          → scenarios
              │                          │                       │
              └──────────────────────────┼───────────────────────┘
                                         ▼
                          Merged response для MCP tool
```

**MCP handler `get_fr("FR-001")` пайплайн**:
```typescript
async function getFr(id: string) {
  // 1. Marksman: definition + backlinks для FR-001 в MD-файлах
  const definition  = await lspRequest('textDocument/definition', { symbol: id });
  const backlinks   = await lspRequest('textDocument/references', { symbol: id });

  // 2. Gherkin index: Scenarios с @FR-001 tag
  const scenarios   = gherkinIndex.scenariosByTag(id);

  // 3. NDJSON: последние test results для этих Scenarios
  const testResults = ndjsonIndex.latestResults(scenarios.map(s => s.pickleId));

  // 4. Tasks: backlinks из TASKS.md (тоже через Marksman)
  const tasks       = backlinks.filter(b => b.file.endsWith('TASKS.md'));

  return { fr: definition, acs: backlinks, scenarios, testResults, tasks };
}
```

**Pros**:
- Marksman обновляется upstream, ты получаешь fixes бесплатно
- Gherkin/NDJSON изолированы в JS — стек однородный
- Если Marksman падает — graceful degrade, MD-часть отключается, остальное работает

**Cons**:
- 2 процесса (Node MCP + Marksman F#)
- IPC overhead на каждый MCP call (~5-10ms за LSP request)
- Marksman binary ~15MB add to install size

### Approach C2: fork Marksman, add Gherkin (rejected)

Добавить парсер Gherkin прямо в Marksman codebase (F#). Получаешь единый workspace со всем сразу.

**Cons-перевешивают**: F# не родной стек dev-pomogator, maintenance burden, отрыв от upstream Marksman. **Не рассматриваем.**

### Edge cases Variant C
- Marksman crash mid-request → MCP должен retry или fallback к own parser (нужен MD parser as backup)
- Marksman не понимает custom heading patterns (`### Requirement: FR-N`) — он индексирует чистый markdown headings. Решение: trick — рядом с каждым `### Requirement: FR-001 Login` ставить `<a name="FR-001"></a>` или wiki-link prefix
- Version mismatch — Marksman API меняется между минорами, нужен compatibility test
- F# runtime — на Windows работает, на ARM/Alpine может быть issue

## Appendix E: Edge cases per MCP tool

### `get_fr(id)`

| Edge case | Поведение |
|-----------|-----------|
| FR не существует (typo: FR-01 вместо FR-001) | Fuzzy match по Levenshtein-distance, suggest top-3 closest + `{ found: false, suggestions: [...] }` |
| FR определён в нескольких файлах (duplicate) | `{ ambiguous: true, candidates: [...] }` + warning code `DUPLICATE_DEFINITION` |
| FR в архивной спеке (`.specs/archive/`) | Include с флагом `archived: true`, агент решает использовать или нет |
| FR с очень длинным body (>10K chars) | Усечение до 2000 chars + pagination через `get_fr(id, offset)` |
| FR с broken refs внутри (refs FR-99 несуществующий) | Include + `internal_broken_refs: [...]` |
| Mixed case (`fr-001`, `FR-1`, `FR-001`) | Normalize при индексации (UPPER+pad zeros), все варианты резолвятся в один node |
| FR ссылается на другую spec (`refs: SPEC-other/FR-3`) | Cross-spec resolve через workspace-level definitions; вернуть с указанием `cross_spec: true, source_slug: "other"` |
| FR в draft статусе (front-matter `status: draft`) | Include + `status: "draft"`; conformance_check skip-ает draft-only FRs |

### `conformance_check(scope?)`

| Edge case | Поведение |
|-----------|-----------|
| Test файл удалён, но ndjson всё ещё содержит старый Scenario | Detect mismatch → finding `STALE_NDJSON` + suggest rerun tests |
| Scenario с `@FR-99` тэгом на несуществующий FR | `ORPHAN_SCENARIO_TAG` |
| FR без AC вообще | `FR_MISSING_AC` (severity: warning, not error) |
| Scenario был compile-error (отсутствует step definition) → не появился в `testCaseStarted` | `SCENARIO_NOT_RUN` finding |
| Multiple scenarios с одним именем (например `@FR-1` 5 раз) | Все засчитываются, дополнительно `DUPLICATE_COVERAGE` warning если ≥3 |
| FR добавлен после last test run | `FR_UNTESTED_AFTER_EDIT` (last_test_run < FR.last_modified) |
| Конформанс check для всей спеки `scope: "all"` на 30 specs | Pagination findings (max 100 per call), warning если truncated |
| Ndjson нет совсем | Skip test-related checks, return только structural; warning `NO_TEST_RUN_DATA` |

### `test_for_fr(id)`

| Edge case | Поведение |
|-----------|-----------|
| FR имеет scenarios в нескольких .feature файлах | Return all, group by file |
| Ndjson старше 24h | Include + `staleness_warning: { last_run: ..., hours_ago: 36 }` |
| Scenario переименован после прогона (ndjson содержит старое имя) | Match по pickleId (стабильный); если pickleId не совпадает — `RENAMED_SCENARIO` warning |
| Параметризованные scenarios (Scenario Outline + Examples) | Каждая example как отдельный TestCase в ndjson, group by parent Scenario name |
| Skipped scenarios (`@ignore` tag или `@manual`) | Include с `status: "skipped"` + reason тэг |

### `blast_radius(id)`

| Edge case | Поведение |
|-----------|-----------|
| Циклическая зависимость (FR-1 refs FR-2 refs FR-1) | Detect cycle, return с `cycle_detected: ["FR-1", "FR-2", "FR-1"]` |
| Глубокая chain (FR-1 → AC-3 → SCEN-X → TASK-12 → Code → другие FR) | Configurable depth (default 3), указать `max_depth_reached: true` если truncated |
| «Что если удалить» vs «что если изменить» vs «что если переименовать» | Парам `change_type: "delete" | "modify" | "rename"`; разные blast (delete = всё ломается, rename = только anchors invalidated) |
| FR не имеет ни одного reference | `{ blast: "isolated", warning: "FR has no incoming references - either orphan or new" }` |
| Code refs — как извлекать (нет direct edge spec ↔ code)? | Heuristic: grep по FR-N в code comments + LSP `findReferences` на любые symbols упомянутые в FR text |

### `git_diff_impact(rev?)`

| Edge case | Поведение |
|-----------|-----------|
| Uncommitted changes (working tree) | Default rev: working tree vs HEAD; explicit override `rev: "HEAD~3..HEAD"` |
| Merge commits | Diff против merge-base, не первый parent |
| Rename detected as delete+add | Use `git diff -M` (rename detection), treat as `RENAMED` not `DELETED`+`ADDED` |
| Diff в не-spec файлах (src/) | Include только если файл linked-from `code_refs` любого FR; иначе ignore |
| Untracked файлы | Optional via `include_untracked: true` (default false) |
| Commit без spec changes | Return `{ touched_frs: [], summary: "no spec-relevant changes" }` |

### `search_specs(query, type?)`

| Edge case | Поведение |
|-----------|-----------|
| Query на русском, spec на английском (или mixed) | FTS5 with porter stemming + locale-aware analyzer; для semantic — multilingual embeddings (e.g., bge-m3) |
| Domain jargon ("WMS", "AcceptProduct.mslx") | Frontmatter-promoted fields (тэги, glossary) дают boost |
| Too many results (>100) | Top-K by score; pagination cursor |
| Type filter `type: "FR"` или `"Scenario"` | Filter applied при индексации; быстро через secondary index |
| Empty query | Return `spec_overview()` поведение по умолчанию |

### `unlinked(type?)`

| Edge case | Поведение |
|-----------|-----------|
| Scenarios намеренно без FR (e.g., `tests/infrastructure/`) | Exclude через config `unlinked.exclude_paths: [...]` или tag `@no-fr-required` |
| TASKs со статусом "planning" без FR | `severity: info` вместо `warning` |
| AC определён но никем не cited | `ORPHAN_AC` (даже если FR на него ссылается через `[link](#ac-X)` — должно быть распознано) |

### `broken_refs()`

| Edge case | Поведение |
|-----------|-----------|
| External URLs (https://...) | Skip по умолчанию; opt-in `check_external: true` через HEAD requests с timeout |
| Refs на архивные спеки | `archived: true` flag, не error |
| Hash-only refs (`[link](#anchor)` без файла) | Resolve в текущем файле; если нет — broken |
| Refs на тесты которые не существуют (`tests/Auth.feature:42`) | Validate существование файла + heuristic line range |

## Appendix F: Sub-agents (Haiku) vs scripts — когда что использовать

### Pure script wins

| Use case | Почему script |
|----------|---------------|
| `list_uncovered_frs()` | Pure data traversal; deterministic; <50ms |
| `find_scenarios_by_tag(@FR-N)` | Simple index lookup |
| `validate_cross_refs()` | Boolean check, без интерпретации |
| `compile_graph_from_files()` | Deterministic, нужен один result |
| `git_diff_impact()` | git plumbing + graph traversal |
| `latest_test_results(fr)` | Index query |

**Преимущества**: 0 LLM tokens, <100ms, идемпотентны, легко тестируются, нет hallucination.

### Sub-agent (Haiku) wins

| Use case | Почему agent |
|----------|--------------|
| `semantic_drift_check(fr, scenario)` — Given/When/Then соответствует FR text? | Нужна интерпретация natural language, structural check не справится |
| `suggest_scenario_for_fr(fr)` — generate Gherkin draft из FR | Generative task |
| `explain_blast_radius(fr_id)` — 2-sentence summary над script output | Synthesis |
| `suggest_fix_for_broken_ref(ref)` — auto-suggest правильный ID | Понимание контекста |
| `coverage_gap_explanation(fr)` — почему scenario не полностью покрывает FR | Reasoning |

**Преимущества**: handles ambiguity, natural language output, can suggest fixes.

**Недостатки**: cost (~$0.0005 на Haiku call), latency 1-3s, non-deterministic, **может галлюцинировать** — основная проблема которую v4 решает.

### Recommended hybrid pattern: "enriched script errors"

Лучший паттерн — **скрипт делает всю детерминистическую работу + структурно богатый error message** который не требует от агента дополнительного research. Sub-agent — опционально поверх для семантики.

**Плохой error от скрипта** (агент тратит время на расследование):
```
ERROR: validation failed
- TASK-12: orphan
```

**Хороший error от скрипта** (агент видит всё):
```json
{
  "findings": [
    {
      "code": "ORPHAN_TASK",
      "severity": "error",
      "task": "TASK-12",
      "file": "TASKS.md:88",
      "task_text": "Add OAuth2 callback handler",
      "issue": "Task references FR-99 which doesn't exist in any spec",
      "evidence": { "refs_field": "FR-99", "available_frs": ["FR-1","FR-2","FR-9"] },
      "suggestions": [
        { "action": "rename_ref", "from": "FR-99", "to": "FR-9", "confidence": 0.7,
          "reason": "Closest match by Levenshtein distance; FR-9 text mentions OAuth" },
        { "action": "remove_ref", "task": "TASK-12",
          "reason": "If task is no longer needed" },
        { "action": "create_fr", "draft_id": "FR-10",
          "reason": "If TASK-12 implements new requirement not yet in spec" }
      ],
      "auto_fixable": false
    }
  ],
  "summary": "1 error, 0 warnings; 1 auto-fix not available (needs human decision)"
}
```

Тогда:
- Агент НЕ нужно re-read TASKS.md
- Агент НЕ нужно искать какие FR существуют
- Агент НЕ нужно понимать что такое orphan
- Готовые options к выбору, агент просто выбирает по контексту

**Это снимает 80% потребности в sub-agent'ах**. Sub-agent (Haiku) остаётся только для:
1. Семантический drift check (`SEMANTIC_DRIFT`) — нужна интерпретация текста
2. Auto-generate suggestions for ambiguous cases (например, какой FR из 3 близких имелся в виду)

### Final pattern для v4

| Layer | Tech | When |
|-------|------|------|
| **Layer 1**: Graph + structural checks | Pure TypeScript, deterministic | 95% всех queries |
| **Layer 2**: Enriched error messages with suggestions | Same script, rich output schema | Часть Layer 1, не отдельный layer |
| **Layer 3**: Semantic checks (opt-in) | Haiku sub-agent через `Task` API, called from script когда нужно | 5% queries, явный config flag |
| **Layer 4**: Generative (suggest scenario / fix) | Sub-agent, only on agent's explicit request via MCP tool | по запросу |

**Default config v4**: Layers 1-2 active по умолчанию. Layer 3-4 opt-in.

**Cost analysis** (для сессии 100 tool calls со спекой):
- Pure scripts: $0, latency ~5s total
- + Layer 3 semantic on 10% calls: +$0.005, +10-20s latency
- + Layer 4 generative on demand: +$0.002 per explicit call

Сильно дешевле чем sub-agent на каждый call. И детерминистические части не галлюцинируют by construction.

## Appendix G: MCP/LSP layering decision + tools redesign (tag/node-centric)

### Architectural correction

Initial draft предполагал «MCP wraps LSP» как primary pattern. После обсуждения: это **разные слои**, дубли OK.

| Layer | Activation | Use |
|-------|-----------|------|
| LSP (Marksman + Claude Code native LSP) | Реактивный (file events, Read tool) | Symbol navigation, real-time diagnostics IDE/agent |
| MCP (custom dev-pomogator-specs) | Pull only (agent calls tool) | Domain queries (spec graph, conformance, trace) |
| PreToolUse hooks | Sync block | HARD invariants (как v3 form-guards) |
| PostToolUse hooks | Async push | Soft findings — auto-inject в context после Edit `.specs/**` |

LSP даёт ~900× speedup на cross-file symbol queries vs grep (бенчмарк: 50ms vs 45-60s — `[SINGLE_SOURCE: amirteymoori.com / yingtu.ai blogs, not Anthropic official]`). Claude Code native LSP integration существует — упоминается в community blogs (Karan Bansal, YingTu, Antonio Cortes 2026); конкретная версия и список языков `[NEEDS_CONFIRMATION: official release notes not located]`. Issue `anthropics/claude-code#5495` — feature request с performance claims, **не** release announcement. v4 не должен зависеть от точной версии Claude Code — Marksman для MD достаточно даже если Claude Code LSP отсутствует.

### Tool redesign (replaces FR-centric draft)

Previous draft был FR-centric — что неверно: у нас FR/NFR/AC/SCEN/TASK/USECASE/RISK и тэги (`@FR-N`, `@NFR-Category-N`, `@priority:P1`, `@archived`). Redesign — generic node + tag combinator:

| # | Tool | Input | Output |
|---|------|-------|--------|
| 1 | `get_node(id)` | `"FR-001"` / `"NFR-Performance-1"` / `"AC-3"` / `"SCEN-x"` / `"TASK-12"` | Type-aware node payload |
| 2 | **`get_trace(node_id, depth?)`** ⭐ primary tool | `"FR-001"` или `"NFR-Performance-1"` | Полный graph slice от node до листьев (test results, code impl, related nodes) + natural-language explanation для агента в одном response |
| 3 | `find_by_tags(tags[], operator?)` | `["@FR-001", "@priority:P1"]` + `"AND"`/`"OR"` | Nodes matching tag combination |
| 4 | `find_by_type(type, slug?)` | `"NFR"`, optional slug | All nodes of type |
| 5 | `conformance_check(scope?, severity?)` | `"all"` / `"FR-001"` + severity filter | Structured findings + suggestions |
| 6 | `blast_radius(node_id, change_type)` | `"FR-001"` + `"delete"`/`"modify"`/`"rename"` | What breaks at each level |
| 7 | `list_orphans(type?)` | `"Scenario"` / `"AC"` / `"NFR"` / null | Disconnected nodes |
| 8 | `broken_refs(scope?)` | optional slug | Broken wiki-links / inline-links |
| 9 | `git_diff_impact(rev?)` | `"HEAD~3..HEAD"` | Touched nodes + at-risk tests |
| 10 | `search(query, filter?)` | `"login email"` + `{type, slug}` | Ranked semantic + text results |
| 11 | `overview(slug?)` | optional slug | Counts + coverage % + last test run |

**`get_trace(node_id)` — главный tool**. Один call → агент получает structured граф slice + аннотацию natural-language для понимания:

```json
{
  "node": { "id": "FR-001", "type": "FR", "title": "Login", "file": ".specs/auth/FR.md:12" },
  "explanation_for_agent": "FR-001 — login requirement. 2 AC (AC-3, AC-7), 3 Gherkin scenarios in Auth.feature, 2 pending tasks. Last run 2h ago: 2 PASSED, 1 FAILED (SCEN-login-locked — NullReferenceException AuthService.cs:88). Related: FR-005 (password reset), NFR-Security-1 (lockout compliance).",
  "tree": {
    "acceptance_criteria": [...],
    "scenarios": [{ "id", "file", "tags", "lastResult", "step_bindings": [{ "step", "code_file:line" }] }],
    "tasks": [...],
    "code_impl": [{ "file", "lines", "via": "step binding SCEN-x" }],
    "related_nodes": [{ "id": "FR-005", "reason": "shares tag" }]
  }
}
```

Built-in LSP tools от Claude Code (`GoToDefinition`, `FindReferences`, etc.) — остаются доступны агенту параллельно. MCP не пытается их replace.

### Tool count budget

Не накладываем hard limit в Phase 2 (пользователь решил отложить бюджет). Текущий design = 11 MCP tools + 6 built-in LSP = 17, в безопасной зоне (cliff ~25 tools per MCPVerse / eclipsesource benchmarks).

## Appendix H: Multi-env / devcontainer constraints

### Supported environments (Phase 2)

| Env | MCP server location | File watching | Notes |
|-----|---------------------|---------------|-------|
| Host (Win/Mac/Linux) | Host process | Native FS events | Baseline |
| Devcontainer (VS Code Remote-Containers) | В контейнере | Polling fallback (Docker Desktop bind-mounts) | `claude` CLI должен быть установлен в container |
| WSL2 | В WSL distro | Polling для `/mnt/c/...`, native для WSL FS | |
| GitHub Codespaces | Container (managed) | Polling | Phase 3+ |
| Hyper-V test VM | В VM | Native | Уже есть `hyperv-test-runner` skill |

**Принцип**: MCP server живёт там же, где Claude Code CLI. Не пытаемся sharing host↔container.

### Path convention (strict)

Все paths в MCP API response — **relative к git repo root** (`git rev-parse --show-toplevel`). Никаких absolute paths — они ломаются при cross-env mismatch:

- ✅ `{ "file": ".specs/auth/FR.md", "line": 12 }`
- ❌ `{ "file": "/workspace/.specs/auth/FR.md" }` — ломается на host
- ❌ `{ "file": "D:\\repos\\dev-pomogator\\..." }` — ломается в container

### File watching — chokidar polling fallback

Bind-mounts (Docker Desktop Windows/Mac, WSL2 `/mnt/c`) часто не доставляют FS events корректно. Решение:

```typescript
const watcher = chokidar.watch('.specs/**', {
  usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' || autoDetectSlowFS(),
  interval: 1000,
  binaryInterval: 3000,
  awaitWriteFinish: true,
});
```

`autoDetectSlowFS()` — touch test при старте MCP: create temp file, ждём event 500ms; если не пришёл → polling on.

### Multi-session protection (per-worktree-per-env)

Lock file `.dev-pomogator/.mcp-lock.json` (atomic `flag: 'wx'`, паттерн из `atomic-update-lock.md`):

```json
{
  "pid": 12345,
  "env": "container:devcontainer-abc123",
  "started_at": "2026-05-17T10:00:00Z"
}
```

Start sequence: atomic create → if exists check pid alive → if alive but different env → DENY с инструкцией («MCP уже запущен в env X»). Stale lock (pid не alive) → delete + retry.

Multi-session Claude Code на одном проекте — **roadmap Phase 3** (вместе с Codespaces).

### Plugin distribution и subagent CLI

`claude` CLI должен быть установлен в каждой env где работает Claude Code. Для devcontainer добавляем в `Dockerfile`:

```dockerfile
RUN npm install -g @anthropic-ai/claude-code
```

Это onboard-repo concern — `.devcontainer/devcontainer.json` `postCreateCommand` ставит и Claude CLI, и dev-pomogator.

## Appendix I: Phased rollout

| Phase | Scope | Language(s) | Storage | Key deliverables |
|-------|-------|-------------|---------|------------------|
| **Phase 0** ⭐ | Migration current dev-pomogator BDD: vitest pseudo-BDD → real Cucumber-JS с NDJSON output | TypeScript | N/A | Migrated `tests/` to cucumber-js, working `reqnroll_report.ndjson`-equivalent, fixtures для Phase 1 |
| **Phase 1** | Graph builder + custom MD parser + Gherkin AST + NDJSON ingester | TypeScript | In-memory only | SpecGraph module, parsers, unit-tests на fixture |
| **Phase 2** | MCP server + 11 tools + PreToolUse hooks (HARD) + PostToolUse push (always-push, шум приемлем) | TypeScript | In-memory | Working MCP, agent integration end-to-end |
| **Phase 3** | LLM layer: semantic_drift_check, suggest_scenario, blast_radius explanation; subagent через `claude` CLI subprocess; multi-language support (.NET/Python/Java) | + C# / Python / Java | In-memory | Optional LLM checks + cross-lang code refs |
| **Phase 4** | Persistent SQLite FTS5 (cross-session), side-channel logs (`.dev-pomogator/.spec-check-log/`), Codespaces / multi-session Claude support, KG analytics (if scale grows) | All | SQLite optional | Cross-session sharing, log analytics |

**Critical: Phase 0 — миграция dev-pomogator BDD первым шагом**. Без реального Cucumber-JS NDJSON ничего из Phase 1-2 не имеет смысла тестировать.

## Appendix J: Plugin install requirements + BDD framework decision

### v4 — это update existing dev-pomogator extension

Не новый плагин — патч в `extensions/specs-workflow/` + новый `extensions/dev-pomogator-specs-mcp/`. Зависимости устанавливаются при `npm install` / `npx dev-pomogator` (existing flow).

### npm dependencies (pure JS, no native)

```json
{
  "unified": "^11",
  "remark-parse": "^11",
  "remark-frontmatter": "^5",
  "remark-wiki-link": "^6",
  "unist-util-visit": "^5",
  "@cucumber/cucumber": "^11",          // Phase 0: real BDD runner
  "@cucumber/gherkin": "^29",
  "@cucumber/gherkin-utils": "^9",
  "@cucumber/messages": "^27",
  "@modelcontextprotocol/sdk": "^1",
  "chokidar": "^4"
}
```

**No native deps** — никакого better-sqlite3, никакого Marksman F# binary в default install. Это упрощает devcontainer / cross-platform.

### Marksman — opt-in postInstall

Marksman F# binary ~15MB. Default: НЕ устанавливается. Если юзер хочет IDE-features (wiki-link navigation в VS Code) — отдельная команда `dev-pomogator install-marksman` качает с GitHub releases для текущей платформы.

Phase 2 fallback — встроенный custom MD LSP в нашем MCP server (на JS), даёт subset фич Marksman (wiki-link parsing, broken-ref diagnostics). Marksman опционален для IDE-richer experience.

### BDD framework для Phase 0 (TypeScript)

Кандидаты:

| Tool | NDJSON output | Maturity | Vitest compat | Verdict |
|------|---------------|----------|---------------|---------|
| **`@cucumber/cucumber` (cucumber-js)** | ✅ Canonical message formatter (NDJSON) | High (~3 lifecycle years) | ❌ standalone runner | **Pick** — standard, NDJSON официальный |
| `@quickpickle/quickpickle` | ⚠️ Unclear — own formatter | Recent, smaller community | ✅ vitest-based | Rejected — custom output, не Cucumber Messages standard |
| `@amiceli/vitest-cucumber` | ❌ Custom output, не NDJSON | Active | ✅ vitest-native | Rejected — no NDJSON, blocks v4 trace |
| `jest-cucumber` | ❌ Jest-specific | Active | ❌ jest only | Rejected — wrong test framework |

**Decision: `@cucumber/cucumber` (cucumber-js)** — единственный с **канонический NDJSON output** (Cucumber Messages standard, тот же формат что Reqnroll v3+ генерит). Это даёт unified message schema для Phase 3 multi-language.

**Phase 0 migration steps**:
1. Install `@cucumber/cucumber` + `ts-node` config для TypeScript step defs
2. Convert existing `.feature` файлы в `tests/features/` (if needed) или хранить их в `.specs/{slug}/*.feature`
3. Move step definitions из vitest test files в `tests/step_definitions/*.ts`
4. Configure `cucumber.json`: format: `message:reports/cucumber-messages.ndjson` для NDJSON output
5. Keep vitest для unit tests (не-BDD)
6. CI update: запускать обе test suites (cucumber-js для BDD, vitest для unit)

### Hybrid Marksman + custom MD parser approach

Custom MD parser в нашем MCP индексирует **dev-pomogator-specific anchors**:
- `### Requirement: FR-N` → anchor `FR-N`
- `### NFR-{Category}-N` → anchor `NFR-Category-N`
- `### AC-N` → anchor `AC-N`
- `#### Scenario: SCEN-x` → anchor `SCEN-x`
- `### Use Case UC-N` → anchor `UC-N`
- Frontmatter `id:` field → primary anchor

Marksman (если установлен) — обрабатывает остальное (generic wiki-links, MD headings, broken-link diagnostics в IDE). Два индекса merge в MCP layer.

## Appendix K: Orphan resolution policy

Два класса orphans + предлагаемый resolution flow:

### Class 1: `SCENARIO_TAG_ORPHAN`

Scenario имеет `@FR-N`/`@NFR-N`/`@AC-N` тэг, но соответствующий node не существует в MD.

### Class 2: `UNTAGGED_SCENARIO`

Scenario без любых `@FR-`/`@NFR-`/`@AC-` тэгов. Не понятно к чему относится.

### Resolution options (configurable в `.dev-pomogator/.spec-config.json`)

| Option | Behavior |
|--------|----------|
| `auto_stub` | Auto-create FR/NFR/AC stub в соответствующем MD с frontmatter `_draft: true` — agent потом дописывает |
| `prompt_user` | MCP tool `/resolve-orphan` — interactive flow с агентом, юзер выбирает action |
| `exempt` | Добавить в `orphan_exemptions: ["SCEN-name", ...]` — silenced |
| `warn` (default) | Warning в conformance_check output + suggestion, не block |

Pattern из spec-driven dev: orphan ≠ error по умолчанию (red phase friendly), но всегда видим в `conformance_check`.

## Appendix L: Storage decision — in-memory only (revised)

### Корректировка прошлой версии

Ранее предлагалось SQLite FTS5 как persistence layer. **Отвергнуто** после обсуждения. Решение: **in-memory only для Phase 2**.

### Source of truth vs cache

| Layer | Где | Lifecycle |
|-------|-----|-----------|
| **Source of truth (specs)** | `.specs/**/*.md`, `*.feature` файлы | Git-committed, неубиваемы |
| **Derived index (SpecGraph)** | In-memory у MCP server process | Rebuilds at startup (1-2s), не persistent |
| **Test results (NDJSON)** | `reports/cucumber-messages.ndjson` | Last test run output, juzер sам решает commit ли |

SQLite (если был бы) — это **derived index**, не source of truth. Loss = rebuild за 1-2s. Файлы spec в git — никогда не теряются.

### Аргументы за in-memory

| Critère | In-memory | SQLite |
|---------|-----------|--------|
| Cold start | 1-2s rebuild | 1-2s rebuild **первый раз** |
| Native deps | 0 (pure JS) | `better-sqlite3` (compile per platform) — devcontainer pain |
| Devcontainer bind-mount lock issues | Нет | Реальный риск (Docker Desktop) |
| Code complexity | ~500 строк | ~1000 + migrations |
| Test fixtures | Чистые JS objects | Нужны DB cleanup hooks |
| Cross-session sharing | ❌ нет | ✅ есть |

Cross-session sharing — единственный реальный плюс SQLite. Но:
- Multi-session Claude Code — roadmap Phase 3+
- Devcontainer scenarios (где SQLite lock issues самые болезненные) — тоже Phase 3+
- Phase 2 = single Claude Code session = single MCP process → in-memory достаточно

**SQLite — roadmap Phase 4 если в реальности cross-session понадобится**.

## Appendix M: Auto-push diagnostics — always-on (revised)

После обсуждения: keep `PostToolUse always-push` для soft conformance findings.

### Trade-off acceptance

Минусы (acknowledged):
- Red phase noise (агент пишет failing test намеренно → push кричит)
- Параллельная работа над несколькими FRs → push отвлекает
- Draft state → preliminary findings лишние

Плюсы (overruling):
- Агент **забывает** позвать `conformance_check` сам
- Без push — feature не работает: 80% случаев "тест не соответствует FR" пройдут незамеченными
- Trade noise > silent breakage

### Implementation (Phase 2)

- Hook trigger: PostToolUse on `Write|Edit` matching `.specs/**/*.md` or `**/*.feature`
- Action: incremental rebuild (только affected file) → `conformance_check(scope: affected_node_ids)`
- Output: findings injected в context как `<system-reminder>` message
- Severity filter: ALL findings push'атся (info + warning + error). Юзер может отфильтровать через config flag.

### Side-channel log (Phase 4)

`.dev-pomogator/.spec-check-log/<timestamp>.jsonl` — append-only лог всех findings. Юзер может grep'ить / strain analytics / ML по логам. Не в context автоматически.

## Appendix N: Test fixtures (self-test)

Phase 0/1 deliverable — fixture для unit-tests v4 parser/graph builder.

### Fixture content

Копируем существующие dev-pomogator артефакты в `tests/fixtures/v4-self-test/`:

```
tests/fixtures/v4-self-test/
├── .specs/
│   ├── personal-pomogator/         # копия из .specs/personal-pomogator/
│   ├── codex-cli-support/          # копия — пример multi-FR spec
│   └── spec-generator-v3/          # копия v3 spec
├── features/
│   └── personal-pomogator.feature  # копия из .specs/.../feature файла
└── reports/
    └── cucumber-messages.ndjson    # pre-recorded NDJSON sample for parser tests
```

### Why fixture

- Real-world spec format examples (not synthetic)
- Diverse edge cases (multi-FR, multi-AC, tagged scenarios)
- Reproducible parser tests без зависимости от live `.specs/`
- Regression detection: после parser changes — diff against fixture expected output

### Bonus

v4 на этой fixture работает = backward compat с v1/v2/v3 specs подтверждён.

## Appendix O: Additional risks (revised)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Phase 0 cucumber-js migration ломает existing vitest tests dev-pomogator | High | Medium | Keep both: cucumber-js for BDD .feature, vitest for unit tests. CI runs обе. Migration постепенная, file-by-file. Test fixture для regression detection |
| Marksman F# binary постоянно не доступен в devcontainer / постоянно ставится | Medium | Low | Custom JS MD LSP в нашем MCP — fallback, всегда работает. Marksman opt-in для IDE-rich features |
| `PostToolUse` always-push создаёт unbearable noise при bulk edits / red phase | Medium | High | Severity filter в config (warning/error only); throttling (max 1 push per N seconds); explicit silence flag `_no_push_check: true` в frontmatter spec (юзер может временно заглушить) |
| In-memory rebuild при каждом MCP server restart — 1-2s latency на 30 specs, scales linearly | Medium | Low | Acceptable для Phase 2. Если >10s rebuild (>200 specs) — re-evaluate SQLite. Benchmark + alerting в Phase 4 |
| `chokidar` polling fallback пропускает события на high-velocity edits | Medium | Medium | `awaitWriteFinish: true` + 1s polling interval + manual `/reindex` MCP command как escape hatch |
| `cucumber-js` NDJSON формат отличается от Reqnroll NDJSON в деталях (breaking changes между minor versions) | Low | High | Pin `@cucumber/messages` version. CI test против multiple cucumber-js versions. Graceful degrade при parse failures |
| Marksman не понимает наши custom heading anchors (`### Requirement: FR-N`) — wiki-link `[[FR-N]]` не резолвится в Marksman | High | Medium | Custom MD parser в нашем MCP — primary index с поддержкой custom anchors. Marksman — secondary index для wiki-link navigation в чистом MD. Two indexes merged в MCP layer |
| Orphan SCENARIO_TAG_ORPHAN flood при initial v4 rollout — много existing scenarios без правильных тэгов | High | Medium | Default behavior `warn` (не error/block); `exempt` list для legacy scenarios; bulk migration command `dev-pomogator add-tags-from-naming` (эвристика по naming convention) |

## Appendix P: Final locked-in decisions (post-discussion)

После обсуждения зафиксированы следующие решения (override любые предыдущие черновики):

### Marksman distribution

**Bundle install always, silent default**. +15MB к dev-pomogator size — acceptable trade-off для гарантированной IDE navigation. Binary копируется в `.dev-pomogator/bin/marksman` per platform во время `npm install`/`npx dev-pomogator`. Auto-install с GitHub releases при первом старте если не скопировано.

### Phase 0 migration scope

**dev-pomogator самой — обязательно** в Phase 0.
**Target projects на TypeScript — обязательная миграция** (не recommendation) на cucumber-js BDD тесты, **рядом с существующими vitest unit-тестами** (не replace, additive). Это закрепляется в `onboard-repo` flow: при детекте TS проекта + установке dev-pomogator v4 → `cucumber-js` is required.

### NDJSON output path strategy — Option A (one master + post-split)

Master NDJSON: `.dev-pomogator/.last-test-run.ndjson` (single cucumber-js run).
Post-split (наш MCP / Bash hook после test run): каждый pickle/testCase разносится по `.specs/{slug}/.test-results.ndjson` based on `.feature` file location.

- Один cucumber-js run = full test suite (быстро)
- Per-spec NDJSON для inspection и MCP queries
- Гибкость для юзера: commit per-spec NDJSON или в .gitignore

### Anchor convention — Option B + dual-anchor registration

Heading формат: `### FR-001: Login` (short, ID + title через `:`).

Наш custom MD parser регистрирует **два anchor'а** на одну heading:
1. **Полный slug** (Marksman-native): `[[fr-001-login]]` — descriptive, читая wiki-link видно про что
2. **Just ID** (alias через наш parser): `[[FR-001]]` — compact, для densely-linked текстов

Оба резолвятся в одно место. Юзер выбирает форму по контексту.

**Backward compat**: legacy heading `### Requirement: FR-001 Login` (v3 convention) ALSO работает через наш parser (triple-anchor registration: `[[requirement-fr-001-login]]`, `[[fr-001-login]]`, `[[FR-001]]`).

### `.dev-pomogator/.spec-config.json` — обязательные поля

```json
{
  "version": 1,
  "anchor_patterns": { /* regex per node type */ },
  "orphan_policy": { /* per orphan class: warn|block|exempt */ },
  "bdd_runner": { /* tool, ndjson paths */ },
  "post_tool_use": { "enabled": true, "throttle_ms": 3000, "severity_filter": [...] },
  "conformance_checks": { "enabled": [...], "disabled": [...] },
  "mcp": { "scope": "per-worktree", "lock_file": "..." },
  "marksman": { "enabled": true, "binary_path": "...", "auto_install": true },
  "frontmatter": { "spec_required_fields": [...], "spec_optional_fields": [...] },
  "watcher": { "polling_auto_detect": true, "polling_interval_ms": 1000 }
}
```

Все поля optional с defaults в коде. Полная JSON Schema идёт в `spec-generator-v4_SCHEMA.md`.

### PostToolUse throttling — 3 секунды

`max 1 push per 3 seconds`, в окне 3с — findings batch'ятся, в конце окна — aggregated dedupe push. Балансирует human/agent thinking pause vs spam. Конфигурируемо через `post_tool_use.throttle_ms`.

### Phase 5 — Migration helper (new phase)

Добавлен после Phase 4. Scope:

- Команда `dev-pomogator migrate-v3-to-v4`
- Scan `.specs/**/*.md` на legacy patterns (`### Requirement: FR-N ...`)
- Convert headings в short form (`### FR-N: ...`)
- Detect missing `.spec-config.json` → создать с defaults
- Predict tags для untagged `.feature` scenarios через naming heuristic
- Interactive diff per file — юзер approve/skip/edit
- **Suggestion mode** (hint where migration needed, без applying) — для timid юзеров

Не silent auto-migrate — explicit consent.

### Updated phased rollout (7 phases — Phase 6 added per Appendix Q)

| Phase | Scope | Storage |
|-------|-------|---------|
| **Phase 0** | cucumber-js migration (dev-pomogator + target TS projects mandatory) | N/A |
| **Phase 1** | Graph builder + parsers (MD/Gherkin/NDJSON) + dual-anchor | In-memory |
| **Phase 2** | MCP server (11 tools) + PreToolUse HARD + PostToolUse always-push (3s throttle) + Marksman bundle | In-memory |
| **Phase 3** | LLM layer + subagent via `claude` CLI + multi-language (C#/Python/Java) | In-memory |
| **Phase 4** | SQLite FTS5 + side-channel logs + Codespaces / multi-session | SQLite opt-in |
| **Phase 5** | Migration helper v3 → v4 (interactive + suggestion mode) | — |
| **Phase 6** | New `architecture-research-workflow` skill + enrichment of existing `research-workflow` + create-spec integration. См. Appendix Q | — |

## Appendix Q: Phase 6 — `architecture-research-workflow` skill (post-session meta-deliverable)

### Q.0: Why this phase exists (WHY history для future reference)

**Контекст**: сессия по дизайну v4 spec-generator заняла 30+ turns с двумя fundamental user push-back'ами ("research хуйня"). Несмотря на наличие skill `research-workflow`, он покрывал только **один research burst** — не итеративную архитектурную exploration. User'у пришлось вручную:

- Дважды pushback'ать чтобы я углубился
- Перезапускать research с новым фокусом
- Корректировать FR-centric framing tools'ов на tag/node-centric
- Объяснять конфузы (SQLite vs source of truth)
- Запрашивать variants A/B/C/D, edge case enumeration, phased rollout

**Если бы skill encapsulate'ил эти паттерны** — сессия заняла бы 5-8 turns вместо 30+.

**Decision**: новый skill **`architecture-research-workflow`** (analogous naming к `research-workflow`) + enrichment существующего `research-workflow` + auto-integration в `create-spec`. Path = **Option B+C hybrid** из прошлого анализа.

### Q.1: Three-part deliverable

| Component | Scope | File location |
|-----------|-------|---------------|
| **(1) New skill `architecture-research-workflow`** | 7-stage architectural exploration: pain framing → external validation → broad research → focused research + pushback → variant generation → decision locking → phased rollout → hand-off to create-spec | `.claude/skills/architecture-research-workflow/SKILL.md` + templates + scripts |
| **(2) Enrich `research-workflow`** | Add patterns useful for ANY research: misconception flush check, external pain mention, schema exhaustiveness depth | `.claude/skills/research-workflow/SKILL.md` — modify in place |
| **(3) Modify `create-spec`** | Auto-invoke `architecture-research-workflow` (вместо `research-workflow`) когда complexity ≥ medium, иначе current flow остаётся | `.claude/skills/create-spec/SKILL.md` — modify Phase 1 step 5 |

### Q.2: Architecture-research-workflow — 7-stage design

```
Stage 0: Problem framing (structured 3-Q intake)
  Inputs: user feature description
  Outputs: .specs/{slug}/.architecture-research/0-problem-statement.md
  Schema: { symptom, suspected_cause, desired_outcome }

Stage 1: External pain validation
  Inputs: problem statement
  Actions: GitHub issues / blogs / papers search для evidence pain reality
           + competitive landscape (кто уже пытался решить)
  Outputs: .specs/{slug}/.architecture-research/1-pain-evidence.md
  STOP condition: если pain не подтверждён externally → flag user, может фича преждевременна

Stage 2: Broad research burst (calls research-workflow as primitive)
  Inputs: validated problem + landscape
  Actions: Skill("research-workflow") с 10-15 hypotheses, multi-angle
           CAN run parallel research-workflow для разных angles
  Outputs: .specs/{slug}/.architecture-research/2-research-broad.md

Stage 3: Self-pushback + focused research (iterative, 1-3 cycles)
  Inputs: broad research output
  Actions: MANDATORY self-pushback: "what's shallow? what angle missed?"
           User confirmation: "это правильный фокус?" (AskUserQuestion)
           Re-invoke research-workflow with refined focus
           Misconception flush: "что я assume что может быть ложно?"
  Outputs: .specs/{slug}/.architecture-research/3-research-focused.md (replaces 2 if needed)

Stage 4: Architecture variant generation
  Inputs: focused research
  Actions: Generate ≥3 variants (preferably 4)
           Per variant: reuse vs custom matrix, effort, risk, payoff
           Edge case enumeration per critical component
  Outputs: .specs/{slug}/.architecture-research/4-variants.md

Stage 5: Iterative decision locking (Q&A loop)
  Inputs: variants
  Actions: Generate decision list (5-10 open questions)
           AskUserQuestion one-by-one (or batch 3-4)
           Track: initial proposal → user input → revised → locked
           Re-iterate if user reveals new constraint
           If new constraint affects variants → suggest explicit restart-from-stage 4
  Outputs: .specs/{slug}/.architecture-research/5-decisions-locked.md

Stage 6: Phased rollout planning
  Inputs: locked decisions
  Actions: Break work into 3-7 phases
           Per phase: scope / dependencies / deliverables / storage decisions / risks
           Phase 0 if migrations needed
  Outputs: .specs/{slug}/.architecture-research/6-phases.md

Stage 7: Hand-off to create-spec
  Inputs: all 7 stage outputs
  Actions: Merge into final RESEARCH.md (one Appendix per stage)
           Invoke Skill("create-spec") with prefilled context
           create-spec skips own Phase 1 step 5 (research) — already done
  Outputs: .specs/{slug}/RESEARCH.md (consolidated, committed)
           Continues into create-spec Phase 2 (Requirements + Design)
```

### Q.3: Persistence — committable, NOT temp (decided)

`.specs/{slug}/.architecture-research/` — **committable** в git (не в `.gitignore`). Reason:
- Audit trail для team — почему такие решения приняты
- Можно вернуться через неделю/месяц и понять историю
- New team member может прочитать как формировалась архитектура

**Cleanup option**: после Stage 7 merge — можно опциональный `dev-pomogator cleanup-arch-research <slug>` который удаляет temp folder если RESEARCH.md консолидирован. По умолчанию **не удаляется**.

### Q.4: Stage ordering — forward-only с explicit rewind

Stages 0→7 идут forward-only. Назад можно только через explicit команду `restart-from-stage <N>` который:
- Удаляет outputs стейджей >N
- Записывает в decisions log: `[REWIND] Stage 5 → Stage 4: <reason>`
- Стартует с Stage N заново

**Reason для строгости**: без этого drift между Stage 4↔5↔6 бесконечный. Explicit rewind заставляет осознать что мы restart, не accidental loop.

### Q.5: Parallel research bursts (Stage 2 — confirmed yes)

Stage 2 (broad research) может spawn'ить ≥2 параллельных `research-workflow` invocations для разных angles. Например:
- Angle A: «существующие OSS-инструменты»
- Angle B: «academic papers / research»
- Angle C: «industry adoption patterns»

Это leverages subagent capability (когда Phase 3 v4 готов — можно через `claude` CLI subprocess спавнить parallel). Сейчас manual orchestration через `Task` tool.

### Q.6: Anti-patterns from session — encoded in skill

8 antipatterns добавляются в `architecture-research-workflow/references/anti-patterns.md`:

| # | Anti-pattern | Что случилось в нашей сессии | Mitigation rule |
|---|--------------|------------------------------|-----------------|
| AP-arch-1 | First-answer commitment | Принял "MCP wraps LSP" без вариантов | R3: Stage 4 MUST generate ≥3 variants |
| AP-arch-2 | Reactive depth | Углублялся только когда user push'ил | R1: Stage 3 mandatory self-pushback ≥1 cycle |
| AP-arch-3 | Hidden category framing | FR-centric tools без NFR/AC | R8: Stage 4 mandatory edge case table per component |
| AP-arch-4 | Source-of-truth confusion | SQLite vs git misconception | R5: Stage 3 misconception flush prompt |
| AP-arch-5 | Monolithic delivery | 1080-line dump без structure | R9: Stage 6 mandatory phased rollout |
| AP-arch-6 | Skip pain validation | Сразу tools research | R2: Stage 1 mandatory before Stage 2 |
| AP-arch-7 | Lost decision history | Initial vs final смешаны | R6: Decisions tracked with revision marker |
| AP-arch-8 | Reactive variant generation | Variant только после прямого запроса user | Encoded in R3 (mandatory ≥3) |

### Q.7: Shared base patterns (между `research-workflow` и `architecture-research-workflow`)

Создаём `.claude/skills/_shared/research-base.md` — common reference. Оба skill'а referencing.

| Pattern | Owner |
|---------|-------|
| Hypothesis-FIRST formulation | Shared base (existing in research-workflow) |
| Triangulation (3 independent angles) | Shared base |
| Verification markers ([VERIFIED]/[UNVERIFIED]/...) | Shared base |
| Source taxonomy | Shared base |
| Schema exhaustiveness rule | Shared base |
| Required reading list (when applicable) | Shared base |
| Anti-patterns AP-1..AP-8 (research-specific) | research-workflow only |
| Anti-patterns AP-arch-1..AP-arch-8 (arch-specific) | architecture-research-workflow only |
| **NEW: External pain validation** | Shared base (можно use в любом research) |
| **NEW: Misconception flush prompt** | Shared base |
| Variant generation (≥3) | architecture-research-workflow only |
| Decision tracking | architecture-research-workflow only |
| Phased rollout | architecture-research-workflow only |
| Stage gating + rewind | architecture-research-workflow only |

### Q.8: create-spec integration (auto-use)

Modify `.claude/skills/create-spec/SKILL.md` Phase 1 step 5:

**Current**: `Invoke Skill("research-workflow") для технических находок`

**New**:
```
Heuristic complexity detection:
  - Если feature description содержит "архитектур", "v2/v3/v4", "большая",
    "пере проектирование", "rebuild", "rework", or contains ≥3 components
    → Invoke Skill("architecture-research-workflow")
  - Else → Invoke Skill("research-workflow") как раньше

User can override через explicit flag в create-spec arguments.
```

architecture-research-workflow Stage 7 (hand-off) уже вызывает create-spec — это обратная связь, нужно избежать infinite loop:
- create-spec invoke arch-research только если **флаг отсутствует** `--research-done` в context
- arch-research при hand-off ставит флаг → create-spec не invoke снова

### Q.9: Triggers (RU + EN)

```
EN: "architecture research", "design exploration", "deep dive",
    "architecture spike", "v2/v3/v4 design", "system design research"

RU: "архитектурный ресерч", "большой ресерч под фичу", "продумай архитектуру",
    "разработка концепции фичи", "ресерч-цикл фичи", "глубокий ресерч архитектуры"
```

### Q.10: Work plan для Phase 6

| Sub-phase | Effort | Deliverable |
|-----------|--------|-------------|
| 6.A: Scaffold new skill | 1 day | `.claude/skills/architecture-research-workflow/{SKILL.md, templates/, references/, scripts/}` |
| 6.B: Shared base extraction | 0.5 day | `.claude/skills/_shared/research-base.md` + both skills reference it |
| 6.C: Stage helpers (scripts) | 2 days | `init-research-folder.ts`, `merge-to-research-md.ts`, `decision-tracker.ts`, `restart-from-stage.ts` |
| 6.D: Enrich existing research-workflow | 0.5 day | Add external-pain + misconception-flush sections |
| 6.E: Modify create-spec для auto-invoke | 1 day | Heuristic + flag handling + recursion guard |
| 6.F: Integration test (dogfood) | 2 days | Retroactive run на synthetic v4 scenario, compare output to actual session |
| 6.G: Docs + CLAUDE.md update | 0.5 day | Skill description in CLAUDE.md, README в skill folder |
| 6.H: Extract optional sub-skills (bonus) | 1-2 days (defer) | `iterative-refinement`, `edge-case-catalog`, `pain-validator` — ONLY if pattern reused 2+ times |

**Total**: 7-10 days for full Phase 6 (excluding 6.H).

### Q.11: Risks для Phase 6 (added to Risk Assessment)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `architecture-research-workflow` overhead для маленьких фич — юзер не хочет 7 stages для bugfix | High | Medium | create-spec heuristic detects complexity; small features → existing research-workflow path; explicit user override flag |
| Stage rewind logic loops infinitely при agent indecision | Medium | High | Hard limit 3 rewinds per spec; after 3rd — DENY with user prompt «too many rewinds, manual intervention required» |
| `.architecture-research/` folder pollutes spec history | Low | Low | Optional `cleanup` command после Stage 7; default keep для audit trail |
| Skill creep — добавляем ещё stages в ответ на feedback | Medium | Medium | Lock skill scope в SKILL.md frontmatter; new patterns extract в **separate** sub-skills (AP-arch-extension pattern), не bloat |
| create-spec recursion: arch-research calls create-spec calls arch-research | Low | High | Flag `--research-done` set в Stage 7 hand-off; create-spec checks flag — если есть, skip own research invocation |

### Q.12: Open questions для future Maxim (когда вернётся через неделю)

Если читаешь это через неделю и забыл контекст:

1. **Почему 7 stages а не 5 или 10?** — Из паттернов нашей сессии: pain validation (1), broad (1), focused+pushback (1, iterative), variants (1), decisions (1, iterative), phases (1), hand-off (1) = 7 distinct phases. Меньше — теряем что-то; больше — bureaucracy.
2. **Почему forward-only с explicit rewind а не free navigation?** — Без forward-only — accidental loops между Stages 4↔5↔6. Explicit rewind с audit trail = осознанный restart.
3. **Почему commit `.architecture-research/` а не `.gitignore`?** — Audit trail для team, понимание истории решений через недели/месяцы.
4. **Почему `architecture-research-workflow` а не extension существующего research-workflow?** — Разные ментальные модели: research = «find facts», arch = «design system». Mixing их в одном skill bloats до 800+ строк.
5. **Почему параллельные research bursts в Stage 2 не обязательны?** — Performance optimization, не correctness. Без них работает sequentially тоже.

---

## Appendix R — Phase 7 Cross-spec reconciliation: motivation & prior art (2026-05-20)

### Related sprint work / cross-impact analysis pattern

Origin: 2026-05-20 case study from a real agent session (post-render-eval ↔ closed-loop-hardening ↔ `pipeline/agent.ts`). Two parallel agents authored overlapping specs without awareness of each other's work; review surfaced 3 critical conflicts + 8 medium gaps:

- **Duplicate memory layer** — `agents/post-render-eval/baselines.json` proposed in one spec, while existing eval-agent already maintained a rolling baseline storing the same metric `mp4_content_grounded`. Two baseline storages for a single metric → self-improve reading one, post-render-eval reading another.
- **Feedback key mismatch** — code (`pipeline/agent.ts:181`) pushes feedback as `mp4_content_grounded` (snake_case); new spec proposed `content-grounding` (kebab-case). Renaming silently breaks self-improve's scope filter (line 263-266) — `mp4_content_grounded` filter no longer finds anything. This is the **`cross-spec/runtime-identifier-drift`** finding code class.
- **Architectural decision contradicts code** — user-confirmed «separate agent on port 8005 with own memory» while actual `pipeline/agent.ts` shows inline TS service without HTTP boundary. The **`impl-drift/architectural-decision-vs-reality`** finding code class — largest gap in prior art per arXiv 2602.07609 «Evaluating LLMs for Detecting Architectural Decision Violations».

Additional medium-severity classes derived from the same case:

- Stale spec claims «outstanding gap» where code already implemented it (`cross-spec/stale-spec-outstanding-but-done` — `closed-loop-hardening` Gap 2 «lazy checkpointer» marked outstanding while `pipeline/agent.ts:43-62` shows `_checkpointer = getCheckpointer()` lazy pattern in place).
- Render metadata not exposed in state (`impl-drift/output-not-exposed` — spec uses `run.outputs.durationMs` but `services.render.run()` only returns `{mp4Path}`).
- Data shape incompatible with external API (`impl-drift/data-shape-incompatible` — spec proposes `frame-severity-distribution = {ok, warn, critical}` object; LangSmith `score: float | null` cannot accept object).
- Multi-metric interrupt cascade UX (`cross-spec/cascading-interaction` — extending self-improve to watch 5 metrics produces 5 sequential `interrupt()` calls in one run).
- Cold-start warmup indicator missing (`impl-drift/cold-start-ux-gap` — new evaluators emit scores but never flag regression for first N runs while baseline builds; user sees «works fine» while reality is degraded).
- Skill trigger collision in CLAUDE.md auto-routing (`cross-spec/skill-trigger-collision` — `/eval` and `/post-render-eval` both fire on «оцени рилс»).

### Output format inspiration (executive summary + numbered findings + recommendations table)

The case study produced a report in this shape:

```
🔴 N critical conflicts | 🟡 N medium gaps | 🟢 N OK

🔴 Conflict #1 — Memory layer duplicates
   Reality of code (pipeline/agent.ts:181-185): <quoted lines>
   Spec proposes: <quoted text>
   Problem: <explanation>
   Fix option A (minimal): <text>
   Fix option B (alternative): <text>

🟡 Gap #N — <title>
   <body>

Recommendations
   #  | Action                                      | Impact
   ---|---------------------------------------------|-----------
   1  | Change architectural decision: …            | Closes Conflict #3, saves ~12 files
   2  | Preserve feedback key mp4_content_grounded  | Closes Gap #5
   …

Final question for human: Path A vs Path B?
```

This shape directly informs:

- YAML `findings[]` per-finding structure (code + severity + class + spec_a + spec_b + location + message + suggested_fix + snippets + confidence).
- YAML `recommendations[]` priority+action+impact table (`summary.top_3_recommendations` for dashboard).
- AskUserQuestion Path A/B/C options for `impl-drift/architectural-decision-vs-reality` and `impl-drift/duplicate-infrastructure`.
- Summary dashboard at the top of YAML (`by_severity` + `by_class` + totals) modeled on the executive summary line.

### Why current tooling doesn't catch this

dev-pomogator existing infrastructure (FR-5 PreToolUse HARD hooks, FR-6 PostToolUse always-push, FR-8 LLM semantic drift FR↔Scenario, audit categories phase3plus_audit-*) all operate **within a single spec**. None cross-checks two specs or compares spec claims against code shape. The closest existing rule is `.claude/rules/gotchas/verify-divergent-contracts.md` — but it describes the divergence pattern (test ↔ eval ↔ spec) without an automated detector. Phase 7 builds the automated detector.

### Prior art survey (top 5 + adopted/avoided patterns)

| # | Project | Stars | Mode | LLM | Closest to our design? | Gap |
|---|---------|-------|------|-----|----------------------|-----|
| 1 | [github/spec-kit](https://github.com/github/spec-kit) `/speckit.analyze` | ~90k | Markdown report, 6 categories (Duplication / Ambiguity / Underspecification / Constitution Alignment / Coverage Gaps / Terminology) | Hybrid | Closest analogue — same 4-doc corpus (spec/plan/tasks/constitution) | No LLM-driven FR pairwise compare across N specs; no YAML/SARIF; no fix loop |
| 2 | [theDakshJaitly/mex](https://github.com/theDakshJaitly/mex) | ~727 | Claude Code drift CLI, JSON report, `sync --dry-run` flag | Yes | Same target audience (Claude Code), separate detect/sync commands, dry-run pattern adopted | Single-shot AI fix without alternatives; no Path A/B/C; closed scaffold (`.mex/` only) |
| 3 | [itsallcode/openfasttrace](https://github.com/itsallcode/openfasttrace) | ~250 | Requirements traceability, 4-class taxonomy (covered/uncovered/orphaned/outdated) | No | 4-class summary grouping adopted as `summary.by_class` | Requires `// [impl->REQ-N]` annotations in code; we parse prose claims directly |
| 4 | [stoplightio/spectral](https://github.com/stoplightio/spectral) | ~3.7k | OpenAPI/AsyncAPI linter, SARIF/JSON output, namespace/rule-name | No | Rule-id convention `namespace/kebab-case-rule` adopted for all 28 finding codes | API-spec only, no cross-doc or impl-drift checks |
| 5 | [oasdiff/oasdiff](https://github.com/oasdiff/oasdiff) | ~1.5k | Pairwise N-way semantic diff of OpenAPI specs, 450-category taxonomy, multi-format export | No | Closest prior art for pairwise N-way diff + structured category taxonomy | API-spec only; no code drift |

Also surveyed (less relevant): vale (single-file prose linter), textlint (single-file), markdownlint (formatting), alex (inclusivity), contextlint (~35 stars, structural cross-ref but no semantic), adr-tools / Log4brains / madr (ADR rendering, no contradiction detection), Doorstop / StrictDoc / Sphinx-Needs (traceability but require structured items), PicklesDoc / SpecFlow+ LivingDoc / Reqnroll LivingDoc (code→doc rendering, not doc→code verification), Optic (dead, runtime traffic), Schemathesis / Dredd (runtime fuzzing against OpenAPI), shinpr/claude-code-workflows (multi-agent code-verifier / design-sync — prose output, no shared schema between agents), Pimzino/claude-code-spec-workflow (workflow scaffold, no audit), OpenSpec / Fission-AI (SDD scaffold), MCP Inspector (test UI, not drift detector).

**Adopted patterns** (folded into the design):

- **SARIF 2.1.0 secondary output** (Spectral precedent) — opt-in via `--sarif` flag; 1:1 rule-id mapping to finding codes. Free GitHub Code Scanning + VS Code IDE integration.
- **Spectral `namespace/kebab-case-rule` finding codes** — `cross-spec/fr-overlap`, `impl-drift/missing-file` etc. Enables `.spec-config.json` `disabled_rules[]` selective opt-out per Spectral pattern.
- **OpenFastTrace 4-class summary** (covered/uncovered/orphaned/outdated) as `summary.by_class` dashboard layer above the 28 codes.
- **mex `--dry-run` mode** — print summary + first 10 findings to stdout, skip YAML/SARIF writes.
- **spec-kit Coverage Summary Table** — top-level `summary` block with `by_severity` + `by_class` + `by_namespace` + `totals`.
- **dev-pomogator existing JSONL append-only audit log** (`.claude/rules/scope-gate/escape-hatch-audit.md` pattern) — used for CRITICAL acknowledge-and-override audit at `.claude/logs/cross-spec-overrides.jsonl`.
- **shinpr two-agent separation** — `cross-spec-reconcile` (detect) and `cross-spec-resolve` (fix) as separate skills. Schema-driven YAML contract between them is the **incremental novelty** vs shinpr (which emits prose).

**Avoided patterns** (anti-patterns observed in prior art):

- **ESLint `--fix` semantic-breaking auto-apply** — `no-implicit-coercion` converting `+value` → `Number(value)` changes semantics on `+'123abc'`. We always explain-then-confirm; never bare-fix.
- **Dependabot per-PR fatigue** — batch findings per spec slug in a single YAML; one AskUserQuestion sequence per batch, not per finding.
- **mex single-shot AI fix without alternatives** — agent picks one fix path silently. Our Path A/B/C exposure of architectural forks is the explicit improvement.
- **OpenFastTrace `// [impl->REQ-N]` code-annotation requirement** — adds maintenance burden in source code. We parse prose claims directly without annotations.
- **Spectral rule sprawl** — community-observed unmaintainable past ~50 rules. We cap at 28 curated codes for v0.1.0 with namespace-disable opt-out.
- **HTML-static-site-only output** (Log4brains, Sphinx-Needs) — non-CI-friendly. YAML + SARIF first; HTML render is downstream.
- **Codegen-as-drift-detection** (openapi-typescript pattern) — only works when spec is machine-readable. FR.md prose is not — we extract claims via remark + regex.

### Honest novel value

| # | Capability | Prior art status |
|---|-----------|------------------|
| 1 | LLM-driven N-way semantic FR pairwise compare across corpus | Novel — spec-kit single-feature; oasdiff 2-spec only; nobody N-way |
| 2 | Unified spec-vs-spec + spec-vs-code drift in one report | Novel — existing tools specialize in one axis |
| 3 | Prose-claim extraction without code annotations | Novel — mex/OFT require structured scaffold |
| 4 | Architectural fork A/B/C resolution UX | Novel (largest gap per arXiv 2602.07609) — no surveyed tool surfaces forks; they dump findings or auto-pick |
| 5 | Schema-driven YAML contract between two skills | Incremental novelty — shinpr has multi-agent but prose, mex has JSON but single agent; combining schema + skill split is new |

**Not novel** (don't oversell): per-finding severity (Spectral / OFT), JSON/YAML output (oasdiff), dry-run mode (mex), agent-based fix (mex). Our value is the synthesis.

## Appendix Z — v3 Research & Risks (consolidated 2026-05-28)

This appendix preserves the research and risk-assessment content from `.specs/spec-generator-v3/RESEARCH.md` so that the v3 spec folder can be deleted without losing institutional knowledge. The decisions and risks below shipped in spec-generator-v3 (PR #14) and are inherited by v4 as soft-tier behavior (FR-19), version gate (FR-22), meta-guard extension (FR-24), and additive merge invariant (FR-25).

### Z.1 v3 sources and upstream context

- github.com/github/spec-kit v0.7.0 (upstream templates `spec.md` / `plan.md` / `tasks.md`).
- Wiki custom preset on top of upstream: Done When, Task Summary Table, CHK matrix, Risk Assessment, Key Decisions blocks.
- dev-pomogator existing hooks at v3 design time: `phase-gate.ts`, `reqnroll-ce-guard`, `pre-edit-skill-guard` (pattern references for the new form-guards).
- Anthropic skill-creator: anti-pushy description pattern, proven by `rules-optimizer` and `deep-insights` skills.

### Z.2 v3 technical findings (kept as background for v4)

- **Upstream vs custom preset.** Upstream v0.7.0 has `User Story N (Priority: Pn)` + Why + Independent Test + Acceptance Scenarios inline; `Success Criteria SC-N`; `Complexity Tracking` (not «Risk Assessment»). The wiki preset added Done When per task, Task Summary Table, CHK traceability matrix `CHK-FR{n}-{nn}`, `## Risk Assessment` table with Likelihood/Impact/Mitigation, Key Decisions with Rationale/Trade-off/Alternatives considered.
- **Hidden-skills pattern (no native API).** Claude Code's SKILL.md frontmatter has no `internal: true` / `private: true` / `visibility: parent-only` field. The proven workaround is the anti-pushy description (DESIGN paragraph (o) of this spec).
- **Hallucination-proof hook architecture.** Pattern from `phase-gate.ts`: stdin JSON parse → matcher filter → validation → exit 0 / exit 2 with `hookSpecificOutput.permissionDecision: 'deny'` JSON + `process.stderr.write` human-readable message. Fail-open: `main().catch(e => exit(0))` so a hook bug never blocks. Exit 2 = deny; exit 0 = allow. v4 inherits this as the soft-tier policy in FR-19.
- **Migration guard via `.progress.json::version`.** `readProgressState` + `getProgressVersion` + `isV3Spec` decided enforcement on a per-spec basis. `scaffold-spec.ts` stamps `version: 3` for new specs. Forward-compatible: `readProgressState` ignores unknown fields. v4 extends to `version >= 4` in FR-22.

### Z.3 v3 architectural constraints (preserved in v4)

- Hooks MUST fail-open at the soft tier (FR-19 keeps this verbatim).
- No env-var bypass (NFR-Security-1 preserves this for hard-tier too).
- Migration guard first — short-circuit on legacy `.progress.json::version` before any work (FR-22).
- Installer hook format: `hooks.PreToolUse` MUST be array-of-groups per `installer-hook-formats.md` (FR-25 additive merge depends on this shape).
- The 13-file spec scaffold is not changed; new fields land in existing files.

### Z.4 v3 risk assessment (inherited, v4 mitigations cross-linked)

| Risk (from v3) | Likelihood | Impact | Mitigation (v3) | Mitigation in v4 |
|----------------|------------|--------|-----------------|------------------|
| Parser regex false-positive on emoji/unicode in titles | High | High | Fail-open wrapper + audit log PARSER_CRASH for telemetry; unit-test parsers on 28+ existing specs before activation | FR-19 soft-tier fail-open verbatim; v4 SpecGraph parser (FR-2) replaces v3 regex over time |
| Child skills auto-trigger despite anti-pushy description | Medium | Medium | Verbatim description from `rules-optimizer`; SPECGEN003_24 negative test | Unchanged — same descriptions, same test |
| Serial chain of 7 PreToolUse hooks slows Write/Edit | Medium | Low | Short-circuit on filename in the first 3 lines of each hook; benchmark ≤180ms budget | NFR-Performance-4 inherits the 180ms budget for the soft-tier chain |
| Dogfood spec blocked by its own guards during creation | High | Medium | In `.dev-pomogator/` worktree the form-guards aren't installed; bootstrap commit order: code → dogfood → manifest activation | Same flow; v4 install over v3 (FR-25 additive merge) preserves this |
| `.progress.json::version` bump breaks existing installer readers | Low | High | `readProgressState` ignores unknown fields; additive schema change | Same approach for `version: 4` (FR-22) |
| Jira-mode traces lost when a skill rewrites a file | Medium | High | Skills read-first patch-second (Edit, never Write over the whole file); SPECGEN003_21 round-trip test | Unchanged — same skills, same test |
| Meta-guard false-DENY on a legitimate manifest add-new-extension | Medium | Medium | Additive-only policy: meta-guard denies ONLY removal of protected hooks; SPECGEN003_26 allow-test | v4 FR-24 extends scope to `plugin.json` MCP-tool registrations with the same additive-only policy |
| Agent bypasses meta-guard via `settings.local.json` | Medium | High | Meta-guard checks both source `extension.json` and installed `settings.local.json`; audit log + UserPromptSubmit summary | v4 FR-24 covers `plugin.json` too; FR-20 surfaces tamper attempts via the threshold summary |
| Audit log grows without bound | Low | Low | `rotateLog()` deletes >30 days + truncates >10MB; called from `validate-specs.ts` once per session | v3 log path preserved per FR-23 inventory; v4 spec-check-log JSONL has its own 10MB rotation (FR-15) |

### Z.5 What lives where after consolidation

Source code for v3 form-guards remains at `tools/specs-validator/*.ts` (production). The four design decisions are reproduced in DESIGN.md paragraph (o). The 28 BDD scenarios are preserved at `.specs/spec-generator-v4/legacy-v3.feature` and continue to be tested by `tests/e2e/spec-generator-v3.test.ts`. v3's performance budgets are preserved in NFR.md under «Legacy v3 budgets». The v3 production release entry is preserved in CHANGELOG.md as `[0.1.0-v3]`.


