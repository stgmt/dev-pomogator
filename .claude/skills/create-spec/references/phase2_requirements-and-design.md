# Phase 2: Requirements + Design

## Contents

- [Step 0 (Jira-mode)](#step-0-jira-mode)
- [Алгоритм](#алгоритм)
- [Правила создания .feature](#правила-создания-feature)
- [STOP #2](#stop-2)

**Файлы:** REQUIREMENTS.md, FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, `{slug}_SCHEMA.md`, `*.feature`

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
    .dev-pomogator/tools/specs-generator/analyze-features.ts -Format text [-FeatureSlug "{slug}"] [-DomainCode "{DOMAIN}"]
    ```

    На основе отчёта:
    - Использовать Background из самого частого паттерна (не выдумывать)
    - Переиспользовать формулировки шагов из Step Dictionary
    - Использовать следующий свободный domain number из отчёта
    - Подробные правила — [`feature-creation-rules.md`](feature-creation-rules.md)

14. **Создать `{feature-slug}.feature`** (по правилам [`feature-creation-rules.md`](feature-creation-rules.md), опираясь на отчёт `analyze-features.ts`).

15. **Валидация:** `.dev-pomogator/tools/specs-generator/validate-spec.ts -Path ".specs/{feature}"` — исправить ошибки если есть.

## Правила создания .feature

См. отдельный reference: [`feature-creation-rules.md`](feature-creation-rules.md).

## STOP #2

Показать Requirements + Design (Executive Summary с key decisions), спросить подтверждение.

После подтверждения:

```
.dev-pomogator/tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Requirements
```

## Next phase

После STOP #2 → перейти к [`phase3_finalization.md`](phase3_finalization.md).
