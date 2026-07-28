# Skill health и CARL: root-cause отчёт — 2026-07-28

## Короткий вывод

`research-workflow` сломал не CARL. Чужая логика про товары, бюджет и €200 была напрямую добавлена в canonical skill коммитом `05c8109b` вместе с тестом, который специально требовал эти строки. Родительский коммит `e0ecebb8` содержит прежний technical-only contract.

CARL существовал до инцидента и не имеет writer path к `SKILL.md`: `tools/carl/adapt-rules.ts` читает rules/skills и формирует `.carl/carl.json`, а `tools/carl/install.ts` обновляет settings/manifest. История CARL-коммитов не меняет `research-workflow/SKILL.md`.

Главная системная причина, почему поломка дошла до пользователей: skill audit был только developer-инструментом на `tsx` + `yaml`, не был обязательным CI/release gate и не запускался из реального dependency-absent plugin layout. Кроме того, его эвристика считала любые названия инструментов внутри backticks вызовами, включая запреты вроде “never raw Write”.

## 1. Что именно сломало research-workflow

### Доказанная причина

- Introducing commit: `05c8109ba584ea5124e44bdb448632f888fe9bd5`.
- Clean parent: `e0ecebb8cd6e71288b75bbbe7931ffab9b920fed`.
- В canonical `.claude/skills/research-workflow/SKILL.md` были добавлены product/buying triggers, eligibility gates, пример €200, товарный anti-pattern и checklist.
- Тем же коммитом был создан `tests/step_definitions/feature_research_workflow_constraints.ts`, который проверял именно новые закупочные фразы. Это исключает случайную генерацию или порчу файла.
- `.agents/skills/research-workflow/SKILL.md` не получил изменение. Это отдельный mirror-drift, а не доказательство CARL propagation.

### Почему CARL исключён

| Проверка | Результат |
|---|---|
| Время изменения | CARL integration/repair commits предшествуют `05c8109b` |
| Git history canonical skill | CARL-коммиты `research-workflow/SKILL.md` не меняют |
| `adapt-rules.ts` writer | `.carl/carl.json`, не skill source |
| `install.ts` writer | CARL settings/manifest, не skill source |
| Ошибочный тест | Добавлен вместе с direct skill edit в `05c8109b` |

**Вердикт:** CARL не root cause и не propagation mechanism. Root cause — неверный cross-project context, применённый прямой правкой к общему skill в смешанном коммите.

## 2. Подтверждённо сломанные skills

До исправления real optimizer audit возвращал 36 errors и 2 warnings на 54 canonical skills.

### Исправлены в этой работе

| Skill | Поломка | Почему это реально ломает пользователя | Исправление |
|---|---|---|---|
| `bdd-migrator` | Невалидный YAML description из-за некавыченного `:` | Parser терял весь frontmatter; name/description/allowed-tools выглядели отсутствующими | Description переведён в YAML block scalar |
| `edge-debug-port` | Та же YAML syntax error | Skill discovery/metadata parsing ненадёжны | Description переведён в block scalar |
| `task-status` | Та же YAML syntax error | Centralized status skill мог не загрузить metadata/tools | Description переведён в block scalar |
| `proxy-up` | Отсутствовал `allowed-tools` | Workflow исполняет shell-команды, но permission contract был пуст | Добавлен минимальный `Bash` |
| `use-claude-subscription` | Отсутствовал `allowed-tools` | Workflow читает/правит проект, запускает smoke и делегирует `proxy-up` без declaration | Добавлены `Read, Glob, Grep, Edit, Write, Bash, Skill` |

Legacy optimizer после этих исправлений больше не сообщает missing metadata для пяти targets; остаётся policy warning про слово `claude` в публичном имени `use-claude-subscription`. Имя намеренно не переименовано: оно является пользовательским trigger/API, а автоматическое переименование было бы compatibility break.

## 3. Другие найденные проблемы

### Подтверждённые runtime/distribution defects, оставленные в exact baseline

| Surface | Finding | Риск | Почему не исправлено здесь |
|---|---|---|---|
| `spec-review` | Ссылка на отсутствующий `references/category-14-memory-constraints.md` | Пользователь не может открыть обещанный reference | Требует восстановления/переписывания отдельного category contract |
| `variant-matrix-build` | Ссылка выходит за plugin root в соседний `scope-gate` repository | У установленного plugin ссылка гарантированно не разрешается | Нужен выбор: co-locate reference или заменить external contract |
| `verify-generic-scope-fix` | Ссылка на repository-only `.specs` выходит за plugin root | Installed skill ссылается на недоставляемый spec path | Нужна installed-safe документационная ссылка |

