# Acceptance Criteria (EARS)

## AC-1 (FR-1) @feature1

**Требование:** [FR-1](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1)

WHEN `prompt-capture.ts` получает hook input `{session_id: "abc-123", prompt: "real user message"}` THEN скрипт SHALL создать файл `~/.dev-pomogator/.plan-prompts-abc-123.json` с записью `{ts: <timestamp>, text: "real user message"}` AND скрипт SHALL NOT создать файл `~/.dev-pomogator/.plan-prompts-default.json`.

## AC-2 (FR-2) @feature2

**Требование:** [FR-2](FR.md#fr-2-prompt-capture-не-пишет-defaultjson-при-отсутствии-session_id-feature2)

IF hook input не содержит поле `session_id` ИЛИ `session_id` пустая строка THEN `prompt-capture.ts` SHALL завершиться с exit 0 AND скрипт SHALL NOT создать никакого файла в `~/.dev-pomogator/`.

## AC-3 (FR-3) @feature3

**Требование:** [FR-3](FR.md#fr-3-prompt-capture-фильтрует-task-notification-псевдо-промпты-feature3)

WHEN `prompt-capture.ts` получает hook input `{session_id: "x", prompt: "<task-notification><task-id>...</task-id></task-notification>"}` THEN скрипт SHALL завершиться с exit 0 AND скрипт SHALL NOT записать промпт в файл `.plan-prompts-x.json` (файл либо не существует, либо не содержит этой записи).

## AC-4 (FR-4) @feature4

**Требование:** [FR-4](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4)

WHEN `loadUserPrompts(undefined)` ИЛИ `loadUserPrompts("nonexistent-session")` вызывается AND другие файлы `.plan-prompts-*.json` существуют в `~/.dev-pomogator/` THEN функция SHALL вернуть пустую строку AND функция SHALL NOT читать другие файлы из `~/.dev-pomogator/` (нет `readdirSync`).

## AC-5 (FR-5) @feature5

**Требование:** [FR-5](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5)

IF файл `.plan-prompts-x.json` содержит mix `[{text: "<task-notification>spam</task-notification>"}, {text: "real prompt 1"}, {text: "real prompt 2"}]` THEN `formatPromptsFromFile` SHALL вернуть строку содержащую "real prompt 1" AND "real prompt 2" AND строка SHALL NOT содержать подстроку "<task-notification".

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-спецификация-specsplan-pomogator-prompt-isolation-полна-и-валидна-feature6)

WHEN `./.dev-pomogator/tools/specs-generator/validate-spec.ts -Path .specs/plan-pomogator-prompt-isolation` запускается THEN скрипт SHALL завершиться с exit 0 AND скрипт SHALL вывести 0 ERROR-уровень замечаний (warnings допустимы при наличии оправдания в спеке).

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-регрессионные-тесты-покрывают-fr-1fr-5-интеграционно)

WHEN `vitest run plan-validator.test.ts -t "PLUGIN007_43"` запускается THEN тест-suite SHALL пройти все 5 новых тестов (PLUGIN007_43_01..05) в зелёный AND каждый из 5 тестов SHALL соответствовать парному `Scenario: PLUGIN007_43_NN` в глобальном `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` (1:1 mapping согласно `extension-test-quality.md`).
