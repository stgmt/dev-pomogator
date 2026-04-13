# Hyperv Test Runner Schema

JSON Schema (Draft-07) для test scenarios в `tests/hyperv-scenarios/HV<NNN>_<slug>.yaml`. Реальный schema файл лежит в `tests/hyperv-scenarios/schema.json` и используется для валидации каждого scenario при write/edit.

## Test Scenario (root object)

```json
{
  "id": "HV001",
  "name": "install-clean",
  "description": "Install dev-pomogator into a clean typical-claude-user fixture and verify managed files are created.",
  "tags": ["install", "smoke", "p1"],
  "preconditions": {
    "checkpoint": "baseline-clean",
    "fixture": "typical-claude-user"
  },
  "steps": [
    {
      "name": "copy fixture",
      "cmd": "Copy-Item -Path C:\\fixture-source -Destination C:\\test-project -Recurse -Force",
      "screenshot": false,
      "timeout_seconds": 30
    },
    {
      "name": "install dev-pomogator",
      "cmd": "cd C:\\test-project; npx dev-pomogator --claude --all",
      "screenshot": true,
      "timeout_seconds": 180
    }
  ],
  "assertions": [
    { "type": "exit_code", "step": "install dev-pomogator", "equals": 0 },
    { "type": "file_exists", "path": "C:\\test-project\\.dev-pomogator\\tools" },
    { "type": "text_contains", "path": "C:\\test-project\\.gitignore", "value": ">>> dev-pomogator (managed" },
    { "type": "screenshot_match", "step": "install dev-pomogator", "expect": "PowerShell window shows 'Installation complete' in green text" }
  ],
  "post_test": {
    "revert": "baseline-clean"
  }
}
```

## Поля верхнего уровня

- **`id`** (string, required): уникальный идентификатор формата `HV<NNN>` где `NNN` — 3-значное число с leading zeros. Например `HV001`, `HV042`.
- **`name`** (string, required): kebab-case имя сценария. Должно совпадать с suffix имени файла после `<id>_`. Например для `HV001_install-clean.yaml` → `name: install-clean`.
- **`description`** (string, required): 1-3 предложения. Что сценарий проверяет, в каком состоянии VM, какой ожидаемый результат.
- **`tags`** (array of string, optional): свободные метки для группировки и фильтрации. Рекомендуемые: `smoke`, `regression`, `install`, `uninstall`, `update`, `p1`/`p2`/`p3` (priority).
- **`preconditions`** (object, required): начальное состояние VM перед запуском.
- **`steps`** (array, required, min 1): команды для выполнения внутри VM в порядке списка.
- **`assertions`** (array, required, min 1): проверки после выполнения steps.
- **`post_test`** (object, required): что делать после assertions (всегда независимо от результата).

## `preconditions`

```yaml
preconditions:
  checkpoint: baseline-clean        # required, имя Hyper-V snapshot к которому revert перед стартом
  fixture: typical-claude-user      # optional, имя fixture папки в tests/fixtures/
  env_vars:                         # optional, env vars передаваемые внутрь VM
    ANTHROPIC_API_KEY: "$env:ANTHROPIC_API_KEY"
```

- **`checkpoint`** (string, required): имя существующего checkpoint VM. Validator проверяет существование `Get-VMSnapshot` при run, не при schema validation.
- **`fixture`** (string, optional): какой fixture копировать в VM. Если указан — copy перед первым step.
- **`env_vars`** (object, optional): map имя→значение. Поддерживается интерполяция через `$env:VARNAME` из host environment. Используется для секретов (API keys).

## `steps[]`

```yaml
steps:
  - name: install dev-pomogator
    cmd: cd C:\test-project; npx dev-pomogator --claude --all
    screenshot: true
    timeout_seconds: 180
    expect_exit: 0
```

- **`name`** (string, required): человекочитаемое имя шага. Используется в логах, отчётах, ссылках из assertions.
- **`cmd`** (string, required): PowerShell команда, выполняемая через `Invoke-Command -VMName claude-test`.
- **`screenshot`** (bool, optional, default false): сделать screenshot после выполнения step через `screenshot.ps1`. Сохраняется в `run_dir/screenshots/step-<N>.png`.
- **`timeout_seconds`** (int, optional, default 60): max время выполнения step. По истечении — kill команда, mark step как failed.
- **`expect_exit`** (int, optional): если указан — step считается failed если exit_code не совпадает. Не дублирует `assertions[type=exit_code]`, но удобно для inline check.

## `assertions[]`

Каждое assertion имеет `type` дискриминатор и набор полей в зависимости от типа.

### `exit_code`

```yaml
- type: exit_code
  step: install dev-pomogator   # имя step из steps[].name
  equals: 0
```

### `file_exists`

```yaml
- type: file_exists
  path: C:\test-project\.dev-pomogator\tools
```

### `file_absent`

```yaml
- type: file_absent
  path: C:\test-project\.dev-pomogator\.user-overrides\.broken
```

### `text_contains`

```yaml
- type: text_contains
  path: C:\test-project\.gitignore
  value: ">>> dev-pomogator (managed"
  encoding: utf-8     # optional, default utf-8
```

### `screenshot_match`

```yaml
- type: screenshot_match
  step: install dev-pomogator   # which step's screenshot
  expect: |
    PowerShell window in foreground.
    Last visible line shows "Installation complete" in green text.
    No red error messages visible.
```

`expect` — это **prose описание** того что AI agent ДОЛЖЕН увидеть на screenshot. Agent читает PNG multimodally, формирует CONFIRMED/DENIED + reason. Это **не pixel-match** — это semantic visual check.

## `post_test`

```yaml
post_test:
  revert: baseline-clean        # required, имя checkpoint к которому revert после assertions
  collect_logs:                 # optional, дополнительные файлы из VM в run_dir
    - C:\test-project\.claude\.activity.log
    - C:\test-project\dev-pomogator-install.log
```

- **`revert`** (string, required): к какому checkpoint вернуть VM после теста. Обычно `baseline-clean`.
- **`collect_logs`** (array of string, optional): пути в VM для копирования в `run_dir/vm-logs/` перед revert. Не делает revert если copy fail.

## Правила валидации

- `id` matches regex pattern `^HV` followed by exactly 3 digits then end-of-string
- `name` matches regex `^[a-z][a-z0-9-]*$` (kebab-case)
- `name` must equal filename suffix: `HV<id>_<name>.yaml`
- Каждый `assertion[type=exit_code]` или `assertion[type=screenshot_match]` ОБЯЗАН ссылаться на существующий `steps[].name` через поле `step`
- `preconditions.checkpoint` не может быть пустой строкой
- `post_test.revert` не может быть пустой строкой
- При наличии хотя бы одного `assertion[type=screenshot_match]` — соответствующий `step` ОБЯЗАН иметь `screenshot: true`
- `tags` уникальны внутри одного scenario
- `steps[].name` уникальны внутри одного scenario
