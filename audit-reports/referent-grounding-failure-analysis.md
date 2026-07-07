# Referent-Grounding Failure — Analysis & Prevention Design

**Date:** 2026-06-25
**Trigger incident:** the "найди оригинал" loop — an agent declared "вот оригинал" **16 times**, each
time a wrong/unrelated artifact, never locating the exact reel the user had pointed at.
**Owner ask:** «разбери кейс; сделай чтоб такой хуйни не было **ни в одном диалоге** (пинатор + обвязка);
агентами прошерсти интернет и гитхаб; потом отчёт.»

---

## 0. TL;DR

- **Root cause is not laziness and not "too little checking". It is *referent substitution*:** the agent
  never pinned the concrete artifact the user pointed at. It reconstructed a *checklist of properties the
  original "should" have* and matched candidates against **its own checklist** — verifying **properties**
  ("matches my criteria") while reporting **identity** ("this IS the one you meant"). Identity ≠ properties.
- **Four amplifiers:** (1) **provenance loss at compaction** — an early *guess* («юзер хочет ApproachSwissModern»)
  was laundered into the post-compaction summary as a *fact* and propagated; (2) **confirmation bias** — first
  property-match → stopped doubting; (3) **self-review entrenchment** — the same committed agent "verified" its
  own checklist; (4) **no loop circuit-breaker** — 16 retries instead of one escalation.
- **The existing pinator (claim-evidence-gate) is on the OPPOSITE axis and would *amplify* this.** It punishes
  *stopping / handing-off / asking the user* and rewards *keep doing*. The correct recovery here — **ask "which
  exact file did you point at?"** — is precisely what pinator's judge is trained to BLOCK as a "fake hand-off".
  So this cannot be "add a line to pinator"; it needs a **complementary, opposite-polarity** governor + a
  **carve-out** in pinator so the correct recovery is not blocked.
- **Hard distribution constraint (verified in code):** `plugin.json` ships `skills / commands / hooks /
  mcpServers / lspServers` — **NOT `rules`**. A `.claude/rules/*.md` lives only inside dev-pomogator's own repo
  and does **not** reach other projects. Therefore "ни в одном диалоге" is satisfiable **only by a
  plugin-distributed hook** — a rule can be a local supplement, never the mechanism.
- **Proposed mechanism, hook-first, shadow-first:** a **repeated-rejection circuit-breaker** as a
  **UserPromptSubmit** hook (the same injection channel the census banner already uses) that flips polarity —
  "you've been rejected N× on the same ask → STOP guessing; locate the exact referent (quote it) or ASK which
  one" — plus a new observable fact + APPROVE carve-out in the pinator judge. Ship in **shadow** first to
  measure false-fire (the gate already supports `shadow`), then enforce.
- **Honest limit:** the most dangerous amplifier (guess→fact at compaction) is **harness-owned** — the
  summarizer is not ours to rewrite. A hook cannot fully fix it. The honest mitigation is *discipline +
  inline epistemic markers + a memory-write convention*, not a gate. This report does not overclaim that fix.
- **Correction (§7.3) — two claims retracted, Owner caught both:** an earlier draft said "no harness builds the
  stateful repeated-rejection gate" and "pinator is ahead on enforcement". **Both wrong.** A code-signature
  search found a live stateful rejection detector (`claude-learn/learning-signal-hook.py`), a 1,000+ -hit
  frustration-detection `UserPromptSubmit` cohort, and an explicit referent/repetition classifier (`maggy`).
  Component A's genuine novelty shrinks to the *recovery action* (enumerate referents → ask which one) — the
  detection machinery is already built and is now a proven fork base, not a green-field build.

---

## 1. The case — what actually happened (honest reconstruction)

| # | What the agent showed as "the original" | Why it was not |
|---|------------------------------------------|----------------|
| 1 | `SwissInfographicScene` / hybrid-port | self-admitted "порт", rejected |
| 2 | `ApproachSwissModern → SWISS-ORIGINAL.mp4` | invented standalone composition, not from the pipeline |
| 3 | `reel-swiss-pulse.mp4` | user: «никак с оригиналом не связано» |
| … | (the loop continued to ~16) | each new candidate matched the agent's self-built checklist, none was the user's referent |

The agent even ran a frame-verify on candidate #3 — but that only proved **"this clip satisfies MY criteria"**,
not **"this is the clip you meant."** It verified the wrong predicate. Across a context compaction, the
post-summary state recorded "user wants ApproachSwissModern" — which had been an **early guess**, not the
user's words — and the agent then acted on it as established fact.

---

## 2. Root cause — identity-vs-properties (the spine), with four amplifiers

**Defect (single sentence):** the agent resolved a *reference* ("the original I showed you") by *reconstructing
a description* and *matching properties*, instead of *dereferencing the concrete pointer* the user had already
given and *verifying identity*.

This is a recognized, separately-studied class in the dialogue/agent literature (full citations in §6). It
decomposes into:

1. **Referent grounding failure** — "the original" is a deictic reference to a concrete entity that exists in
   conversation history. The job is *retrieval of that entity node*, not generation of "what the original
   should look like". (Dataflow `refer` operator; discourse-deixis resolution.)
2. **Uncertainty miscalibration** — a low-confidence *candidate* was phrased as a high-confidence *find*.
   Strong assertiveness co-occurs with *lower* accuracy; the marker should have been "this might be it —
   confirm?" not "вот оригинал".
