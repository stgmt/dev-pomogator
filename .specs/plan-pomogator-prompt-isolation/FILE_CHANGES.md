# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи `plan-pomogator-prompt-isolation`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts` | edit | [FR-1](FR.md#fr-1-prompt-capture-использует-session_id-из-hook-input-feature1), [FR-2](FR.md#fr-2-prompt-capture-не-пишет-defaultjson-при-отсутствии-session_id-feature2), [FR-3](FR.md#fr-3-prompt-capture-фильтрует-task-notification-псевдо-промпты-feature3): rename `conversation_id` → `session_id` (line 31, 88), убрать `\|\| 'default'` fallback (line 88), добавить task-notification regex filter (line 86) |
| `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` | edit | [FR-4](FR.md#fr-4-plan-gate-loaduserprompts-не-имеет-most-recent-fallback-feature4), [FR-5](FR.md#fr-5-plan-gate-formatpromptsfromfile-фильтрует-task-notification-на-чтении-feature5): убрать most-recent fallback в `loadUserPrompts` (lines 74-97), добавить defense filter в `formatPromptsFromFile` (lines 104-117), экспортировать `formatPromptsFromFile` |
| `.dev-pomogator/tools/plan-pomogator/prompt-capture.ts` | edit | Installed copy для реального hook execution согласно `post-edit-verification.md` правилу — копируется из `extensions/plan-pomogator/tools/plan-pomogator/prompt-capture.ts` после edit |
| `.dev-pomogator/tools/plan-pomogator/plan-gate.ts` | edit | Installed copy для реального hook execution согласно `post-edit-verification.md` правилу — копируется из `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts` после edit |
| `tests/e2e/plan-validator.test.ts` | edit | [FR-7](FR.md#fr-7-регрессионные-тесты-покрывают-fr-1fr-5-интеграционно-feature7): добавить describe `PLUGIN007_43 prompt-capture & plan-gate session isolation` с 5 it-блоками PLUGIN007_43_01..05 покрывающими AC-1..AC-5 через spawnSync интеграцию и прямой импорт `formatPromptsFromFile` |
| `tests/features/plugins/plan-pomogator/PLUGIN007_plan-pomogator.feature` | edit | [FR-7](FR.md#fr-7-регрессионные-тесты-покрывают-fr-1fr-5-интеграционно-feature7): добавить 5 BDD сценариев PLUGIN007_43..47 с тегами `# @feature43` после существующего PLUGIN007_42 для 1:1 mapping с тестами согласно `extension-test-quality.md` |
| `extensions/plan-pomogator/extension.json` | edit | Bump version `1.8.0` → `1.8.1` (semver patch для bugfix), description обновляется с упоминанием prompt isolation fix. Manifest integrity согласно `extension-manifest-integrity.md` |
| `.specs/plan-pomogator-prompt-isolation/AUDIT_REPORT.md` | create | Auto-generated report после Phase 3+ Audit с записью всех findings и исправлений (validate-spec.ts + audit-spec.ts + AI semantic analysis) |
