# Antipattern Triggers (Category #3)

Default trigger list для категории #3 — используется когда target проект НЕ имеет `.claude/rules/antipatterns/*.md` каталога. Если каталог существует, его triggers имеют приоритет (read-and-merge).

> **MCP-rails (FR-39):** Step 1 reads `.claude/rules/…` (NOT `.specs/`) → ordinary
> Read/Glob. Step 2 scans the SPEC and MUST go through the read door — never a raw
> `grep` of `.specs/`.

## Detection algorithm

```bash
# Step 1: проверить существование antipatterns каталога в target проекте
# (.claude/rules/ is NOT .specs/ → ordinary Read/Glob is fine here)
if [ -d ".claude/rules/antipatterns" ]; then
  # Read each rule file и извлечь trigger patterns из ## Trigger / ## Антипаттерн / ## Запрещено секций
  for rule in .claude/rules/antipatterns/*.md; do
    name=$(basename "$rule" .md)
    # Extract patterns (см. ниже)
  done
else
  # Use default trigger list ниже
fi
```

```
# Step 2 (MCP-rails): scan the SPEC through the read door, not grep over .specs/
#   for doc in FR.md DESIGN.md TASKS.md FILE_CHANGES.md:
#     read_spec_doc({ spec: "{slug}", doc }) → match each {pattern} against the content
```

## Default trigger list

Каждый trigger: regex pattern + reason + suggested fix + rule reference (если применимо).

### AP-DB-1: Direct SQL writes from non-data-layer

**Pattern:**

```bash
grep -nE '\b(INSERT|UPDATE|DELETE)\s+(FROM\s+|INTO\s+)?\w+|ExecuteSqlRaw|ExecuteScalarAsync|raw SQL|napram(ую|ой|ой)|directly executes? UPDATE' \
  .specs/{slug}/{DESIGN,FR}.md
```

Severity: P1 если в DESIGN/FR mentions skill/handler/controller writes SQL напрямую.

**Reason:** Skills, handlers, hooks should NOT execute raw SQL. Domain services own DB writes (testability, transaction boundary, audit log).

**Fix:** Replace с domain service call (e.g. `IUserService.SuspendAsync`, `IPaymentRepository.MarkRefundedAsync`).

**Rule ref:** `.claude/rules/antipatterns/no-direct-prod-edits.md` (если существует).

---

### AP-MOCK-1: Mocks/stubs в e2e/integration tests

**Pattern:**

```bash
grep -nE 'Mock<|Substitute\.For<|jest\.mock|sinon\.stub|MagicMock\(' \
  .specs/{slug}/{FR,DESIGN,TASKS}.md | grep -iE 'e2e|integration|end-to-end'
```

Severity: P1.

**Reason:** Integration tests должны использовать реальные dependencies (real DB через testcontainers, real HTTP server). Mocks допустимы ТОЛЬКО для unit tests.

**Fix:** Replace mock plan с testcontainer / fake server / in-memory DB настоящего типа.

**Rule ref:** `.claude/rules/integration-tests-first.md`.

---

### AP-MOCK-2: Test fallback / silent skip

**Pattern:**

```bash
grep -nE '(Skip\(|test\.skip|\.todo|fallback to (mock|stub)|catch.*Skip|Inconclusive)' \
  .specs/{slug}/{FR,DESIGN,TASKS}.md
```

Severity: P1.

**Reason:** Tests не должны silently skip. Если зависимость недоступна — fail loud.

**Fix:** Replace `try { real } catch { skip }` patterns на `Assert.Throws` или explicit `[RequiresExternalService]` attribute.

**Rule ref:** `no-mocks-fallbacks` reference в create-spec skill (под `.claude/skills/create-spec/`).

---

### AP-SYNC-1: Sync over async (Result/Wait/blocking)

**Pattern:**

```bash
grep -nE '\.Result\b|\.Wait\(\)|GetAwaiter\(\)\.GetResult\(\)|asyncio\.run\(.*\)\.result' \
  .specs/{slug}/DESIGN.md
```

Severity: P2 (можеть быть legitimate в Main entry point).

**Reason:** Blocking async в hot path → deadlock в ASP.NET sync context, thread pool starvation.

**Fix:** Propagate `async` / `await` up the call chain. Если absolutely needed — `Task.Run(() => ...).GetAwaiter().GetResult()` с комментарием почему.

---

### AP-CFG-1: Hardcoded secrets / connection strings в коде

**Pattern:**

```bash
grep -nE '(password|secret|api[-_ ]?key|token|connection[-_ ]?string)\s*[=:]\s*"[^"]{8,}"' \
  .specs/{slug}/*.md
```

Severity: P0 если literal secret-like value в spec.

