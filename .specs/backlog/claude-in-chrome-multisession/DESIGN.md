# Design

## Реализуемые требования

- [FR-1..FR-10](REQUIREMENTS.md#functional-requirements)

## Компоненты

- **Extension manifest** (`extension.json`) — source of truth.
- **Hook script** (`cims-guard.ts`) — Pre+PostToolUse logic в одном файле.
- **CLI helper** (`claim-tab.mjs`) — Node ESM, self-contained.
- **Skill** (`SKILL.md`).
- **State directory** (`~/.dev-pomogator/cdmm-sessions/<sid>/owned-tabs.json`).
- **Event log** (`~/.dev-pomogator/logs/cims-guard.log`).
- **Installer integration** — **NO new code**; existing `src/installer/extensions.ts` + `src/installer/settings-local.ts`.

## Где лежит реализация

- App: `extensions/claude-in-chrome-multisession/tools/claude-in-chrome-multisession/{cims-guard.ts, claim-tab.mjs}`
- Skill: `.claude/skills/claude-in-chrome-multisession/SKILL.md`
- Tests: `tests/e2e/claude-in-chrome-multisession-{guard,claim,skill,installer}.test.ts`
- Wiring: existing (no edits)
- Runtime state: `~/.dev-pomogator/cdmm-sessions/`, `~/.dev-pomogator/logs/cims-guard.log`

## Директории и файлы

```
extensions/claude-in-chrome-multisession/
  extension.json
  README.md
  CHANGELOG.md
  tools/claude-in-chrome-multisession/
    cims-guard.ts
    claim-tab.mjs
    README.md

.claude/skills/claude-in-chrome-multisession/
  SKILL.md

tests/e2e/
  claude-in-chrome-multisession-helpers.ts
  claude-in-chrome-multisession-guard.test.ts
  claude-in-chrome-multisession-claim.test.ts
  claude-in-chrome-multisession-skill.test.ts
  claude-in-chrome-multisession-installer.test.ts
```

## Алгоритм cims-guard.ts (FR-2/3/6/7/8)

```
main:
  Read all stdin → JSON.parse (catch → log parse_error → exit 0)
  Validate {session_id, tool_name, hook_event_name}; tool_name MUST start с "mcp__claude-in-chrome__"
  Branch on hook_event_name:
    PostToolUse + tabs_create_mcp:
      extract newTabId from tool_response via regex
      adopt(sessionId, newTabId) → log recorded_tab → exit 0
    PreToolUse:
      tabId = Number(tool_input?.tabId)
      if null/NaN → log allow_no_tabid → exit 0
      if myAllowlist.includes(tabId) → update lastUsedAt → log allow_owned → exit 0
      otherOwner = findOtherOwner(tabId)
      if otherOwner: log deny_other_session → write deny payload → exit 2
      else (orphan): adopt(sessionId, tabId) → log allow_adopted_orphan → exit 0
    other → exit 0

adopt(sid, tabId):
  cur = readOwned(sid) ?? new
  if !tabIds.includes(tabId): push
  lastUsedAt = now
  writeOwned(cur) — atomic temp+rename

deny(reason):
  stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason:reason}}))
  exit(2)
```

## Алгоритм claim-tab.mjs (FR-5)

```
parse argv: {add, release, list, clean, reset} + optional <tabId> + optional --session
switch:
  list: read all dirs → JSON output
  clean: rm dirs где Date.now() - lastUsedAt > 24h
  reset: rm STATE_ROOT
  add: validate sid + tabId; adopt
  release: remove tabId from sid allowlist
```

## Алгоритм install (FR-9)

```
1. Parse extension.json
2. Copy tools/* → .dev-pomogator/tools/
3. Copy SKILL.md → .claude/skills/
4. Parse extension.json.hooks.claude → writeHooksToSettingsLocal smart-merge
5. Record managed paths в config.json
```

## API

### `cims-guard.ts` contract

- **stdin:** Claude Code hook protocol JSON.
- **stdout (DENY):** `{hookSpecificOutput: {hookEventName, permissionDecision: "deny", permissionDecisionReason}}` + exit 2.
- **stdout (ALLOW):** empty + exit 0.

### `claim-tab.mjs` CLI

- **stdout:** JSON only.
- **stderr:** `[claim-tab] error:` для errors.
- **Exit codes:** 0 success, 2 user error.

### State file shape

```json
{
  "sessionId": "<sid>",
  "tabIds": [<numbers>],
  "createdAt": "<ISO>",
  "lastUsedAt": "<ISO>"
}
```

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_FORMAT:** BDD

**Framework:** vitest 4.1.0 + custom 1:1 .feature mapping per `extension-test-quality` rule. Convention: `tests/features/plugins/EXT/DOMAIN_EXT.feature` aligned 1:1 c `tests/e2e/EXT-*.test.ts` где `EXT = claude-in-chrome-multisession`, `DOMAIN = PLUGIN018`.

**Install Command:** already installed (vitest^4.1.0)

**Classification:** TEST_DATA_ACTIVE

**TEST_DATA:** TEST_DATA_ACTIVE

**Evidence:**
1. **Создаёт/изменяет данные?** ДА — тесты пишут `~/.dev-pomogator/cdmm-sessions/<sid>/owned-tabs.json` через synthetic stdin.
2. **Изменяет состояние, требующее rollback?** ДА — каждый тест использует isolated fake `HOME`.
3. **BDD сценарии требуют предустановленных данных?** ДА — DENY cross-session test требует pre-existing OTHER session's allowlist.
4. **Внешние сервисы требуют mock?** НЕТ для guard/claim/skill (synthetic stdin); installer test runs реальный `runInstaller`.

**Verdict:** TEST_DATA_ACTIVE — нужны fixtures + cleanup hooks.

### Существующие hooks

| Hook файл | Тип | Что делает | Можно переиспользовать? |
|-----------|-----|------------|------------------------|
| `tests/e2e/helpers.ts` | shared helper | `runInstaller()` + tmpdir | **Да** для AC-9 |
| `tests/e2e/chrome-devtools-mcp-mux-helpers.ts` | shared helper | tmpdir + cleanup pattern | **Pattern reused** |

### Новые hooks

| Hook файл | Тип | Что делает | По аналогии с |
|-----------|-----|------------|---------------|
| `tests/e2e/claude-in-chrome-multisession-helpers.ts` | local helper | makeFakeHome, runHookSync, runClaimTabSync | `chrome-devtools-mcp-mux-helpers.ts` |
| AfterEach в каждом *.test.ts | vitest `afterEach` | rm fakeHome | Existing pattern |

### Cleanup Strategy

- Каждый test creates own `os.tmpdir()/dev-pomogator-cims-XXXXX/` через `mkdtempSync`.
- Override `HOME` and `USERPROFILE` env vars.
- AfterEach: `fs.rmSync(fakeHome, {recursive, force})`.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Synthetic stdin payloads | inline | Generated per-scenario | per-test |
| Pre-populated owned-tabs.json | inline | Setup для cross-session DENY | per-test |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `fakeHome` | string | beforeEach | test body, env override | Isolated HOME |

## Key Decisions

### KD-1: Two layers (skill + hook), not skill-only

**Decision:** реализовать AND skill (soft) AND hook (hard).

**Rationale:** skill alone — soft contract, зависит от LLM discipline. Hook — hard enforcement. Defense-in-depth.

**Trade-off:** ~50-150ms latency per browser hook fire. Acceptable.

**Alternatives:**
- (a) Skill-only — rejected: cross-session safety regresses to "AI politely cooperates".
- (b) Hook-only — rejected: constant DENYs без proactive guidance frustrating UX.

### KD-2: First-touch ownership for orphans

**Decision:** unknown tabId auto-claim'ится в текущую сессию.

**Rationale:** bootstrap-friendly. User open'aет tab вручную → Claude может с ним работать.

**Alternatives:**
- (a) DENY all unknown — bootstrap UX broken.
- (b) Allow без auto-claim — no enforcement.

### KD-3: Per-session state directory

**Decision:** `~/.dev-pomogator/cdmm-sessions/<sid>/owned-tabs.json`.

**Rationale:** atomic writes per session don't contend.

**Alternatives:**
- (a) Shared single file — lock contention.
- (b) SQLite — dependency overhead.

### KD-4: `tabs_context_mcp` not gated

**Decision:** ALLOW все calls к read-only discovery tool.

**Rationale:** Claude Code hook API не supports response rewriting. Skill instructs Claude mentally filter; hook backs up via DENY на write ops.

**Alternatives:**
- (a) Modify response в PostToolUse — not supported.
- (b) Replace tool с custom — requires extension fork.
