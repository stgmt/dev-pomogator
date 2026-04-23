# Use Cases

## UC-1: Happy path — agent verifies enum expansion, commit proceeds @feature1

**Actor:** Claude Code agent (или dev-человек) делает fix для Jira-тикета "add missing doctypes to `isOutboundDocument` validation".
**Precondition:** Staged diff добавляет 2+ элемента в enum/Set/array в `src/services/DocumentStatusService.ts`.

**Flow:**
1. Agent перед `git commit` запускает `/verify-generic-scope-fix`
2. Skill читает `git diff --cached` → парсит добавленные variants
3. Для каждого variant: skill выполняет (a) dedicated-flow grep (`Start<V>Modal|<V>Form|New<V>`), (b) dataflow trace от creation UI до gate function, (c) value reachability check (проверка что qty/params реально вводятся юзером, не генерятся сервером)
4. Все variants classified as `traced` → skill пишет marker `.claude/.scope-verified/<session_id>-<shortdiffsha>.json` с `{timestamp, diff_sha256, variants: [...], should_ship: true}`
5. Agent вызывает `git commit` — hook детектит fresh matching marker → exit 0 → commit проходит

**Expected outcome:** Commit создан, marker-файл содержит audit trail.

---

## UC-2: Docs-only diff — zero friction @feature4

**Actor:** Claude Code agent правит только README/documentation.
**Precondition:** `git diff --cached --name-only` возвращает только `*.md` / `*.txt` файлы.

**Flow:**
1. Agent вызывает `git commit -m "docs: update"` без запуска skill
2. PreToolUse hook парсит diff → `scoreDiff()` computes total score
3. Filename dampening (−2 per docs file) → итоговый score < 2
4. Hook exit 0 → commit проходит без блокировки

**Expected outcome:** Ноль friction для трivial diff-ов. Не триггерит H1-style over-correction dynamic.

---

## UC-3: Missing verification — stocktaking-like incident blocked @feature1

**Actor:** Claude Code agent работает над PRODUCTS-20218-style задачей, добавляет элементы в `isOutboundDocument` enum.
**Precondition:** Staged diff содержит `+'stocktaking',` в `src/services/StockValidationService.ts`. Skill НЕ запускался → marker отсутствует.

**Flow:**
1. Agent вызывает `git commit -m "fix: add stocktaking to outbound"` без предварительного skill invocation
2. PreToolUse hook fires, парсит diff → detects (filename matches `*Service.ts` = +1) + (array item addition = +2) + (predicate name `isOutbound` = +1) = score **4**
3. Hook checks `.claude/.scope-verified/` → no fresh marker matching current `sha256(diff)`
4. Hook checks commit message → no `[skip-scope-verify:...]` pattern
5. Hook emits `permissionDecision: deny` + `process.exit(2)`
6. Claude Code показывает deny message: "Diff меняет scope-gate в Service файле. Запусти `/verify-generic-scope-fix` для анализа каждого добавленного variant-а, или добавь `[skip-scope-verify: <reason>]` в commit message"

**Expected outcome:** Commit заблокирован ДО того как no-op fix отправился в MR. Агент вынужден либо verify, либо явно escape.

**Why это закрывает инцидент:** В MR !100 этот ровно сценарий произошёл. Hook превращает H2 ("noticed but didn't act") в невозможный — нельзя забыть проверку, потому что без marker commit физически блокируется.

---

## UC-4: Stale marker — agent changed diff after verification @feature2

**Actor:** Claude Code agent.
**Precondition:** Skill был запущен ранее, marker существует с `diff_sha256 = "abc123"`. После запуска skill agent изменил код (например, добавил ещё один variant).

**Flow:**
1. Agent вызывает `git commit`
2. Hook вычисляет `sha256(git diff --cached)` = `"def456"` — не совпадает с marker-ом
3. Hook treats marker as absent → re-required verification
4. Score check → блокировка с message "verification stale: diff changed since last verify, re-run /verify-generic-scope-fix"

**Expected outcome:** Agent вынужден re-verify после каждого изменения. Защита от "verify once, then add stuff, then commit" paths.

**Edge case:** TTL = 30 минут (marker age > 30min тоже invalid) — защищает от агентов с долгими сессиями где изначальная verification может устареть по другим причинам (external code изменился).

---

## UC-5: Escape hatch — legitimate bypass with audit trail @feature3

**Actor:** Claude Code agent / dev-человек, знает что fix бенигнон (e.g., пересмотр existing dead-code path который всё равно не используется).
**Precondition:** Score >= 2, но agent уверен что fix не no-op и не rotten.

**Flow:**
1. Agent вызывает `git commit -m "chore: refactor [skip-scope-verify: dead-code path confirmed with reviewer evolkov, не триггерит validation в runtime]"`
2. Hook парсит commit message → matches `/\[skip-scope-verify:\s*([^\]]+)\]/i`
3. Hook validates reason length ≥8 chars (здесь — длинная строка → pass)
4. Hook appends entry в `.claude/logs/scope-gate-escapes.jsonl`: `{ts, diff_sha256, reason, session_id, cwd}`
5. Hook exit 0 → commit проходит

**Expected outcome:** Legitimate escape hatch доступен, но каждое использование auditable для ревьюера.

**Why это важно:** Без escape hatch hook становится "concerns-as-offload 2.0" — каждый commit требует verification даже когда agent уверен. С hatch — explicit accountability (reason в git log, auditable grep-ом).

---

## Edge Cases

## UC-6: Integration check — skill frontmatter + extension.json schema @feature5

**Actor:** dev-pomogator maintainer / CI pipeline.
**Precondition:** Extension `scope-gate` is being installed OR manifest schema is being validated.

**Flow:**
1. Read `extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md` frontmatter — verify `disable-model-invocation: true`, `name`, `description`, `allowed-tools`
2. Read `extensions/scope-gate/extension.json` — verify hooks.claude.PreToolUse matcher/command/timeout, skillFiles/toolFiles/ruleFiles all paths exist
3. Run `validate-spec.ts` + `extension-manifest-integrity.md` checklist

**Expected outcome:** Manifest compliant, frontmatter includes required `disable-model-invocation: true` (NEW pattern для dev-pomogator), all registered files exist.

**Why это важно:** H2 counter — без `disable-model-invocation: true` модель может self-invoke skill; с этим флагом — только user explicit invocation. Без integrity check regression возможна.

---

## Edge Cases

### EC-1: Partial re-verification
Agent запускает skill, он классифицирует 3 variants как traced + 1 как `conditional` (reachable только через feature flag). Skill пишет marker `should_ship: review_recommended`. Hook разрешает commit (fresh marker, не `should_ship: false`), но warning logged в stderr.

### EC-2: Session ID mismatch
Marker создан в session_id=A, commit запущен в session_id=B (разные Claude Code sessions на том же cwd). Hook требует session_id match в marker — prevents стороннего session bypass. Если match — pass; если нет — treat as no marker, re-verify.

### EC-3: No git repo
`git diff --cached` fails (no .git/). Hook catches exec error → fail-open (exit 0) по паттерну `plan-gate.ts:220-231`.

### EC-4: Marker file pollution
`.claude/.scope-verified/` fills over time. Hook на каждом fire делает GC files с age > 24h (простой `fs.readdir` + filter, <50ms).
