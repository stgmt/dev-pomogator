# Lessons Learned — 15 case studies

Реальные failures из spec-review session (PR #78 + adjacent). Каждый урок: что произошло → корневой урок → grep pattern для категории.

## Урок 1: Tawk vs Twilio (категория #2 — Existing-asset duplicate)

**PR/Session:** PR #78 spec drafting, RESEARCH.md initial.

**Категория:** #2 (Existing-asset duplicate, P0).

**Что произошло:** Пользователь упомянул "Twilio" в свободной форме. Агент написал в RESEARCH.md "Twilio/Crisp/Tawk нет, делать с нуля" не прочитав landing page (`source-code/my-custom-app/index.html`). Реальность: Tawk.to widget уже подключён в той же `index.html` на строке 119 (`<!-- BEGIN TAWK -->...`).

**Урок:** При упоминании external service (chat / payment / monitoring / analytics) — ОБЯЗАТЕЛЬНО:

1. `Read index.html` лендинга (если есть)
2. `Grep` по `package.json` / `*.csproj` / `appsettings*.json` / `composer.json` / `requirements.txt`
3. Только после этого писать "X нет, добавляем"

**Pattern to grep:**

```bash
# Для каждого упомянутого external service
asset="tawk|twilio|crisp|intercom|zendesk|stripe|paypal|sentry|datadog|ga4|segment"
grep -riE "$asset" public/ src/ source-code/ index.html package.json *.csproj appsettings*.json
```

---

## Урок 2: HMAC SHA256 vs SHA1 (категория #1 — External-API claim verify)

**PR/Session:** PR #78 spec, FR.md webhook signature section.

**Категория:** #1 (External-API claim verify, P0).

**Что произошло:** В первой редакции спеки агент написал "Tawk webhook signed with HMAC-SHA256" без сверки с docs. Реальность по `https://developer.tawk.to/webhooks/` — Tawk использует **HMAC-SHA1** (legacy для совместимости). Если бы spec прошёл в impl — webhook signature verification всегда бы failed.

**Урок:** ЛЮБАЯ крипто/сетевая характеристика external API → `WebFetch` на official docs ДО записи в спеку. Никаких "наверное стандарт", "обычно SHA256", "JWT default".

**Pattern to grep:**

```bash
grep -nE '\b(HMAC|SHA-?(1|256|512)|RSA|PSS|Ed25519|JWT|RS256|HS256|HS512|ES256)\b' \
  .specs/{slug}/*.md
# Для каждого hit — verify в official docs через WebFetch
```

---

## Урок 3: PaymentMode collision (категория #12 — Cross-namespace name collision)

**PR/Session:** PR #78 implementation phase, build success but reader confusion.

**Категория:** #12 (Cross-namespace name collision, P0).

**Что произошло:** Добавил `enum PaymentMode { Manual, YooKassa }` в свой namespace `Billing.Domain`. Build прошёл (different namespaces), но в `CreatePaymentCommandHandler.cs:12` уже использовался `Yandex.Checkout.V3.PaymentMode.FullPayment` через `using Yandex.Checkout.V3;`. Ridder кода видит два `PaymentMode` в одном файле, должен fully-qualify каждый — fragile.

**Урок:** Перед `enum` / `class` / `interface` / `record` X — `Grep "(class|enum|interface|record|struct) X\b"` по всему codebase + по `using` declarations в csproj refs.

**Pattern to grep:**

```bash
# Для каждого нового type из spec
for name in $(grep -oE '(enum|class|interface|record|struct)\s+\w+' .specs/{slug}/{DESIGN,SCHEMA}.md | awk '{print $NF}' | sort -u); do
  echo "=== $name ==="
  grep -rE "(class|enum|interface|record|struct)\s+${name}\b" --include="*.cs" --include="*.ts" .
done
```

---

## Урок 4: SQL из скилла (категория #3 — Antipattern guardrails)

**PR/Session:** PR #78, первоначальная спека.

**Категория:** #3 (Antipattern guardrails, P1).

**Что произошло:** Первоначальная спека: "skill пишет SQL UPDATE напрямую через DbContext.Database.ExecuteSqlRawAsync". Противоречит `.claude/rules/antipatterns/no-direct-prod-edits.md` — skills/handlers/hooks НЕ должны выполнять raw SQL. Domain services owns DB writes.

**Урок:** Перед записью имплементационного решения — пройти `.claude/rules/antipatterns/` (если существует в target проекте) целиком grep'ом, отметить совпадения.

**Pattern to grep:**

```bash
# Direct SQL writes от non-data-layer
grep -nE '\b(INSERT|UPDATE|DELETE)\s+(FROM|INTO)?\s*\w+|ExecuteSqlRaw|ExecuteScalarAsync|ExecuteSqlInterpolated' \
  .specs/{slug}/{DESIGN,FR,TASKS}.md

# Skill/handler/hook performs DB write
grep -nE '(skill|handler|hook|controller)\s+(executes?|writes?|updates?)\s+(SQL|database|DB)' \
  .specs/{slug}/*.md
```

---

## Урок 5: Bash != PowerShell (категория #7 — Tooling mismatch)

**PR/Session:** PR #78 impl phase, agent ran command via Bash tool.

**Категория:** #7 (Tooling mismatch, P1).

**Что произошло:** Запустил `if (Test-Path .) { ... }` через Bash tool — fail (синтаксис PowerShell в bash shell). System-prompt подсказывает PowerShell для interactive shell, но Bash tool это `sh/bash` — другая grammar.

**Урок:** Bash-tool команды только bash-grammar (`if [ -d . ]; then ... fi`). PowerShell-синтаксис только если пользователь явно говорит "запусти в PowerShell" или используется PowerShell tool.

**Pattern to grep:**

```bash
# PowerShell glyphs в bash code blocks
grep -nE '\b(Test-Path|Get-ChildItem|New-Item|Set-Location|Write-Host|Where-Object|ForEach-Object)\b' \
  .specs/{slug}/*.md
grep -nE '\$env:|\$_\.|\$PSItem' .specs/{slug}/*.md
grep -nE '\| Where-Object|\| ForEach-Object|\| Select-Object' .specs/{slug}/*.md
```

---

## Урок 6: UC-8 idempotency как требование, не Assumption (категория #4)

**PR/Session:** PR #78 USE_CASES drafting.

**Категория:** #4 (Assumption-vs-Requirement, P1).

**Что произошло:** Добавил UC-8 (повторный submit идемпотентен) без явной просьбы пользователя. Это разумная защита (replay attacks, network retries), но это допущение — пользователь не upомянул requirement explicitly.

**Урок:** Для каждого UC/FR проверить — есть ли в Extracted Requirements плана прямая цитата? Нет — переносим в Assumptions с маркером `[A]` ИЛИ удаляем ИЛИ confirm с user.

**Pattern to grep:**

```bash
# FR/UC/AC без [A] marker
grep -nE '^### (UC|FR|AC)-\d+' .specs/{slug}/{USE_CASES,FR,ACCEPTANCE_CRITERIA}.md | \
  while read line; do
    # Check если в plan-файле есть match
    # Если нет и в FR/UC нет [A] — flag P1
  done

# Quick check existing [A] markers
grep -c '\[A\]' .specs/{slug}/*.md
```

---

## Урок 7: Plan-gate format strict (категория #8)

**PR/Session:** PR #78 plan creation.

**Категория:** #8 (Plan-gate template compliance, P1).

**Что произошло:**

1. Todos с `- description: ...` (вместо blockquote `> ...`) — `validate-plan.ts` Phase 1 fail
2. Абсолютный путь `D:\repos\my-app\src\file.ts` в File Changes (relative paths required)
3. Активный plan path был `expressive-twirling-goblet.md`, но system-reminder указал `iridescent-whistler-...md` — писал не туда

**Урок:** Перед каждой правкой плана:

1. `Read tools/plan-pomogator/template.md`
2. `ls ~/.claude/plans/` для определения активного plan-файла
3. Прочитать "Plan File Info:" из system prompt — единственный source of truth куда писать

**Pattern to grep:**

```bash
# Absolute paths
grep -nE '[A-Z]:\\|/Users/|/home/' "{plan-file}"

# Wrong todo format
grep -nE '^- description:' "{plan-file}"

# Validate
npx tsx tools/plan-pomogator/validate-plan.ts "{plan-file}"
```

---

## Урок 8: Action filter ≠ middleware для raw-body (категория #11 — spec ↔ code drift)

**PR/Session:** PR #78 impl phase, webhook signature verification.

**Категория:** #11 (Spec ↔ code drift, P1).

**Что произошло:** Спека говорила "TawkWebhookSignatureFilter (action filter) для HMAC проверки". Но `[ServiceFilter]` action filter выполняется ПОСЛЕ model binding — body уже потенциально consumed (depending on input formatter). Эталон в codebase — `YooKassaIPWhitelistMiddleware` — это middleware, выполняется ДО model binding.

**Урок:** Перед записью имплементационной детали типа `filter` / `middleware` / `handler` / `delegating handler` — найти эталонную реализацию в codebase grep'ом и проверить тип. Read 30+ строк context.

**Pattern to grep:**

```bash
# Webhook/signature verification — найти эталон
grep -rnE '(SignatureFilter|SignatureMiddleware|VerifySignature|HmacVerify)' \
  --include="*.cs" --include="*.ts" src/

# Middleware vs filter usage
grep -rnE 'app\.UseMiddleware<|services\.AddScoped<.*Filter>' --include="*.cs" src/Program.cs src/Startup.cs
```

---

## Урок 9: InfrastructureInitializerService vs Database.MigrateAsync (категория #11)

**PR/Session:** PR #78 impl phase, DB migration design.

**Категория:** #11 (Spec ↔ code drift, P1).

**Что произошло:** Spec говорила "миграция через `InfrastructureInitializerService`" — фантазия, такого class не существует. Реально в `BillingServiceCollectionExtensions:283` уже есть `Database.MigrateAsync()` retry policy через Polly.

**Урок:** Перед записью "миграция через X" — `Grep "MigrateAsync\|UseSqlServer\|UseNpgsql\|UseSqlite"` по DI extensions. Понимать существующий механизм миграций.

**Pattern to grep:**

```bash
# Existing migration mechanism
grep -rnE '(MigrateAsync|EnsureCreated|UseSqlServer|UseNpgsql|UseSqlite|alembic upgrade)' \
  --include="*.cs" --include="*.py" \
  src/*Extensions.cs src/Program.cs src/Startup.cs alembic/

# DI service registrations
grep -rnE 'services\.Add(Scoped|Singleton|Transient)<I?\w+InitializerService>' --include="*.cs" src/
```

---

## Урок 10: IIdempotencyService vs DB-level (категория #11)

**PR/Session:** PR #78 impl phase, idempotency design.

**Категория:** #11 (Spec ↔ code drift, P1).

**Что произошло:** Spec говорила "идемпотентность через `IIdempotencyService.ExecuteOnceAsync(key, action)`" — in-memory cache approach. Реальная имплементация ушла на DB-level: `paymentRepository.FindRecentByIdempotencyKeyAsync(key)` перед insert (атомарно через unique constraint, persists across restarts, work for distributed instances).

**Урок:** Для финансовых данных DB-level честнее (durability, distributed safety). При spec drift — fix spec, а не код. Cache-based idempotency допустима только для idempotent reads.

**Pattern to grep:**

```bash
# Existing idempotency mechanism
grep -rnE '(Idempotency|IdempotencyKey|FindRecentBy)' \
  --include="*.cs" --include="*.ts" src/

# Unique constraints на idempotency
grep -rnE '(IDX_.*Idempotency|HasIndex.*IdempotencyKey).*IsUnique' --include="*.cs" src/
```

---

## Урок 11: GetCurrentRateAsync ≠ GetExchangeRateAsync (категория #11)

**PR/Session:** PR #78 handler implementation.

**Категория:** #11 (Spec ↔ code drift, P1).

**Что произошло:** В handler написал `_currencyService.GetCurrentRateAsync(ct)`. Реально интерфейс — `Task<decimal> GetExchangeRateAsync(string from, string to, CancellationToken)`. Compiler caught (build error), но потеря времени и confusion.

**Урок:** Перед использованием метода injected service → `Read interface file`, не угадывать сигнатуру.

**Pattern to grep:**

```bash
# Find interface file для каждого injected service
for svc in $(grep -oE 'I\w+Service' .specs/{slug}/DESIGN.md | sort -u); do
  echo "=== $svc ==="
  grep -rnE "interface $svc\b" --include="*.cs" src/
done

# Verify method signatures
grep -rnE '(Task|Task<\w+>)\s+\w+Async\(' --include="*.cs" src/Services/I*.cs
```

---

## Урок 12: Endpoint path /create vs /yookassa/create (категория #11)

**PR/Session:** PR #78 endpoint spec.

**Категория:** #11 (Spec ↔ code drift, P1).

**Что произошло:** Спека писала `POST /api/billing/payment/create`. Реальный endpoint по controller:

```csharp
[Route("api/billing/payment")]      // controller-level
public class PaymentController { ...
  [HttpPost("yookassa/create")]      // method-level
  public async Task<...> Create(...) { ... }
}
```

Combined path = `/api/billing/payment/yookassa/create`. Frontend calls failed 404.

**Урок:** Перед записью endpoint path в спеке — `Grep "HttpPost\|HttpGet\|Route"` по существующим controllers + проверить combined Route+HttpVerb.

**Pattern to grep:**

```bash
# Find combined route paths
grep -B2 -A1 -nE '\[Http(Post|Get|Put|Delete|Patch)\(' --include="*.cs" -r src/Controllers/

# Compare with spec endpoint claims
grep -nE '(POST|GET|PUT|DELETE|PATCH)\s+/api/' .specs/{slug}/{FR,DESIGN}.md
```

---

## Урок 13: `tail -50` в pipe висит без EOF

**PR/Session:** Various sessions, background dotnet test.

**Категория:** Tooling-related (gotcha, не строго одна из 13 категорий — но влияет на TASKS.md commands).

**Что произошло:** Запустил `dotnet test ... | tail -50` в background. dotnet завершился, но bash висел из-за `tail -50` без EOF в pipe — 20+ минут. Naked `| tail` в bg = single point of failure (см. `.claude/rules/pomogator/no-blocking-on-tests.md`).

**Урок:** Для long-running команд в background → redirect на disk:

- `> output.txt 2>&1` (clean redirect)
- `| tee /tmp/full.log | tail -40` (defense in depth — tee пишет даже если tail/capture drops)

Категория #7 spec-review должен flag любые `| tail` или `| head` без `tee` в TASKS bg-команд.

**Pattern to grep:**

```bash
# TASKS commands с naked | tail (без tee)
grep -nE '\|\s*(tail|head)\s+-\w+' .specs/{slug}/TASKS.md | grep -v 'tee'
```

---

## Урок 14: npm install --legacy-peer-deps в этом репо

**PR/Session:** Various, frontend dev workflow.

**Категория:** Tooling-related (#7 partially), project-specific конвенция.

**Что произошло:** `npm install` упал на ERESOLVE peer-dep conflict (`@lobehub/icons` vs React major version). Правило `.claude/rules/frontend/docker-dev.md` его описывало, но agent не прочитал rules ДО `npm install`.

**Урок:** Перед `npm install` / `pip install` / `dotnet restore` / `cargo build` — `Read .claude/rules/frontend/*.md` или `.claude/rules/{stack}/*.md`. Организационные квирки часто документированы.

**Pattern to grep:**

```bash
# Check existence of stack-specific rules
ls .claude/rules/frontend/*.md .claude/rules/backend/*.md .claude/rules/dotnet/*.md 2>/dev/null

# Если spec предлагает install command — verify против rules
grep -nE '(npm|yarn|pnpm)\s+(install|i)\b' .specs/{slug}/TASKS.md
```

---

## Урок 15: dotnet ef migrations add без БД

**PR/Session:** PR #78 impl phase.

**Категория:** Knowledge gap (не строго одна из 13, но релевантно для TASKS validation).

**Что произошло:** Думал что `dotnet ef migrations add` требует connection к live БД. Отложил создание migration до того как поднимешь Postgres. Реально для `migrations add` БД не нужна — только design-time `IDbContextFactory<TContext>` (или явный constructor с empty `DbContextOptions`).

**Урок:** EF migrations design-time tools (`add`, `script`, `remove`) БД не требуют. Только `migrations apply` / `database update` требуют live connection. Можно генерировать миграции на ноутбуке без поднятого Postgres.

**Pattern to grep:**

```bash
# В TASKS если task говорит "wait for DB before migration add" — flag
grep -nE 'migration.*add.*after.*(start|launch|provision).*(Postgres|MySQL|SQL Server)' \
  .specs/{slug}/TASKS.md
```

---

## Aggregation: lessons → categories matrix

| # | Урок | Category | Severity |
|---|------|----------|----------|
| 1 | Tawk vs Twilio | #2 | P0 |
| 2 | HMAC SHA256 vs SHA1 | #1 | P0 |
| 3 | PaymentMode collision | #12 | P0 |
| 4 | SQL из скилла | #3 | P1 |
| 5 | Bash != PowerShell | #7 | P1 |
| 6 | UC-8 idempotency | #4 | P1 |
| 7 | Plan-gate format strict | #8 | P1 |
| 8 | Action filter ≠ middleware | #11 | P1 |
| 9 | InfrastructureInitializerService | #11 | P1 |
| 10 | IIdempotencyService DB-level | #11 | P1 |
| 11 | GetCurrentRateAsync signature | #11 | P1 |
| 12 | Endpoint path drift | #11 | P1 |
| 13 | naked `\| tail` в bg | #7 | P2 |
| 14 | npm install --legacy-peer-deps | #7 | P2 |
| 15 | dotnet ef migrations без БД | (knowledge) | informational |
