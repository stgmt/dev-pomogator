# Design

## Реализуемые требования

- [FR-1: Skill workflow — mechanical reach analysis per variant](FR.md#fr-1-skill-workflow--mechanical-reach-analysis-per-variant)
- [FR-2: PreToolUse hook — block commit without fresh verification](FR.md#fr-2-pretooluse-hook--block-commit-without-fresh-verification)
- [FR-3: Escape hatch with audit trail](FR.md#fr-3-escape-hatch-with-audit-trail)
- [FR-4: Docs/test dampening — anti-over-application](FR.md#fr-4-docstest-dampening--anti-over-application)
- [FR-5: Marker invalidation — diff-hash pin + TTL](FR.md#fr-5-marker-invalidation--diff-hash-pin--ttl)
- [FR-6: Weighted suspicionScore heuristic](FR.md#fr-6-weighted-suspicionscore-heuristic)
- [FR-7: Fail-loud on unreachable variant](FR.md#fr-7-fail-loud-on-unreachable-variant--explicit-counter-h3)
- [FR-8: Skill frontmatter — disable-model-invocation pattern](FR.md#fr-8-skill-frontmatter--disable-model-invocation-pattern)
- [FR-9: Integration with dev-pomogator extension system](FR.md#fr-9-integration-with-dev-pomogator-extension-system)

## Архитектура (text diagram)

```
┌──────────────────────────────────────────────────────────────┐
│  User types /verify-generic-scope-fix (explicit invocation)  │
│                                                              │
│   SKILL.md workflow (disable-model-invocation: true):        │
│   1. Bash: git diff --cached  →  unifiedDiff                 │
│   2. parseAddedVariants(unifiedDiff)                         │
│      → [{file, kind, name, lineNumber}]                      │
│   3. For each variant:                                       │
│      Grep:  Start<Name>Modal|<Name>Form|New<Name>            │
│      Grep:  call sites of gate function                      │
│      Grep:  read-only flags, auto-generated values           │
│      Classify reach ∈ {traced, unreachable, conditional}     │
│   4. If ANY variant = unreachable → should_ship: false       │
│      Output: "DO NOT SHIP — variant X structurally no-op"    │
│   5. Write {cwd}/.claude/.scope-verified/<sid>-<sha>.json    │
└──────────────────────────────────────────────────────────────┘
                           │ marker on disk (atomic write)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Claude Code invokes Bash("git commit -m …")                 │
│                                                              │
│   PreToolUse hook (matcher: "Bash") fires:                   │
│   scope-gate-guard.ts reads stdin JSON:                      │
│     {tool_name, tool_input.command, cwd, session_id}         │
│   ├─ if tool_name !== "Bash" → exit 0                        │
│   ├─ if !/^\s*git\s+(commit|push)\b/ → exit 0                │
│   ├─ diff = exec("git diff --cached", {cwd})                 │
│   ├─ if diff empty → exit 0                                  │
│   ├─ if --name-only all docs/tests → exit 0 (short-circuit)  │
│   ├─ score = scoreDiff(diff) with FR-4 dampening             │
│   ├─ if score < 2 → exit 0                                   │
│   ├─ if /\[skip-scope-verify:([^\]]+)\]/i → log + exit 0     │
│   ├─ marker = readMarker(cwd, session_id, sha256(diff))      │
│   ├─ if marker && fresh && should_ship → exit 0              │
│   └─ emit deny JSON + process.exit(2)                        │
└──────────────────────────────────────────────────────────────┘
```

## Компоненты

**Reusable core (в `extensions/_shared/`)** — используется scope-gate hook, plan-pomogator plan-gate, specs-workflow audit-spec:
- **scope-gate-score-diff.ts** (`extensions/_shared/scope-gate-score-diff.ts`) — **pure** `scoreDiff(diff: string): {score, reasons}` + `isGuardFile(path)` + `detectGuardFiles(paths)` + `isDocsOrTestsOnly`. Single source of truth для heuristic regex.
- **scope-gate-marker-store.ts** (`extensions/_shared/scope-gate-marker-store.ts`) — atomic marker I/O + GC + escape log, cwd-scoped.
- Re-exports через `extensions/_shared/index.ts` + individual `.ts` imports per installed-layout pattern (consistent с hook-utils.ts и marker-utils.ts).

**scope-gate extension-specific:**
- **SKILL.md** (`extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md`) — human-readable instructions для AI с frontmatter `disable-model-invocation: true`
- **analyze-diff.ts** (`extensions/scope-gate/tools/scope-gate/analyze-diff.ts`) — deterministic helper для skill: `parseAddedVariants()` + вызов `scoreDiff()` через `../_shared/scope-gate-score-diff.ts`. Installed как tool (`.dev-pomogator/tools/scope-gate/analyze-diff.ts`), invoked by skill via `npx tsx`.
- **scope-gate-guard.ts** (`extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts`) — the PreToolUse hook; main() modeled на `plan-gate.ts:206-296`; imports from `../_shared/scope-gate-*.ts`.
- **Rules:**
  - `extensions/scope-gate/rules/when-to-verify.md` — trigger map + hard-OUT signals (prevent H1 over-application)
  - `extensions/scope-gate/rules/escape-hatch-audit.md` — how to audit `.claude/logs/scope-gate-escapes.jsonl`

**Cross-extension reuse points:**
- **plan-pomogator** (`plan-gate.ts`) — scope-gate advisory (non-blocking, runs FIRST before any Phase deny): parses `## File Changes` table, calls `detectGuardFiles(paths)`, emits stderr advisory when plan touches guard files. Advisory surfaces regardless of plan validity (Phase 1-4 errors don't suppress it). Recommends running `/verify-generic-scope-fix` during implementation.
- **specs-workflow** (`specs-generator-core.mjs` → `audit-spec`) — new check `SCOPE_GATE_CANDIDATE` (severity: INFO, category: LOGIC_GAPS): scans `FILE_CHANGES.md` spec table, detects guard-file patterns, emits finding recommending `/verify-generic-scope-fix` in TASKS Phase 0. Regex mirrors `_shared/scope-gate-score-diff.ts isGuardFile()` — kept in sync via test.

## Где лежит реализация

- **Source of truth** (dev-pomogator repo):
  - App-code: `extensions/scope-gate/tools/scope-gate/{scope-gate-guard,score-diff,marker-store}.ts`
  - Skill: `extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md` + `scripts/analyze-diff.ts`
  - Rules: `extensions/scope-gate/rules/{when-to-verify,escape-hatch-audit}.md`
  - Manifest: `extensions/scope-gate/extension.json`
  - Tests: `tests/e2e/scope-gate.test.ts`, `tests/unit/score-diff.test.ts`, `tests/unit/marker-store.test.ts`, `tests/regressions/stocktaking-incident.test.ts`
- **Target project after install** (via existing dev-pomogator installer contract):
  - `.claude/skills/verify-generic-scope-fix/SKILL.md` + `scripts/analyze-diff.ts`
  - `.dev-pomogator/tools/scope-gate/{scope-gate-guard,score-diff,marker-store}.ts`
  - `.claude/rules/scope-gate/{when-to-verify,escape-hatch-audit}.md`
  - Hook registration в `.claude/settings.local.json` (per personal-pomogator contract)

## Директории и файлы

```
extensions/scope-gate/
├── extension.json                          # manifest (FR-9)
├── skills/
│   └── verify-generic-scope-fix/
│       ├── SKILL.md                        # frontmatter + 5-step checklist
│       └── scripts/
│           └── analyze-diff.ts             # skill helper (FR-1)
├── tools/
│   └── scope-gate/
│       ├── scope-gate-guard.ts             # PreToolUse hook (FR-2)
│       ├── score-diff.ts                   # pure heuristic (FR-6)
│       └── marker-store.ts                 # atomic IO + GC (FR-5)
└── rules/
    ├── when-to-verify.md                   # trigger map
    └── escape-hatch-audit.md               # audit docs
```

## Алгоритм

### Hook main() (scope-gate-guard.ts)

Based on `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:206-296` with adaptations:

```
1. inputData = read all stdin
2. if process.stdin.isTTY → exit 0
3. if !inputData.trim() → exit 0
4. try { data = JSON.parse(inputData) } catch { exit 0 }  // fail-open
5. if data.tool_name !== "Bash" → exit 0
6. const cmd = data.tool_input?.command ?? ""
7. if !/^\s*git\s+(commit|push)\b/.test(cmd) → exit 0
8. const cwd = data.cwd || process.cwd()
9. // GC stale markers (if last GC > 1h ago)
10. runGC(cwd)
11. // Get staged diff
12. const diff = tryExec("git diff --cached", {cwd}, "")  // empty on fail (fail-open)
13. if !diff → exit 0
14. // Docs-only short-circuit (FR-4 rule c)
15. const names = tryExec("git diff --cached --name-only", {cwd}, "").split("\n")
16. if allMatch(names, /\.(md|txt|rst)$|(\/|^)(docs?|tests?|__tests__|spec)\//) → exit 0
17. // Compute weighted score + dampening
18. const {score, reasons} = scoreDiff(diff, {dampenFiles: names})
19. if score < 2 → exit 0
20. // Escape hatch (FR-3)
21. const msg = extractCommitMessage(cmd)  // parse -m / -F / .git/COMMIT_EDITMSG
22. const escapeMatch = msg?.match(/\[skip-scope-verify:\s*([^\]]+)\]/i) || process.env.SCOPE_GATE_SKIP === "1"
23. if escapeMatch → appendEscapeLog(...); exit 0
24. // Fresh marker check (FR-5)
25. const marker = readFreshMarker(cwd, data.session_id, sha256(diff))
26. if marker && marker.should_ship !== false → exit 0
27. // Deny
28. denyAndExit(diff, score, reasons, marker)
```

### scoreDiff() (score-diff.ts, FR-6)

```
function scoreDiff(unifiedDiff: string, opts: {dampenFiles?: string[]}): {score, reasons} {
  let score = 0
  const reasons = []
  const files = parseFilesFromDiff(unifiedDiff)
  for (const file of files) {
    // R-filename
    if (/(Service|Validator|Gate|Guard|Policy|Rule|Predicate|Filter)\.(ts|tsx|cs|java|kt|py|rb|go)$/i.test(file.path)
        || /\/(domain|policies|validation)\//i.test(file.path)) {
      score += 1; reasons.push(`+1 filename:${file.path}`)
    }
    // R-enum: added line is string literal "..." within [...] or Set([...]) or enum { or type = '...' context
    for (const hunk of file.hunks) {
      for (const line of hunk.addedLines) {
        if (isEnumLikeItem(line, hunk.context)) { score += 2; reasons.push(`+2 enum-item:${file.path}:${line.n}`) }
        if (isSwitchCase(line, hunk.context))    { score += 2; reasons.push(`+2 switch-case:${file.path}:${line.n}`) }
      }
      // R-predicate: hunk touches function with predicate-name
      const fnName = findEnclosingFunction(hunk)
      if (fnName && /^(is|should|can|has|must|check|validate|verify|allow|permit)[A-Z]/.test(fnName)) {
        score += 1; reasons.push(`+1 predicate:${fnName}`)
      }
    }
  }
  // FR-4 dampening
  if (opts.dampenFiles) {
    for (const f of opts.dampenFiles) {
      if (/\.(md|txt|rst)$/i.test(f))                              { score -= 2; reasons.push(`-2 docs:${f}`) }
      else if (/(\/|^)(docs?|tests?|__tests__|spec)\//i.test(f))   { score -= 1; reasons.push(`-1 test:${f}`) }
    }
  }
  return {score, reasons}
}
```

### Marker store (marker-store.ts, FR-5)

```
writeMarker(cwd, sessionId, diffSha, variants, shouldShip):
  dir = path.join(cwd, '.claude/.scope-verified')
  fs.ensureDirSync(dir)
  filename = `${sessionId}-${diffSha.slice(0,12)}.json`
  tempPath = path.join(dir, `${filename}.tmp`)
  finalPath = path.join(dir, filename)
  // path traversal check per no-unvalidated-manifest-paths
  if !finalPath.startsWith(dir) → throw
  content = JSON.stringify({timestamp: Date.now(), diff_sha256: diffSha, session_id: sessionId, variants, should_ship: shouldShip}, null, 2)
  fs.writeFileSync(tempPath, content, {encoding: 'utf-8', flag: 'wx'})  // atomic per atomic-update-lock
  fs.renameSync(tempPath, finalPath)

readFreshMarker(cwd, sessionId, diffSha):
  filename = `${sessionId}-${diffSha.slice(0,12)}.json`
  fullPath = path.join(cwd, '.claude/.scope-verified', filename)
  if !fs.existsSync(fullPath) → return null
  const raw = fs.readFileSync(fullPath, 'utf-8')
  let m
  try { m = JSON.parse(raw) } catch { return null }  // corrupt → treat as absent
  if m.diff_sha256 !== diffSha → return null
  if m.session_id !== sessionId → return null
  if Date.now() - m.timestamp > 30*60*1000 → return null
  return m

runGC(cwd):
  dir = path.join(cwd, '.claude/.scope-verified')
  if !fs.existsSync(dir) → return
  const lastGcFile = path.join(dir, '.last-gc')
  if fs.existsSync(lastGcFile) && Date.now() - fs.statSync(lastGcFile).mtimeMs < 3600000 → return  // <1h skip
  for const f of fs.readdirSync(dir):
    if f === '.last-gc' → continue
    const stat = fs.statSync(path.join(dir, f))
    if Date.now() - stat.mtimeMs > 24*60*60*1000 → fs.unlinkSync(path.join(dir, f))
  fs.writeFileSync(lastGcFile, String(Date.now()))
```

## API

### Marker JSON schema

См. `verify-generic-scope-fix_SCHEMA.md`.

### Hook stdin/stdout contract

**Input** (stdin JSON, subset of Claude Code PreToolUse):
```
{
  "tool_name": "Bash",
  "tool_input": { "command": "git commit -m \"...\"" },
  "cwd": "/абсолютный/путь/к/repo",
  "session_id": "<uuid>"
}
```

**Output on deny** (stdout JSON + exit 2):
```
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "[scope-gate] Detected <N> suspicious patterns:\n  • <reason1>\n  • <reason2>\n\nRun: /verify-generic-scope-fix\nOr add to commit message: [skip-scope-verify: <reason ≥8 chars>]\nSee: .claude/rules/scope-gate/escape-hatch-audit.md"
  }
}
```

**Output on pass**: empty stdout + exit 0.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** vitest (existing in dev-pomogator)
**Install Command:** already installed (`vitest` + `@cucumber/cucumber` not needed; dev-pomogator уses vitest directly для BDD-style integration tests per `extension-test-quality.md`)
**Evidence:** `tests/e2e/` существующие тесты использую vitest с `describe(DOMAIN_CODE: ..., () => { it(CODE_NN: ...) })` convention (см. `.claude/rules/extension-test-quality.md`); нет Cucumber framework — dev-pomogator BDD через vitest 1:1 mapping на `.feature` scenarios через `@featureN` теги
**Verdict:** Hooks нужны для управления state test-репозиториев (tmp git repos + staged diffs + `.claude/.scope-verified/` state); fixtures для 5 VSGF001_NN сценариев

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` `runInstaller()` | utility helper | per-test | Создаёт tmp project, запускает installer | Да — reuse для e2e scope-gate test setup |
| `tests/e2e/helpers.ts` `spawnSync` wrappers | utility helper | per-test | Spawn CLI tools + capture stdout/exit | Да — reuse для spawn scope-gate-guard hook с crafted stdin |
| `tests/e2e/helpers.ts` `readFixture()` | domain helper | per-test | Read fixture file | Да — reuse для staged-diff fixture loading |
| `afterEach` в `tests/e2e/*.test.ts` | vitest hook | per-test | Cleanup tmp projects | Да — наш test cleanup аналогично |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/scope-gate-helpers.ts` `createTmpRepoWithDiff()` | helper | per-scenario | Создаёт tmp git repo, stage-ит синтетический diff, возвращает `{cwd, diffSha}` | `runInstaller` из `helpers.ts` |
| `tests/e2e/scope-gate-helpers.ts` `writeMarkerFile()` | helper | per-scenario | Пишет fixture marker в tmp repo's `.claude/.scope-verified/` | N/A (new) |
| `tests/e2e/scope-gate-helpers.ts` `spawnHook()` | helper | per-scenario | Spawns `npx tsx scope-gate-guard.ts` с crafted stdin JSON, возвращает `{stdout, exitCode, stderr}` | `spawnSync` wrappers |
| `beforeEach` в `tests/e2e/scope-gate.test.ts` | vitest hook | per-test | Создаёт fresh tmp dir, resets state | Existing pattern |
| `afterEach` | vitest hook | per-test | Удаляет tmp dir + marker state (`fs.rmSync(tmpDir, {recursive: true, force: true})`) | Existing pattern |

> **Note:** `beforeEach` и `afterEach` — standard vitest lifecycle hooks (часть framework). Не требуют отдельной TASKS.md Phase 0 task — создаются inline в `tests/e2e/scope-gate.test.ts` P0-4 task.

### Cleanup Strategy

- Per-scenario tmp directories (каждый VSGF001_NN получает свой tmp git repo) — полный cleanup через `fs.rmSync(tmpDir, {recursive: true, force: true})` в `afterEach`
- No DB / external service cleanup — всё purely filesystem
- Session state: marker store scoped to tmp cwd, автоматически удаляется вместе с tmpDir

### Test Data & Fixtures

Подробности см. `FIXTURES.md`.

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| F-1 stocktaking-diff.patch | `tests/fixtures/scope-gate/stocktaking-diff.patch` | Unified diff adding 'stocktaking' to enum (scoring = 4) | per-scenario (VSGF001_10) |
| F-2 docs-only-diff.patch | `tests/fixtures/scope-gate/docs-only-diff.patch` | Only README.md changes | per-scenario (VSGF001_40) |
| F-3 fresh-marker.json | `tests/fixtures/scope-gate/fresh-marker.json` | Valid marker с should_ship: true | per-scenario (VSGF001_11) |
| F-4 stale-marker.json | `tests/fixtures/scope-gate/stale-marker.json` | Marker с mismatched diff_sha256 | per-scenario (VSGF001_20) |
| F-5 escape-hatch-commit-msg.txt | `tests/fixtures/scope-gate/escape-hatch-msg.txt` | Commit message c `[skip-scope-verify: ...]` | per-scenario (VSGF001_30) |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tmpCwd` | string | `beforeEach` | все test steps | Абсолютный путь to per-scenario tmp repo |
| `sessionId` | string | `beforeEach` (random UUID) | marker read/write helpers | Session isolation per scenario |
| `stagedDiffSha` | string | `createTmpRepoWithDiff()` | `writeMarkerFile()`, `spawnHook()` | sha256 staged diff для marker pin consistency |

## Reuse Plan (ссылки на существующий код и правила)

| Что переиспользуем | Путь | Зачем |
|---|---|---|
| Stdin+exit pattern | `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:206-296` | Прямой template для `main()` в scope-gate-guard.ts |
| Atomic write | `.claude/rules/atomic-config-save.md` | Marker write через tempfile + rename |
| Atomic lock | `.claude/rules/atomic-update-lock.md` | `flag: 'wx'` O_EXCL для marker temp file |
| Path traversal protection | `.claude/rules/no-unvalidated-manifest-paths.md` | Validate marker path startsWith base dir |
| CWD scoping | `.claude/rules/gotchas/hook-global-state-cwd-scoping.md` | Marker store только в `{cwd}/.claude/.scope-verified/` |
| TS import extensions | `.claude/rules/ts-import-extensions.md` | `.ts` specifiers (не `.js`) для relative imports |
| Hook registration formats | `.claude/rules/gotchas/installer-hook-formats.md` | extension.json Object form для PreToolUse |
| Test quality | `.claude/rules/extension-test-quality.md` | 1:1 test↔feature mapping, DOMAIN_CODE_NN naming |
| Integration tests first | `.claude/rules/integration-tests-first.md` | E2E через spawnSync на real hook, не mocked |

## Known limitations (документируем explicitly)

- **Hook matcher = "Bash"**, не sub-command. Фильтрация `git commit|push` — внутри hook code. Claude Code PreToolUse matcher принимает regex на tool_name, не на tool_input.command (verified: нет precedent в dev-pomogator и в docs). Cost: hook fires на каждый Bash (даже unrelated `ls`), но early exit < 5ms.
- **Heuristic false positives** — `scoreDiff()` не AST-based. Возможно re-tuning по real-world data (first 30+ blocks). Threshold=2 и dampening выбраны conservatively.
- **Single-commit scope** — marker valid только для одного diff_sha256. Multi-commit feature branch требует re-verify каждый commit (by design — защита от "verify once, modify, commit").
- **Skill relies on mechanical grep, not AST** — LLM для AST анализа сейчас не используется (P-4 budget не позволяет). Future enhancement: AST-based reach analysis через tree-sitter.
- **disable-model-invocation: true pattern — first precedent в dev-pomogator.** Задокументирован в this DESIGN.md; future procedural gates могут reuse этот paradigm.
