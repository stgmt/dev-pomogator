# Pinator — Functional Requirements

> Migrated from claim-evidence-gate. Modules: **M1–M4** = FR-1..FR-12 below. M0/M6/M7 are open backlog (see README), not COMPLETE.

## Scope

Pinator is a Stop-time completion judge, not a universal conversation fact checker. It evaluates a Stop only while the current agent session has unfinished authoritative work.

## FR-1
**Eligibility and inactive silence**

The gate SHALL collect work context before any classifier, judge, credential warning, census, fire, or marker behavior. Only open current-session Claude tasks/todos, a successfully approved executing plan, actively worked specs with open mapped work, or active native `/goal` SHALL activate it. Empty/all-closed context SHALL silently approve with zero side effects. Dialogue and completion-sounding prose SHALL NOT activate it. Disabled, malformed, missing-transcript, and unknown lifecycle data SHALL fail open; shadow MAY record only after eligibility.

## FR-2
**Session task lifecycle**

Replay latest `TodoWrite` and successful current-session `TaskCreate`/`TaskUpdate`. `pending|in_progress` are active; `completed|deleted` are closed. Failed updates and unrelated reminder/List/Get rows SHALL NOT arm without ownership/claim correlation. Closing the final owned task removes the source.

## FR-3
**Approved plan activation**

A plan SHALL activate only from a successful current-session `ExitPlanMode` result correlated by tool-use ID. Support explicit `planFilePath` and the observed result-first-line absolute-path form. Rejected, validation-failed, uncorrelated, mtime, mere-existence, and other-session plans SHALL NOT activate; newer approval supersedes old.

## FR-4
**Plan commitment ledger**

Extract stable commitment IDs from plan Todos, falling back to numbered implementation steps, and key the ledger by `session_id + plan_hash`. Evidence closes only its linked commitment. Judge-persisted completion requires result-confirmed evidence IDs. Rollup is ALL, never ANY. `blocked|awaiting` MAY approve a Stop but SHALL NOT disarm; all-evidenced-complete, explicit abandon/supersede, or newer approval closes the source.

## FR-5
**Active spec lifecycle**

A spec SHALL require current-session selection/mutation AND open mapped task/phase in scoped census. Read-only access, discussion, recency, and global backlog SHALL NOT activate. `.feature` mutation counts only with open mapped work. Preserve every active spec, never guess `specs[0]`; closing all mapped work removes that source.

## FR-6
**Native goal lifecycle and independence**

Verified native `goal_status met:false` SHALL activate the exact condition and `met:true` SHALL deactivate it. Clear and resume support require captured real artifacts; prose-regex guesses are forbidden. Native `/goal` remains an independent Stop evaluator; Pinator SHALL NOT replace it, interpret its verdict, or persist goal completion.

## FR-7
**Merge all sources**

Merge every simultaneous source in deterministic order with kind, stable ID, status, activation evidence, source location, lifecycle revision, retained provenance, and explicit conflicts.

## FR-8
**Current bounded evidence**

Use Stop `last_assistant_message` as the final response and include only latest actionable real-human mandate, result-confirmed current-turn tools, official `background_tasks`/`session_crons`, transcript-derived async state, and merged commitments. Exclude secrets, full transcripts, unbounded outputs, and irrelevant prompts; mark truncation.

## FR-9
**Structured judge and scoped claims**

The judge SHALL return each commitment as `complete|blocked|awaiting|actionable` with evidence IDs plus one Stop decision. It SHALL NOT infer work from prose. Missing/unknown evidence and ANY rollup keep commitments active. Claim classes MAY block only after eligibility and only when mapped to active commitments. Async MAY justify waiting but SHALL NOT create a source.

## FR-10
**Context-scoped state and credentials**

Scope marker/fire state by `session_id` and context revision; changed context resets retry state and inactive flow performs no state I/O. Missing judge credentials remain WARN-not-block only for active eligible context.

## FR-11
**Remove obsolete global activation**

Remove `GRAY_SIGNAL`, `NEXT_SECTION_RE`, generic blocker prose outside active work, gate-inspection streaks, whole-session mandate dumping, first-spec guessing, and historical carve-outs that exist only to compensate for global arming.

## FR-12
**Single parse, distribution, and clients**

Parse transcript JSONL once through a shared bounded reader. Preserve the deps-absent claim-gate bundle, Claude Stop route, and shared endpoint resolver. The Codex launcher SHALL use a proven adapter or explicit tested fail-open; it SHALL NOT assume Claude lifecycle shapes.
