# Categories — detailed patterns

Каждая категория ниже содержит: **trigger** (когда применять), **method** (Read/Grep/WebFetch/Bash recipe), **severity rule** (когда P0/P1/P2/P3), **finding format** для REVIEW_NOTES.md, **remediation hint**.

## Category 1: External-API claim verify (P0)

### Trigger

В spec-файлах (USER_STORIES, USE_CASES, RESEARCH, FR, AC, DESIGN) встречается ЛЮБОЕ utверждение про external service:

- Crypto/signature algorithm: "HMAC-SHA256", "RSA-PSS", "Ed25519", "JWT RS256"
- API endpoint path: `/v1/...`, `POST /...`
- Request/response schema fields: `{ "event": "...", "payload": {...} }`
- Header names: `X-Tawk-Signature`, `Stripe-Signature`, `Authorization: Bearer`
- Webhook delivery semantics: "at-least-once", "ordered", "idempotency-key required"
- Rate limit numbers: "100 req/sec", "burst 1000"
- Pricing/quota/SLA claims

### Method

1. Grep across spec для external service mentions:

   ```bash
   grep -E "(Tawk|Stripe|Twilio|Crisp|YooKassa|Yandex|Google|Auth0|JWT|HMAC|webhook|signature)" .specs/{slug}/*.md
   ```

2. Для каждого hit — найти claim (factual statement):
   - Algorithm name + version (`HMAC-SHA256`, не просто `HMAC`)
   - Header/field name (`X-Tawk-Signature`, не просто `signature header`)
   - Endpoint path (`/v1/sessions`, не просто `their API`)

3. WebFetch official docs URL для verification:
   - Tawk.to → `https://developer.tawk.to/`
   - Stripe → `https://stripe.com/docs/webhooks/signatures`
   - Twilio → `https://www.twilio.com/docs/usage/security`
   - YooKassa → `https://yookassa.ru/developers/api`
   - Auth0 → `https://auth0.com/docs/secure/tokens/json-web-tokens`

4. Сравнить claim с docs. Если расходится — P0 finding.

5. Если есть 5+ claims — запустить `scripts/check_external_claims.py` (batch).

### Severity rule

- P0: claim фальсифицирован docs (e.g. "HMAC-SHA256" в spec, docs говорят SHA1)
- P0: claim про несуществующий endpoint/header
- P1: claim correct по essence но missing version/precision (e.g. "JWT" без указания algorithm — RS256/HS256/etc.)
- P2: claim корректен, но docs URL не указан в RESEARCH.md (audit trail слаб)

### Finding format

```markdown
| # | Category | Location | Issue | Required fix |
|---|----------|----------|-------|--------------|
| 1 | EXT_API | FR.md:42 "Tawk webhook signed with HMAC-SHA256" | Tawk uses HMAC-SHA1 per https://developer.tawk.to/webhooks/ | Replace SHA256 → SHA1 in FR.md, AC.md, DESIGN.md |
```

### Lesson reference

Урок 2 (HMAC SHA256 vs SHA1) — `lessons-learned.md`.

---

## Category 2: Existing-asset duplicate (P0)

### Trigger

Спека предлагает добавить сервис/библиотеку/widget/SDK, который УЖЕ существует в репо.

Особенно опасно когда:

- "Делать с нуля" claim в RESEARCH.md или DESIGN.md
- Mentions chat/payment/monitoring/analytics service
- New NuGet/npm package addition

### Method

1. Identify предлагаемые external assets из spec:

   ```bash
   grep -E "(install|add|integrate|new|Twilio|Crisp|Tawk|Sentry|Datadog|GA4|Segment|Stripe|PayPal|Auth0)" \
     .specs/{slug}/{RESEARCH,DESIGN,FILE_CHANGES,FR}.md
   ```

