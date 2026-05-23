# Non-Functional Requirements (NFR)

## Performance

- **Sub-agent invocation timeout**: 60 seconds. Sub-agent ОБЯЗАН вернуть результат за 60s либо main skill timeout с partial report
- **End-to-end command duration**: ≤90 seconds для типичной спеки (≤20 AC, ≤30 test files) — sub-agent reads + git status + YAML read должны parallel где можно
- **Context bundle size**: ≤4KB JSON для sub-agent (lean brief — sub-agent сам читает большие файлы)
- **No file system writes**: skill read-only (no .progress.json writes, no .verification-log creation) — workflow side-effect-free

## Security

- **Sub-agent prompt не должен embedding credentials**: при включении content из spec файлов в context bundle — фильтр на patterns `*_KEY=`, `*_TOKEN=`, `*_SECRET=`, `password:` (case-insensitive); matched lines replaced с `[REDACTED]` перед передачей в Agent
- **Path traversal protection**: spec slug validated через regex `^[a-zA-Z0-9_-]+$` перед использованием в paths; reject и exit с error если invalid
- **No external network calls**: skill работает только с local filesystem + git + Docker через локальные команды; никаких HTTP requests, никаких telemetry exfiltration

## Reliability

- **Fail-open behavior**: если sub-agent crash / timeout / parse error в output JSON → skill ОБЯЗАН вернуть skeleton report с message `Sub-agent unavailable — manual verification required: <checklist>` (не throw error, не exit non-zero)
- **Idempotent**: повторный вызов даёт identical output для same spec state (нет side effects между вызовами)
- **No regression на missing files**: если `.test-status` или plan path отсутствуют — skill graceful degradation, отчёт содержит section `Missing artifacts: [paths]`
- **Stale heartbeat detection**: YAML mtime check ≥5 min при `state: running` → classify as stale (не treated как failed)

## Usability

- **Output format**: Markdown с emoji-prefixes для quick scan (✓ verified, ⏸ blocked, ❌ claimed-only, 🟢 STRONG, 🟡 WEAK, 🔴 FAKE-POSITIVE-RISK, ⚠ environmental)
- **Structured JSON для machine consumption**: parsable schema described в `honest-status-command_SCHEMA.md` для programmatic downstream tools
- **No interaction**: skill не требует AskUserQuestion в normal flow — даёт report и exit (interactive только при missing slug fallback "Pass slug explicitly")
- **Self-documenting output**: при отсутствии active spec — output содержит usage hint `/spec-status <slug>`; при environmental blocker — actionable recovery hint (e.g. "Restart Docker Desktop / WSL")
- **AI-friendly readability**: each section ≤5 bullet-points в markdown render; long lists collapsed в counts + "show all via --verbose flag" (verbose flag — future enhancement, не v1)