**Reason:** Secrets must come from `appsettings.{env}.json` / env vars / Key Vault / 1Password. Никогда — hardcoded.

**Fix:** Use placeholder `{ConfigurationKey}` syntax в spec (e.g. `appsettings.json["Tawk:Secret"]`), fetch via `IConfiguration` в коде.

---

### AP-EXC-1: Catch-all exception swallowing

**Pattern:**

```bash
grep -nE 'catch\s*\(?\s*Exception\s*\)?\s*\{?\s*\}|except:\s*pass|except\s+Exception:\s*pass' \
  .specs/{slug}/DESIGN.md
```

Severity: P2.

**Reason:** Глотание exceptions скрывает баги. Допустимо ТОЛЬКО с explicit logging + propagation decision.

**Fix:** Catch specific exception types. Always log. Re-throw or wrap.

---

### AP-NULL-1: Null-as-flag в API contracts

**Pattern:**

```bash
grep -nE '(returns?|возвращает)\s+null\s+(if|когда|on|при)|nullable\s+result' \
  .specs/{slug}/{FR,DESIGN}.md
```

Severity: P2.

**Reason:** Null как control flow → NullReferenceException risks. Better: Result<T, E>, Option<T>, или explicit empty.

**Fix:** Replace с `Maybe<T>` / `Result<T>` / explicit empty collection.

---

### AP-DATE-1: Local time vs UTC mixing

**Pattern:**

```bash
grep -nE 'DateTime\.Now|datetime\.now\(\)|new Date\(\)' .specs/{slug}/{FR,DESIGN}.md
```

Severity: P1 если spec упоминает timestamps без UTC marker.

**Reason:** Timezone bugs в production. Webhooks, billing, audit logs должны быть UTC.

**Fix:** Use `DateTime.UtcNow`, `datetime.now(timezone.utc)`, `Date.now()` (already UTC ms).

---

### AP-RETRY-1: Бесконечный retry без circuit breaker

**Pattern:**

```bash
grep -nE 'retry\s+(forever|indefinitely|until\s+success|infinit)|while\s+true.*retry' \
  .specs/{slug}/{FR,DESIGN}.md
```

Severity: P1.

**Reason:** External API down → бесконечный retry → cascading failure.

**Fix:** Polly retry policy с exponential backoff + max attempts + circuit breaker. Document max attempts в FR/AC.

---

### AP-LOG-1: PII / secrets в логах

**Pattern:**

```bash
grep -nE 'log.*\.(?:Info|Debug|Trace).*\b(password|secret|token|email|phone|ssn|card)\b' \
  .specs/{slug}/{FR,DESIGN}.md
```

Severity: P0.

**Reason:** GDPR / PCI-DSS violations. PII в логах → compliance breach.

**Fix:** Mask PII в structured logging. Never log secrets. Use `[LogProperty(Sensitive = true)]` attributes.

---

### AP-FRONT-1: innerHTML / dangerouslySetInnerHTML с user input

**Pattern:**

```bash
grep -nE '(innerHTML|dangerouslySetInnerHTML).*\b(user|input|query|param|body)\b' \
  .specs/{slug}/{FR,DESIGN}.md
```

Severity: P0 (XSS vulnerability).

**Fix:** Use textContent / React's default escaping. If HTML rendering required — DOMPurify / sanitize-html.

---

### AP-MIGRATION-1: Database migration в startup без feature flag

**Pattern:**

```bash
grep -nE '(MigrateAsync|EnsureCreated|alembic upgrade|django migrate).*startup|startup.*migrate' \
  .specs/{slug}/{FR,DESIGN}.md
```

Severity: P2 (depends on policy).

**Reason:** Migrations в startup blocks deployment + concurrent instances race conditions.

**Fix:** Separate migration step (CI/CD pipeline или explicit admin command). Document в DESIGN.md что migration выполняется до start of new version.

---

## Project-specific overlay

Если target проект имеет `.claude/rules/antipatterns/*.md`, EACH rule должен быть прочитан, и его trigger patterns merged с default list. Conflict resolution: project-specific overrides default.

```bash
# Read project rules
for rule in .claude/rules/antipatterns/*.md; do
  # Extract «## Антипаттерн» / «## Запрещено» / «## Trigger» секций
  awk '/^## (Антипаттерн|Запрещено|Trigger|Triggers)/,/^## /' "$rule"
done
```

## Severity calibration

Default antipattern severity = P1. Override only когда:

- **P0** (block ConfirmStop): security-impacting (PII logging, hardcoded secrets, XSS)
- **P2** (recommendation): architectural smell без immediate damage (sync-over-async, null-as-flag)
- **P3** (informational): style preference (date format, naming convention)