2. Для каждого asset — verify в репо:

   ```bash
   # Frontend (npm)
   cat package.json | jq '.dependencies + .devDependencies | keys' | grep -i {asset}
   grep -ri "{asset}" public/ src/ index.html source-code/
   
   # .NET
   find . -name "*.csproj" -exec grep -l -i "{asset}" {} \;
   grep -ri "{asset}" appsettings*.json
   
   # DI registrations
   grep -rE "AddSingleton<.*{Asset}|AddScoped<.*{Asset}|services.Add{Asset}" --include="*.cs"
   
   # Configuration files
   grep -ri "{asset}" *.config *.yml *.yaml
   ```

3. Также check `index.html` / landing pages для embedded widgets:

   ```bash
   find . -name "index.html" -exec grep -l "embed\.tawk\|widget\|crisp\|intercom" {} \;
   ```

### Severity rule

- P0: asset УЖЕ интегрирован, spec предлагает добавить заново → duplicate
- P0: spec говорит "X нет, добавляем" — реально grep находит X
- P1: похожее (но не identical) asset существует — нужно явно решить replace vs coexist
- P2: asset не используется, но был раньше (commit history) — risk of confusion

### Finding format

```markdown
| 2 | EXISTING_ASSET | RESEARCH.md:18 "Chat виджета нет, добавляем Twilio Conversations" | Tawk.to widget уже подключён в source-code/my-custom-app/index.html:119 (`<!-- BEGIN TAWK -->`) | Решить: replace Tawk → Twilio (требует migration plan) ИЛИ keep Tawk и не добавлять Twilio |
```

### Lesson reference

Урок 1 (Tawk vs Twilio).

---

## Category 3: Antipattern guardrails (P1)

### Trigger

Spec файлы предлагают impl decision, который match'ится против известных antipatterns в `.claude/rules/antipatterns/*.md` (если каталог существует в target проекте) ИЛИ против встроенного default trigger list (см. SKILL.md → antipattern-triggers reference).

### Method

См. подробно antipattern-triggers reference (loaded by SKILL.md одним уровнем). Краткий алгоритм:

1. Если `.claude/rules/antipatterns/` существует в проекте:

   ```bash
   ls .claude/rules/antipatterns/*.md | while read rule; do
     name=$(basename "$rule" .md)
     # Извлечь триггерные паттерны из правила (## Триггер или ## Антипаттерн секция)
     # Grep против spec
   done
   ```

2. Иначе — использовать default trigger list из `antipattern-triggers.md` (raw SQL writes, mocks в e2e, sync-over-async, etc.)

3. Для каждого match — finding с reference на antipattern rule.

### Severity rule

- P1: clear violation antipattern rule (e.g. "skill пишет SQL UPDATE напрямую" → нарушает `no-direct-prod-edits.md`)
- P2: pattern smells подозрительно, но не явный hit (e.g. "service writes to file" — может быть легитимно)

### Finding format

```markdown
| 3 | ANTIPATTERN | DESIGN.md:67 "Skill executes UPDATE Users SET ... directly" | Violates `.claude/rules/antipatterns/no-direct-prod-edits.md` (skill should call domain service, не raw SQL) | Replace with `IUserService.SuspendAsync(userId)` call |
```

### Lesson reference

Урок 4 (SQL из скилла).

---

## Category 4: Assumption-vs-Requirement (P1)

### Trigger

Каждый FR / UC / AC должен иметь обоснование: либо прямая user reference (Extracted Requirements в плане, JIRA_SOURCE.md, user message в session), либо явный `[Assumption]` маркер.

### Method

1. Read `.specs/{slug}/FR.md`, `USE_CASES.md`, `ACCEPTANCE_CRITERIA.md`.

2. Read source истины:
   - Plan file (если есть): `~/.claude/plans/{name}.md` → `### Extracted Requirements`
   - Jira artifacts: `.specs/{slug}/JIRA_SOURCE.md` если есть
   - User session messages (последние 10-20)

3. Для каждого FR/UC/AC — quick scan: есть ли совпадающее требование в источнике?
   - Прямая цитата → OK, no finding
   - Косвенная связь → OK, no finding
   - Не найдено → P1 finding "Assumption должно быть marked"

4. Grep `[A]` или `[Assumption]` маркеры в spec — если их нет вообще, а findings есть — критично.

### Severity rule

