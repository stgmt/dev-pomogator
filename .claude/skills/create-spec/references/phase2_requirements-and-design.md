# Phase 2: Requirements + Design

## Contents

- [Step 0 (Jira-mode)](#step-0-jira-mode)
- [Pre-Write Verification Checklist (ОБЯЗАТЕЛЬНО)](#pre-write-verification-checklist-обязательно)
- [Алгоритм](#алгоритм)
- [Правила создания .feature](#правила-создания-feature)
- [STOP #2](#stop-2)

**Файлы:** REQUIREMENTS.md, FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, `{slug}_SCHEMA.md`, `*.feature`

## Pre-Write Verification Checklist (ОБЯЗАТЕЛЬНО)

Перед написанием FR/AC/DESIGN — выполнить **все** проверки ниже. Каждый item фиксирует класс ошибок, регулярно всплывающий на spec-review. Цель — **поймать на genertion, не на review**.

> **Контекст:** в session 2026-05-12 ревью spec `worktree-setup` обнаружил 3 P0 + 2 P1 которые могли быть пойманы на генерации:
> - Wrong file claim (`tsx-runner-bootstrap.cjs` вместо `tsx-runner.js`) — не Read'нул файл
> - Hardcoded identifier (`stgmt/dev-pomogator`) — игнор own feedback memory
> - Wrong CLI semantics (`git worktree add <path> <branch>`) — не Bash'нул `--help`
> - Namespace collision (`GH_HOST` vs gh CLI's own env var) — не проверил reserved names
> - Missed env-first pattern — не загрузил feedback memory pre-write

### CL-1: Memory-aware context priming

ДО написания первого FR/Design claim — выполнить:

```bash
# Derive project-encoded cwd: Claude Code заменяет '/', '\', ':' на '-' в pwd
# Пример: D:\repos\dev-pomogator → D--repos-dev-pomogator
encoded=$(pwd | sed 's|[:/\\]|-|g')
ls ~/.claude/projects/${encoded}/memory/feedback_*.md 2>/dev/null
```

Если файлы существуют — **прочитать каждый Read tool-ом**. Это constraints применимые к ЭТОЙ spec (например `feedback_no-hardcoded-*`, `feedback_env-first-*`, `feedback_integration-tests-*`).

Каждая загруженная memory становится **active constraint** при написании spec:
- Если memory говорит "no hardcoded X" — spec ОБЯЗАН не содержать литерал X
- Если memory говорит "env file before asking" — spec ОБЯЗАН использовать env-first паттерн в design

При финальной проверке (CL-7 ниже) — grep spec body против literals упомянутых в memory.

### CL-2: Verify every file path before claiming behavior

Для **каждого** absolute или relative path упоминаемого в FR/DESIGN/SCHEMA:

- Read tool на этот path → verify file existence, structure
- Сохранить line number range в RESEARCH.md "Где лежит реализация" или DESIGN.md "Где лежит реализация"
- Без verified file content — НЕ писать claim про поведение этого файла

Запрещено: claim "файл X делает Y" если file X не был Read в текущей session.

### CL-3: Verify every external CLI command via `--help`

Для **каждой** внешней CLI команды (git, gh, node, npm, npx, dotnet, pytest, docker, etc.) упомянутой в FR/AC/DESIGN:

- Bash `{cmd} --help 2>&1 | head -N` ИЛИ `{cmd} -h`
- Цитировать relevant usage line в RESEARCH.md "Технические находки" или DESIGN.md как `[VERIFIED: {cmd} --help → "{quote}"]`
- Если flag/option упомянут — verify он существует в actual help output

Запрещено: claim "команда X с флагом Y делает Z" без verification что флаг Y реально существует и делает Z.

### CL-4: Verify external API surface (Step 5b expansion)

Шаг 5b алгоритма (External Service Verification) переносится сюда как **pre-FR** проверка, не post-design. Для каждого внешнего сервиса (gh API, GitHub REST, OpenAI, Stripe, etc.):

- WebFetch на официальную доку ИЛИ Bash на CLI команду для verification
- Цитировать field names / endpoint paths / response shapes в SCHEMA.md или RESEARCH.md
- Каждый API claim → `[VERIFIED: <source>]` или `[UNVERIFIED]`

Запрещено: claim "API возвращает {field}" без verification.

### CL-5: Namespace collision check для новых env vars / config keys

Для **каждого** нового env var name или config key упомянутого в spec:

- grep против reserved namespaces для common tools (gh: `GH_TOKEN`, `GH_HOST`, `GH_ENTERPRISE_*`; npm: `NPM_TOKEN`, `NPM_CONFIG_*`; AWS: `AWS_*`; Node: `NODE_*`; etc.)
- Если коллизия найдена — добавить namespace prefix (e.g., `WT_GH_*` для worktree-setup, `MYAPP_*` для app-level)
- Документировать namespace choice в SCHEMA.md с обоснованием

Запрещено: использовать общеупотребительные имена (`HOST`, `TOKEN`, `USER`, `PATH`, `HOME`) без префикса.

### CL-6: Verify file paths after writing — pre-STOP grep

Перед `spec-status -ConfirmStop Requirements`:

MCP-rails (FR-39 — no raw `grep` of `.specs/`): pull the spec text through the
read door, extract path-like references, then verify each on disk:

```
list_spec_docs({ spec: "{slug}" })           # md + feature + .progress.json
# for each doc: read_spec_doc({ spec, doc }) → regex the returned content for
#   (~|/|\.\.?/|[A-Z]:[\\/])[a-zA-Z0-9._\\/-]+   path-like tokens
```

For every extracted path `p`, the existence check is on the TARGET (code/config,
outside `.specs/`), so it stays a plain shell test:
`[ -e "$(echo $p | sed "s|^~|$HOME|")" ] || echo "MISSING: $p"`.

Каждый `MISSING:` — либо truly missing (P0 — wrong claim) либо futur creation (OK если в FILE_CHANGES.md action=create). Если последнее — добавить в FILE_CHANGES.

### CL-7: Memory constraint compliance — pre-STOP grep

Перед `spec-status -ConfirmStop Requirements`:

Для каждой loaded в CL-1 memory:
- Extract forbidden literals / required patterns (e.g., memory "no-hardcoded-stgmt" → forbidden `stgmt/`)
- Scan the spec for each forbidden literal **through the MCP read door** (MCP-rails
  FR-39 — no raw `grep` of `.specs/`): `list_spec_docs` then `read_spec_doc` each
  doc and substring-match the literal in the returned content
- Если match — P0 finding, must fix

```bash
# Extracting the literals from memory files is fine via grep — the memory dir
# (~/.claude/projects/.../memory/) is NOT .specs/, so it is not gated:
for memo in ~/.claude/projects/$(pwd | sed 's|[/:]|-|g')/memory/feedback_no-hardcoded-*.md; do
  grep -oE 'literal[s]? `[^`]+`' "$memo" | head -1 | sed 's/.*`\(.*\)`.*/\1/'
done
# Then match each extracted literal against the spec docs via read_spec_doc
# (above) — NOT `grep -rn "$literal" .specs/{slug}/`.
```

> ⚠️ **Coverage note:** the read-door loop covers `*.md`/`*.feature`/`.progress.json`;
> a literal hardcoded in a spec `.yaml`/`.json` artifact is out of this step's
> reach (engine-side reconcile/audit owns that). Don't treat md/feature as total.

### CL-8: Cross-reference consistency

- Каждый @featureN в `.feature` ↔ есть в REQUIREMENTS.md Traceability Matrix ↔ есть FR-N
- Каждый CHK-FR{n}-{nn} в REQUIREMENTS.md Verification Matrix ↔ Traces To существует
- Каждый file path в FILE_CHANGES.md ↔ упомянут в TASKS.md или Implementation Plan

Поймает before-STOP cross-file inconsistencies которые иначе всплывут в Phase 3+ audit.

---

После прохождения **всех 8 пунктов** — приступать к Алгоритму ниже. Каждый Write tool call после этого — already-verified content.

## Step 0 (Jira-mode)

Если `.specs/{slug}/JIRA_SOURCE.md` существует — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 2: extract CRITICAL imperatives → FR; scope enumeration → каждый member получает FR или `[WAIVED]`; exclusions → `## Out of Scope`; errors → reference `{file}:{line}`; UI observations → точные тексты в AC; config values → NFR boundaries.

Format Jira trace в FR/AC/BDD/Tasks — см. [`jira-mode.md`](jira-mode.md).

## Алгоритм

1. **Заполнить FR.md** (формат: `## FR-N: {Название}`). В Jira-mode — каждый FR со строкой `Jira imperative:`.

2. **Заполнить NFR.md** (секции: Performance, Security, Reliability, Usability). В Jira-mode — constraints из `.jira-cache.json` `config_values` cross-checked.

3. **Заполнить ACCEPTANCE_CRITERIA.md** (EARS формат: `WHEN ... THEN ... SHALL ...`). В Jira-mode — каждый AC со строкой `Jira acceptance:` или `Evidence:`.

4. **Заполнить REQUIREMENTS.md** (индекс ссылок, traceability matrix).

5. **Step 4b: Вызвать `Skill("requirements-chk-matrix")`** — skill строит CHK traceability matrix в REQUIREMENTS.md (`CHK-FR{n}-{nn}` rows + Verification Process + Summary Counts) И populates `## Key Decisions` блоки в DESIGN.md с Rationale/Trade-off/Alternatives considered. Hook `requirements-chk-guard` enforces CHK format; `design-decision-guard` enforces Key Decisions format.

6. **Step 4c: Вызвать `Skill("variant-matrix-build")`** — skill детектит polymorphic FRs (shared pipeline + per-variant dispatch) через `trigger-phrases.ts` (mechanical regex EN+RU). Если detection возвращает ≥1 polymorphic FR с `hardOut: false`, skill populates AC Decision Table в `ACCEPTANCE_CRITERIA.md`, `Scenario Outline` + `Examples:` block в `.feature` файле, и per-variant tasks в `TASKS.md`. Возвращает JSON `{frs_with_matrix, ac_rows, examples_rows, tasks_emitted, escape_hatches, files_touched}`. Phase 3+ Audit category `VARIANT_COVERAGE` блокирует STOP #3 если matrix incomplete (severity ≥ WARNING). Trigger map + hard-OUT signals — см. `.claude/rules/specs-workflow/variant-matrix/when-to-build-matrix.md`. Escape hatch `[skip-variant-matrix: <reason ≥8 chars>]` в FR body — JSONL audit log в `.claude/logs/spec-variant-matrix-escapes.jsonl`.

7. **Заполнить DESIGN.md** — при ручном редактировании дополнить `## Key Decisions` из skill-output; hook `design-decision-guard` блокирует decisions без Alternatives.

7a. **Step 4d: SCHEMA.md decision (ОБЯЗАТЕЛЬНО — НЕ пропускать).** Каждая фича получает scaffold-файл `{slug}_SCHEMA.md` с placeholder-template (`{Feature Name}`, `{Сущность 1}` и т.д.). Этот файл нельзя оставлять с placeholders — audit emit-ит LOGIC_GAPS warnings, скил generator теряет artifact in subsequent runs.

   **Применять SCHEMA.md (заполнить content) если фича включает любое из:**
   - **Multi-layer pipeline** — data flow через 2+ stages (audit → detect → merge → ratchet, или event → validator → executor → reporter)
   - **JSON envelopes / data contracts** — структуры для config файлов, API responses, sub-agent invocations, log entries
   - **Validation rules** — constraints на data shapes (required fields, value ranges, enum members)
   - **Inter-component contracts** — interfaces между modules / extensions / scripts

   **Содержимое (если применяется):**
   1. **Visual pipeline diagram** — ASCII art или mermaid:
      ```
      [user input] → [stage 1: detect] → {output shape A}
                                      ↓
                     [stage 2: merge] → {output shape B}
                                      ↓
                     [stage 3: verify] → {final shape}
      ```
   2. **JSON shapes per entity / per layer output**
   3. **Validation rules** (списком)

   **Если фича simple (single function, refactor, naming-only) — заменить ВЕСЬ content scaffold-template на N/A заглушку:**
   ```markdown
   # {Feature Name} Schema

   **N/A** — у этой фичи нет dedicated data schema. См. DESIGN.md > API раздел для interface descriptions.
   ```

   **ЗАПРЕЩЕНО:** оставлять scaffold с placeholders (`{Feature Name}`, `{Сущность 1}`, `{поле1}` и т.д.). audit-spec.ts emit-ит LOGIC_GAPS findings; STOP #3 не блокирует, но качество спеки ухудшается. При наличии multi-layer pipeline в DESIGN.md — заполнение SCHEMA.md ОБЯЗАТЕЛЬНО как visual companion.

8. **Step 5a: OUT OF SCOPE пропагация (ОБЯЗАТЕЛЬНО):** Если FR помечен `> OUT OF SCOPE`, агент ОБЯЗАН пометить связанные UC, AC и User Stories. Формат: `> OUT OF SCOPE — см. FR-N`.

9. **Step 5b: External Service Verification (ОБЯЗАТЕЛЬНО для фич с внешними сервисами):** Для каждого внешнего сервиса в DESIGN.md:
   - Проверить env vars / API config через официальную документацию (Context7 или WebSearch)
   - Пометить проверенные: `[VERIFIED: {источник}]`
   - Пометить непроверенные: `[UNVERIFIED]`

10. **Step 5c: Multimodal re-verification (ОБЯЗАТЕЛЬНО в Jira-mode):** Для каждого AC, содержащего ссылку `Screenshot: {filename}` или `Video: {filename}:{timestamp}`:
   - Прочитать attachment из `.specs/{slug}/attachments/{filename}` (если присутствует локально) через Read tool (multimodal)
   - Применить правило `.claude/rules/pomogator/screenshot-driven-verification.md`: описать что ВИДНО, сравнить с ОЖИДАНИЕМ AC, вывести `CONFIRMED` / `DENIED` с обоснованием
   - Если file отсутствует локально → пометить AC `[EVIDENCE_MISSING: run /jira-intake-resync]` и не утверждать детали UI от головы.

11. **Step 6: BDD Test Infrastructure Assessment (ОБЯЗАТЕЛЬНО — НЕ пропускать).** Полный алгоритм 6.1-6.5 — см. [`phase2_bdd-test-infrastructure.md`](phase2_bdd-test-infrastructure.md). Результат записывается в секцию `## BDD Test Infrastructure` в DESIGN.md. Секция НЕ МОЖЕТ быть удалена.

12. **Заполнить FILE_CHANGES.md** — каждый файл из TASKS.md `**files:**` ОБЯЗАН быть в FILE_CHANGES.md.

13. **Step 8: Анализ паттернов .feature (ОБЯЗАТЕЛЬНО перед написанием .feature):**

    ```
    tools/specs-generator/analyze-features.ts -Format text [-FeatureSlug "{slug}"] [-DomainCode "{DOMAIN}"]
    ```

    На основе отчёта:
    - Использовать Background из самого частого паттерна (не выдумывать)
    - Переиспользовать формулировки шагов из Step Dictionary
    - Использовать следующий свободный domain number из отчёта
    - Подробные правила — [`feature-creation-rules.md`](feature-creation-rules.md)

14. **Создать `{feature-slug}.feature`** (по правилам [`feature-creation-rules.md`](feature-creation-rules.md), опираясь на отчёт `analyze-features.ts`).

15. **Валидация:** `tools/specs-generator/validate-spec.ts -Path ".specs/{feature}"` — исправить ошибки если есть.

## Правила создания .feature

См. отдельный reference: [`feature-creation-rules.md`](feature-creation-rules.md).

## STOP #2

Показать Requirements + Design (Executive Summary с key decisions), спросить подтверждение.

После подтверждения:

```
tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Requirements
```

## Next phase

После STOP #2 → перейти к [`phase3_finalization.md`](phase3_finalization.md).
