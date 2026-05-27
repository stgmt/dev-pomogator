---
name: research-workflow
description: |
  Use this skill for technical research workflows: investigating libraries, frameworks, APIs, code patterns, or external documentation. Guides through 4-phase research cycle (Уточнение → Исследование → Верификация → Отчёт) with HYPOTHESIS-FIRST verification across MCP tools, GitHub code search, and Web Search. Triggers (Russian): "исследуй", "найди", "погугли", "ресерч". Triggers (English): "research", "investigate", "find", "google", "look up". The skill is also invoked by create-spec via Skill("research-workflow") during Phase 1 step 5 when filling RESEARCH.md technical findings. Each hypothesis MUST be verified across ≥3 INDEPENDENT sources (not just 3 search hits) with direct quotes and explicit [VERIFIED]/[UNVERIFIED]/[ASSUMED]/[SINGLE_SOURCE] markers in output. Schema/API/protocol questions REQUIRE exhaustive field enumeration, not "key fields". Do NOT use for refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.
allowed-tools: Read, Glob, Grep, Bash, WebFetch, WebSearch
---

# research-workflow — Hypothesis-first research с обязательной верификацией

4-фазный workflow с **hypothesis-FIRST** подходом и обязательной triangulation через ≥3 INDEPENDENT источника.

## Anti-patterns from past failures

Перед началом — изучи известные failure modes (избегай повторения):

| # | Failure mode | Что произошло | Что должно было произойти |
|---|--------------|---------------|---------------------------|
| AP-1 | **Schema undercoverage** | Взял `plugin.json` 4 поля (`name/version/description/author`), реально 15+ полей | Schema exhaustiveness rule: перечислить ВСЕ fields с required/optional разделением, прочитать `plugins-reference.md` целиком, не только `plugins.md` |
| AP-2 | **Distribution misassumption** | Предположил «postinstall + npm», реально — `claude plugin install <name>@<marketplace>` | Distribution всегда — first hypothesis для package research; явно искать `install` команду в docs, не angle inference из npm convention |
| AP-3 | **Discovery misassumption** | Предположил filesystem scan, реально — `enabledPlugins` declaration в settings.json | Discovery — second hypothesis для plugin/extension research; explicit вопрос «как именно находится» |
| AP-4 | **Single-source claim presented as fact** | «Desktop поддерживает плагины» — взято от user assertion, без verification в docs | `[UNVERIFIED]` marker обязателен когда нет docs proof; user assertion ≠ verified |
| AP-5 | **Date-blind quote** | Цитата из docs без даты последнего обновления — могло быть outdated | Recency check: для каждого URL — проверить дату; если >12 месяцев — отметить риск |
| AP-6 | **Hypothesis-after-research** | Сначала research, потом «гипотезы по результатам» — гипотезы подгоняются под findings | Hypothesis-FIRST: формулировать гипотезы ДО search, искать proof/disproof, не интерпретацию |
| AP-7 | **Self-citation / circular reference** | Agent цитировал собственный `RESEARCH.md` или `FR.md` как evidence для своих же hypothesis-ов — circular validation | Source taxonomy excludes generated artifacts: spec files (`.specs/**`), plan files (`~/.claude/plans/**`), research output of THIS skill — НЕ являются sources. Только external docs / source code / community refs. Если только internal docs cited — `[CIRCULAR_RISK]` marker |
| AP-8 | **Cited-but-not-fetched** | Agent ссылался на URL без actual fetch и quote — присваивал «verified» status по name только | Каждый docs URL обязан быть actually FETCHED через WebFetch (not just listed). Quote с line number / paragraph должна быть в output. URL без quote → `[CITED_NOT_FETCHED]` (=`[UNVERIFIED]`) |

## ФАЗА 1: УТОЧНЕНИЕ + HYPOTHESIS FORMULATION

### Skip Phase 1 (5 вариантов направлений) КОГДА:

- Skill вызван из `create-spec` (направление задано feature-context) — переходи сразу к hypothesis formulation
- Пользователь дал конкретный topical запрос
- Контекст однозначен

### Hypothesis Formulation (ОБЯЗАТЕЛЬНО, не пропускать)

**ДО любого search** — выписать гипотезы явно, как структурированный список. Каждая гипотеза:

1. Конкретное утверждение (yes/no answerable)
2. Имеет ожидаемый proof type (docs page, schema URL, code example, etc.)
3. Имеет fallback: если proof не найден — `[UNVERIFIED]` явно

**Standard hypothesis categories** (для разных типов research):

#### Для Plugin/Extension/Package research

