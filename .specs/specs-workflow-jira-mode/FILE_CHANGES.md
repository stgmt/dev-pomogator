# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> ⚠️ `edit`/`delete` — только для СУЩЕСТВУЮЩИХ на диске путей (audit FILE_CHANGES_VERIFY бьёт HARD ERROR-ом по edit-строке с несуществующим путём). Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `{путь/к/файлу1}` | create | [FR-1](FR.md#fr-1-jirasourcemd-presence-triggers-jirasourcepreserved-tracing-checks-feature100) |
| `{путь/к/файлу2}` | create | [FR-2](FR.md#fr-2-jira-imperative-trace-in-frmd-section-suppresses-the-jirasourcepreserved-warning-for-that-section-feature101) |
| `{путь/к/файлу3}` | create | {причина} |

