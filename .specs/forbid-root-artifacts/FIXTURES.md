# Fixtures

## Overview

BDD-сценарии этой фичи (`forbid-root-artifacts.feature`, @feature1–4) прогоняют
РЕАЛЬНЫЕ `check.py` / `configure.py` в изолированном временном git-репозитории.
Поэтому фикстуры — это: чистый tmp-репо с установленным деревом плагина, варианты
`.root-artifacts.yaml` (инлайн-докстринги в сценариях), подкладываемые в корень
файлы/директории под тест, поддельный `claude`-бинарь в `PATH` (для LLM-ветки без
реальной подписки) и seed кэша классификатора. Никаких mock'ов производственного
кода — только реальные входные артефакты.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Изолированный tmp git-репо | factory | `$TMP/<scenario>/` | per-scenario | Background hook (`git init`) |
| F-2 | Дерево плагина в репо | snapshot | `.dev-pomogator/tools/forbid-root-artifacts/` | per-scenario | Background hook (copy `tools/forbid-root-artifacts/`) |
| F-3 | `.root-artifacts.yaml` под тест | static | `<repo>/.root-artifacts.yaml` | per-scenario | инлайн-докстринг сценария |
| F-4 | Файлы/директории в корне | factory | `<repo>/<name>` | per-scenario | шаги `And file/directory "X" exists` |
| F-5 | Поддельный `claude` бинарь | factory | `$PATH/claude` (shim) | per-scenario | шаг `Given fake "claude" binary ...` |
| F-6 | Seed кэша классификатора | seed | `<repo>/.dev-pomogator/.classifier-cache.json` | per-scenario | шаг `Given .classifier-cache.json contains` |

## Fixture Details

### F-1: Изолированный tmp git-репозиторий

- **Type:** factory
- **Format:** filesystem (git repo)
- **Setup:** `git init` во временной директории (per-scenario), CWD переключается туда.
- **Teardown:** удаление tmp-директории после сценария.
- **Dependencies:** none
- **Used by:** все 29 сценариев (Background).
- **Assumptions:** `git` в `PATH`; запись во временную FS.

### F-2: Дерево плагина в репо

- **Type:** snapshot
- **Format:** Python-файлы + yaml
- **Setup:** копирование `tools/forbid-root-artifacts/` → `<repo>/.dev-pomogator/tools/forbid-root-artifacts/` (`check.py`, `configure.py`, `_classifier.py`, `default-whitelist.yaml`).
- **Teardown:** уходит вместе с F-1.
- **Dependencies:** F-1
- **Used by:** все сценарии; специально мутируется в CLASS_02 (патч `default-whitelist.yaml`) и CLASS_03 (удаление `_classifier.py`).
- **Assumptions:** Python 3.8+ + `pyyaml` доступны раннеру.

### F-3: `.root-artifacts.yaml` под тест

- **Type:** static (инлайн)
- **Format:** YAML
- **Setup:** записывается из докстринга сценария (режимы `extend`/`replace`, `auto_prune`, `classifier`, `trash_patterns`, кастомный header).
- **Teardown:** уходит вместе с F-1. NB: сценарии AUTOPRUNE_* проверяют, что `check.py` ПЕРЕзаписал этот файл — фикстура намеренно мутабельна.
- **Dependencies:** F-1
- **Used by:** EXTEND_*, REPLACE_*, IGNORE_*, DIR_*, все AUTOPRUNE_*, TRASH_*, LLM_*, CLASS_02.
- **Assumptions:** отсутствие файла = дефолтный whitelist (BASE_* сценарии).

### F-4: Файлы/директории в корне под тест

- **Type:** factory
- **Format:** пустые файлы / директории
- **Setup:** `touch`/`mkdir` по шагам (`random.txt`, `README.md`, `.gitignore`, `MyProject.sln`, `.progress.json`, `foo.testsettings`, `weird.unknownext`, …).
- **Teardown:** уходит вместе с F-1.
- **Dependencies:** F-1
- **Used by:** практически все сценарии (объект проверки whitelist/классификации).
- **Assumptions:** имя файла — basename без traversal (кроме AUTOPRUNE_03, который проверяет отклонение `../escape.txt`).

### F-5: Поддельный `claude` бинарь

- **Type:** factory
- **Format:** исполняемый shell/py-shim в начале `PATH`
- **Setup:** shim, печатающий фиксированный JSON (`{"result":"trash"}`) и/или логирующий вызовы; в LLM_02 — намеренно ОТСУТСТВУЕТ (проверка fallback).
- **Teardown:** восстановление `PATH`; удаление shim.
- **Dependencies:** F-1, F-2
- **Used by:** LLM_01 (invoked once), LLM_02 (absent → fallback), LLM_03 (cache hit → NOT invoked).
- **Assumptions:** классификатор ищет `claude` через `shutil.which` — shim перехватывается по `PATH`.

### F-6: Seed кэша классификатора

- **Type:** seed
- **Format:** JSON (`{schema_version, entries:{name:{result,ts}}}`)
- **Setup:** предзаписанный `.dev-pomogator/.classifier-cache.json` с валидной (не истёкшей) записью.
- **Teardown:** уходит вместе с F-1.
- **Dependencies:** F-1, F-2
- **Used by:** LLM_03 (cache hit подавляет subprocess-вызов).
- **Assumptions:** `ts` в будущем/в пределах TTL, чтобы запись считалась свежей.

## Dependencies Graph

```
F-1 (tmp repo)
 └─ F-2 (plugin tree)
     ├─ F-3 (.root-artifacts.yaml)
     ├─ F-4 (root files/dirs)
     ├─ F-5 (fake claude)  ← LLM ветка
     └─ F-6 (classifier cache seed)  ← LLM_03
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | AUTOPRUNE_* (7) | F-1, F-2, F-3, F-4 | none |
| @feature2 | TRASH_* + TRASH_BLOCK (4) | F-1, F-2, F-3, F-4 | none |
| @feature3 | LLM_01/02/03 (3) | F-1, F-2, F-3, F-4, F-5, F-6 | none |
| @feature4 | STRUCT/BASE/EXTEND/REPLACE/IGNORE/DIR/CLASS (15) | F-1, F-2, F-3, F-4 | none |

## Notes

- Cleanup — per-scenario через F-1 teardown (весь tmp-репо удаляется), отдельной
  очистки не требуется.
- F-3 и F-2 намеренно мутабельны (auto-prune переписывает yaml; CLASS_02/03 патчат
  дерево плагина) — сравнение mtime/содержимого ПОСЛЕ запуска и есть предмет проверки.
- F-5 не требует реальной подписки Claude: LLM-ветка тестируется детерминированным
  shim'ом, что делает @feature3 воспроизводимым в CI без секретов.