H1: **Distribution** — Каков canonical install mechanism? (CLI команда, npm, git, marketplace, direct download)
H2: **Discovery** — Как клиент находит/загружает? (filesystem scan, explicit registration, env var, config file)
H3: **Schema** — Полная shape config файла (ВСЕ поля required/optional с описанием)
H4: **Versioning** — Как раздаются версии? (semver, git SHA, timestamp, manual)
H5: **Lifecycle** — Install → Enable → Run → Update → Disable → Uninstall — каждый шаг
H6: **Compatibility** — Какие platforms (CLI/Desktop/IDE)? Что работает где?
H7: **Conflicts** — Что происходит при collision (same-name plugins, version conflicts)?

#### Для API/Protocol research

H1: **Endpoint surface** — ВСЕ endpoints с methods/paths/auth requirements
H2: **Request schema** — каждый endpoint: ВСЕ required/optional params, types, examples
H3: **Response schema** — success + error shapes
H4: **Authentication** — exact mechanism (header/cookie/OAuth/API key), scope/permissions
H5: **Rate limits + quotas** — exact numbers, window, burst behavior
H6: **Versioning** — header? URL prefix? deprecation policy?

#### Для CLI tool research

H1: **Command surface** — ВСЕ subcommands с usage signatures
H2: **Flag surface** — ВСЕ flags с types/defaults/examples
H3: **Config files** — где читаются (precedence), schema каждого
H4: **Env vars** — какие читаются, какой type/format
H5: **Output formats** — exit codes, stdout/stderr conventions, machine-readable formats

### Output of Phase 1

```markdown
## Hypotheses (formulated before research)

| H# | Statement | Expected Proof Type | Fallback |
|----|-----------|---------------------|----------|
| H1 | dev-pomogator can be installed via `claude plugin install dev-pomogator@stgmt` | CLI command in plugins-reference.md | [UNVERIFIED] if not found |
| H2 | Plugin discovery via `enabledPlugins` field in settings.json (not filesystem scan) | settings.md docs page + reference | [UNVERIFIED] |
| H3 | plugin.json schema includes fields beyond name/version/description/author | plugins-reference.md schema section + JSON schema URL if exists | List actual fields, mark [UNVERIFIED] if not enumerated |
```

---

## ФАЗА 2: ИССЛЕДОВАНИЕ (targeted by hypotheses)

### Step 0: Required Reading List (для known research types)

ПЕРЕД search'ем — прочитать ВСЕ страницы целиком (не grep по ключевым словам), которые относятся к topic. Для plugin/Anthropic research минимум:

| URL | Что искать | Required? |
|-----|------------|-----------|
| `code.claude.com/docs/en/llms.txt` | Sitemap всех docs страниц | YES — daje понимание surface area |
| `code.claude.com/docs/en/plugins.md` | High-level overview, basic schema | YES |
| `code.claude.com/docs/en/plugins-reference.md` | **Detailed schema reference** — full field list | YES — критично для AP-1 |
| `code.claude.com/docs/en/skills.md` | Skill format, frontmatter, scopes | YES для plugin research |
| `code.claude.com/docs/en/settings.md` | settings.json structure, scopes precedence | YES |
| `code.claude.com/docs/en/mcp.md` | MCP server scope/lifecycle | If MCP relevant |
| `code.claude.com/docs/en/discover-plugins.md` | Marketplace mechanics | If marketplace relevant |
| `code.claude.com/docs/en/hooks.md` | Hooks events + format | If hooks relevant |

**ПРАВИЛО**: Если research это plugin/extension topic, и `plugins-reference.md` НЕ был прочитан целиком — research НЕДОСТАТОЧЕН. Mark `[INCOMPLETE_READING]`.

### Step 1: Local check

`Glob`/`Grep`/`Read` по проекту — есть ли уже implementation/example/test для этой topic.

### Step 2: MCP инструменты (приоритет)

| Инструмент | Назначение | Когда использовать |
|------------|------------|---------------------|
| `mcp__context7__resolve-library-id` → `query-docs` | Официальная документация библиотек | Каждый library/framework hypothesis |
| `mcp__octocode__githubSearchCode` | Реальные usage в open-source | Verification: «есть ли реальный код использующий это API» |
| `mcp__octocode__githubSearchRepositories` | Find related projects | Discovery alternative implementations |
| `mcp__octocode__githubSearchPullRequests` | PRs упоминающие feature | Recency: что изменилось недавно |
| `mcp__octocode__githubGetFileContent` | Прямое чтение SOURCE файлов | Когда docs URL не работает; reading actual implementation |
| `WebFetch` | Прямое чтение docs страницы | Когда нужно прочитать страницу целиком (Required Reading List) |
| `WebSearch` | Discovery новых URL/issues/blogs | Triangulation third-source — community / non-official angle |

