# Functional Requirements (FR)

## FR-1: Skill workflow — mechanical reach analysis per variant @feature1

Skill `/verify-generic-scope-fix` SHALL выполнять следующий workflow при invocation:

1. Execute `git diff --cached` → получить unified diff staged changes
2. `parseAddedVariants(diff)` → extract список добавленных variants с типом: `{file, kind: "enum-item" | "switch-case" | "array-entry", name, lineNumber}`
3. Для каждого variant — **reach analysis**:
   - **(a) Dedicated-flow grep** — искать `Start<Name>Modal|<Name>Form|New<Name>|<Name>Creator`; при находке → classify как potential separate flow
   - **(b) Dataflow trace** — open найденный компонент, найти где user input → save; если gate-функция не вызывается в этом path → classify как `unreachable`
   - **(c) Value reachability** — для gate проверяющей значения: убедиться что значения вводятся юзером; если auto-generated → classify как `unreachable`
4. Classify результат per variant: `traced` | `unreachable` | `conditional`
5. Write marker `{cwd}/.claude/.scope-verified/<session_id>-<shortdiffsha>.json` с schema (см. `verify-generic-scope-fix_SCHEMA.md`): `{timestamp, diff_sha256, variants, should_ship}`
6. Вывести human-readable report: per-variant verdict + overall `should_ship` + actionable hint

**Rationale:** H2 noticed-but-didn't-act — skill должен механически конвертировать diagnosis в action.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-happy-path)

---

## FR-2: PreToolUse hook — block commit without fresh verification @feature1

Hook `scope-gate-guard` (PreToolUse, matcher `"Bash"`) SHALL:

1. Read stdin JSON — `{tool_name, tool_input, cwd, session_id}`
2. Fail-open если `isTTY` | empty input | JSON parse error (pattern `plan-gate.ts:209-226`)
3. Extract `tool_input.command`; если не matches `/^\s*git\s+(commit|push)\b/` → exit 0
4. Execute `git diff --cached` в `data.cwd`
5. Compute `suspicionScore(diff)` per FR-6 weighted heuristic + dampening per FR-4
6. Если `score < 2` → exit 0
7. Check commit message для escape hatch (FR-3) → match → log + exit 0
8. Check `{cwd}/.claude/.scope-verified/` для fresh marker: `sha256(diff) === marker.diff_sha256` AND `session_id` match AND `age < 30min` → exit 0
9. Otherwise: emit `permissionDecision: deny` + `process.exit(2)`

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-3](USE_CASES.md#uc-3-missing-verification)

---

## FR-3: Escape hatch with audit trail @feature3

Hook SHALL recognize:

- Commit message pattern: `/\[skip-scope-verify:\s*([^\]]+)\]/i`
- Environment variable: `SCOPE_GATE_SKIP=1`

On match:

1. Extract reason (regex group 1 OR env value)
2. Validate reason length ≥ 8 chars; если короче — WARN в stderr, но exit 0 продолжается
3. Append JSONL entry: `{cwd}/.claude/logs/scope-gate-escapes.jsonl` → `{"ts", "diff_sha256", "reason", "session_id", "cwd"}`
4. `process.exit(0)` (bypass)

**Rationale:** H3 concerns-as-offload counter — escape hatch нужен, но audit trail делает accountability visible.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-5](USE_CASES.md#uc-5-escape-hatch)

---

## FR-4: Docs/test dampening — anti-over-application @feature4

Hook SHALL снижать score для benign diff patterns:

- Rule (a): каждый file matching `/\.(md|txt|rst)$/i` → `score -= 2`
- Rule (b): каждый file path matching `/(\/|^)(docs?|tests?|__tests__|spec)\//i` → `score -= 1`
- Rule (c): если `--name-only` показывает **только** docs/tests/md-файлы → immediate `exit 0` short-circuit

**Rationale:** H1 over-application prevention. Без dampening gate становится "каждый commit блокирован", воспроизводит failure pattern.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-2](USE_CASES.md#uc-2-docs-only)

---

## FR-5: Marker invalidation — diff-hash pin + TTL @feature2

Hook SHALL considered marker invalid if ANY:

- `sha256(current git diff --cached)` !== `marker.diff_sha256` (diff changed)
- `Date.now() - marker.timestamp > 30*60*1000` (TTL > 30min)
- `marker.session_id !== data.session_id` (different session)

Invalid → treated as absent → re-verify required.

Additionally: hook SHALL GC marker-файлов с age > 24h при каждом invocation.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-stale-marker)

