# Phase 2: Requirements + Design

## Contents

- [Step 0 (Jira-mode)](#step-0-jira-mode)
- [Алгоритм](#алгоритм)
- [Правила создания .feature](#правила-создания-feature)
- [STOP #2](#stop-2)

**Файлы:** REQUIREMENTS.md, FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, `*.feature`

## Step 0 (Jira-mode)

Если `.specs/{slug}/JIRA_SOURCE.md` существует — выполнить Step 0 из [`jira-mode.md`](jira-mode.md) для Phase 2: extract CRITICAL imperatives → FR; scope enumeration → каждый member получает FR или `[WAIVED]`; exclusions → `## Out of Scope`; errors → reference `{file}:{line}`; UI observations → точные тексты в AC; config values → NFR boundaries.

Format Jira trace в FR/AC/BDD/Tasks — см. [`jira-mode.md`](jira-mode.md).

## Алгоритм

1. **Заполнить FR.md** (формат: `## FR-N: {Название}`). В Jira-mode — каждый FR со строкой `Jira imperative:`.

2. **Заполнить NFR.md** (секции: Performance, Security, Reliability, Usability). В Jira-mode — constraints из `.jira-cache.json` `config_values` cross-checked.

3. **Заполнить ACCEPTANCE_CRITERIA.md** (EARS формат: `WHEN ... THEN ... SHALL ...`). В Jira-mode — каждый AC со строкой `Jira acceptance:` или `Evidence:`.

4. **Заполнить REQUIREMENTS.md** (индекс ссылок, traceability matrix).

5. **Step 4b: Вызвать `Skill("requirements-chk-matrix")`** — skill строит CHK traceability matrix в REQUIREMENTS.md (`CHK-FR{n}-{nn}` rows + Verification Process + Summary Counts) И populates `## Key Decisions` блоки в DESIGN.md с Rationale/Trade-off/Alternatives considered. Hook `requirements-chk-guard` enforces CHK format; `design-decision-guard` enforces Key Decisions format.

6. **Заполнить DESIGN.md** — при ручном редактировании дополнить `## Key Decisions` из skill-output; hook `design-decision-guard` блокирует decisions без Alternatives.

7. **Step 5a: OUT OF SCOPE пропагация (ОБЯЗАТЕЛЬНО):** Если FR помечен `> OUT OF SCOPE`, агент ОБЯЗАН пометить связанные UC, AC и User Stories. Формат: `> OUT OF SCOPE — см. FR-N`.

8. **Step 5b: External Service Verification (ОБЯЗАТЕЛЬНО для фич с внешними сервисами):** Для каждого внешнего сервиса в DESIGN.md:
   - Проверить env vars / API config через официальную документацию (Context7 или WebSearch)
   - Пометить проверенные: `[VERIFIED: {источник}]`
   - Пометить непроверенные: `[UNVERIFIED]`

9. **Step 5c: Multimodal re-verification (ОБЯЗАТЕЛЬНО в Jira-mode):** Для каждого AC, содержащего ссылку `Screenshot: {filename}` или `Video: {filename}:{timestamp}`:
   - Прочитать attachment из `.specs/{slug}/attachments/{filename}` (если присутствует локально) через Read tool (multimodal)
   - Применить правило `.claude/rules/pomogator/screenshot-driven-verification.md`: описать что ВИДНО, сравнить с ОЖИДАНИЕМ AC, вывести `CONFIRMED` / `DENIED` с обоснованием
   - Если file отсутствует локально → пометить AC `[EVIDENCE_MISSING: run /jira-intake-resync]` и не утверждать детали UI от головы.

10. **Step 6: BDD Test Infrastructure Assessment (ОБЯЗАТЕЛЬНО — НЕ пропускать).** Полный алгоритм 6.1-6.5 — см. [`phase2_bdd-test-infrastructure.md`](phase2_bdd-test-infrastructure.md). Результат записывается в секцию `## BDD Test Infrastructure` в DESIGN.md. Секция НЕ МОЖЕТ быть удалена.

11. **Заполнить FILE_CHANGES.md** — каждый файл из TASKS.md `**files:**` ОБЯЗАН быть в FILE_CHANGES.md.

12. **Step 8: Анализ паттернов .feature (ОБЯЗАТЕЛЬНО перед написанием .feature):**

    ```
    .dev-pomogator/tools/specs-generator/analyze-features.ts -Format text [-FeatureSlug "{slug}"] [-DomainCode "{DOMAIN}"]
    ```

    На основе отчёта:
    - Использовать Background из самого частого паттерна (не выдумывать)
    - Переиспользовать формулировки шагов из Step Dictionary
    - Использовать следующий свободный domain number из отчёта
    - Подробные правила — [`feature-creation-rules.md`](feature-creation-rules.md)

13. **Создать `{feature-slug}.feature`** (по правилам [`feature-creation-rules.md`](feature-creation-rules.md), опираясь на отчёт `analyze-features.ts`).

14. **Валидация:** `.dev-pomogator/tools/specs-generator/validate-spec.ts -Path ".specs/{feature}"` — исправить ошибки если есть.

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
