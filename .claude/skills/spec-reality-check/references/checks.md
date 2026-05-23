# Six checks reference

Each check emits `AuditFinding` shape: `{check, category, severity, message, details, file?, line?}` (interface imported from `extensions/specs-workflow/tools/specs-validator/audit-checks.ts:14`).

## FC_CREATE_EXISTS

- **Severity:** ERROR
- **Category:** FILE_CHANGES_VERIFY
- **Trigger:** FILE_CHANGES.md row `action=create` пути уже существует в репозитории
- **Root cause:** Спека stale — описывает плановое создание файла который уже был создан в каком-то другом коммите (или путь скопирован из template без актуализации)
- **Fix recipe:** Изменить action на `edit` если файл должен модифицироваться, или удалить row если фича уже shipped и спека обсуждает done work

## FC_EDIT_MISSING

- **Severity:** ERROR
- **Category:** FILE_CHANGES_VERIFY
- **Trigger:** FILE_CHANGES.md row `action=edit` на несуществующий путь
- **Root cause:** Путь устарел (переименован/удалён в коде, не обновлено в спеке) или typo
- **Fix recipe:** Найти текущий путь через git log / grep; обновить row в FILE_CHANGES; если файл больше не существует и не должен — удалить row

## FC_DELETE_MISSING

- **Severity:** ERROR
- **Category:** FILE_CHANGES_VERIFY
- **Trigger:** FILE_CHANGES.md row `action=delete` на несуществующий путь
- **Root cause:** Файл уже удалён в предыдущем коммите — спека описывает работу которая уже завершена
- **Fix recipe:** Удалить row из FILE_CHANGES; зарегистрировать в CHANGELOG как done work

## NARRATIVE_PATH_MISSING

- **Severity:** WARNING
- **Category:** LOGIC_GAPS
- **Trigger:** Inline backtick path в FR.md / DESIGN.md / TASKS.md (расширение `.ts` / `.js` / `.py` / `.json` / `.md` / etc) на несуществующий файл
- **Root cause:** Narrative описание ссылается на устаревший / переименованный / never-shipped файл
- **Fix recipe:** Найти актуальный path и обновить; если path был historical reference (объясняет почему делали так) — пометить `[historical: ...]` чтобы skill пропускал

## CODE_DRIFT_FR_ALREADY_DONE

- **Severity:** WARNING
- **Category:** LOGIC_GAPS
- **Trigger:** `git log --max-count=20 -S "FR-N"` per FR ID возвращает ≥1 commit для путей из FILE_CHANGES
- **Root cause:** Фича уже была реализована раньше; спека планирует её снова (re-planning shipped work)
- **Fix recipe:** Проверить шипнутое — если уже сделано, перевести спеку в done status, обновить CHANGELOG; если frontmatter spec mentioned FR-N но code already mentions it, спека stale relative to code
- **Skip rule:** Graceful skip с INFO finding "git unavailable" если `.git/` отсутствует (Docker test env per `docker-no-git-repo` rule)

## TASKS_FC_CONSISTENCY

- **Severity:** WARNING (orphan TASK), INFO (orphan FC)
- **Category:** INCONSISTENCY
- **Trigger:** Файл упомянут в TASKS.md `**files:**` block но не в FILE_CHANGES table (orphan TASK), OR файл в FILE_CHANGES но не в TASKS (orphan FC)
- **Root cause:** TASKS добавлен / переименован отдельно от FILE_CHANGES; рассинхронизация artifacts
- **Fix recipe:** Synchronize obe sources of truth; обычно FILE_CHANGES — primary, TASKS — operational view
- **Skip rule:** Paths помеченные `[OUT_OF_SCOPE: ...]` или `~~strikethrough~~` пропускаются

## Output formatting

| Format | Use case | Example |
|--------|----------|---------|
| `--format json` | CI / hook consumption | `{"findings": [...], "summary": {...}}` |
| `--format human` | Interactive read | ANSI-colored (chalk): red=ERROR / yellow=WARNING / blue=INFO, with file:line clickable refs |
| `--format markdown` | Commit-able reports | Markdown table: Check / Severity / File / Message / Suggested fix |

## Exit codes

- `0` — always (findings != error). Hook downstream checks `findings[].severity === 'ERROR'` для deny logic.
- `1` — only on unparseable CLI args or IO error (spec dir not found).