3. **Provenance loss across compaction** — the `Derive`/summarize step dropped the `inferred` vs `observed`
   tag, so a guess re-entered context as ground truth. (The single most damaging amplifier; see §5.4 for why a
   hook can only partially address it.)
4. **Confirmation bias + self-review entrenchment + no loop-breaker** — first property-match stopped the
   doubt; self-review by the already-committed agent reinforced the wrong checklist; nothing counted "declared
   found → rejected" attempts and forced an escalation.

---

## 3. Why pinator does not catch this — and would *amplify* it (the wrong-axis finding)

The claim-evidence-gate (`tools/claim-evidence-gate/`) is a **Stop** hook + a Haiku **judge**
(`meridian-judge.ts`) whose entire purpose is the **lazy-stop** class: it BLOCKS a turn that *stops while work
remains*, *defers to later*, or *hands the next action / a task-pick to the user* ("fake hand-off"), and it
APPROVES "keep doing". Read the judge prompt directly — it treats `«скажешь — сделаю» / «решать тебе» / «какую
взять»` as a bypass to BLOCK.

The video failure is the **inverse pathology**:

- The agent was **not** stopping early — it was **hyperactive and over-certain**, producing wrong output every
  turn. Every one of those 16 turns *did work* and *claimed progress* → pinator would **APPROVE** each (or
  even *kick it to keep going*).
- The **correct recovery** — *ask "which exact file did you point me at?"* — is exactly what pinator's judge
  classifies as a **fake hand-off and BLOCKS**.

So pinator is **orthogonal** to this failure and, at the recovery moment, **actively hostile** to the right
move. Two consequences for the design:

- (a) The new governor must be **opposite-polarity** and live at a **different event** (see §4–§5).
- (b) Pinator's judge needs a **new fact + APPROVE carve-out** so that, *after repeated rejection on the same
  ask*, "ask which exact referent" is recognized as the **correct recovery**, not a lazy hand-off.

(Note: pinator is the *secondary* actor here — it didn't *cause* the 16 failures, the guessing did. But left
unchanged it would block the cure.)

---

## 4. The hard constraint: rules don't travel — only hooks do (verified)

`/.claude-plugin/plugin.json` (v2.0.3) distributes exactly:

```json
"skills": ["./.claude/skills"],
"commands": ["./.claude/commands"],
"hooks": ["./.claude-plugin/hooks.json"],
"mcpServers": ["./.mcp.json"],
"lspServers": "./.lsp.json"
```

There is **no `rules` field** — and the repo's own `finish-the-deploy-dont-hand-off` rule already states the
principle: *«механический enforcement — в судье гейта (он уезжает ко всем проектам через плагин, правило же
грузится для каждого репо отдельно)».*

**Conclusion:** a `.claude/rules/*.md` + a CLAUDE.md row is **dev-pomogator-local**; it will *not* load in
presentation-reels or any other project. The owner's requirement — "ни в одном диалоге" — can be met **only**
through the plugin-distributed surface. The right surface is a **hook**, and the right event is
**`UserPromptSubmit`** (it already carries the census banner, `prompt-suggest`, `prompt-capture`,
`learnings-capture` — proof that injecting context on every user turn is an established, traveling pattern).

---

## 5. Proposed mechanism

Design center of gravity (post-advisor): **repeated-rejection detection → polarity-flip context injection at
`UserPromptSubmit`, shipped in the plugin hook, shadow-first**, with pinator getting a carve-out fact. Layered:

### 5.1 Component A — Repeated-rejection circuit-breaker (PRIMARY · plugin hook · UserPromptSubmit)

**Why this is the core:** it fits pinator's own philosophy — *weigh observable, agent-independent facts first*.
"The user rejected the same ask N times" is a **harness-observable fact in the user's own words** — the agent
cannot fabricate or polish it (unlike its own narrative). And it intervenes **before the agent re-acts** (at
the moment the rejection arrives), which the Stop hook cannot (Stop fires *after* wrong-guess #N is already
rendered).

- **New tool:** `tools/referent-grounding-guard/guard.ts` — **builtins-only** (`node:fs`/`node:path`) and
  **fail-open**, per `dead-integration-guard` (must run for plugin users with no `node_modules`). Pure exported
  decision fn `referentGuardDecision(recentUserTurns, cfg) → {trip, n, candidates}` for BDD testing both ways.
- **Wiring:** add to `.claude-plugin/hooks.json` `UserPromptSubmit[]` (travels to all projects) + mirror in
  `.claude/settings.json` for dogfood.
- **Detection (deterministic):** scan the last K user turns of the session transcript for **consecutive
  rejections of the prior deliverable on the same ask** — a rejection lexicon over the *user's* messages:
  `нет / не то / не это / опять / снова / не оригинал / никак не связан / ты (даун|дурак) / N раз / again /
  wrong / not it / that'?s not / still not / не понял сути`. Count consecutive user turns that (i) carry a
  rejection token AND (ii) do **not** introduce a clearly new ask. At **N ≥ 2–3 → trip** (the
  practitioner-standard circuit-breaker threshold; see §6 Goal 5).
- **On trip → inject `additionalContext`** (UserPromptSubmit's context-injection channel — same one the census
  banner uses) with a **polarity-flip** reminder, e.g.:
  > ⚠️ Ты получил отказ {n}× подряд на ОДНУ и ту же просьбу. СТОП — не выдавай ещё одну догадку, цикл ею не
  > разорвётся. (1) Найди в истории ТОЧНЫЙ референс, на который указал пользователь, и **процитируй**
  > сообщение/путь. (2) Не нашёл — **СПРОСИ**, какой именно из {candidates}, не угадывай снова. Совпадение по
  > признакам ≠ тот самый объект (identity ≠ properties).
