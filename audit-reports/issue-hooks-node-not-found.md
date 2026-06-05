# [ISSUE DRAFT] Все хуки молча падают на машинах без Node.js — `node: command not found`

> Заготовка для GitHub issue. Создать через `gh issue create --title "..." --body-file audit-reports/issue-hooks-node-not-found.md` когда появится `gh`, либо вручную на github.com/stgmt/dev-pomogator/issues.

## Симптом

При старте сессии Claude Code (v2.1.165, Windows 11):

```
SessionStart:startup hook error
Failed with non-blocking status code:
/usr/bin/bash: line 1: node: command not found
```

×4 (по числу SessionStart-хуков). Аналогично НЕ работают **все остальные** хуки: Stop (auto-commit, simplify, dedup и т.д.), PreToolUse (plan-gate, build_guard, test_guard), UserPromptSubmit, PostToolUse — всего ~20 деклараций в `.claude/settings.json`.

## Анализ (evidence, сессия 2026-06-05)

1. **Каждая hook-команда начинается с `node -e "require(...bootstrap.cjs)"`** — `.claude/settings.json:17` и далее (все entrypoint-ы одинаковы).
2. **Node.js на машине не установлен вообще**:
   - `which node npm npx bun tsx` в Git Bash → ничего;
   - `Get-Command node,npm,bun` в PowerShell → пусто;
   - `Test-Path "C:\Program Files\nodejs"` → `False`;
   - `scoop list` → только 7zip + git; нет volta/nvm/fnm/bun.
3. **Claude Code при этом работает** — это нативный бинарник (`~/.local/bin/claude.exe`), Node ему не нужен. Поэтому пользователь может полноценно жить без Node и даже не догадываться, что вся hook-инфраструктура dev-pomogator мертва.
4. **Multi-strategy fallback в `tools/_shared/bootstrap.cjs` (Node native strip-types → tsx → npx) не помогает** — он не успевает стартовать: сам entrypoint хука — `node`, его нет → bash падает на line 1.

## Корневая причина

Дизайн-предположение «node есть в PATH» зашито в entrypoint каждого хука. Fail-soft-логика живёт *внутри* bootstrap.cjs, но точка входа — снаружи неё.

## Немедленный фикс для этой машины (вне репы)

Установить Node ≥22.6: `scoop install nodejs-lts` (или winget/официальный msi), перезапустить Claude Code.

## Варианты системного фикса в репе

1. **Doctor/SessionStart pre-check без node**: обернуть hook-команды в bash-шим (`tools/_shared/hook-entry.sh`), который сам ищет node (`PATH`, `C:\Program Files\nodejs`, scoop shims, volta, nvm, bun как замена) и при отсутствии печатает один внятный actionable-месседж («dev-pomogator hooks требуют Node.js ≥22.6 — установи: scoop install nodejs-lts») вместо 20 × `command not found`.
2. **Резолв node в шиме**: тот же шим может найти node вне PATH (типичный случай: установлен в Windows PATH, но Git Bash запущен с урезанным окружением) и вызвать его по абсолютному пути — тогда хуки оживут без участия пользователя.
3. **pomogator-doctor**: проверка «node доступен из bash-окружения хуков» (именно из bash, не из PowerShell — окружения различаются) уже частично есть в 17 checks — убедиться, что она ловит этот кейс и подсказывает фикс.
4. **Install-time гейт**: `install.ps1`/`install.sh` и canonical plugin install — проверять node до записи hooks.json, иначе предупреждать.

## Статус по итогам сессии 2026-06-05 (та же сессия, после установки Node)

Установлен Node 24.16.0 (`scoop install nodejs-lts` + `scoop shim add node/npm/npx`), выполнен `npm install`. Это вскрыло ещё **два бага в tsx-runner** (оба починены в этой сессии) и один открытый gap:

1. **[FIXED]** `--experimental-default-type=module` удалён в Node 23+ → Strategy 0 падала с «bad option» (exit 9) на любом современном Node. Фикс: флаг добавляется только на Node 22.x (`tools/_shared/tsx-runner.js:runNodeNativeTs`).
2. **[FIXED]** Fall-through на tsx никогда не срабатывал: Strategy 0 шла с `stdio: 'inherit'`, поэтому текст ошибки (SyntaxError / ERR_MODULE_NOT_FOUND / bad option) не попадал в `err.stderr`, и `isResolverError()` возвращал false → жёсткий fail вместо фолбэка. Фикс: stderr теперь `pipe` + re-emit, `'bad option'` добавлен в `RESOLVER_ERROR_TOKENS`.
3. **[FIXED]** `tools/test-statusline/package.json` содержал `{"type": "commonjs"}` → на Node 23+ (где override-флага больше нет) `.ts` файлы рядом трактовались как CJS и падали на `import`. Заменено на `"module"` (в папке только `.ts` ESM + `.cjs`, которому поле не нужно).
4. **[OPEN]** `npm run lint` = `eslint .claude tools`, но eslint НЕ в devDependencies и конфига (`eslint.config.*`) в репе нет — lint сломан на любой чистой машине. Требует отдельного решения: добавить eslint+конфиг в репо или убрать script.

Верификация: все 4 SessionStart + все 8 Stop хуков прогнаны вручную через реальный `node -e "require(bootstrap.cjs)"` entrypoint — exit 0, `~/.dev-pomogator/logs/tsx-runner.log` показывает `OK strategies=0:native` ~110-330ms.

## Acceptance criteria (черновик)

- На машине без Node хуки выдают ОДНО понятное сообщение с инструкцией установки, а не N × `node: command not found`.
- На машине, где node есть в Windows PATH, но не в Git Bash PATH, хуки работают (резолв по известным путям).
- pomogator-doctor детектит кейс «node отсутствует/не виден из bash» как 🔴 с fix action.