- P1: FR/UC без user reference и без `[A]` маркера
- P2: AC более детальный чем user requested — допустимо, но желательно `[A]`
- P3: NFR (часто додумываются разработчиком) — log only

### Finding format

```markdown
| 4 | ASSUMPTION | USE_CASES.md UC-8 "Repeated submit идемпотентен" | Не упомянут в Extracted Requirements плана и в Jira. Это разумная защита, но это допущение. | Добавить `[A]` маркер в UC-8 или удалить, или подтвердить с user |
```

### Lesson reference

Урок 6 (UC-8 idempotency).

---

## Category 5: Open Questions stale (P1)

### Trigger

Перед `ConfirmStop Discovery` или `ConfirmStop Requirements` — все `## Open Questions` в RESEARCH.md должны быть resolved (`- [x]`) или migrated в DESIGN.md.

### Method

```bash
# Найти unchecked open questions
grep -nE "^- \[ \]" .specs/{slug}/RESEARCH.md

# Найти секцию Open Questions
awk '/^## Open Questions/,/^## /' .specs/{slug}/RESEARCH.md
```

Каждая `- [ ]` в `## Open Questions` секции = stale question.

### Severity rule

- P1: stale question при попытке `ConfirmStop Discovery` (Phase 1)
- P1: stale question при попытке `ConfirmStop Requirements` (Phase 2)
- P2: stale question в `## Out of Scope` или `## Future Work` секциях — допустимо

### Finding format

```markdown
| 5 | OPEN_Q_STALE | RESEARCH.md:34 "- [ ] Какой timeout для webhook retry?" | Unresolved при попытке ConfirmStop Requirements | Resolve и переместить в DESIGN.md ИЛИ ответить и tick `- [x]` ИЛИ marked как `[OUT_OF_SCOPE: deferred to follow-up]` |
```

---

## Category 6: @featureN cross-file consistency (P0)

### Trigger

`@featureN` теги связывают USER_STORIES → USE_CASES → FR → AC → `.feature` файл. Любой mismatch breaks traceability и audit-spec.ts.

### Method

```bash
# Собрать все @featureN теги из каждого файла
for f in USER_STORIES.md USE_CASES.md FR.md NFR.md ACCEPTANCE_CRITERIA.md REQUIREMENTS.md; do
  echo "=== $f ==="
  grep -oE "@feature[0-9]+" .specs/{slug}/$f | sort -u
done

# .feature файл
grep -oE "@feature[0-9]+" .specs/{slug}/*.feature | sort -u

# TASKS.md
grep -oE "@feature[0-9]+" .specs/{slug}/TASKS.md | sort -u
```

### Severity rule

- P0: @featureN существует в FR/AC но отсутствует в `.feature` файле (broken traceability)
- P0: `.feature` файл содержит @featureN которого нет в FR/AC (orphan tag)
- P0: USER_STORIES и FR используют разный счёт (US-1 → @feature1, FR-1 → @feature2)
- P1: TASKS.md не ссылается на @featureN (less critical, но нарушает traceability)

### Finding format

```markdown
| 6 | FEATURE_TAG | FR.md @feature3 vs payment.feature | FR-3 имеет @feature3, в payment.feature нет соответствующего Scenario с @feature3 | Add `@feature3` tag to scenario "ID-3 ..." in payment.feature OR remove @feature3 from FR-3 |
```

---

## Category 7: Tooling mismatch (P1)

### Trigger

Spec/TASKS/DESIGN содержит:

- PowerShell-grammar в bash code blocks: `if (Test-Path .)`, `Get-ChildItem`, `$env:VAR`
- Прямые test runners: `dotnet test`, `npm test`, `pytest`, `cargo test`, `go test` (вместо `/run-tests`)
- Raw shell tools: `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk` в TASKS — должны быть Glob/Grep/Read tools (если TASKS говорят про Claude Code workflow)

### Method

