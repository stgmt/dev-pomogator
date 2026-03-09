# Acceptance Criteria (EARS)

## AC-1 (FR-1): Capture Hook Script @feature1

**Требование:** [FR-1](FR.md#fr-1-capture-hook-script)

WHEN UserPromptSubmit hook receives JSON input with `prompt` field containing a correction pattern THEN capture.ts SHALL parse the prompt, detect T1-T6 signals via regex, AND write matching entries to `.dev-pomogator/learnings-queue.json`.

WHEN Stop hook receives JSON input with `transcript_path` field THEN capture.ts SHALL read the transcript, analyze for T1-T6 signals (semantic + regex), AND write matching entries to queue.

IF no T1-T6 signals are detected in the input THEN capture.ts SHALL exit silently without writing to queue.

## AC-1a (FR-1a): Regex-based Detection @feature1a

**Требование:** [FR-1a](FR.md#fr-1a-regex-based-detection)

WHEN prompt contains T2 correction pattern (e.g., "no, use bun") THEN capture SHALL create entry with trigger=T2 AND confidence >= 0.8.

WHEN prompt contains T6 workaround pattern (e.g., "костыль") THEN capture SHALL create entry with trigger=T6 AND confidence >= 0.7.

WHEN prompt contains T3 repeated confusion pattern (e.g., "опять та же проблема") THEN capture SHALL create entry with trigger=T3 AND confidence >= 0.7.

WHEN prompt contains explicit marker ("remember:", "запомни:") THEN capture SHALL create entry with confidence >= 0.9.

WHEN prompt matches 2+ patterns of the same trigger type THEN confidence SHALL be min(max_single_confidence * 1.1, 1.0).

WHEN prompt matches approval pattern (e.g., "perfect", "отлично") AND pending queue entry exists with overlapping keywords THEN capture SHALL boost entry confidence by +0.15 (capped at 1.0) WITHOUT creating new entry.

IF prompt matches approval pattern AND no matching pending entry exists THEN capture SHALL NOT create any entry.

> Источник: claude-reflect-system MEDIUM confidence approvals

## AC-1b (FR-1b): AI-powered Semantic Detection @feature1b

**Требование:** [FR-1b](FR.md#fr-1b-ai-powered-semantic-detection)

WHEN Stop hook has `transcript_path` AND `LEARNINGS_SEMANTIC_ENABLED !== "false"` THEN capture SHALL invoke Haiku LLM with last 20 messages AND parse structured JSON output for T1-T6 signals.

IF LLM call fails (timeout, network error, invalid response) THEN capture SHALL fallback to regex-only analysis of transcript messages AND log warning to stderr.

IF `LEARNINGS_SEMANTIC_ENABLED === "false"` THEN capture SHALL skip LLM call AND use regex-only analysis.

WHEN Stop hook has transcript AND LLM returns no T1-T6 signals BUT self-evaluation gates return at least one YES THEN capture SHALL create entry with trigger=T5 AND confidence >= 0.7.

> Источник: Claudeception self-evaluation gates

## AC-2 (FR-2): Queue Schema @feature2

**Требование:** [FR-2](FR.md#fr-2-queue-schema)

WHEN queue file is read by any consumer (/suggest-rules, /reflect) THEN it SHALL conform to version 1 schema with all required fields: id, timestamp, sessionId, trigger, signal, context, confidence, source, platform, status.

IF queue file does not exist THEN reading consumer SHALL treat it as empty queue (0 entries).

WHEN entry is written THEN `signal` SHALL be truncated to 100 characters AND `context` SHALL be truncated to 200 characters.

WHEN entry is written THEN it SHALL include `fingerprint` (SHA-256[:16] of normalized signal), `count` (default 1), AND `lastSeen` (ISO8601).

> Источник: claude-reflect-system fingerprint dedup

## AC-3 (FR-3): Atomic Queue Operations @feature3

**Требование:** [FR-3](FR.md#fr-3-atomic-queue-operations)

WHEN capture.ts writes to queue THEN it SHALL acquire file lock via `writeFile(lockFile, pid, { flag: 'wx' })` before reading/writing.

WHEN two hooks attempt to write simultaneously THEN file lock SHALL serialize access AND both entries SHALL be persisted (second hook waits for lock release).

IF lock file exists AND is older than 60 seconds THEN capture SHALL remove stale lock AND retry acquisition.

IF queue JSON is corrupted (parse error) THEN capture SHALL backup corrupted file as `.bak` AND create new empty queue.

WHEN new entry fingerprint matches existing pending entry THEN appendEntries SHALL increment existing entry count AND update lastSeen AND NOT create new entry.

> Источник: claude-reflect-system fingerprint dedup

## AC-4 (FR-4): /suggest-rules Phase -1.5 Integration @feature4

**Требование:** [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration)

WHEN /suggest-rules runs AND `.dev-pomogator/learnings-queue.json` contains pending entries THEN Phase -1.5 SHALL display summary `📥 Queue: N pending entries` AND create pre-candidates with source `📥 queue`.

WHEN /suggest-rules Phase 5 creates files from queue-sourced candidates THEN consumed entries SHALL be updated: status="consumed", consumedBy="{rule-path}", consumedAt="{timestamp}".

IF queue file does not exist OR has no pending entries THEN Phase -1.5 SHALL display `📥 Queue: пуст` AND continue to Phase -0.5.

WHEN Phase -1.5 creates pre-candidate from queue entry THEN it SHALL add ACCUMULATED_EVIDENCE (+15) bonus.

WHEN queue entry has count >= 3 THEN Phase -1.5 SHALL add CROSS_SESSION_REPEAT (+20) bonus.

> Источник: claude-reflect-system count-based promotion

## AC-5 (FR-5): Auto-Dedupe in Phase 2.5 @feature3

**Требование:** [FR-5](FR.md#fr-5-auto-dedupe-in-phase-25-feature3)

WHEN queue-based candidate keywords match existing rule content with >80% overlap THEN candidate SHALL be marked DUP AND queue entry status SHALL be set to consumed with consumedBy="DUP:{rule-path}".

WHEN overlap is 30-80% THEN candidate SHALL be shown as MERGE with reference to existing rule.

WHEN overlap is <30% THEN candidate SHALL be treated as NEW.

## AC-6 (FR-6): /reflect Command @feature2

**Требование:** [FR-6](FR.md#fr-6-reflect-command)

WHEN user runs /reflect THEN command SHALL display table of all entries sorted by timestamp (newest first) with columns: #, Trigger, Signal, Confidence, Age, Status.

WHEN user types "reject N" THEN entry N status SHALL be set to "rejected".

WHEN user types "clear" THEN all consumed and rejected entries SHALL be removed from queue file.

WHEN user types "stats" THEN command SHALL show breakdown by trigger type and status.

IF queue is empty THEN command SHALL display: "Очередь пуста. Сигналы появятся автоматически при работе с агентом."

## AC-7 (FR-7): Auto-Dedupe Rules in Phase 6 @feature3

**Требование:** [FR-7](FR.md#fr-7-auto-dedupe-rules-in-phase-6-feature3)

WHEN /suggest-rules Phase 6 (Rules Optimization) runs THEN auto-dedupe SHALL read all `.claude/rules/**/*.md` files AND identify pairs with >70% semantic keyword overlap.

WHEN merge candidates are found THEN Phase 6 summary SHALL display merge candidates with overlap percentage AND propose merged file content within the same pipeline flow.

IF no merge candidates found THEN Phase 6 summary SHALL include: "Дубликатов не найдено."

## AC-8 (FR-8): Extension Manifest Update @feature4

**Требование:** [FR-8](FR.md#fr-8-extension-manifest-update)

WHEN extension is installed via dev-pomogator installer THEN hooks SHALL be registered:
- Claude: UserPromptSubmit + Stop events in `.claude/settings.json`
- Cursor: beforeSubmitPrompt + stop events in `~/.cursor/hooks/hooks.json`

WHEN extension is updated THEN new hooks SHALL be added via smart merge WITHOUT removing existing user hooks or other extension hooks.

WHEN capture hook coexists with specs-validator on UserPromptSubmit THEN both hooks SHALL be registered as separate entries in hooks array.

## AC-9 (FR-9): Installation Verification @feature4

**Требование:** [FR-9](FR.md#fr-9-installation-verification)

WHEN /verify-install runs THEN it SHALL check:
1. `capture.ts` exists in `.dev-pomogator/tools/learnings-capture/`
2. Hooks registered in platform settings file
3. Hook commands reference `learnings-capture/capture.ts`

IF any check fails THEN verification SHALL report specific failure with fix suggestion.

IF queue.json does not exist THEN verification SHALL report warning (not error): "will be created on first capture".

## AC-10 (FR-10): Auto-Suggest Threshold @feature5

**Требование:** [FR-10](FR.md#fr-10-auto-suggest-threshold-feature5)

WHEN capture.ts writes new entry AND pending queue count >= LEARNINGS_SUGGEST_THRESHOLD (default 5) THEN capture SHALL output notification to stderr.

IF LEARNINGS_SUGGEST_THRESHOLD is 0 THEN capture SHALL skip notification check.

IF pending count < threshold THEN capture SHALL NOT output notification.

> Источник идеи: Claudeception auto-activation hook