### Step 3: Web Search rules

3-step approach:
1. **Точная цитата** в кавычках — «exact phrase from docs»
2. **`site:` оператор** — `site:code.claude.com plugin enabledPlugins`
3. **Negative search** — `-old -deprecated` для отсева outdated результатов
4. **GitHub issues filter** — `site:github.com/anthropics is:issue plugin install`

### Step 4: Schema exhaustiveness rule

Для structured config research (plugin.json, settings.json, manifest.json и т.д.):

1. Найти official **JSON Schema URL** если существует (`$schema` field в example, или dedicated schema endpoint)
2. Если schema URL найден — fetch + перечислить ВСЕ properties с types/required
3. Если schema URL нет — read reference docs page CELIKOM, найти таблицу полей
4. Output: **полная таблица полей** required vs optional с коротким описанием каждого

```markdown
| Field | Type | Required? | Description | Source |
|-------|------|-----------|-------------|--------|
| name | string | YES | Plugin identifier | plugins-reference.md L370 |
| version | string | NO | semver; default = git SHA | plugins-reference.md L375 |
| skills | string\|array | NO | Skill directory paths | plugins-reference.md L389 |
| ... (continue for ALL fields, not "key" ones) | | | | |
```

### Step 5: Recency check

Для каждого main URL:
1. Найти дату последнего обновления (HTML meta, GitHub commit date, blog post date)
2. Если >12 месяцев — `[STALE_RISK: last updated YYYY-MM-DD]`
3. Search: «`<feature>` changelog 2026 site:anthropic.com» для recent changes

---

## ФАЗА 3: ВЕРИФИКАЦИЯ (triangulation, fail-loud)

### Triangulation requirement (не «3 источника», а 3 INDEPENDENT)

Каждая hypothesis должна иметь proof из **3 ИНДЕПЕНДЕНТНЫХ angles**:

| Angle | Examples | Что считается |
|-------|----------|---------------|
| **Official docs** | docs.anthropic.com, code.claude.com | Vendor-authored official documentation |
| **Source code** | github.com/anthropics/claude-code | Actual implementation OR examples in official repos |
| **Community/third-party** | GitHub issues, blog posts, Stack Overflow, плагины OSS | Independent users / blog authors |

3 hits в одних docs ≠ 3 sources. 3 cited paragraphs from same blog ≠ 3 sources. **Different angle = different source.**

### Verification status taxonomy (ОБЯЗАТЕЛЬНО использовать в output)

| Marker | Когда использовать | Пример |
|--------|---------------------|--------|
| `[VERIFIED: <url>]` | 3+ INDEPENDENT angles confirm | `[VERIFIED: plugins-reference.md L370 + github.com/anthropics/claude-code/.../config.ts L42 + community blog 2026-01]` |
| `[NEEDS_CONFIRMATION: <url>]` | 2 angles confirm, 3rd missing | `[NEEDS_CONFIRMATION: plugins-reference.md only; no community examples found yet]` |
| `[SINGLE_SOURCE: <url>]` | Only 1 angle | Mark explicit risk; don't present as fact |
| `[UNVERIFIED]` | Hypothesis formulated but no proof found | Required to be present in output if H not confirmed |
| `[ASSUMED]` | Inferred from convention/pattern, no direct source | High risk — flag for user review |
| `[STALE_RISK: <date>]` | Source >12 months old, no recent changelog reviewed | Suggest re-check |
| `[INCOMPLETE_READING]` | Required Reading List not fully read | Block report finalization |
| `[CIRCULAR_RISK]` | Только generated artifacts (spec, plan, prior research output) cited | Не являются sources; искать external proof |
| `[CITED_NOT_FETCHED]` | URL listed but page не была actually fetched через WebFetch | Equivalent to `[UNVERIFIED]`; обязательно fetch + quote |

### Source taxonomy (что считается valid source)

**VALID external sources** (counts toward 3-angle triangulation):
- Official vendor docs (docs.anthropic.com, code.claude.com и т.д.) — **must be fetched + quoted**
- Source code in vendor's official repo (github.com/anthropics/...) — **must reference specific file:line**
- Independent community sources — blog posts, third-party tutorials, GitHub issues от non-vendor authors
- JSON schema URLs если existуют