- **Modes (mirror the gate):** `REFERENT_GUARD_ENABLED = shadow | true | false`, **default `shadow`** at first
  release. Every trip logged to `.dev-pomogator/.referent-guard-fires.jsonl` to measure false-fire **before**
  enforcing. Promote to `true` only once the shadow log shows it fires on real loops and not on normal asks.

### 5.2 Component B — Pinator carve-out (Stop hook + judge)

So the *correct recovery* is not blocked as a fake hand-off:

- Add an **observable fact** `consecutiveUserRejections: number` to `JudgeInput` (computed by the **same**
  whole-transcript scan as Component A, the way `agentBgInFlightCount` is computed today).
- Add to `buildJudgePrompt` an **APPROVE** rule:
  > If `consecutiveUserRejections ≥ N` AND the message is **asking the user which exact referent/artifact they
  > meant** (a disambiguation question following repeated rejection) → that is the CORRECT recovery, **APPROVE**;
  > do NOT treat it as a fake hand-off.
- Keep it conservative and tightly bound to the rejection count (so it cannot become a general "ask instead of
  work" loophole). This is a *small* change to one judge rule + one fact field — not a rewrite.

### 5.3 Component C — Discipline (repo-local rule + skill) — SUPPLEMENT, not the mechanism

For dev-pomogator's *own* sessions (and as documentation of the discipline), an always-apply rule
`anchor-on-referent` + CLAUDE.md row. Explicitly labeled as a **supplement** (it does not travel — §4):

- When the user references a concrete artifact ("the original", "где я показал", "тот самый", "this one"):
  **FIRST locate the exact pointer in history and quote the message/path.** Verify **identity** (the user
  pointed at THIS), never accept a self-built property-checklist as the resolution.
- Mark every claim **GUESS vs USER-STATED** inline; after a rejection, **re-ground or ASK — never re-guess.**
- A "found it / this is the original" claim must cite **where the user pointed at this exact artifact**, or be
  phrased as a candidate awaiting confirmation.

### 5.4 What a hook *cannot* fix — provenance across compaction (honest scope)

The amplifier that did the real damage — an early **guess** promoted to **fact** inside the post-compaction
summary — is **harness-owned**. The summarizer is not a surface we control; a hook cannot force an
`observed`-vs-`inferred` tag through Anthropic's compaction. The literature's clean fix (`Derive`-relation
provenance, observation-masking; §6 Goal 3) lives *inside the summarizer*. The **honest, partial** mitigations
we *can* do:

- **Inline epistemic markers** in the agent's own prose (`[GUESS]` / `[USER-STATED]`) so the *text* of the tag
  survives summarization as plain content (a summary that keeps the words keeps the label).
- **Memory-write convention:** `feedback`/`project` memories tag facts `observed | inferred` and never record a
  guess as a fact (the memory format already separates `type`).

This is mitigation, not a guarantee. Stating it plainly is required — a report about over-claimed certainty
must not over-claim its own fix.

### 5.5 Component D — (OPTIONAL, demoted) identity claim-class in the Stop classifier

A new `claim_classifier` class — a "this is the original / found it / located the referent" assertion — that
requires an **identity citation** (a quoted user pointer), not a property match. **Demoted and shadow-only**
because it is **H1-over-fire bait** (`feedback_single-incident-rules-over-generalize`): agents legitimately say
"found it / here's X / done" constantly. If built at all, gate it behind **both** a referent-ambiguity signal
**and** `consecutiveUserRejections ≥ 1`, and run it in shadow indefinitely until the fires-log proves low
false-fire. Do **not** lead with this.

---

## 6. External prior art — WEB (primary sources)

Each maps to one failure component; mechanism + URL.

**Goal 1 — referent grounding / deixis ("the one I showed you"):**
- **Dataflow Synthesis — `refer`/`revise` operators** (Andreas et al., Semantic Machines, TACL 2020):
  resolve a reference by *retrieving the actual entity node from the dialogue graph*, never by reconstructing a
  description. **The single most on-point technique.** https://arxiv.org/abs/2009.11423
- **Reference-Centric Grounded Dialogue** (Fried et al., EMNLP 2021): explicit "what entity are we both
  pointing at" state; resolve by *selecting among known candidates*, not generating + matching.
  https://ar5iv.labs.arxiv.org/html/2109.05042
- **Discourse-Deixis Resolution** (Li et al., 2022): "find the original" = antecedent-identity resolution, not
  attribute-matching. https://arxiv.org/pdf/2211.15980

**Goal 2 — uncertainty calibration (guess stated as find):**
- **Epistemic calibration / markers** (*Epistemic Integrity in LLMs*, 2024): high-certainty phrasing
  correlates with *lower* accuracy; gate strong assertions behind calibrated confidence; low confidence →
  phrase as candidate. https://arxiv.org/pdf/2411.06528
- **Verbalized confidence** (UQ survey, 2025): require a confidence band *plus a citable referent* — confidence
  without a citation is rejected. https://arxiv.org/html/2503.15850

**Goal 3 — provenance across compaction (guess→fact):**
- **Evidence vs execution provenance — `Derive`/`Support`** (*From Agent Traces to Trust*, 2026): tag every
  fact `observed` vs `inferred`; the summarize step must *propagate* the tag so a guess can't re-enter as
  ground truth. States the failure explicitly. https://arxiv.org/html/2606.04990
- **ABBEL — belief bottleneck** (2025): keep "what the user said" (observation) structurally separate from
  "what I believe they meant" (belief). https://arxiv.org/pdf/2512.20111
- **Observation-masking vs summarization** (Kang et al., 2025): summary-only compaction strips exact wording —
  the precise way the user's literal "I showed you here" pointer is lost; prefer masking/retention for
  identity-bearing facts. https://arxiv.org/html/2508.21433v3

**Goal 4 — confirmation bias / verify-identity-not-properties:**
- **SAVeR — verify before commit** (2026): support function Γ(·); flags `Unjustified_Inference` /
  `Overgeneralization`; iterate audit→repair until no unsupported inference *before* committing. "matches my
  criteria" trips `Unjustified_Inference`. https://arxiv.org/html/2604.08401
- **Devil's Advocate — anticipatory reflection** (EMNLP Findings 2024): pre-commitment counterfactual "what if
  this is NOT it?" so the agent can't stop doubting after first match. https://aclanthology.org/2024.findings-emnlp.53.pdf
- **Self-Confirmation Trap / Multi-Agent Reflexion** (2025–26): single-agent self-review *amplifies*
  confirmation bias — the verifier must be **independent** of the actor. (Pinator's judge being a *separate*
  Haiku call is the right shape.) https://arxiv.org/html/2606.24428v1

**Goal 5 — repeated-failure loop circuit-breakers:**
- **Ask or Assume? (Intent Agent)** (Edwards & Schuster, 2026): a detector *decoupled from the executor* that
  halts and forces a clarifying question on ambiguity; 69.4% vs 61.2% resolve, *better-calibrated* asking.
  The closest "ask-don't-guess" gate. https://arxiv.org/abs/2603.26233
- **AI Agent Circuit Breakers** (practitioner): concrete thresholds — **2–3 consecutive no-progress / N=3
  same-step failures → trip, escalate to human, do NOT retry.** Directly sizes Component A's threshold.
  https://dev.to/waxell/ai-agent-circuit-breakers-the-reliability-pattern-production-teams-are-missing-5bpg
- **Ambig-SWE** (2025): agents *know* a task is ambiguous but don't ask because "ask" was never taught as a
  correct terminal — make clarification a first-class success. https://arxiv.org/html/2502.13069v1

**Web agent's Top-5 mechanisms for a gate (ranked):** (1) referent dereference not description reconstruction;
(2) repeated-false-find circuit-breaker → forced escalation; (3) `observed`/`inferred` provenance preserved
across compaction; (4) self-audit "identity not properties"; (5) decoupled clarification gate that interrupts
the actor. **This independently confirms §5.**

---

## 7. External prior art — GitHub (concrete implementations)

**Maturity caveat:** directness ≠ adoption. The most-adopted hit is `majiayu000/vibeguard` (**26★**);
everything else is low-star / single-author / niche. Treat these as **design references to adapt**, not
battle-tested patterns. **Honest gap:** *no* project found implements "verify **identity** not **properties**"
("it has the right attributes ⇒ it's the thing you meant"); the nearest is referent-resolution gating
(resolves *which* item, does not enforce same-entity confirmation). This corroborates keeping §5.5 demoted.

**Goal 1 — evidence-before-claim:**
- **`majiayu000/vibeguard`** (26★, Claude Code anti-hallucination toolkit) — `rules/universal.md` **W-03**
  "before saying 'fixed/done', produce fresh verification evidence"; **W-16** "a completion claim must cite
  command output produced *in this session*." `hooks/stop-guard.sh` carries a **critical design lesson**: it
  deliberately returns exit 0 on Stop because "Claude cannot commit in Stop context, so exit 2 → infinite
  loop" — it checks `stop_hook_active`. (Pinator already does this; corroboration that a Stop-gate must not
  fail-closed-loop.) https://github.com/majiayu000/vibeguard