```bash
# PowerShell в bash blocks
grep -nE '(\bTest-Path\b|\$env:|Get-ChildItem|New-Item|Set-Location|Write-Host|\$_\.|Where-Object)' \
  .specs/{slug}/*.md

# Raw test runners
grep -nE '\b(dotnet test|npm test|npx vitest|pytest|cargo test|go test)\b' .specs/{slug}/TASKS.md

# Raw shell tools в TASKS
grep -nE '^\s*(\$ )?(find|grep|cat|head|tail|sed|awk)\s' .specs/{slug}/TASKS.md
```

### Severity rule

- P1: PowerShell в `\`\`\`bash` block (broken syntax при copy-paste)
- P1: `dotnet test` / `npm test` в TASKS — должно быть `/run-tests` (см. `.claude/rules/tui-test-runner/centralized-test-runner.md`)
- P2: raw shell tool в TASKS — может быть legitimate (e.g. `git log` который не имеет Claude tool аналога)

### Finding format

```markdown
| 7 | TOOLING | TASKS.md:67 task T-12 "Run `dotnet test --filter X`" | Direct test runner blocked by centralized-test-runner rule | Replace with `/run-tests --filter X` |
```

### Lesson reference

Урок 5 (Bash != PowerShell).

---

## Category 8: Plan-gate template compliance (P1)

### Trigger

Если есть active plan file (`~/.claude/plans/{name}.md` mentioned в session) — diff против `.dev-pomogator/tools/plan-pomogator/template.md`.

### Method

1. Identify active plan: проверить session messages на упоминание `~/.claude/plans/...md` или Plan File Info из system prompt.

2. Read template:

   ```bash
   cat .dev-pomogator/tools/plan-pomogator/template.md
   ```

3. Read plan и проверить:

   - 10 секций в правильном порядке (`## 💬`, `## 🎯 Context`, ...) — см. `.claude/rules/plan-pomogator/plan-pomogator.md`
   - `### Extracted Requirements` в Context секции с ≥2 нумерованных пунктов
   - Todos format: `### 📋 \`todo-id\`` + `> описание` blockquote + `- **files:**` + `- **changes:**` + `- **refs:**`
   - File Changes: relative paths only (no `D:\...`)
   - Каждый File Changes path упомянут в Implementation Plan или Todos

4. Run validator:

   ```bash
   npx tsx .dev-pomogator/tools/plan-pomogator/validate-plan.ts <path-to-plan>
   ```

### Severity rule

- P0: Phase 1-3 errors (validator exit > 0) — план не пройдёт ExitPlanMode
- P1: Phase 4 warnings (actionability) — допустимо, но fix recommended
- P1: absolute paths в File Changes (`D:\...`)

### Finding format

```markdown
| 8 | PLAN_GATE | ~/.claude/plans/active-plan.md:142 | Todo "auth-fix" использует `- description:` instead of blockquote `>` (validate-plan Phase 1 fail) | Replace `- description: ...` with `> ...` |
```

### Lesson reference

Урок 7 (Plan-gate format strict).

---

## Category 9: BDD Test Infrastructure → Phase 0 (P0)

### Trigger

DESIGN.md содержит TEST_DATA classification = `TEST_DATA_ACTIVE` или `TEST_FORMAT_ACTIVE` (см. `phase2_bdd-test-infrastructure.md` reference в create-spec).

### Method

1. Read DESIGN.md:

   ```bash
   grep -nE "TEST_DATA_ACTIVE|TEST_FORMAT_ACTIVE|## Hooks Design" .specs/{slug}/DESIGN.md
   ```

2. Если ACTIVE — DESIGN должен иметь `## Hooks Design` секцию с list of hooks.

3. Read TASKS.md → Phase 0 секцию (`## Phase 0: Test Infrastructure` или подобное):

   ```bash
   awk '/^## Phase 0/,/^## /' .specs/{slug}/TASKS.md
   ```

   Должны быть tasks для каждого hook из DESIGN.

4. Read FILE_CHANGES.md:

   ```bash
   grep -E "(create|edit).*hook" .specs/{slug}/FILE_CHANGES.md
   ```

   Должны быть corresponding `create` entries для hook файлов.

### Severity rule

