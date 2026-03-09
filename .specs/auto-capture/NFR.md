# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1:** UserPromptSubmit hook (regex-only) SHALL complete within 500ms to avoid noticeable delay for the user.
- **NFR-P2:** Stop hook with LLM semantic detection SHALL complete within 10 seconds (session end — user tolerance is higher).
- **NFR-P3:** Stop hook regex-only fallback SHALL complete within 1 second.
- **NFR-P4:** Queue read in /suggest-rules Phase -1.5 SHALL complete within 100ms for queue files up to 1000 entries.
- **NFR-P5:** /reflect command SHALL render table within 2 seconds for queue files up to 1000 entries.
- **NFR-P6:** Atomic queue write (lock + read + append + write + unlock) SHALL complete within 200ms.
- **NFR-P7:** Threshold check (FR-10) SHALL add < 50ms to total UserPromptSubmit hook execution time.

### Future Enhancement: Web Research

suggest-rules pipeline (Phase 4) может быть расширен добавлением WebSearch/WebFetch в allowed-tools для верификации best practices при создании rules/skills.

> Источник: Claudeception uses WebSearch + WebFetch during skill extraction

## Security

- **NFR-S1:** Queue entries SHALL NOT contain full user prompts — only `signal` (< 100 chars) and `context` (< 200 chars) as truncated excerpts.
- **NFR-S2:** Queue file path SHALL be validated through `resolveWithinProject()` to prevent path traversal.
- **NFR-S3:** LLM API key SHALL be read from env var (`AUTO_COMMIT_LLM_URL`), NOT hardcoded in scripts.
- **NFR-S4:** Queue file SHALL be in `.dev-pomogator/` (already in .gitignore) to prevent accidental commit of captured signals.
- **NFR-S5:** Lock file SHALL contain PID for stale lock identification, NOT sensitive data.

## Reliability

- **NFR-R1:** Queue writes SHALL be atomic (temp file + move) to prevent corruption on crash/power loss.
- **NFR-R2:** Concurrent hook invocations SHALL be serialized via file lock (flag: 'wx') to prevent data loss.
- **NFR-R3:** Stale lock files (> 60 seconds old) SHALL be automatically removed and retried.
- **NFR-R4:** Corrupted queue file SHALL be backed up as `learnings-queue.json.bak` and replaced with empty queue.
- **NFR-R5:** LLM unavailability SHALL gracefully fallback to regex-only detection without error to user.
- **NFR-R6:** Missing transcript_path (Cursor) SHALL fallback to prompt-only analysis without error.
- **NFR-R7:** capture.ts hook failure SHALL NOT block user workflow — exit 0 with stderr logging.
- **NFR-R8:** Phase 6 rule merge operations SHALL create backup of target files before modification. Backup path: `.dev-pomogator/.merge-backups/{filename}_{timestamp}.md`. Auto-cleanup: 30 days.
  > Источник: claude-reflect-system timestamped backups + 30-day auto-cleanup

## Usability

- **NFR-U1:** Auto-capture SHALL be zero-friction — user SHALL NOT notice hook execution during normal workflow.
- **NFR-U2:** /reflect table SHALL be scannable at a glance — max 6 columns, sorted by timestamp desc.
- **NFR-U3:** Auto-dedupe in /suggest-rules SHALL be silent — dedupe decisions logged in Phase 3 output, not interrupting user.
- **NFR-U4:** Queue auto-cleanup SHALL remove entries older than 30 days to prevent unbounded growth.
- **NFR-U5:** First-time setup SHALL require zero configuration — hooks installed automatically via extension manifest.
- **NFR-U6:** /reflect SHALL show actionable suggestions when queue is empty: "Сигналы появятся автоматически при работе с агентом."
- **NFR-U7:** capture.ts SHALL работать без MCP, deep-insights или других внешних зависимостей. Единственная зависимость — `tsx` для TypeScript execution. Queue operations полностью автономны.
  > Источник: Claudeception zero-friction setup (1 файл, 0 зависимостей)