---

## FR-6: Weighted suspicionScore heuristic

`scoreDiff(unifiedDiff)` SHALL вычислять score additively:

| Rule | Condition | Points |
|------|-----------|--------|
| R-filename | Added lines в файле matching `/(Service\|Validator\|Gate\|Guard\|Policy\|Rule\|Predicate\|Filter)\.(ts\|tsx\|cs\|java\|kt\|py\|rb\|go)$/i` OR path contains `/(domain\|policies\|validation)/` | +1 |
| R-enum | Diff hunk adds 1+ string literal в body `[...]`, `new Set([...])`, `enum`, or `type T = 'a' \| 'b' \| ...` (context: opening bracket within 3 lines before, closing/more items within 3 lines after) | +2 |
| R-case | Added lines starting с `case \w+:` внутри `switch` блока | +2 |
| R-predicate | Diff touches lines внутри function с name matching `/^(is\|should\|can\|has\|must\|check\|validate\|verify\|allow\|permit)[A-Z]/` | +1 |

Threshold: `score >= 2` → block (subject to FR-4 dampening).

**Calibration** (incident diff):
- Stocktaking: filename (1) + enum (2) + predicate (1) = **4** → block ✓
- Docs-only: 0 → pass ✓

**Tuning:** threshold/weights tunable after 30+ real blocks via `.claude/logs/scope-gate-blocks.jsonl` analysis.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

---

## FR-7: Fail-loud on unreachable variant — explicit counter-H3 @feature1

Skill SHALL:

- Если хотя бы один variant classified `unreachable` → marker с `should_ship: false`
- Hook при встрече marker с `should_ship: false` → deny commit (независимо от fresh/stale)
- Skill output SHALL содержать "DO NOT SHIP — variant X structurally no-op"
- ЗАПРЕЩЕНО skill-у писать `should_ship: true` с noted concern; concern без explicit resolution = `should_ship: false`

**Rationale:** H3 concerns-as-offload counter. "Noted concern и shipnуть" — structurally impossible.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

---

## FR-8: Skill frontmatter — disable-model-invocation pattern @feature5

SKILL.md файл SHALL содержать frontmatter:

```yaml
---
name: verify-generic-scope-fix
description: Use BEFORE commit when diff adds 2+ items to an enum/switch/array that gates a shared codepath (files matching *Service.ts / *Validator.ts / *Gate.ts / *Policy.ts). Prevents adding variants whose creation flow bypasses the gate — making the fix structurally no-op.
allowed-tools: Read, Bash, Grep, Glob
disable-model-invocation: true
---
```

**Rationale:** H2 counter — модель не может "решить пропустить" skill. Invocation только через user `/verify-generic-scope-fix` или referenced rule. Новый reusable pattern для dev-pomogator.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)

---

## FR-9: Integration with dev-pomogator extension system

Extension `extensions/scope-gate/` SHALL содержать:

- `extension.json` с registration: `skills`, `skillFiles`, `tools`, `toolFiles`, `hooks.claude.PreToolUse`, `ruleFiles`
- PreToolUse hook в Object format: `{matcher: "Bash", command: "npx tsx .dev-pomogator/tools/scope-gate/scope-gate-guard.ts", timeout: 5}`
- Rules `.claude/rules/scope-gate/when-to-verify.md` + `escape-hatch-audit.md` registered в `ruleFiles.claude`

Installer SHALL (via existing contract) copy artifacts в target project per `extension-manifest-integrity.md`.

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)
