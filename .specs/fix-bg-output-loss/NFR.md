# Non-Functional Requirements (NFR)

## Performance

- Patch добавляет один дополнительный процесс `tee` в pipeline. Overhead: один syscall write на каждую строку output. Для типичного vitest прогона (~1000-5000 строк) — negligible (<100ms cumulative).
- Disk footprint: typical log 50-500 KB (vitest compact reporter). Никакой rotation не требуется в scope этой фичи — user может вручную `rm .dev-pomogator/.docker-status/test-run-*.log` старше X.

## Security

- Log файл содержит stdout тестов — **возможно** наличие environment variable values если тесты их printят. Директория `.dev-pomogator/` уже gitignored (managed), риск leak в commit минимизирован.
- Log path использует `$(date +%s)` (epoch seconds), не username/shell expansion — нет инъекции через SESSION или окружение.
- `tee` — POSIX стандарт, присутствует в Git-Bash, Alpine, Ubuntu, Debian Docker images. Нет зависимости от нестандартных утилит.

## Reliability

- Tee MUST NOT break exit code propagation: `set -o pipefail` остаётся в `docker-test.sh:6`, первый non-zero exit в pipeline сохраняется в `$?`.
- `mkdir -p` idempotent — re-runs скрипта не fail при existing dir.
- Если запись в log fails (full disk, readonly mount) — `tee` exits non-zero → `pipefail` триггерит fail docker-test.sh early. Это желаемое поведение (fail-fast над silent data loss).

## Usability

- AI-агент должен увидеть правило `no-blocking-on-tests.md` с anti-pattern section до того как напишет bg команду. Rule уже в always-apply категории в CLAUDE.md → загружается в каждой сессии.
- Log путь пишется в первую строку stdout скрипта: `[docker-test] Log: .dev-pomogator/.docker-status/test-run-1745000000.log` — user/AI сразу видит где искать после окончания прогона.
- Нет изменений в invocation interface: `bash scripts/docker-test.sh <vitest-args>` работает как раньше. Zero breaking changes для existing callers (`/run-tests`, CI).
