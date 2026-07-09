# BIET Handoff — Claude Code context bloat from hook output

**Date:** 2026-07-08
**For:** next agent fixing `dev-pomogator` hook/tool-output context bloat
**Type:** bugfix handoff with proof, not a hypothesis
**Severity:** high for Claude Code usability; repeated compaction/thrash can make sessions unusable

BIET here means:

- **B**ug: exact broken behavior.
- **I**mpact: why it hurts the agent/session.
- **E**vidence: concrete transcript/source proof.
- **T**asks + Tests: minimal fix path and verification.

---

## B — Bug

`dev-pomogator` emits oversized hook stdout into Claude Code transcript entries.

The worst offender is `spec-conformance-push`, registered as a `PostToolUse` hook for `Write|Edit`. It builds a full conformance graph, receives thousands of findings, and prints every finding into a `<system-reminder>` block.

The persisted-output UI preview is misleading: Claude Code shows a small `Output too large (...)` preview and writes the full stdout to `tool-results/*.txt`, but the JSONL transcript entry still contains the full raw stdout in `attachment.stdout`. This means compact/restart can still inherit the bloat.

Secondary offender: the prompt-time status/census hook prints `Spec conformance` / `Spec tasks (census)` banners on `UserPromptSubmit`. Individually they are small, but they repeat often and should remain tightly capped/debounced.

This is not primarily CARL lazy-load. CARL showed `context=lazy-managed; reduction=53719->6286` in separate sessions; the 700 KB blasts are hook stdout.

---

## I — Impact

Observed effects:

- Claude Code sessions hit context limit soon after `/compact`.
- Autocompact appears to "not work" because the transcript refills with hook/tool output.
- Repeated resumes create additional 88-170 KB "continued from previous conversation" summaries, compounding the issue.
- The proxy/sub2api side may be healthy while Claude-side local transcript bloat still kills the session.

The fix must reduce agent-facing hook stdout. Do not solve this by tuning model context windows, compact models, or proxy fallback.

---

## E — Evidence

### Transcript proof

Primary session inspected:

```text
C:\Users\stigm\.claude\projects\E--repos-dev-pomogator\d977d18b-799e-4938-8492-a875052f1d04.jsonl
```

Measured summary:

```text
bytes=150918602
lines=23404
huge_or_output_too_large_hooks=176
output_too_large=195
spec_findings_mentions=122
status_banners=46
```

Smoking gun event:

```text
jsonl_line=473
timestamp=2026-07-07T17:07:11.754Z
rawLen=719642
attachment.type=hook_success
attachment.content len=2198
attachment.stdout len=713574
```

`attachment.content` begins with the persisted-output preview:

```text
<persisted-output>
Output too large (696.8KB). Full output saved to: ...\tool-results\hook-...-stdout.txt
```

But `attachment.stdout` still contains the full hook output:

```text
<system-reminder>
Spec conformance findings (PostToolUse push, 3s window):
  2692 finding(s): 1830 warning, 862 info
  [WARNING] UNCOVERED_FR .specs/suggest-rules-insights/FR.md:31 ...
```

Late-session repeats near the current incident:

```text
L22865 ts=2026-07-08T19:47:31.250Z rawLen=722735 stdoutLen=716640 contentLen=2198 2690 findings: 1833 warning, 857 info
L22967 ts=2026-07-08T19:52:02.726Z rawLen=722735 stdoutLen=716640 contentLen=2198 2690 findings: 1833 warning, 857 info
```

Top large strings in that JSONL were hook stdout, not normal Bash/Read:

```text
type=attachment attach=hook_success biggest=$.attachment.stdout len=746601
type=attachment attach=hook_success biggest=$.attachment.stdout len=746421
type=attachment attach=hook_success biggest=$.attachment.stdout len=746187
```

### Source proof: primary producer

Hook registration:

```text
.claude/settings.json:436  "PostToolUse": [
.claude/settings.json:438    "matcher": "Write|Edit"
.claude/settings.json:447    tools/spec-conformance-push/spec-conformance-push.bundle.mjs
```