- P0: TEST_DATA_ACTIVE classification, но Phase 0 в TASKS.md отсутствует или пустая
- P0: hook упомянут в DESIGN, но соответствующий task в Phase 0 отсутствует
- P0: hook task существует, но FILE_CHANGES не имеет create entry для hook файла
- P1: classification == NONE/PASSIVE — Phase 0 опциональна

### Finding format

```markdown
| 9 | BDD_PHASE0 | DESIGN.md:120 "Hooks: BeforeScenario_SeedDB, AfterAll_TruncateAll" | TASKS.md Phase 0 имеет 1 task (BeforeScenario_SeedDB), но AfterAll_TruncateAll task отсутствует | Add task T-0.2: "Implement AfterAll_TruncateAll hook in tests/Hooks/CleanupHooks.cs" + add to FILE_CHANGES |
```

---

## Category 10: Hallucination/fluff smell (P2)

### Trigger

Spec содержит prose без factual support:

- Paragraph >5 sentences без code/table/file/issue references
- Marketing-style adjectives без numbers: "fast", "stable", "convenient", "robust", "secure", "scalable", "быстрый", "стабильный", "удобный"
- NFR без disclaimer "targets vs measured": "Performance: respond in <100ms" без указания measurement methodology

### Method

```bash
# Long paragraphs без refs
awk 'BEGIN{RS=""}/[^.]\.[^.]+\.[^.]+\.[^.]+\.[^.]+\.[^.]+\./{
  if (!/(\.md|\.ts|\.cs|\.py|FR-|AC-|UC-|@feature|http|`)/ ) print FILENAME":"NR": "$0
}' .specs/{slug}/*.md

# Marketing words
grep -nE "\b(fast|stable|convenient|robust|secure|scalable|быстр|стабильн|удобн|надёжн|безопасн)\w*\b" \
  .specs/{slug}/{FR,NFR,DESIGN}.md | grep -vE "[0-9]+(ms|s|MB|GB|req|sec|%)"

# NFR без measurement
grep -nE "(Performance|Throughput|Latency|Reliability):" .specs/{slug}/NFR.md | \
  grep -vE "(measured|target|baseline|p50|p95|p99)"