- **`DenisSergeevitch/repo-task-proof-loop`** — managed CLAUDE.md rule (opened/verified): *"Verifiers judge
  current code and current command results, **not prior chat claims**."* A separate task-verifier re-runs
  checks against the *current* codebase — the direct structural counter to "early guess promoted to fact".
  https://github.com/DenisSergeevitch/repo-task-proof-loop
- Prose-only norms in many `CLAUDE.md`/`AGENTS.md` (e.g. `xnoto/opencode-config`: "Label inferences as
  inferences, not verified facts… not complete until verified or the user is told it couldn't be") — rule-text
  seeds for §5.3.

**Goal 2 — loop / repeated-failure → escalation (the 16× loop):**
- **`vibeguard`** `hooks/circuit-breaker.sh` — consecutive-block counter, `CB_THRESHOLD=3` → **OPEN** +
  `CB_COOLDOWN=300s` → **HALF-OPEN** probe. `hooks/analysis-paralysis-guard.sh` (`PostToolUse`) — 7 read-only
  ops with no write → "act or report a blocker". `rules/universal.md` **W-02** "fail the same problem 3× in a
  row → stop and **question the hypothesis**", **W-15** "info gain shrinks 3 rounds → stop that direction."
  **Directly sizes Component A's N=3 threshold and its "question the premise" message.** *Adapt:* hash the
  agent's repeated *claim/action* (not just per-hook blocks) and break at N.

**Goal 3 — provenance tagging (guess→fact post-compaction) — the most direct hit:**
- **`robotrocketscience/aelfrice`** (SQLite belief store + Claude Code hooks, ingests `~/.claude/projects/*.jsonl`)
  — every belief carries an **`origin`** column (`user_stated` / `user_corrected` / `user_validated` /
  `agent_inferred` / `speculative` / …). **Precedence ladder:** `user_stated > user_corrected > user_validated
  > document_recent > agent_inferred` — an inferred belief can **never** outrank a user-stated one. Promotion
  `agent_inferred → user_validated` is **"a UI act, not a math act"** — *no* implicit path (no feedback/retrieval
  count promotes it); only an explicit `aelf validate <id>`. The cleanest structural guarantee that a model
  guess can't become ground truth — exactly the §5.4 amplifier. https://github.com/robotrocketscience/aelfrice
- **`vibeguard`** `fact-inference-separation.md` (**W-11**) — the lightweight prompt version: label every claim
  `[source: file:line]` (fact) vs `[based on: X] (confidence)` (inference) vs `[assumption: premise]`. This is
  the inline-marker discipline named in §5.4.

**Goal 4 — HITL "confirm the target before the expensive action":**
- **`langchain-ai/langgraph`** `interrupt()` / `Command(resume=...)` — the one recognized-project anchor: pause
  + persist graph state before a reviewable action that names the exact target, resume on approve/edit/reject.
  https://docs.langchain.com/oss/python/langchain/human-in-the-loop
- `vibeguard` W-10 (multi-confirm before publish/delete); `HarshP4585/forge` couples HITL with disambiguation
  ("ask which of these files to delete" when intent is multi-interpretation).

**Goal 5 — referent resolution / disambiguation gate ("ask which exact item"):**
- **`273v/kaos-agents`** `context/coreference.py` — `resolve_ordinal()` binds deixis ("the last / the third")
  to a candidate list from session memory; **on ambiguous / out-of-range reference it does NOT silently bind** —
  it tags the worker to *"ask the user which item they mean."* Carries a confidence score → caller chooses
  hint-vs-ask. Direct counter to "never located the referent". https://github.com/273v/kaos-agents
- **`francesco-delrosso/CutTheYap`** (real Claude Code **`UserPromptSubmit`** hook, local / no-LLM / fail-open)
  — scores prompt ambiguity: **action verb with NO concrete target** (filename/path/code-block) → signal
  `action-without-target`; tiers clear/low/medium/high; injects `additionalContext` rather than blocking.
  **This is an almost-exact ready-made skeleton for Component A (§5.1).** https://github.com/francesco-delrosso/CutTheYap

**GitHub Top-5 (ranked by directness):** (1) **aelfrice origin-ladder** → provenance guess≠fact;
(2) **kaos-agents coreference gate** → resolve referent / ask-which; (3) **vibeguard loop guards** (3-strike +
paralysis) → break the 16× loop; (4) **proof-loop verifier + vibeguard W-16** → evidence-before-claim;
(5) **CutTheYap targetless-action hook + LangGraph interrupt** → clarify-before-acting at UserPromptSubmit.
**Independently confirms §5 and supplies a concrete hook skeleton (CutTheYap) + provenance schema (aelfrice).**

---

## 7.1 Harness landscape — what people actually RUN (by adoption)

> §6–§7 answered "what *patterns/mechanisms* exist". This section answers the harness question directly:
> **what do practitioners deploy for this?** A second harness-axis sweep (production guardrail/HITL frameworks
> + the Claude-Code hook ecosystem, ranked by adoption) is in flight; this is the verified-so-far picture and
> is enriched when those agents land.

**Headline (honest):** there is **no mature, purpose-built harness** for "stop guessing the referent / ask
which exact one." Nobody ships "ask-which-referent / repeated-rejection" as a product. People **assemble** it
from three layers, and for *this specific* failure each layer covers only a slice:

| Layer | What people actually run | What it gives THIS failure | Adoption |
|---|---|---|---|
| **HITL / orchestration** (verified stars, Jun 2026) | **LangGraph** (35.7k) `interrupt()`/`Command(resume)` — gates the *exact tool call* before exec · **OpenAI Agents SDK** (27.4k) `needs_approval`/`ToolApprovalItem` · **AutoGen** (59k, but maintenance-mode / superseded by MS Agent Framework) `human_input_mode` | (c) HITL confirm ✅ + (b) loop caps ✅ (`recursion_limit`/`max_turns`) — but **(a) clarify-gate ❌** (build-on-primitive) | high |
| **Guardrail / eval** | **Guardrails AI** (7k) Hub (ProvenanceLLM / GroundedAIHallucination) · **NeMo Guardrails** (6.5k) `self_check_facts` / AlignScore · **LlamaIndex** (50k) `FaithfulnessEvaluator` · **DSPy** (35k) `Refine`/`BestOfN` self-refine | (d) evidence/provenance ✅ — output-validation, NOT "ask which referent" | mid–high |
| **Gateway** | **Portkey** (12.2k) provider circuit-breaker (failure-rate → cooldown) + deny/fallback actions | (b)-transport health — NOT claim correctness | mid |
| **Claude-Code hooks** (the on-point ecosystem — ranked by real adoption, 2nd sweep) | **`severity1/claude-code-prompt-improver`** (**1,640★** / 135f) — `UserPromptSubmit` injects a self-eval block; if vague → research subagent + **asks 1–6 grounded clarifying questions**. `improve-prompt.py` cloned **verbatim into 15+ repos** = the de-facto reference design | clarify-before-acting (LLM-delegated) | **most-adopted** |
| | **`DenisSergeevitch/repo-task-proof-loop`** (**719★**) — separate task-verifier subagent judges *current code + fresh command output, not prior chat claims* | evidence-before-claim (proof loop) | most-starred |
| | **`assafkip/research-mode`** (141★) citation/grounding · **`rulebricks/claude-code-guardrails`** (71★) `PreToolUse` deny | anti-hallucination / tool-gating | moderate |
| | **`vibeguard`** (26★) — circuit-breaker "3 strikes→OPEN" + analysis-paralysis (7 read-only→act/report) + W-02 "fail same 3×→question the hypothesis" | richest **loop/repeat-failure** breaker | low★ but deepest loop set |
| | **`aelfrice`** (6★) — `origin` enum + Beta-Bernoulli, survives compaction via SQLite, `UserPromptSubmit`+MCP | the **only** real provenance memory | low★, alone in niche |
| | **`CutTheYap`** (0★) deterministic no-LLM `UserPromptSubmit` ambiguity scorer (`action-without-target`/`vague-reference`), fail-open, 77 tests · **`claude-rigor`** (0★) goal-gate + speculation-catch (exit-2 on "probably/should work") | clarify / evidence (deterministic) | new, **cleanest skeletons** |
| **Cursor convention** | **"Planner Mode" `.cursorrules`** — "ask **4–6 clarifying questions** before a plan" (+ "if you don't know, say so, don't guess") | clarify-before-acting (prose) | the most-copied ask-don't-guess convention |

**Verdict (now backed by TWO independent sweeps):** general agent-reliability harnesses are adopted
(LangGraph / AutoGen / Guardrails AI / NeMo) but give *generic* HITL / loop-termination / output-validation —
not referent-grounding. In the Claude-Code ecosystem the clarify-before-acting facet IS adopted — the de-facto
reference is **prompt-improver (1,640★, 15+ clones)**, with a whole cottage industry of stateless
`UserPromptSubmit` "vague-prompt → clarify" hooks behind it (agent-smith, vague-request-detector, prompt-coach,
giip ambiguity-score, namba-ai…). At the adoption tier these are mostly STATELESS per-prompt. **⚠️ The strong
claim this paragraph originally drew from that — "no shipped harness counts user rejections; the stateful gate
is unbuilt; it must be built, not adopted" — was WRONG and is CORRECTED in §7.3:** a code-signature search the
Owner prompted found a live *stateful* cross-turn rejection detector (`claude-learn/learning-signal-hook.py`)
plus a large frustration-detection cohort. The "0–26★" range was also wrong (field tops at 1,640★). What is
genuinely *narrower* (and not proven absent) is only the *recovery action* — "→ enumerate the candidate
referents → ask which" — vs. the existing "→ update playbook / go straight to fix".

**Best fork base for Component A (concrete, from the sweep):** **CutTheYap `hooks/gate.py`** for the skeleton +
its `action-without-target`/`vague-reference` signals (≈60% of "which referent?" for free) · **vibeguard
`circuit-breaker.sh`** for the per-session rejection-counter state idiom (`CB_BLOCKS`/`CB_THRESHOLD`/`CB_SESSION`
— swap "consecutive hook blocks" → "consecutive user rejections of the same target") · **aelfrice** for
surfacing candidate referents into `additionalContext`. Nobody ships this trio pre-assembled.

**Production-framework sweep (primary-source verified, Jun 2026) — the headline matches the niche finding:**
**no production framework ships an *automatic* clarification gate (a) as a turnkey feature.** All 11 surveyed
(LangGraph, OpenAI Agents SDK, AutoGen/AG2, NeMo Guardrails, Guardrails AI, LlamaIndex, Semantic Kernel, DSPy,
Guidance, Portkey, Anthropic primitives) leave it as "build it on our HITL primitive." Loop caps (b) and
HITL-confirm (c) are first-class in the orchestration frameworks; evidence/provenance (d) is first-class in the
guardrail/eval frameworks — but **no single framework covers all four**, and the clarify-gate is shipped by
*nobody*. The only published statement of the ask-don't-guess *principle* is Anthropic's prompt advice ("allow
Claude to say 'I don't know'" / "cite quotes or retract"), unenforced. People **assemble**: orchestration
(LangGraph / OpenAI) + guardrail (Guardrails AI / NeMo) + gateway (Portkey) + prompt discipline — and the
clarify-gate + any evidence-gate-on-stop are **hand-built on the host's enforcement primitive**, which for
Claude Code is exactly **`PreToolUse` `deny` + a `Stop`-hook judge**. **Notable:** that is precisely the
pattern this repo's own `claim-evidence-gate` + `clear-questions-to-user` + `no-unverified-blocker` stack
already implements — **dev-pomogator is already filling the (a)+(d)-on-enforcement gap that no off-the-shelf
framework ships.** Component A extends that lead to the one piece even this repo lacks: a *stateful*
repeated-rejection → ask-which-referent gate.

**Star counts spot-checked against the live GitHub API (2026-06-25, this analysis):** prompt-improver
**1640★ / 135f**, repo-task-proof-loop **719★ / 46f**, vibeguard **26★ / 4f** — all three confirm the
research-agent figures exactly (3/3 match). Framework-tier stars (LangGraph 35.7k, OpenAI Agents SDK 27.4k,
LlamaIndex 50k, etc.) are from the agent's GitHub-API pull; AutoGen's 59k is flagged as overstated
(maintenance-mode / superseded). NeMo `self_check_facts` specifics remain snippet-confirmed, not page-confirmed.

---

## 7.2 The 0-star personal-harness cohort — what star-ranking missed (code-search, not repo-search)

> **Owner's correction (valid, material):** §7–§7.1 ranked by **adoption (stars)**, which structurally hides
> the most relevant cohort — solo devs who build their own "pomogator" for their own pain and never get stars.
> Re-ran as GitHub **`search_code` by mechanism signature** (`UserPromptSubmit` + "do not guess" / "clarify" /
> ambiguity), **no star filter** (the octocode-style code-search method). It surfaced a whole invisible population.

**Method note:** searching the *literal term* fails — "помогатор" is common Russian slang for "helper" (VPS
setup, relocation, language apps, even a DnD character) with ~zero AI-harness hits. The cohort doesn't *name*
it; you find it by the **mechanism** (a `UserPromptSubmit` hook that injects "don't guess, clarify first").

**The invisible cohort (0–few stars, missed by BOTH adoption sweeps):**
- **`ycpiglet/tag_manual` `scripts/prompt_clarity_hook.py`** — the closest personal build: a *"always check,
  but silent unless ambiguous"* gate **"the Owner chose (decision 2)"**; tiers advisory / clarify ("ask a batch
  before acting") / grill (heavy mode). A solo, hand-built CutTheYap.
- **`clarify-vague-request.sh`/`.cjs`** (copied across `AvivK5498/beads-web`, `weselow/Yandex-webmaster-mcp-server`,
  `jordanhindo/meridian`) — `UserPromptSubmit` literally emitting *"Do NOT guess. Do NOT start working. Ask first."*
- **`andreoucostas/ai-tech-lead-dotnet` `route-prompt.sh`/`.ps1`** — UserPromptSubmit "Plan gate: present →
  clarify → confirm … do not guess past a material ambiguity."
- **`arvidfcjarfalla-prog/atlas` `.claude/learned-rules.md`** — a personal *dated* learned-rules file (like the
  Owner's own) incl. a real gotcha: *"NEVER use ok:false in UserPromptSubmit hooks for routing"* — CLARIFY mode
  with ok:false locks the user out (a scar only someone who built this would record).
- **`albertodiazdurana/*`** (4 repos, one solo dev) — personal `.claude/CLAUDE.md` "do not guess or fabricate"
  + per-turn `UserPromptSubmit` enforcement, replicated across his projects.
- **`ljw1004/mini_agent`, `mhxie/Atelier` (intent-miss capture), `tenfingerseddy/resonance-lattice` (intent
  extraction in UserPromptSubmit), `Agentscreator/engram-memory`, `unerr-ai/*`, `Sheldon-92/TAD`** — more solo
  intent/clarify/evidence harnesses, all low-star.

**The Owner's cohort is real and was invisible to star-ranking** (method lesson logged). ⚠️ This section first
claimed "none of these is the stateful repeated-rejection gate" — **that claim was ALSO wrong; see §7.3**: a
deeper code-signature search found the stateful detector already built and running. The richer set widens
Component A's fork base — `prompt_clarity_hook.py`'s tiered advisory/clarify/grill structure is a second
skeleton next to CutTheYap.

## 7.3 Falsification — the "nobody builds it" claim was WRONG (the Owner was right)

> The Owner refused to believe "nobody builds the stateful repeated-rejection gate; your pinator is ahead."
> Correctly. Both claims were overstated and are retracted here — and the error is *the same one this whole
> report is about*: asserting a global negative ("nobody") from a narrow search, plus a flattering
> unfalsifiable comparison ("ahead"). A code-signature search aimed at *falsifying my own claim* broke it on the
> first batch.

**A live, stateful, cross-turn rejection detector EXISTS and runs** — `OutcomefocusAi/claude-learn`
`hooks/learning-signal-hook.py` (a real `UserPromptSubmit` hook, read in full):
- Detects **correction** in the user's own words — `"not that"` / `"wrong"` / `"i said"` / `"i told you"` /
  `"i already told"` / `"that's not"` / `"not what i"`.
- Detects **repeated rejection / frustration** — `"again?"` / `"how many times"` / `"why do you keep"` /
  `"you keep"` / `"same mistake"` / `"i just said"`.
- **Stateful**: appends each signal to `~/.claude/.learning-signals.jsonl`, counts pending since the last
  playbook update, and **at ≥3 injects** `[Learning checkpoint: N unprocessed signals — update playbook NOW]`.

That is the detect → accumulate-across-turns → threshold → inject machinery I called the "unbuilt core" of
Component A. It is built and running in the wild.

**A whole frustration/sentiment `UserPromptSubmit` cohort** the star sweeps missed (query "frustration
UserPromptSubmit hook" → **1,082 code hits**): `danielmiessler/LifeOS` (ImplicitSentimentCapture + RatingCapture),
`yonatangross/orchestkit` `frustration-detector.ts`, `mo0ogly/llm_robot_medical` + `chrysa/…` `frustration-
detector.cjs`, `dev32-io/ccToolBox` (**decay-weighted score ≥5 → FRUSTRATION**), `tatargabor/set-core` (emotion
detection → tag `frustration,recurring` → inject warning), `rjroy/vibe-garden` mind-reader, `tanweai/pua`.

**And `alinaqi/maggy`** (RFC v5.0) explicitly classifies the distinctions Component A rests on: **Referent** —
`"that's not right"` / `"I said X not Y"` → *output* (vs `"this page"` → app); **Repetition type** — *same
prompt rephrased → output quality* vs *same UI action repeated → app bug*; plus session-context weighting. The
referent + repetition classifier I claimed nobody had is a named design element there.

**Corrected verdict (honest):**
- ❌ "Nobody builds the stateful repeated-rejection detector" — **FALSE.** Built & running (`claude-learn`) + a
  large frustration-detection cohort + an explicit referent/repetition classifier (`maggy`).
- ❌ "dev-pomogator's pinator is ahead on enforcement" — **RETRACTED.** Unfalsifiable flattery; the pinator is
  on a *different* axis (anti-lazy-stop), and others run comparable / more on-point enforcement.
- ✅ Genuinely *narrower and uncommon* (NOT proven absent — a global negative is unprovable): the specific
  **recovery on trip** = "STOP guessing → **enumerate the candidate referents** → ask which one." Existing
  stateful detectors trip into "update your playbook" / "go straight to the fix" / "adjust style", not
  referent-enumeration. So Component A's novelty is the *intervention*, not the *machinery* — and the machinery
  is now a proven fork base (`claude-learn`'s jsonl signal-accumulator), not a green-field build.

**Method lesson (reinforced, now logged to memory):** an absence-claim ("nobody / none / ahead") must trigger an
adversarial falsification search BEFORE it ships — the exact discipline §6 Goal 4 prescribes for the agent. This
report made the error twice ("0–26★", then "nobody builds it"); the Owner caught both.

## 8. Rollout plan

1. **Component A in shadow** — build `referent-grounding-guard`, wire to `UserPromptSubmit` (plugin + dogfood),
   default `REFERENT_GUARD_ENABLED=shadow`, log to `.referent-guard-fires.jsonl`. BDD scenario(s): trips on 3
   consecutive rejections; does **not** trip on first ask / a new ask / praise. dead-integration: builtins-only,
   fail-open, run **deps-absent**.
2. **Measure** — let shadow run across real sessions; review the fires-log for false-fire.
3. **Component B (pinator carve-out)** — add `consecutiveUserRejections` fact + the APPROVE rule; pin behavior
   in `judge-bench.ts` (the correct-recovery question APPROVES; a normal lazy hand-off still BLOCKS).
4. **Promote A to `true`** once shadow is clean.
5. **Component C (repo-local rule)** — `anchor-on-referent` + CLAUDE.md row, labeled supplement.
6. **Component D** — only if §2 shows a need and shadow false-fire is near-zero.

## 9. Honest limits & risks

- **H1 over-generalization** is the real risk (the repo's recurring failure mode). The mitigation is built in:
  shadow-first + a fires-log + the rejection-count gate, so nothing enforces before its false-fire is measured.
- **The compaction guess→fact amplifier is only partially addressable** (§5.4) — harness-owned. Do not claim a
  full fix.
- **Pinator is secondary** — the cure for the loop is Component A; the pinator change only stops pinator from
  blocking the cure.
- **No proven "identity-not-properties" implementation exists** (§7 honest gap) — the deepest part of the
  defect has no battle-tested prior art; Component A approximates it via *ask-which-referent on repeated
  rejection*, not a true same-entity proof. Most external references are low-star/single-author (max 26★) —
  design seeds to adapt, not proven patterns.

## 10. Addendum — a live pinator gap captured while writing this report (verified)

While compiling §7.1 this session, the claim-evidence-gate **blocked a legitimate stop twice**: the agent had
launched two background research agents and ended the turn awaiting their results to finish the report. Reason
returned: *"Named next tasks (2 bg agents) without concrete work NOW."* Root cause, **verified in code** (not a
complaint — `no-unverified-blocker` discipline):

- `claim_evidence_gate_stop.ts` computes `nextStepAwaitsResult = awaitingAsync && AWAITS_RESULT_RE.test(claimText)`.
  `AWAITS_RESULT_RE` (in the Stop hook) covers `когда придёт` / `по результату` / `when it returns|lands|completes`
  — but **not** the equally-common "когда **вернутся / придут / пришлют** — дополню" (agents *returning*). The
  closing phrase used "когда вернутся" → regex miss → `nextStepAwaitsResult = false`.
- With that flag false, `meridian-judge.buildJudgePrompt` weighs "launched 2 agents, will enrich when they
  return" as *"names a SEPARATE next task without doing it"* → BLOCK — even though the named next step
  (enrich the report) **strictly consumes the pending agent results** and cannot run until they land.

This is the **same collision class as the referent case** (a legitimate await mis-read as a lazy stop), and a
concrete **Component B** improvement, evidenced live:

1. **Broaden `AWAITS_RESULT_RE`** to cover agent-return phrasings: `вернут\w*` / `придут` / `пришл\w*` /
   `заверш\w*` / `when .* (return|come back|finish)`. (Low-risk regex widening; pin in `judge-bench.ts`.)
2. **Or** have the judge treat the observable fact `agentBgInFlightCount ≥ 1` + "next step enriches their
   output" as a legit wait regardless of phrasing — the agent-launch is harness-recorded, ungameable, and
   already computed in `turn_window.agentBgInFlightCount`.

Either fix prevents the gate from kicking a genuine "I dispatched workers and am waiting for them" stop. Logged
here because the incident *is* primary evidence for the carve-out this report proposes.