Эти три finding подавлены только точными fingerprints в `tools/skill-health/baseline.json`. Любое изменение соответствующего skill инвалидирует suppression и снова блокирует strict gate.

### Mirror/distribution debt

- `.agents/skills` содержит 57 каталогов против 54 canonical.
- Много файлов сохранили `.Codex/...` paths и старые Codex-названия.
- Это дерево не является active Claude plugin source: `.claude-plugin/plugin.json` указывает на `.claude/skills`.
- `research-workflow` mirror остался technical-only, когда canonical был загрязнён; CARL его не синхронизировал.
- `meridian-model-call` является явно адаптированным cross-agent mirror и теперь проверяется, когда `.agents` surface присутствует. В установленном canonical plugin mirror optional и не требуется.

Broad mirror rewrite не сделан: без явного решения о поддерживаемых agent platforms он может стереть намеренные adaptations. Новый `mirror-contract.json` требует классифицировать каждый активный mirror как exact/adapted/canonical-only/legacy.

### Не runtime-поломки, а maintainability debt

Legacy optimizer продолжает показывать:

- 8 descriptions длиннее 1024 символов (`corpus-health`, `real-fixtures`, `runtime-dogfood`, `session-pilot`, `spec-generator-dev`, `spec-graph-query`, `spec-reality-check`, `spec-status`);
- `strong-tests` больше 1000 строк;
- transitive-reference warning в `spec-review`;
- policy warning для public name `use-claude-subscription`.

Это требует compatibility-aware refactor, но не доказывает, что skill сейчас не загружается. Они не исправлялись массово.

### Legacy audit false positives

Старый scanner сообщает 16 `ALLOWED_TOOLS_MISSING`, однако часть вызвана текстом:

- “Never raw `Read`/`Write`/`Edit`” в form-filler skills;
- tool names в fenced examples;
- MCP identifiers, перечисленные как документация;
- prose references на другие skills.

Слепое добавление этих tools ослабило бы spec-door policy. Новый checker блокирует только однозначные active call forms, а negated prose и generic fenced examples закреплены self-test.

## 4. Защита для maintainers и установленных пользователей

Добавлен `tools/skill-health/check.mjs`:

- Node builtins only; не использует `tsx`, `yaml`, package manager или `node_modules`;
- валидирует frontmatter, обязательные metadata fields, active tool calls, statically resolvable local links и explicit mirror contract;
- `--report` всегда выдаёт отчёт, `--strict` блокирует новые non-baselined errors;
- deterministic JSON/text output;
- exact baseline: path + finding code + SHA-256 content fingerprint;
- `--self-test` закрепляет malformed YAML, active missing tool, negated prose и fenced-example boundaries.

Один и тот же executable запускается:

1. локально через `npm run check:skill-health`;
2. обязательным шагом `.github/workflows/test.yml`;
3. перед release/publish в `.github/workflows/release.yml`;
4. в dependency-absent copied plugin layout без `node_modules`.

Checker намеренно не добавлен в SessionStart/UserPromptSubmit hooks: сначала он защищает source/release и не создаёт latency или block storm в пользовательской интерактивной сессии.

## 5. Итоговые метрики

| Состояние | Legacy audit | Shipped strict checker |
|---|---:|---:|
| До metadata repair | 36 errors, 2 warnings | N/A |
| После подтверждённых repairs | 25 errors, 2 warnings | 3 exact-baselined findings, 0 blocking |
| Dependency-absent installed layout | Не доказуемо (`tsx`/`yaml`) | 54 skills scanned, 0 blocking |

Legacy error count остаётся высоким главным образом из-за длинных descriptions и старой over-broad tool heuristic. Он сохраняется как диагностический источник; shipped strict verdict теперь даёт dependency-free checker с проверенными false-positive boundaries.

## Follow-up backlog

1. Восстановить или удалить missing category-14 reference в `spec-review`.
2. Сделать installed-safe links в `variant-matrix-build` и `verify-generic-scope-fix`, затем удалить baseline entries.
3. Решить lifecycle `.agents/skills`: поддерживаемый adapted mirror или formal legacy removal.
4. Сократить >1024 descriptions без потери trigger coverage.
5. Разделить `strong-tests` на short entry point + one-level references.
6. Перенести call-aware detection обратно в TypeScript optimizer либо заменить его новым checker, чтобы два diagnostic outputs не расходились.
