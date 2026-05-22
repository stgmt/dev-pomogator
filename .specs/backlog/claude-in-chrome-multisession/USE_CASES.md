# Use Cases

## UC-1: Two parallel Claude Code sessions, hook isolates tabs (happy path) @feature1 @feature2

Developer держит две Claude Code сессии в split-screen.

- **Session A** (`session_id=4b29794f-...`): user пишет "open pikabu". Skill срабатывает; Claude вызывает `tabs_create_mcp()` → возвращается `tabId=311065826`. PostToolUse hook записывает в `~/.dev-pomogator/cdmm-sessions/4b29794f-.../owned-tabs.json`. Claude вызывает `navigate({tabId:311065826, url:"https://pikabu.ru"})` → PreToolUse hook ALLOW.
- **Session B** (`session_id=d33af3c6-...`): user пишет "open habr". Claude вызывает `tabs_create_mcp()` → `tabId=311066071`. PostToolUse записывает в session B. Claude вызывает `navigate({tabId:311066071, url:"https://habr.com"})` → ALLOW.
- Если Session B по ошибке вызовет `navigate({tabId:311065826})` (pikabu) → PreToolUse hook **DENY**: `tabId=311065826 owned by another Claude Code session (4b29794f-...)`.

Результат: 0 collisions, 2 isolated tab sets, real Edge profile sharing (cookies/extensions работают потому что используется Anthropic native messaging IPC, не CDP debug port).

Покрывает: US-1, US-2.

## UC-2: First-time install via dev-pomogator installer @feature3 @feature4

End user впервые ставит:

```bash
npx dev-pomogator --plugins claude-in-chrome-multisession
```

Installer:
- Копирует `tools/.../{cims-guard.ts, claim-tab.mjs, README.md}` в `<targetProject>/.dev-pomogator/tools/claude-in-chrome-multisession/`.
- Копирует `SKILL.md` в `<targetProject>/.claude/skills/claude-in-chrome-multisession/`.
- Парсит `extension.json.hooks.claude.{PreToolUse, PostToolUse}` и **добавляет в `<targetProject>/.claude/settings.local.json`** entries (matcher `mcp__claude-in-chrome__.*`) через smart-merge.
- Записывает managed paths + hook commands в `~/.dev-pomogator/config.json`.

После рестарта Claude Code: skill в session skills list, hook fires на `mcp__claude-in-chrome__*`, state directory создаётся при первой активности.

Покрывает: US-3, US-4.

## UC-3: Manual claim of user-opened tab @feature5

Developer вручную открыл `https://github.com/myrepo/dashboard` в Edge. Хочет чтобы текущая Claude сессия могла читать с этого tab.

- User: "посмотри console на моём GitHub dashboard tab".
- Claude вызывает `tabs_context_mcp` → находит `tabId=311070000` для GitHub URL.
- Claude: `node .dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs add 311070000`.
- Helper records 311070000 в session allowlist.
- Claude вызывает `read_page({tabId:311070000})` → ALLOW.

Покрывает: US-5.

## UC-4: TTL cleanup of stale sessions @feature6

Developer открывал Claude Code много раз. `~/.dev-pomogator/cdmm-sessions/` накопил 50+ dirs с tabIds которых уже нет в браузере.

- User: `node .dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs clean`
- Helper читает каждый `<sid>/owned-tabs.json`, проверяет `lastUsedAt`, удаляет dir если `Date.now() - lastUsedAt > 24h`.
- Output JSON: `{removed: [{sessionId, ageHours}, ...], count: N}`.

Покрывает: US-6.

## UC-5: Single-session bootstrap (orphan auto-claim) @feature7

Developer ставит фичу, **уже** имея открытый Edge с pre-existing tab.

- User: "посмотри console на habr".
- Claude вызывает `tabs_context_mcp` → видит habr `tabId=311050000`.
- Claude вызывает `read_page({tabId:311050000})` напрямую.
- PreToolUse hook: 311050000 не в моей allowlist; `findOtherOwner` returns null. → **AUTO-CLAIM** orphan, append в текущую session. Log event `allow_adopted_orphan`. Tool ALLOW.
- Subsequent calls на этот tab — ALLOW (теперь owned).

Покрывает: US-7.

## UC-6: Hook event log debugging @feature8

```bash
tail -50 ~/.dev-pomogator/logs/cims-guard.log | jq .
```

Output:
```json
{"ts":"...","event":"recorded_tab","sessionId":"4b29794f-...","newTabId":311065826}
{"ts":"...","event":"allow_owned","sessionId":"4b29794f-...","tabId":311065826}
{"ts":"...","event":"deny_other_session","sessionId":"d33af3c6-...","tabId":311065826,"otherOwner":"4b29794f-..."}
```

Покрывает: US-8.

## UC-7: Hook fails open on malformed input @feature9

Hook получил malformed JSON (Anthropic изменил schema, или corrupted IPC).
- Hook: catch block → `logEvent({event:"parse_error", rawLength})` → `process.exit(0)`.
- Tool call продолжает выполняться без block'а. Multi-session safety degrades; workflow не прерывается.

Покрывает: US-9.

## UC-8: Sunset когда Anthropic зашипит native fix @feature10

Через N месяцев Anthropic релизнул per-Claude-session tab groups (Issue #20100).
- Maintainer: bump `extension.json.stability` до `"legacy"`, deprecation notice в README.
- Через несколько релизов: full uninstall path.

Покрывает: US-10.
