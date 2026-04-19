# Non-Functional Requirements (NFR)

## Performance

- **P-1**: Полный запуск Doctor (все 17 checks, worst case при всех extensions installed) SHALL завершиться за ≤ 5 секунд wall-clock. Цель: SessionStart hook не задерживает старт Claude Code.
- **P-2**: Каждый individual check SHALL иметь hard timeout ≤ 3 секунды. Превышение → check помечается ✗ `"check internal timeout"`, общий flow продолжается.
- **P-3**: Checks SHALL запускаться concurrent (Promise.all с bounded concurrency=8), не sequentially. MCP probes — отдельный pool чтобы не блокировать lightweight filesystem checks.
- **P-4**: Global Doctor timeout SHALL be ≤ 15 секунд; превышение → abort всех child processes (включая MCP probe spawns) через AbortController + SIGKILL, exit с кодом 2 и report `"Doctor timeout"`.
- **P-5**: Cold start overhead (import runner + reporter + all checks) SHALL быть < 500ms на Node 22.6+ (via `--experimental-strip-types`, без tsx transpile cost).

## Security

- **S-1**: Doctor SHALL NEVER логировать **values** env vars (API keys, tokens) — ни в chalk output, ни в `--json`, ни в log files (`~/.dev-pomogator/logs/doctor.log`). Только `{name, status: "set"|"unset"}`.
- **S-2**: JSON output mode SHALL redact env var values (FR-25). Specifically: если check type == `env-requirement`, field `value` SHALL be absent, только `status` поле.
- **S-3**: Reinstall spawn SHALL использовать `spawn('npx', ['dev-pomogator'], { stdio: 'inherit', shell: false })` — no shell interpretation input аргументов (защита от command injection).
- **S-4**: Path validation: все paths из `config.json`, `extension.json`, user input SHALL проходить через `resolveWithinProject` (rule `no-unvalidated-manifest-paths`) перед любыми fs операциями.
- **S-5**: MCP probe input SHALL быть контролирован: только server configs из parsed `.mcp.json` / `~/.claude/mcp.json`, не произвольные command strings от пользователя.
- **S-6**: `.env` fixtures в тестах SHALL содержать только fake placeholder values (`sk-test-fake-key`, `test-token-xxx`), никаких реальных credentials.

## Reliability

- **R-1**: Каждый check SHALL быть fail-soft: exception в check impl не должен обрушить весь Doctor run. Caught exception → check помечается ✗ `"internal error: <message>"`, остальные checks продолжают.
- **R-2**: SessionStart hook SHALL НИКОГДА не блокировать session start. Любая error в doctor-hook → stdout `{"continue":true,"suppressOutput":true}` и silent log в `~/.dev-pomogator/logs/doctor.log`.
- **R-3**: STOP-точка `ConfirmStop <phase>` SHALL быть atomic: write через temp file + rename (rule `atomic-config-save`). Прерывание mid-write не должно оставить `.progress.json` в corrupt состоянии.
- **R-4**: 2 concurrent Doctor runs (race condition) SHALL быть defended: acquire lock через `fs.writeFile(lockFile, pid, { flag: 'wx' })` (rule `atomic-update-lock`). Lock timeout 30s; stale lock removal если PID не живой.
- **R-5**: MCP probe child processes SHALL быть killed через SIGKILL at timeout (не SIGTERM) чтобы гарантировать exit даже если сервер ignore signals. Cleanup SHALL происходить в `finally` блоке.
- **R-6**: Doctor SHALL обрабатывать partial filesystem state: `~/.dev-pomogator/config.json` существует но corrupt JSON → critical `"config.json invalid: <parse error>"` + reinstallable=yes.

## Usability

- **U-1**: Каждый check с severity != ok SHALL иметь actionable `hint` field — конкретную команду или action (`"Run 'npm install'"`, `"Add AUTO_COMMIT_API_KEY to .env line 3"`). Запрещено `hint: "Fix the problem"` без конкретики.
- **U-2**: Chalk colors: ✓ green (ok), ⚠ yellow (warning), ✗ red (critical). Traffic-light group headers: 🟢 green emoji, 🟡 yellow emoji, 🔴 red emoji.
- **U-3**: SHALL respect `NO_COLOR` env var (стандарт https://no-color.org) — disable chalk при `process.env.NO_COLOR` defined.
- **U-4**: Exit codes SHALL follow convention POSIX: 0=success, 1=warnings, 2=critical — для предсказуемости в shell scripts и CI.
- **U-5**: Traffic-light output grouping обязательна в interactive mode (FR-20), но optional в `--json` (там просто `group: "self-sufficient"|"needs-env"|"needs-external"` field в CheckResult).
- **U-6**: Reinstall prompt (AskUserQuestion) SHALL чётко указать что именно будет fixed: `"Found 3 problem(s) that can be fixed by reinstall: missing tools (2), stale hooks (1). Run 'npx dev-pomogator' now?"` — не generic сообщение.
- **U-7**: SessionStart banner (`additionalContext`) SHALL быть кратким (≤ 100 символов): `"⚠ pomogator-doctor: 2 critical (1 reinstallable), run /pomogator-doctor"` — не полный отчёт.