```

### Severity rule

- P2: long paragraph без refs (suggest split / add references)
- P2: marketing word без числа
- P3: NFR без disclaimer (fragile detection — many false positives)

### Finding format

```markdown
| 10 | FLUFF | NFR.md:23 "System SHALL be fast and convenient" | Vague claim без metrics | Replace with concrete: "p95 latency < 200ms measured via /metrics endpoint" |
```

---

## Category 11: Spec ↔ code drift (P1, post-impl)

### Trigger

Запускается ТОЛЬКО после implementation phase (когда есть code changes для review). Spec говорит "X через ServiceA", реально код использует ServiceB.

### Method

1. List изменённые files:

   ```bash
   git diff --name-only HEAD~1..HEAD
   # OR
   git diff --cached --name-only
   ```

2. Для каждого FR/AC/DESIGN claim про конкретный сервис/метод/класс — grep по changed files:

   ```bash
   # Spec claim: "Migration через InfrastructureInitializerService"
   grep -rE "(InfrastructureInitializerService|MigrateAsync)" \
     $(git diff --name-only HEAD~1..HEAD)
   ```

3. Для каждого method call — verify signature:

   ```bash
   # Spec: "_currencyService.GetCurrentRateAsync(ct)"
   # Reality: проверить interface
   grep -A2 "interface ICurrencyService" --include="*.cs" -r src/
   ```

4. Endpoint paths:

   ```bash
   # Spec: POST /api/billing/payment/create
   # Reality: combined Route+HttpVerb
   grep -B2 -E '\[HttpPost\("(\w+)"\)\]' --include="*.cs" -r src/
   grep -B2 -A2 "Route.*billing" --include="*.cs" -r src/
   ```

### Severity rule

- P1: spec упоминает несуществующий метод/сервис/path
- P1: spec упоминает correct service, но wrong method signature
- P2: spec describes design pattern, который близок но не identical к impl

### Finding format

```markdown
| 11 | SPEC_CODE_DRIFT | DESIGN.md:89 "_currencyService.GetCurrentRateAsync(ct)" | Interface ICurrencyService.cs:12 declares `GetExchangeRateAsync(string from, string to, CancellationToken)` — different name + signature | Update DESIGN.md to match actual signature OR rename method in code if spec is canonical |
```

### Lesson references

Уроки 8, 9, 10, 11, 12.

---

## Category 12: Cross-namespace name collision (P0)

### Trigger

Spec предлагает создать new `enum`, `class`, `interface`, `record`, `struct` с именем X. Существующий код имеет X в другом namespace (NuGet using или sibling project).

### Method

1. Identify proposed names в spec:

   ```bash
   # Из DESIGN.md / SCHEMA.md / FILE_CHANGES.md
   grep -nE "(enum|class|interface|record|struct)\s+\w+" .specs/{slug}/{DESIGN,SCHEMA,FILE_CHANGES}.md | \
     awk '{print $NF}' | sort -u
   ```

2. Для каждого name — search для существующих definitions:

   ```bash
   for name in "PaymentMode" "OrderStatus" "..." ; do
     grep -rE "(class|enum|interface|record|struct)\s+${name}\b" \
       --include="*.cs" --include="*.ts" --include="*.py" .
   done
   ```

3. Также check NuGet `using` statements:

   ```bash
   grep -rE "using\s+\w+\.\w+\.${name}\b" --include="*.cs" .
   ```

### Severity rule

- P0: name collision detected — same name в same namespace OR commonly imported namespace
- P1: collision в unrelated namespace, но потенциально confusing
- P2: similar (substring) name — minor risk

### Finding format

```markdown
| 12 | NAME_COLLISION | DESIGN.md:45 "enum PaymentMode { Manual, YooKassa }" | `Yandex.Checkout.V3.PaymentMode` уже imported in CreatePaymentCommandHandler.cs:12 — collision на уровне reader | Rename to `BillingPaymentMode` OR fully-qualify both usages |
```

### Lesson reference

Урок 3 (PaymentMode collision).

---

## Category 13: JWT claim / config key consistency (P2)

### Trigger

Post-implementation review: проверка что JWT claim names и config key names используются consistently.

### Method

```bash
# JWT claim access
grep -rE 'FindFirst\("(\w+)"\)|FindFirstValue\("(\w+)"\)' --include="*.cs" .

# Config key access
grep -rE 'Configuration\["[^"]+"\]|GetSection\("[^"]+"\)' --include="*.cs" .

# Standard claim types
grep -rE 'ClaimTypes\.\w+' --include="*.cs" .
```

Compare:

- Spec / DESIGN.md упоминания JWT claims
- Code uses `FindFirst("UserId")` — должно быть `ClaimTypes.NameIdentifier` если semantically same
- Spec config key `"Tawk:Secret"` — code reads `"TawkSecret"` (drift)

### Severity rule

- P2: `FindFirst("UserId")` vs `ClaimTypes.NameIdentifier` — works but inconsistent
- P3: config key casing mismatch ("Tawk:secret" vs "Tawk:Secret") — fragile string match
- P1: spec claim name doesn't match any code usage (spec drift)

### Finding format

```markdown
| 13 | JWT_CLAIM | TawkController.cs:34 `User.FindFirst("UserId")` | Other controllers use `User.FindFirst(ClaimTypes.NameIdentifier)` | Replace with `User.FindFirst(ClaimTypes.NameIdentifier)?.Value` для consistency |
```

---

## Severity quick-reference

| Severity | Categories | Behavior |
|----------|-----------|----------|
| **P0** | 1, 2, 6, 9, 12 | BLOCKER — must fix перед ConfirmStop |
| **P1** | 3, 4, 5, 7, 8, 11 | fix BEFORE Stop, override через `[skip-spec-review-p1: <reason>]` |
| **P2** | 10, 13 + некоторые из 1, 4, 7, 8 | recommendation, log only |
| **P3** | 13 (config keys) + edge cases | informational, log only |