Unbounded formatter:

```text
tools/spec-conformance-push/spec-conformance-push.ts:113 function formatReminder(findings: Finding[]): string
tools/spec-conformance-push/spec-conformance-push.ts:123 for (const f of findings) {
tools/spec-conformance-push/spec-conformance-push.ts:125   `[${f.severity.toUpperCase()}] ${f.code} ${f.location.file}:${f.location.line} — ${f.message}`
```

Full graph check and stdout write:

```text
tools/spec-conformance-push/spec-conformance-push.ts:185 const newFindings = checkConformance(graph);
tools/spec-conformance-push/spec-conformance-push.ts:224 const previous = readState(repoRoot);
tools/spec-conformance-push/spec-conformance-push.ts:225 const decision = decidePush({ now, previous, newFindings });
tools/spec-conformance-push/spec-conformance-push.ts:228 return decision.emit ?? '';
tools/spec-conformance-push/spec-conformance-push.ts:236 if (out) process.stdout.write(out);
```

The side-channel JSONL audit log is fine and should remain complete:

```text
tools/spec-conformance-push/spec-conformance-push.ts:199 append every finding to side-channel JSONL log
tools/spec-conformance-push/spec-conformance-push.ts:206 if (newFindings.length > 0) appendFindings(...)
```

### Source proof: secondary status/census producer

Prompt hook registration:

```text
.claude/settings.json:384  "UserPromptSubmit": [
.claude/settings.json:410  tools/specs-validator/validate-specs.ts
```

Status/census printing:

```text
tools/specs-validator/validate-specs.ts:25 imports buildConformanceSummary, buildTaskCensusLine
tools/specs-validator/validate-specs.ts:348 const line = buildConformanceSummary(...)
tools/specs-validator/validate-specs.ts:353 if (line) console.log(line);
tools/specs-validator/validate-specs.ts:356 const census = buildTaskCensusLine(repoRoot);
tools/specs-validator/validate-specs.ts:357 if (census) console.log(census);
```

String builders:

```text
tools/specs-validator/conformance-summary.ts:136 return `Spec conformance: ...`
tools/specs-validator/conformance-summary.ts:149 export function buildTaskCensusLine(...)
tools/specs-validator/conformance-summary.ts:157 let header = `Spec tasks (census ...`
```

Observed repetition:

```text
C:\Users\stigm\.claude\projects\E--repos-dev-pomogator\2d3bd14e-3dfb-46a6-a7fe-0ef4746d1731.jsonl
status_or_census_entries=14
L299 rawLen=1988
L301 rawLen=1987
L305 rawLen=1988
L308 rawLen=1988
L311 rawLen=1988
L314 rawLen=1988
L317 rawLen=1987
```

---

## T — Tasks

### 1. Cap `spec-conformance-push` agent-facing stdout

Keep full durable logging unchanged. Only cap what goes to `process.stdout`.

Implement a strict agent-facing formatter contract:

- total stdout under a small byte cap, suggested default `6000` bytes;
- show counts by severity;
- show top findings only, suggested max `20` total or grouped by severity;
- include an omitted count;
- include where to inspect the full side-channel log / `/spec-status`;
- preserve `<system-reminder>` wrapper if the hook relies on it.

Suggested shape:

```text
<system-reminder>
Spec conformance findings (PostToolUse push, 3s window):
  2690 finding(s): 1833 warning, 857 info
  Showing first 20; 2670 omitted from agent-facing output.
  Full audit persisted in spec-check-log; run /spec-status for aggregate.
  [WARNING] ...
</system-reminder>
```

Important: do not remove `appendFindings(...)`. The audit log is the correct place for the full corpus.

### 2. Make stdout cap impossible to regress

Add tests in:

```text
tools/spec-conformance-push/__tests__/spec-conformance-push.test.ts
```

Test cases:

- `decidePush` / emitted reminder with 3000 synthetic findings stays below cap.
- emitted reminder contains counts and an omitted count.
- emitted reminder does not include all synthetic findings.
- side-channel JSONL append still records all findings.

If needed, export a pure helper like `formatReminderForAgent` or make `decidePush` accept cap options in tests.

### 3. Tighten prompt-time status/census output

The status/census hook is not the 700 KB blast, but it repeats. Keep it compact.

Targets:

- `buildConformanceSummary(...)` remains one line.
- `buildTaskCensusLine(...)` should stay capped to top 5 specs and ideally under about 1000-1500 chars.
- consider per-session/per-minute debounce in `validate-specs.ts` if repeated `UserPromptSubmit` hook entries keep showing the same census many times.

Tests already exist in:

```text
tools/specs-validator/__tests__/conformance-summary.test.ts
```

Add/adjust tests:

- output length bound for a large census fixture;
- repeated unchanged census can be silent/debounced if debounce is implemented;
- zero-noise behavior remains unchanged.

### 4. Rebuild bundled hook

The live hook registration runs the bundle:

```text
tools/spec-conformance-push/spec-conformance-push.bundle.mjs
```

After editing `spec-conformance-push.ts`, rebuild:

```text
npm run build:push
```

Do not forget to commit both source and bundle if the repo expects checked-in bundles.

### 5. Verification commands

Canonical repo tests are Docker/WSL oriented. At minimum:

```text
npm run build:push
npm test
```

For a focused dev loop, run the existing focused Vitest files through the repo's accepted test path if available:

```text
tools/spec-conformance-push/__tests__/spec-conformance-push.test.ts
tools/specs-validator/__tests__/conformance-summary.test.ts
```

### 6. Manual regression probe

After rebuild, trigger the hook with a harmless edit in a disposable temp/worktree branch and inspect the new Claude JSONL entry.

Expected:

```text
attachment.type=hook_success
attachment.stdout length < 6000-8000
attachment.content should not report Output too large for spec-conformance-push
```

If Claude Code still writes `attachment.stdout` into JSONL, that is okay as long as producer stdout is small.

---

## Do Not Do

- Do not tune `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, `/compact`, Spark, or sub2api for this bug.
- Do not delete conformance checks.
- Do not remove the side-channel audit log.
- Do not assume persisted-output protects context; proof above shows raw `attachment.stdout` remains in JSONL.
- Do not blame CARL lazy-load unless new proof contradicts `context=lazy-managed; reduction=53719->6286`.

---

## Ready-to-paste Agent Prompt

You are fixing `E:\repos\dev-pomogator`.

Read this handoff first:

```text
audit-reports/hook-output-context-bloat-biet-handoff.md
```

Goal: stop Claude Code context bloat from dev-pomogator hook output.

Primary fix: cap `spec-conformance-push` agent-facing stdout. Keep full `appendFindings(...)` side-channel logging. Add tests proving a thousands-finding flush emits a short reminder with counts + omitted count, and does not include all findings. Rebuild `tools/spec-conformance-push/spec-conformance-push.bundle.mjs`.

Secondary fix: keep `validate-specs.ts` / `conformance-summary.ts` prompt-time status/census output bounded and non-spammy.

Evidence to trust:

- JSONL line 473 in `C:\Users\stigm\.claude\projects\E--repos-dev-pomogator\d977d18b-799e-4938-8492-a875052f1d04.jsonl` has `attachment.stdout len=713574` despite persisted-output preview.
- Later lines 22865 and 22967 repeat `stdoutLen=716640`, `2690 findings`.
- Source producer is `tools/spec-conformance-push/spec-conformance-push.ts:113-128`, registered from `.claude/settings.json:436-448`.

Done means:

- source + bundle updated;
- focused tests added/updated;
- `npm run build:push` passes;
- repo canonical test path run or a clear evidence-backed note why only focused tests were run;
- manual/log proof that new hook stdout is small.