**NOT valid sources** (excluded from triangulation):
- `.specs/**/*.md` файлы текущего проекта — это **derivatives**, не sources
- `~/.claude/plans/**` файлы — derivatives
- Output prior runs THIS skill (`RESEARCH.md` filled by predecessor research) — derivatives
- User assertions без external corroboration — flag `[USER_ASSERTION_ONLY]`
- AI-generated docs / blog posts (если detectable) — possibly hallucinated

### Verification table (ОБЯЗАТЕЛЬНО в output)

```markdown
| H# | Hypothesis | Status | Angle 1 (docs) | Angle 2 (code) | Angle 3 (community) |
|----|-----------|--------|----------------|----------------|---------------------|
| H1 | `claude plugin install <name>@<m>` is canonical | [VERIFIED] | plugins-reference.md L450 quote: "..." | github/anthropics/.../cli.ts L88 | systemprompt.io/2026/01 blog |
| H2 | Discovery via enabledPlugins | [VERIFIED] | settings.md L120 quote: "..." | github example settings.json | — [SINGLE_SOURCE_2: docs+code only] |
| H3 | plugin.json field "userConfig" supports prompting | [NEEDS_CONFIRMATION] | plugins-reference.md L405 mentioned | no real-world example found in github search | — |
| H4 | Desktop reads `~/.claude/plugins/` | [UNVERIFIED] | not in docs | not testable from docs | user assertion only — risk AP-4 |
```

### Anti-fact-laundering rule

Если hypothesis получила только `[SINGLE_SOURCE]` или `[NEEDS_CONFIRMATION]`:
- В Phase 4 report — НЕ presenting as fact
- В finding — explicit «based on single source: <url>; needs confirmation»
- Если consumer (e.g., create-spec FR.md) импортирует finding — он должен получить marker, не sanitized version

---

## ФАЗА 4: ОТЧЁТ

### Финальный отчёт format

```markdown
## Research Report: [Topic]

### Reading completeness
- [ ] Required Reading List items прочитаны: <list with checkmarks>
- [ ] Recency: youngest/oldest source dates
- [ ] Schema exhaustiveness: <X fields enumerated, Y skipped — only if applicable>

### Verified findings ([VERIFIED] only)
| Finding | Sources (3 angles) |
|---------|---------------------|

### Partial findings ([NEEDS_CONFIRMATION] / [SINGLE_SOURCE])
| Finding | Status | Missing angle |
|---------|--------|---------------|

### Unverified hypotheses ([UNVERIFIED])
| Hypothesis | Why no proof | Recommended action |
|-----------|--------------|---------------------|

### Schema/API exhaustive enumeration (если applicable)
<full table from Phase 2 Step 4>

### Implications (для consumer skill, e.g. create-spec)
- Какие assumptions in spec надо пересмотреть на основе [VERIFIED] findings?
- Какие [UNVERIFIED] риски impact spec FR/AC/Design?

### Re-research triggers
- When to re-run: <conditions>
```

### Чек-лист (mandatory before report finalize)

- [ ] Hypotheses written BEFORE research (Phase 1)
- [ ] Required Reading List все items прочитаны (or marked [INCOMPLETE_READING])
- [ ] Каждая hypothesis имеет triangulation от 3 INDEPENDENT angles (или marker)
- [ ] Schema/API research — ВСЕ поля enumerated в таблице
- [ ] Recency check — каждый main URL с датой
- [ ] Markers `[VERIFIED]/[UNVERIFIED]/[NEEDS_CONFIRMATION]/[SINGLE_SOURCE]/[ASSUMED]` использованы explicitly
- [ ] Anti-pattern checklist (AP-1 .. AP-6) reviewed against current research

---

## Интеграция со спеками

Skill вызывается **`create-spec` skill во время Phase 1 step 5** через `Skill("research-workflow")`:

1. Skip Phase 1 «5 вариантов» (направление задано spec'ом)
2. Hypothesis formulation — обязательно
3. Required Reading List — основан на spec topic
4. Output → `.specs/{feature}/RESEARCH.md` секция `## Технические находки`
5. **CRITICAL**: При записи в RESEARCH.md — сохранить markers [VERIFIED]/[UNVERIFIED]; consumer (FR.md, DESIGN.md) должен видеть risk-уровни, не sanitized facts.

После завершения, если существует папка спеки:

1. Проверить наличие `.specs/{feature}/RESEARCH.md`
2. Записать verified findings + markers + schema enumeration
3. Если есть `[UNVERIFIED]` или `[SINGLE_SOURCE]` — emit warning к user: «N findings require re-confirmation before FR.md finalization»
4. Использовать скрипт: `tools/specs-generator/spec-status.ts`
