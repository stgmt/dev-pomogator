---
status: DECIDED
decision: "Variant F — Supabase-native (no n8n)"
decision-date: 2026-05-24
proposed-date: 2026-05-23
decision-makers: [WHW developer]
consulted: [Ivan (WHW founder) — pending review of Variant F]
informed: [WHW pilot dealers (eventual)]
input: PRDv2.md (3149 lines, 2026-05-13)
fixed-constraints: Twilio (SMS+voice+STT+email-outbound) + OpenRouter (LLM gateway) — locked by Ivan, not subject to comparison
evidence-basis: Supabase official docs via context7 (2026-05-24) — every capability claim cited in the Evidence table below
---

# Architecture Proposal — White Hat Way Early Warning AI Agent (MVP)

> **DECISION LOCKED 2026-05-24 — Variant F: Supabase-native, no n8n.**
> This supersedes the four-variant dry-run (A–D, retained below as the considered-options record). Variant F was **not** in the original dry-run; it emerged from follow-up analysis once two things were established:
> 1. The WHW operator will tune behaviour by **prompting Claude Code** (and requesting custom visualisations) — not by editing an n8n visual canvas. This removes n8n's *only* unique advantage over the Supabase primitives.
> 2. **Every** engineering function n8n provided (cron, webhooks, queue, multi-step orchestration) has a first-party Supabase equivalent — each one proven against official docs in the [Evidence table](#evidence--proofs-every-capability-claim--supabase-doc) below.
>
> The developer chose Variant F for: minimum vendor surface (3), lowest cost band, no n8n iframe bug, no separate backend to deploy, everything in one project/dashboard/git repo. Full pros/cons recorded in [Variant F — pros / cons](#variant-f--pros--cons-read-before-second-guessing) so the rationale survives future second-guessing.

---

# Decision: Variant F — Supabase-native (no n8n)

## Stack (3 vendors)

| Layer | Choice | Replaces (vs n8n variants) |
|---|---|---|
| Database | Supabase Postgres | — |
| File storage | Supabase Storage (`dealer-imports/{dealer_id}/{year}/{month}/{batch_id}.{ext}`) | S3 / R2 |
| **Scheduling** | **Supabase Cron** (`pg_cron`) — fires SQL / DB-functions / Edge Functions / HTTP on a cron schedule | n8n cron triggers |
| **HTTP out from DB** | **pg_net** (`net.http_post`) — lets a scheduled SQL job invoke an Edge Function | n8n HTTP node |
| **Queue / batch** | **Supabase Queues** (`pgmq`) — durable message queue for chunked SMS sending + retries | n8n batching/loop |
| **Compute / logic** | **Edge Functions** (Deno) + `_shared/` TS modules | n8n function nodes |
| Event triggers | **Database Webhooks** (fire on INSERT/UPDATE/DELETE) | n8n DB-trigger node |
| Auth (V1.1+) | Supabase Auth + RLS (off in V1, ready when dashboard arrives) | — |
| External | Twilio (SMS/voice/STT/email-out) + OpenRouter (LLM) | unchanged, locked by Ivan |

## Why (reasons locked)

1. **n8n's only differentiator is gone.** n8n earned its place in PRDv2 §6.2 because "the team already uses it and does not currently have self-hosting/DevOps experience" — i.e. the *visual canvas* for a non-coder. The operator model is now "operator launches Claude Code, tunes via prompt, asks for a custom visualisation" → the visual canvas is no longer needed. Every other n8n role is pure engineering plumbing that Supabase provides natively.
2. **Fewest vendors (3).** Supabase + Twilio + OpenRouter. One dashboard, one billing portal, one status page, one git repo for schema + functions + cron.
3. **Lowest cost band.** No n8n Cloud tier (~$50/mo) and no separate backend host. ≈ **$25–$50/mo** (Supabase Pro + usage) vs $75–$135/mo for the n8n variants.
4. **No n8n iframe bug.** Action-link confirmation pages were the original reason we already planned Edge Functions (PRDv2 §12 Challenge 9). Variant F just makes Edge Functions the *whole* compute layer rather than a sidecar to n8n.
5. **No separate backend to build/deploy** (vs Variant E classic backend) — saves ~1–1.5 weeks of scaffold (Express routes, Dockerfile, CI/CD, process management).
6. **SaaS-ready.** Supabase Auth + RLS layer onto the existing schema with zero data-layer migration when the V1.1+ dealer dashboard arrives.

## Operator model (why the n8n visual editor is not needed)

Post-launch tuning (cadence, schedules, prompt wording, new visualisations) is done by the **WHW operator running Claude Code against this repo**: they describe the change in a prompt, Claude Code edits the cron schedule / prompt file / Edge Function and (if asked) generates a custom visualisation of the flow. This replaces "operator drags nodes in n8n". Consequence: there is **no non-developer self-service GUI** in V1 — acceptable because the operator path is Claude-Code-assisted, not raw-code.

## New end-to-end workflow (Supabase-native)

```
SCHEDULED JOBS (Supabase Cron / pg_cron)
─────────────────────────────────────────
  08:00 ET digest      cron ─▶ net.http_post ─▶ Edge Fn  generate-digest
  (Mon–Sat)                                       └▶ build digest ─▶ Twilio Email

  11:00 ET SMS batch   cron ─▶ Edge Fn enqueue-checkins
  (Mon–Sat)                       └▶ pgmq.send_batch(400 jobs)   ← instant
                       cron(*/1) ─▶ Edge Fn send-checkin-worker
                                       └▶ pgmq.read(n=25, vt=60s)
                                       └▶ Twilio SMS ×25 ─▶ pgmq.delete on success
                                       └▶ (repeats until queue empty)   ← chunked, resumable

  08:30 ET safety-net  cron ─▶ Edge Fn digest-safety-net (re-send failed digests)

EVENT-DRIVEN (HTTP straight into Edge Functions — no n8n hop)
─────────────────────────────────────────
  Inbound SMS          Twilio webhook ─▶ Edge Fn twilio-inbound
                          └▶ load context ─▶ OpenRouter LLM ─▶ validator (_shared)
                          └▶ Twilio SMS reply  (retry-once → safe fallback)

  Inbound voice        Twilio webhook ─▶ Edge Fn twilio-voice (TwiML)
                          └▶ <Say>/<Record> ─▶ recordingStatusCallback ─▶ Twilio Batch STT

  CSV/Excel import     Twilio Email Inbound Parse ─▶ Edge Fn parse-import
                          └▶ Supabase Storage + UPSERT accounts/customers

  Dealer action-link   email button ─▶ Edge Fn dealer-action  (HMAC verify ─▶ DB write ─▶ HTML)
  Customer opt-out     digest button ─▶ Edge Fn opt-out-customer (24h undo)
```

---

# Evidence / Proofs (every capability claim → Supabase doc)

Sourced from Supabase's official docs repo via context7 on 2026-05-24. Nothing in the Variant F design relies on a capability that isn't cited here.

| # | Claim (what Variant F needs) | Verified | Source doc (github.com/supabase/supabase/…) |
|---|---|---|---|
| 1 | Cron scheduling is built-in (`cron.schedule`) and can target **SQL, DB functions, Edge Functions, or HTTP endpoints**; min interval 1s; run history tracked | ✅ | `apps/www/content/md/modules/cron.md`; `apps/docs/.../cron/quickstart.mdx` |
| 2 | A scheduled SQL job can make an **HTTP POST** (to invoke an Edge Function) via `net.http_post` (pg_net) | ✅ | `apps/docs/.../database/extensions/pg_net.mdx` |
| 3 | Documented pattern: **cron → net.http_post → `/functions/v1/<fn>`** with auth header from Vault | ✅ | `apps/docs/.../functions/schedule-functions.mdx` |
| 4 | Durable **message queue** with `send_batch` (enqueue many) and `read(n, visibility_timeout)` (chunked consume) and `delete`/`pop` | ✅ | `apps/docs/.../queues/api.mdx`; `apps/docs/.../queues/pgmq.mdx` |
| 5 | Official pattern: **Edge Function consumer reads N msgs, processes, deletes** — invoked periodically to drain a backlog | ✅ | `apps/docs/.../queues/consuming-messages-with-edge-functions.mdx` |
| 6 | Edge Function **wall-clock limit = 150s (Free) / 400s (Paid)**; a worker may serve multiple requests / background tasks within that window | ✅ | `apps/docs/.../functions/limits.mdx` |
| 7 | Edge Function **CPU limit = 200ms active compute** (I/O wait does not count against CPU) | ✅ | `apps/docs/troubleshooting/edge-function-cpu-limits.mdx` |
| 8 | **Business logic can live in Postgres functions** (`create function … language plpgsql`) and be called via `supabase.rpc('fn', {...})` or REST `/rpc/<fn>` — explicitly recommended for "business rules, multi-step transactions" | ✅ | `apps/www/_blog/2025-05-17-simplify-backend-with-data-api.mdx`; `examples/prompts/database-functions.md` |
| 9 | **Shared TS modules** across Edge Functions via `supabase/functions/_shared/` + relative imports; "fat functions" recommended | ✅ | `apps/docs/.../functions/development-tips.mdx`; `.../functions/recursive-functions.mdx` |
| 10 | Postgres knows **`America/New_York` and its DST rule** (`now() at time zone 'America/New_York'`; `pg_timezone_names()` exposes `is_dst`) — so ET-correct scheduling is DST-proof | ✅ | `apps/docs/.../database/postgres/configuration.mdx` |

**Honesty note:** I could **not** find a definitive Supabase doc stating whether `pg_cron` honours a *per-job* timezone vs always running its schedule in UTC. That single open point is handled in Deep-dive 2 with an approach (hourly + ET guard) that is correct **regardless** of pg_cron's internal timezone — so the uncertainty does not block the design.

---

# Deep-dive 1 — SMS batch sending: the real constraints (corrected 2026-05-24)

> **CORRECTION.** An earlier version of this section claimed the binding problem was the Edge Function 400s wall-clock, and that you must chunk 400 sends through a queue or risk dying at message 399 / retrying all 400. After researching Twilio's actual send semantics, **that rationale was wrong.** The corrected analysis is here; the old wall-clock/chunking explanation is retained below it (demoted) as a *scale-time* pattern, not the MVP approach.

## What Twilio actually does (researched 2026-05-24)

1. **`Messages.create()` is asynchronous.** It returns **immediately** with HTTP 200 + a Message SID and status `queued`/`accepted`; it does **not** block until the SMS is delivered. Delivery status arrives later via a status-callback webhook. [Twilio: Outbound Message Status in Status Callbacks]
2. **Twilio runs its own distributed queue and paces delivery for you.** Their words: send API requests "as quickly as you'd like, and Twilio will queue your messages and send them out at the appropriate rate." Account/Campaign queues hold up to ~10 hours of message segments. [Twilio: Understanding Rate Limits & Message Queues]
3. **MPS throughput is enforced on Twilio's side** (per A2P campaign + an account-level cap); overflow waits in *Twilio's* queue, not ours. [Twilio: Account-Based Throughput]
4. **One scale caveat:** a single long-code "From" number has a finite queue (error **21611** "max queued messages"). At ~20 customers/dealer this is a non-issue; at scale use a Messaging Service number pool. [Twilio: Error 21611]

## So the wall-clock was a red herring

Because `create()` returns in ~100–200ms and doesn't wait for delivery, 400 sends = **400 quick API calls**:
- Sequential at ~150ms ≈ **~60s**; with light concurrency (10 in flight) ≈ **~6–10s**.
- Both sit far inside the **400s** paid wall-clock. The **200ms CPU** cap is irrelevant — these are I/O awaits, not compute.

**A plain loop over 400 customers fits comfortably in one Edge Function invocation.** My claim that it dies at #399 from the time limit was wrong.

## The real problem is duplicates + resumability — fix is idempotency, not chunking

Two failure modes actually matter:

- **(a) Worker dies mid-batch** (deploy, network blip, rare timeout) → re-run must not re-text the people already done.
- **(b) Duplicate send — the case I missed.** Even *with* a queue: if the worker calls `create()` **successfully** then crashes **before** `delete()`, the message reappears after the visibility timeout and the **same customer is texted again.** pgmq's "exactly once" is explicitly only *"within a visibility timeout"* for queue **delivery** — it does **not** make an external side-effect idempotent. [Supabase: pgmq]

The robust fix for both is **application-level idempotency**, at the per-customer granularity you argued for:

```sql
-- one row per (customer, check-in day); the unique key IS the dedupe guard
create table checkin_sends (
  customer_id  uuid not null,
  checkin_date date not null,
  status       text not null default 'pending',  -- pending | sent | failed
  twilio_sid   text,
  attempts     int  not null default 0,
  last_error   text,
  updated_at   timestamptz not null default now(),
  primary key (customer_id, checkin_date)
);
```
```
for customer in due_customers_today():
    claim = INSERT (customer_id, checkin_date, attempts=1) ON CONFLICT (customer_id, checkin_date)
            DO UPDATE SET attempts = checkin_sends.attempts + 1, updated_at = now()
            WHERE checkin_sends.status <> 'sent'      -- already-sent rows are NOT claimed
            RETURNING customer_id
    if not claim: continue                            -- already sent today → skip
    sid = twilio.create(...)                          -- async, returns fast
    UPDATE checkin_sends SET status='sent', twilio_sid=sid WHERE (customer_id, checkin_date)=...
```
- **Crash anywhere → re-run skips `status='sent'`.** No double-text.
- **Bad number / Twilio 4xx → mark `failed`, bump `attempts`;** a poison record can't loop forever (cap `attempts`).
- **Unit of work and of retry is one customer**, never "the batch" — exactly your point.
- Delivery result (delivered/undelivered) arrives later via **status callback** → update the same row → this table *is* your deliverability analytics.

For 400 customers this needs **no chunking and no queue**. Simpler and strictly more correct than the queue-first design I first gave.

## When a queue (pgmq) actually earns its place

Not at 400/day. It pays off when: the per-run set is large enough that one invocation genuinely risks the 400s window (thousands+, or heavy per-item work beyond a fast API call); or you want **managed** retry/backoff + Dashboard instead of hand-rolled `attempts`; or multiple producers/consumers need decoupling. **Even then the queue does not replace the idempotency table** (failure mode (b)) — you run both: queue for distribution + unique-key guard for exactly-once side effects.

---

## Original wall-clock / chunking explanation (SUPERSEDED — kept as scale-time pattern)

> Retained for the trail and because the queue-chunking mechanics are correct *for large batches*. The premise that 400 sends needs this is wrong (see correction above).

**The thing you asked me to explain.** Two hard numbers from the Evidence table:
- An Edge Function invocation can run **at most 400 seconds** (paid plan) before Supabase kills the worker (claim #6).
- CPU is capped at **200ms of active compute** (claim #7) — but **waiting on a network call (Twilio) is I/O, not CPU**, so the 400s wall-clock is the binding limit for a send loop, not the 200ms.

**Why a naïve loop breaks.** Suppose `send-checkins` does `for (customer of 400) { await twilio.send(...) }` in one invocation:
- Twilio throttles outbound on a 10DLC number (per-number messages-per-second cap), so 400 sends are *paced out* over minutes, not instant.
- If the run drifts past 400s, Supabase **terminates the worker mid-loop**. Now ~N customers got a text, ~400−N did not, and there is **no record of where it stopped** → you can't safely resume (resume risks double-texting the first N).
- One slow Twilio response anywhere late in the loop can trip this.

**Queue-chunking = the fix (all primitives proven, claims #4/#5).** Split "decide who to text" from "actually text them":

```
Step 1  cron 11:00 ET ─▶ Edge Fn enqueue-checkins
            builds today's recipient list
            pgmq.send_batch('checkins', [400 msgs])      ← one call, milliseconds, well under 400s

Step 2  cron */1 * * * * ─▶ Edge Fn send-checkin-worker      (runs every minute)
            msgs = pgmq.read('checkins', vt=60, n=25)     ← grab 25, hide them for 60s
            for (m of msgs) { await twilio.send(m); pgmq.delete(m.msg_id) }
            return                                         ← 25 sends ≪ 400s, always safe
        (next minute's tick grabs the next 25, until the queue is empty)
```

Why this is correct:
- **Each invocation is tiny** (25 sends), nowhere near 400s.
- **Resumable:** the queue *is* the "where did we stop" record. Worker crashes? Unprocessed messages are still in the queue.
- **No customer lost, no double-send:** `read` hides a message for `vt` seconds (visibility timeout). If the worker dies before `delete`, the message reappears after `vt` and a later tick retries it. If it succeeds, `delete` removes it so it's never sent twice.
- **Rate-limit friendly:** chunk size × tick frequency is a throttle you tune to Twilio's MPS.

This is the standard Supabase pattern (claim #5 is literally a doc titled "Consuming Messages with Edge Functions"). 400 customers is comfortably inside it; it also scales if charge-off success grows the list.

## Cron vs Queues — retries, tracking, metadata (research 2026-05-24)

**The question:** can we hang heavy work on Cron and delegate *retries + run-tracking + analyzable metadata* to it, or do we need Queues?

**Myth-bust first: `pg_cron` does NOT retry failed work.** It fires the command on schedule, records whether that run succeeded, and stops. There is no built-in "try again" for a failed job. Evidence:
- The official debugging guide's move is to *query for failures yourself*: `select * from cron.job_run_details where status <> 'succeeded' and status <> 'running'` (`troubleshooting/pgcron-debugging-guide`). If cron retried, you wouldn't hunt failures this way.
- Supabase's own retry guidance routes retries through a **queue**, not cron: "If an Edge Function fails to process a message, it becomes visible again after a timeout and can be retried by the next scheduled task" (`guides/ai/automatic-embeddings.mdx`). Cron's role there is just the periodic *tick*; the **retry comes from the queue's visibility timeout.**

**What Cron *does* give you: a run-log, not a retry engine.** Every scheduled run is recorded in **`cron.job_run_details`** (columns: `jobid, runid, status, return_message, start_time, end_time, command, ...`) — queryable in SQL or via the Dashboard "History" button (`guides/cron.mdx`, `cron/quickstart.mdx`). Two caveats:
- ⚠️ **It is per-tick, not per-item.** For a 400-SMS batch, `job_run_details` has **one** row ("the 11:01 worker tick ran and succeeded") — *not* 400 rows of per-customer status. Per-customer tracking has to live in the queue or your own table.
- ⚠️ **It is not auto-pruned** — "records are not automatically cleaned up and will consume disk space" (`cron/quickstart.mdx`). You schedule your own cleanup.

**Three ways to get retries + per-item tracking + analyzable metadata:**

| Need | Cron alone | **pgmq (Supabase Queues)** | Custom `job_queue` table |
|---|---|---|---|
| Fire on schedule | ✅ its whole job | needs cron to tick the consumer | needs cron to tick the dequeuer |
| **Retry failed work** | ❌ none | ✅ visibility timeout re-shows msg; `read_ct` counts attempts | ✅ you code `retry_count`/`max_retries`/backoff |
| Per-run tracking | ✅ `job_run_details` (per tick) | ✅ Dashboard + archive | ✅ your columns |
| **Per-item tracking** | ❌ 1 row/tick | ✅ per message | ✅ per row |
| Custom analytics metadata | ◐ only `command`/`return_message` | ◐ jsonb payload + `{queue}_archive` table | ✅ any columns you define |
| Built-in metrics | ◐ self-query + self-prune | ✅ `pgmq.metrics_all()` (length, oldest/newest age, total) + Dashboard | ❌ build yourself |
| Managed / no code | ✅ | ✅ mostly | ❌ you write the dequeue function |

Proofs: pgmq retry/`read_ct`/`vt`/archive/`metrics_all()` — `guides/queues/pgmq.mdx`, `guides/queues/api.mdx`; Dashboard "view the number of retries, examine the message payload" — `_blog/2024-12-05-supabase-queues.mdx`; custom `job_queue` with `retry_count`/`max_retries`/`scheduled_at` driven by `cron.schedule('* * * * *', 'select dequeue_and_run_jobs()')` — `guides/auth/auth-hooks/send-sms-hook.mdx`.

**"Heavy stuff directly in cron" — only if it's pure SQL.** A cron job whose body is an in-database `INSERT/UPDATE` ETL runs in Postgres and is bounded by `statement_timeout`, not the Edge 400s cap. But *our* heavy work (Twilio / OpenRouter = external HTTP) **cannot** run in a SQL statement — it must go through an Edge Function, which means the 400s cap applies and chunking-via-queue is back. So cron never *does* our heavy work; it *kicks off* the worker that does.

**Anti-pattern to avoid:** do not schedule N one-off cron jobs as a "task inbox" (one cron row per SMS). pg_cron is a *recurring scheduler*, not a job queue — that bloats `cron.job` / `job_run_details`, still gives no retry, and isn't how it's designed. Use a queue for per-item work.

**Recommendation for our SMS batch (revised after Deep-dive 1 correction):** for MVP (≈400/day) **skip the queue** — use the idempotency-keyed `checkin_sends` table + a plain loop (Deep-dive 1). It gives per-customer retry (`attempts`), exactly-once side effects (unique key), and deliverability analytics (status-callback updates) with no queue machinery. Cron's only job is the daily tick + `job_run_details` answering "did it fire." **Adopt pgmq later** when volume genuinely risks the 400s window or you want managed retry/backoff + Dashboard — and even then keep the `checkin_sends` unique-key guard, because a queue alone does not prevent the crash-after-send duplicate.

---

# Deep-dive 2 — pg_cron + Daylight Saving (OPEN: leaning, not locked)

**Status: you have not locked this. Leaning toward Option 1. Recorded so the trade-off is preserved.**

**The problem.** PRDv2 windows are in **Eastern Time** (digest 08:00 ET, SMS 11:00 ET, Mon–Sat). But Postgres/pg_cron schedules are evaluated against the server clock, which on Supabase is **UTC**. Eastern's UTC offset *changes twice a year*:
- **EST** (winter) = UTC−5 → 11:00 ET = **16:00 UTC**
- **EDT** (summer) = UTC−4 → 11:00 ET = **15:00 UTC**

If you hardcode `0 16 * * 1-6` (UTC), you are **one hour late for ~8 months of the year** (the EDT half). This is a real correctness bug, not cosmetic — texting at 12:00 instead of 11:00.

**Option 1 — Hourly tick + ET guard (RECOMMENDED, DST-proof).**
Schedule the job every hour; inside, proceed only if it's actually the target ET hour on a Mon–Sat. Postgres' tzdata knows the DST rule (claim #10), so this self-corrects across the March/November switch with zero maintenance:
```sql
select cron.schedule('sms-batch-gate', '0 * * * *', $$
  select net.http_post( url := '…/functions/v1/enqueue-checkins', headers := …)
  where extract(hour from (now() at time zone 'America/New_York')) = 11
    and extract(isodow from (now() at time zone 'America/New_York')) between 1 and 6;
$$);
```
- ✅ Correct in EST *and* EDT automatically; never think about it again.
- ◐ 24 wake-ups/day, 23 are instant no-ops (`WHERE` false → nothing fires). Negligible cost.

**Option 2 — Two cron jobs + seasonal guard.** One `0 15 …` and one `0 16 …`, each guarded so only the currently-correct one fires. Works, but you're encoding DST logic by hand → brittle, needs review when tz rules change (they do, by legislation). **Reject** unless Option 1 is somehow unavailable.

**Option 3 — Per-job timezone on pg_cron.** If Supabase's pg_cron honours a per-job timezone (newer pg_cron supports a timezone in the schedule), you could schedule directly in `America/New_York` and let pg_cron handle DST. **This would be the cleanest** — but I could not confirm from Supabase docs that the hosted pg_cron exposes per-job TZ (see Evidence honesty-note). **Action if you lean here:** verify at implementation (`select cron.schedule(...)` signature / `cron.job` columns); if per-job TZ is supported, prefer it; otherwise fall back to Option 1.

**Recommendation:** Option 1 now (robust, zero-dependency on unverified pg_cron TZ behaviour); revisit Option 3 only if you confirm hosted pg_cron supports per-job timezone and want the tidier schedule.

---

# Deep-dive 3 — Centralizing business logic (variants + proofs)

**Your concern:** "logic split between SQL (cron) and TypeScript (Edge Functions) = context-switch." Here's how to keep it centralized, with proofs, and which to pick.

### F-1 — Logic in TypeScript, SQL is dumb plumbing (RECOMMENDED)

- **All** business logic (validator, AI dialogue matrix, session/reply budget, LLM orchestration, digest assembly) lives in **Edge Functions + `supabase/functions/_shared/` TS modules** (claim #9). The same `_shared/validator.ts`, `_shared/matrix.ts`, `_shared/session.ts` are imported by *every* Edge Function — including the queue worker.
- **SQL/cron does only scheduling**: `cron.schedule(...)` whose body is a 1–3 line `net.http_post` to an Edge Function (claim #3). That is configuration, not business logic.
- **DB holds only**: schema, constraints, and trivial triggers (e.g. `updated_at`).
- **Result:** ~95% of logic in **one** TypeScript codebase, unit-testable with `deno test`, reviewable as normal PRs. The only "SQL" is declarative schedule + table constraints — nothing you reason about as business behaviour. **The context-switch effectively disappears.**

```
supabase/functions/
  _shared/
    validator.ts        ← TCPA block-list (PRDv2 §21) — single source of truth
    matrix.ts           ← 21-category AI dialogue matrix (PRDv2 §22)
    session.ts          ← 14-day window, max 4 replies
    twilio.ts  openrouter.ts  db.ts
  twilio-inbound/index.ts        import { validate } from '../_shared/validator.ts'
  send-checkin-worker/index.ts   import { ... } from '../_shared/...'
  generate-digest/index.ts
  dealer-action/index.ts
  tests/  *-test.ts
```

### F-2 — Logic in Postgres functions, Edge Functions are thin adapters

- Encode rules as `plpgsql` functions; Edge Functions just call `supabase.rpc('fn', {...})` (claim #8). Supabase explicitly recommends DB functions for "business rules, multi-step transactions, performance-sensitive operations across multiple tables."
- ✅ Great for **data-heavy transactional** rules (e.g. "compute today's eligible recipients" is genuinely a SQL query — that one *should* be a DB function).
- ❌ Bad for our **LLM orchestration + external HTTP + regex validation** — awkward and untestable in plpgsql, and you'd still need Edge Functions for the Twilio/OpenRouter calls. Pushing the matrix/validator into SQL would *create* a second logic home, not remove one.

### F-3 — Hybrid split (the anti-pattern we're avoiding)

Logic scattered half in SQL, half in TS with no rule about which goes where. This is exactly the "context-switch" you flagged. Don't do this.

### Verdict

**F-1, with one pragmatic exception:** keep all behavioural logic in TS `_shared/` modules; allow *set-based data selection* (e.g. "who is eligible for a check-in today") to be a Postgres function called by `enqueue-checkins`, because that genuinely *is* a SQL query and is faster/cleaner in the DB. Everything a human reasons about as "the product's behaviour" lives in TypeScript, in one place.

---

# Deep-dive 4 — Best-practice check on the role assignments (research 2026-05-24)

Each role in the architecture was checked against Supabase's *own* documented recommendations + Twilio's webhook guidance. Most hold; two need refinement.

## ✅ Confirmed best-practice  (LOCKED 2026-05-24)
- **Cron → pg_net → Edge Function** is *literally* the documented pattern — `cron.schedule('…','* * * * *', $$ select net.http_post(url:='…/functions/v1/fn', headers:=…, timeout_milliseconds:=5000) $$)`. The Dashboard "Edge Function" cron target just wraps this. Recommended refinements: pull the key from **Vault** (`vault.decrypted_secrets`), not inline; set `timeout_milliseconds`. [Supabase: cron/quickstart, functions/schedule-functions]
- **`_shared/` modules for reusable logic** — documented, "reduces HTTP overhead and avoids rate limits." [Supabase: functions/recursive-functions]
- **Idempotency table for exactly-once sends** — standard, not contradicted by anything found.

## ⚠️ Refinement 1 — webhook fast-ack (the one I glossed)
Twilio's incoming-SMS webhook has a **15s read timeout** (Connect default 5s), and Twilio's explicit guidance is: do **not** do long processing synchronously in the webhook response — "respond quickly and handle long-running tasks asynchronously." [Twilio: webhooks connection-overrides; messaging webhook-request]

Our `twilio-inbound` runs **LLM → validator → (retry-once) → reply** — variable latency that can flirt with 15s on a slow tail. Blocking the webhook on it is against best practice. Two compliant options:

- **(a) Background task** — return empty `200`/TwiML immediately, then `EdgeRuntime.waitUntil(handleReply(...))` keeps running after the response; send the reply via Twilio **REST** `Messages.create` (not TwiML). Simplest. [Supabase: functions/background-tasks] **Caveat:** background tasks are **not crash-durable** — if the instance dies mid-task, that reply is lost. Against our hard rule "never leave a customer without a reply."
- **(b) Queue-backed (durable)** — webhook does only: verify signature → `pgmq.send(inbound payload)` → return `200` instantly. A worker (cron-ticked) does LLM→validator→reply with retries. Survives crashes.

**Conclusion — corrects my earlier "pgmq not needed for MVP":** that was true for the **outbound batch** (idempotency table is enough). But **inbound replies** are a different case: fast-ack + the "always reply" durability guarantee make a **queue (or at least background tasks) the best-practice choice for inbound, even at MVP volume** — for reliability, not throughput.

### Recommended inbound design — Supabase Queues + one cron worker (simplest, managed)

The clean, no-crutch pattern. **pgmq = Supabase's first-party managed queue ("Supabase Queues") — not a hand-roll.** This is literally Supabase's documented Queues+Cron pattern:

1. **Webhook `twilio-inbound`:** verify Twilio signature → `pgmq.send('inbound', payload)` → return empty `200` TwiML. Does nothing slow → always acks well under Twilio's 15s timeout.
2. **One worker (cron-ticked, every few seconds):** `read('inbound', vt, n)` → for each msg: LLM → validator → reply → `delete`. Crash before `delete` → message reappears after `vt` → next tick retries it. **The visibility timeout IS the "checker" — no second cron needed.**
3. **Idempotency = Twilio inbound `MessageSid`** (unique per message): guard table `processed_inbound(message_sid pk, reply_sid, status)` — claim before send, skip if already replied. Closes the crash-after-send duplicate.

That's the whole thing: **one queue + one cron worker.** No `waitUntil`, no second cron, no custom retry code — the queue provides retry, the SID provides dedupe.

**What "polling lag" means:** the worker only looks at the queue when cron wakes it. A message arriving just after a tick waits up to one tick interval before processing. At a few-second tick that's a few seconds — irrelevant for SMS (no one expects instant SMS replies).

> *Optional* near-zero-lag variant (not needed for MVP): a DB trigger on enqueue invokes the worker via `pg_net` immediately, with cron as a slow safety-net. Event-driven, still clean.

> **Dropped:** the earlier `EdgeRuntime.waitUntil` "hybrid" — it only existed to shave the few-second polling lag, which doesn't matter for SMS. Premature optimization, removed (it was a crutch).

> **Twilio's own durability isn't enough for us:** Twilio retries an inbound webhook only via the **fallback URL**, and only if our webhook errors or doesn't answer within 15s. Once we ack `200` (instantly, since we just enqueue), Twilio is done — reliable *processing* of the LLM reply is on us → hence the queue. (Still worth configuring a fallback URL on separate infra, per Twilio's recommendation.) [Twilio: webhook fallback]

> **STATUS:** recommended; pending dev OK on the `processed_inbound` schema. Outbound stays the `checkin_sends` idempotency loop (Deep-dive 1) — no queue.

## ⚠️ Refinement 2 — logic placement isn't "all TS"  ✅ LOCKED 2026-05-24
Supabase's own guidance: **Database Functions are recommended for data-intensive operations** (execute in the DB, exposed via REST/GraphQL); **Edge Functions are preferred for low-latency/global + external/custom logic**; "you can invoke a Database Function from an Edge Function — best of both worlds." [Supabase: database/functions]

So the honest split is not "TS = brain, SQL = dumb plumbing." It is:
- **External / orchestration / validation logic → Edge Functions `_shared/` (TS):** LLM calls, Twilio calls, validator regex, dialogue matrix, session budget.
- **Data-intensive logic → Postgres functions (via `rpc`):** "who is due for a check-in today," digest aggregations, set-based selection.

This hybrid *is* the Supabase-recommended split (my F-1 verdict already allowed it; this just corrects the slogan).

## Revised role table
```
Cron (pg_cron)  = БУДИЛЬНИК — расписание; вызывает Edge через pg_net (key из Vault). Best-practice ✓
pg_net          = ПРОВОД    — документированный механизм cron→Edge. ✓
Edge Functions  = РУКИ      — внешняя логика + оркестрация; на webhook'ах отвечать БЫСТРО,
                              медленное (LLM) — в фон/очередь. ✓ с поправкой
_shared/ TS     = МОЗГ-1    — orchestration/validation/LLM (внешнее, кастомное)
Postgres fns    = МОЗГ-2    — data-intensive выборки/агрегации (rpc из Edge) ← так советует Supabase
Postgres        = ПАМЯТЬ    — данные + idempotency-ключи + constraints
pgmq            = КОНВЕЙЕР  — OUTBOUND batch: НЕ нужен (idempotency table).
                              INBOUND replies: НУЖЕН — fast-ack + durability «всегда отвечаем». ← поправка
```

---

# Variant F — pros / cons (read before second-guessing)

Recorded deliberately so the decision isn't relitigated on a bad day. If you're tempted to switch, the trigger conditions are explicit at the bottom.

**Pros**
- ✅ **3 vendors only** (Supabase + Twilio + OpenRouter) — fewest of any variant; one dashboard, one bill, one status page.
- ✅ **Lowest cost** (~$25–$50/mo vs $75–$135 for n8n variants) — no n8n tier, no backend host.
- ✅ **No n8n iframe bug** (PRDv2 §12 Challenge 9) — Edge Functions return their own clean HTML.
- ✅ **No separate backend to build/deploy** (vs Variant E) — saves ~1–1.5 weeks; no Dockerfile/CI/process-manager.
- ✅ **Everything in one git repo** — schema (migrations) + cron + Edge Functions + prompts versioned together; real PR review (n8n stores flows as opaque JSON dumps).
- ✅ **Logic centralizable in one TS codebase** (Deep-dive 3, F-1) — unit-testable with `deno test`.
- ✅ **SaaS-ready** — Auth + RLS layer on with no data-layer migration for the V1.1+ dashboard.
- ✅ **Durable batch processing available** — pgmq (resumable, managed retries) is there for when send volume outgrows a simple idempotent loop. *Note:* exactly-once **side effects** still require an app-level idempotency key regardless of queue (Deep-dive 1).

**Cons (eyes open)**
- ❌ **No visual no-code editor.** Operator tunes via Claude Code prompts, not a canvas. Acceptable *only because* that's the agreed operator model — if WHW ever needs a non-technical operator to self-serve flow edits, this is the thing that hurts. **This is the single biggest trade.**
- ❌ **Edge Function wall-clock cap (400s)** forces the queue pattern for batches (Deep-dive 1). It's a known, solved pattern — but it's extra structure vs an n8n loop node.
- ❌ **Two languages still touch the system** (TS for logic, a little SQL for cron/constraints) — F-1 shrinks SQL to plumbing, but it's not literally zero.
- ❌ **DST handling is on us** (Deep-dive 2) — one-time setup, but a footgun if done naïvely.
- ❌ **Some Supabase coupling** — Edge Functions + pgmq + pg_cron calls are Supabase-flavoured; a future exit means rewriting the ~6–8 functions' glue (the Postgres data itself stays portable).
- ❌ **Deno learning curve** (~1 day for a Node dev) — real but small and paid once.

**Switch triggers (when to revisit — and to what):**
- WHW needs a **non-technical operator to edit flows visually** → add n8n back (Variant A). *Most likely trigger.*
- You want **long-running compute** beyond 400s that's awkward even with queue-chunking → classic backend (Variant E).
- A future hire is **Node/Express-only and allergic to Deno + Supabase idioms** → Variant B/E.

If none of these are true, Variant F stands. Don't reopen it without one of them.

---

## Context and Problem Statement

PRDv2 specifies a 20-dealer pilot serving 2,000–8,000 active BHPH customer accounts in SouthEast US. Required surfaces: (1) Postgres-class relational DB, (2) file storage for raw weekly CSV/Excel imports (~50 MB × 20 dealers × 52 weeks ≈ 52 GB/year), (3) workflow orchestration for cron batches + multi-step pipelines + Twilio webhooks, (4) HTTP endpoints for action-link buttons in the daily digest email (`Reviewed / Contacted / Resolved / Not Useful / Stop Contacting`), (5) optional auth/RLS readiness if Phase V1.1+ adds a dealer dashboard.

Twilio (SMS / `<Say>` voice / Batch Transcription / Email-outbound) and OpenRouter (LLM gateway) are pre-locked by Ivan and identical across all variants — not comparison axes. This document compares only the remaining infrastructure choices.

## Decision Drivers

In priority order, per PRDv2 §1, §3, §5, §6:

1. **Time-to-pilot** — Ivan's V1 is "lightweight operational MVP", semi-manual internally; faster scaffold beats elegance.
2. **Single operator/dev maintainability** — one WHW developer owns the stack for first 6+ months.
3. **Action-link UX correctness** — dealer button-clicks in email must produce clean confirmation pages (not n8n iframe ugliness, see PRDv2 §12 Challenge 9).
4. **SaaS readiness for V1.1+** — Ivan flagged dealer dashboard as plausible future. Auth + RLS + REST/GraphQL API readiness without rewrite avoids costly Phase 2 migration.
5. **Predictable cost band** — pilot economics, $50–$150/mo acceptable, $500+/mo painful.
6. **Vendor sprawl minimization** — fewer dashboards/billing accounts = less ops overhead for solo dev.
7. **Compliance posture** — TCPA / A2P 10DLC compliance already handled at Twilio layer, but raw CSV files contain PII (customer names, phones, balances) — storage encryption-at-rest required by all variants; no extra weight on choice.

## Considered Options

> **⚠️ HISTORICAL (dry-run, 2026-05-23).** The four variants below (A–D) and the "Honest Recommendation: Variant A" at the bottom were the initial dry-run. They are **superseded by the Variant F decision above** (2026-05-24). Kept verbatim as the considered-options trail — do not action the old "Variant A" recommendation.

1. **Variant A — Supabase + n8n Cloud** (DB+Storage+Edge Functions bundled by one vendor)
2. **Variant B — Classic Node backend + managed Postgres + n8n + S3** (portable, separate services)
3. **Variant C — n8n Cloud + managed Postgres only** (no separate backend, no edge functions)
4. **Variant D — Hybrid: managed Postgres + Cloudflare Workers + n8n + R2** (serverless action-link endpoints)

---

## Variant A — Supabase + n8n Cloud

**Y-summary**: In the context of a 20-dealer BHPH pilot, facing one-dev maintainability and need for SaaS-ready dashboard later, this variant uses **Supabase Cloud Pro (Postgres + Storage + Edge Functions + Auth) + n8n Cloud Pro** and rejects classic-backend and serverless splits, to achieve single-vendor data-plane and zero-rewrite path to V1.1 dashboard, accepting Deno-runtime learning curve for Edge Functions and Supabase-API-specific code.

**Stack components**:

| Layer | Choice | Why this over peers |
|---|---|---|
| Database | Supabase Postgres Pro | Bundled with Storage, Auth, Edge Functions in one dashboard; managed backups; Postgres is portable if exit needed |
| File storage | Supabase Storage | Same project as DB; `dealer-imports/{dealer_id}/{year}/{month}/{batch_id}.{ext}` bucket schema from PRDv2 §7.8 maps 1:1; signed-URL generation built-in |
| Workflow orch. | n8n Cloud Pro | Visual workflows for cron batches + Twilio webhooks; PRDv2 §6.2 references it explicitly; Ivan and dev both familiar |
| Action-link HTTP | Supabase Edge Functions (Deno) | Co-located with DB → button-click writes happen with no cross-service auth; bypasses n8n iframe-bug (PRDv2 §12 Challenge 9) |
| Auth (V1: off, V1.1+: on) | Supabase Auth | Magic-link / OAuth built-in; RLS policies ready to layer when dashboard arrives |

**Maturity ring**: `Adopt` (Supabase 2026 mature; n8n Cloud mature) — both have multi-year production track record at this scale.

**Pros**:
- ✅ Good, because one dashboard covers DB + Storage + Auth + Edge Functions + logs (reduces solo-dev cognitive load — concrete: 1 vendor billing portal, 1 status page to monitor)
- ✅ Good, because Edge Functions sidesteps PRDv2 §12 Challenge 9 (n8n iframe-rendering of confirmation pages broken in some email clients — Edge Functions return clean HTML responses)
- ✅ Good, because Supabase RLS + Auth available off-the-shelf when V1.1+ dashboard needed → no DB-migration on Phase 2 (Ivan's "Future SaaS Readiness" requirement, PRDv2 §6.3)
- ✅ Good, because Storage signed-URL generation handles raw CSV/Excel access without custom code (PRDv2 §7.8 raw-file archival requirement)

**Neutral**:
- ◐ Neutral, because Supabase free tier excluded (Pro $25/mo) due to PRDv2 §5 capacity — but this is true for any managed Postgres at this scale
- ◐ Neutral, because Postgres-the-DB is portable (standard SQL) — only Edge Functions are Supabase-specific, and they're typically <500 LOC total for this MVP

**Cons**:
- ❌ Bad, because Edge Functions run on Deno runtime — if dev is TS/Node-only, ~1 day learning curve (concrete: ESM imports, Deno-specific APIs like `Deno.env.get()` instead of `process.env`)
- ❌ Bad, because Edge Functions logic is Supabase-API-specific → if exit from Supabase needed in 2+ years, ~5 button-handlers must be rewritten as Express/Fastify routes
- ❌ Bad, because two managed services (Supabase + n8n) must be learned in parallel by solo dev in first weeks

**Cost band**: ~$75–$100/mo at pilot scale. Sources:
- Supabase Pro $25/mo base (https://supabase.com/pricing — verified 2026 pricing structure but exact number [UNVERIFIED — knowledge cutoff Jan 2026])
- n8n Cloud Pro $50/mo (~10k executions tier) [UNVERIFIED — knowledge cutoff Jan 2026]
- Storage egress / DB CPU at pilot scale likely under included quotas [UNVERIFIED]
- Real precedent dealer count: this is for 20 dealers × ~weekly 50-MB imports + daily digest workflow ≈ 1k–5k workflow executions/mo — comfortably inside n8n Pro tier

**When to choose**: dev is OK spending 1 day on Deno; team explicitly wants smooth path to dealer dashboard in V1.1; "fewer dashboards to babysit" is high-value.

**When NOT to choose**: dev has zero Deno appetite AND no plan for V1.1 dashboard (then Variant B avoids both concerns); or compliance posture requires self-hosted DB (then Variant B with self-hosted Postgres).

**Real-world precedent** [needs octocode verification in live skill — this dry-run cites memory]:
- Many "n8n + Supabase" Twilio integrations exist publicly; specific GitHub repo enumeration deferred to live skill run (the skeleton mandates a real grep, not a memory citation)

**Confirmation**: Within 14 days of pilot launch — (a) action-link click round-trip latency p95 < 800ms (measured via synthetic test on 5 button-types); (b) zero n8n iframe-rendering complaints from first 1–3 dealers; (c) Supabase weekly backup verified by restore-to-staging dry-run.

---

## Variant B — Classic Node backend + managed Postgres + n8n + S3

**Y-summary**: In the context of a 20-dealer BHPH pilot, facing dev preference for portable/familiar stack and skepticism of Supabase-specific code, this variant uses **Neon/Railway Postgres + Express/Fastify Node backend on Railway/Render + AWS S3 + n8n Cloud Pro** and rejects single-vendor bundling, to achieve maximum portability and centralized business logic in a tested Node codebase, accepting +1 week of scaffold time and 6 vendors to monitor.

**Stack components**:

| Layer | Choice | Why this over peers |
|---|---|---|
| Database | Neon Postgres Pro or Railway Postgres | Standard Postgres, no vendor-specific extensions; serverless scaling on Neon |
| File storage | AWS S3 (or Cloudflare R2 for cheaper egress) | Battle-tested; SDK in every language |
| Backend | Express/Fastify on Railway / Render / Fly.io | Centralized business logic; testable with vitest/jest; future REST API "for free" |
| Workflow orch. | n8n Cloud Pro | Same as Variant A — fixed by Ivan reference in PRDv2 §6.2 |
| Action-link HTTP | Same Node backend routes | No cross-service hop; clean HTML responses |
| Auth (V1.1+) | Auth0 / Clerk / build-it-in-Node | Decision deferred to V1.1+; not bundled with DB |

**Maturity ring**: `Adopt` for every component — these are the boring, default choices.

**Pros**:
- ✅ Good, because all business logic lives in one Node codebase → vitest/jest unit tests are straightforward (concrete: validator regex from PRDv2 §21 can be tested in isolation, not as n8n function node)
- ✅ Good, because Postgres-as-Postgres → zero vendor lock-in; exit to RDS/Aurora/self-hosted is `pg_dump | pg_restore`
- ✅ Good, because dev uses familiar Node/Express/Prisma stack (zero learning curve assumed if dev is TS/Node)
- ✅ Good, because the same Node service handles BOTH action-link endpoints AND future dealer dashboard API — no Phase 2 architectural pivot

**Neutral**:
- ◐ Neutral, because deployment via Railway / Render / Fly.io adds 1 vendor but each has GitHub-push-to-deploy → modern dev flow, not painful
- ◐ Neutral, because Auth decision deferred to V1.1+ (not yet a problem in MVP)

**Cons**:
- ❌ Bad, because 6 vendors to learn / monitor / pay (Postgres host + backend host + S3 + n8n + Twilio + OpenRouter) vs 4 in Variant A
- ❌ Bad, because +~1 week of MVP scaffold time to write Express routes + Prisma migrations + S3 client + CI/CD pipeline that Supabase provides out-of-box
- ❌ Bad, because Auth bring-it-yourself when V1.1+ dashboard arrives (Auth0 $35-$240/mo OR Clerk $25/mo OR custom = real cost in dev-hours)
- ❌ Bad, because raw-file Storage bucket schema (`dealer-imports/{dealer_id}/...`) requires hand-written S3 signed-URL generator (Supabase Storage gives this free)

**Cost band**: ~$85–$135/mo at pilot scale. Sources:
- Neon Pro $19/mo (https://neon.tech/pricing) [UNVERIFIED — knowledge cutoff Jan 2026]
- Railway/Render backend host $10–$30/mo at pilot CPU/RAM [UNVERIFIED]
- S3 ~$5/mo at 52 GB/year + light egress [UNVERIFIED]
- n8n Cloud Pro $50/mo (same as Variant A)
- Total: $84–$104 baseline + Auth0 when V1.1+ → $109–$344/mo Phase 2

**When to choose**: dev has deep Node experience and is allergic to learning Deno; explicit goal to keep stack vendor-portable for 5+ year horizon; team plans hire of second engineer (more familiar with Express than Edge Functions).

**When NOT to choose**: pilot velocity is paramount and +1 week scaffold is unacceptable (then Variant A); team strongly prefers single-vendor data-plane.

**Real-world precedent** [needs octocode verification in live skill]:
- Express + Neon + n8n + Twilio combinations are extremely common in indie hacker / Twilio Solutions Architect circles; specific repos deferred to live skill

**Confirmation**: Within 21 days of pilot launch — (a) backend code coverage > 60% via vitest (validator + action-link handlers + import parser); (b) DB migrations replay-able via Prisma migrate reset on staging; (c) S3 bucket lifecycle policy verified (no accidental public-bucket regression).

---

## Variant C — n8n Cloud + managed Postgres only

**Y-summary**: In the context of a 20-dealer BHPH pilot, facing extreme MVP velocity pressure and acceptance of n8n's UX rough edges, this variant uses **Neon/Railway Postgres + n8n Cloud Pro + S3 + n8n HTTP-trigger nodes for action-links** and rejects any separate backend or Edge Functions, to achieve smallest possible vendor surface and fastest scaffold (~3 days), accepting n8n iframe-bug ugly confirmation pages, hard-to-test business logic in n8n JSON workflows, and a guaranteed migration when V1.1+ dashboard arrives.

**Stack components**:

| Layer | Choice | Why this over peers |
|---|---|---|
| Database | Neon Postgres Pro | Same as Variant B; standard Postgres |
| File storage | S3 (via n8n S3 node) OR Neon-paired bucket | Minimal — only raw CSV archival |
| Workflow orch. | n8n Cloud Pro — covers EVERYTHING | Cron, webhook, LLM call, DB write, email send all in n8n |
| Action-link HTTP | n8n HTTP Request webhook nodes | No separate backend at all |
| Auth | None in V1; will require pivot at V1.1+ | Out of scope for MVP |

**Maturity ring**: `Trial` — n8n is mature, but using it as the *only* HTTP layer for user-facing button clicks is at the edge of n8n's design (it shines as orchestrator, less as web server).

**Pros**:
- ✅ Good, because fastest possible scaffold — no backend code, no Edge Functions, just n8n workflows + Postgres tables (concrete: 3–5 days to first end-to-end SMS round-trip)
- ✅ Good, because every step is visible in the n8n graph view — solo dev can debug visually
- ✅ Good, because lowest cost band ($70/mo total)

**Neutral**:
- ◐ Neutral, because n8n workflows are JSON-versioned in git (export+commit), but PR diff readability is poor — neutral, not bad, since solo dev works alone in MVP

**Cons**:
- ❌ Bad, because **n8n iframe-rendering issue (PRDv2 §12 Challenge 9 explicitly flagged)** — action-link confirmation pages will display ugly or broken in some email clients (Gmail inline-rendering, Outlook). This is a real UX problem; dealers will see strange pages on every button click
- ❌ Bad, because business logic (validator regex, session-budget enforcement, LLM-response post-processing per PRDv2 §21) lives in n8n function nodes → cannot be unit-tested in isolation, version-controlled diff-wise, or refactored confidently
- ❌ Bad, because guaranteed pivot when V1.1+ dashboard arrives — you'll end up adding Variant B's backend anyway, having "wasted" 3 days on n8n-only setup
- ❌ Bad, because n8n cost cliff if executions grow past Pro tier (>10k/mo → Business tier ~$667/mo) — pilot is below this, but charge-off-success could spike volume fast

**Cost band**: ~$70–$80/mo at pilot scale. Sources:
- Neon Pro $19/mo [UNVERIFIED — knowledge cutoff Jan 2026]
- n8n Cloud Pro $50/mo [UNVERIFIED]
- S3 ~$5/mo [UNVERIFIED]

**When to choose**: pilot is explicitly "throwaway proof-of-concept", dashboard plans are pure speculation 2+ years out, dev is willing to accept ugly confirmation pages.

**When NOT to choose**: dealer UX matters (PRDv2 §3 emphasizes dealer satisfaction → button-click UX is in the trust loop); dashboard in V1.1+ is more than speculation; want to test business logic via unit tests.

**Real-world precedent** [needs octocode verification in live skill]: not enumerated — generally n8n-only architectures appear in solo-hacker territory, not in 20-dealer commercial pilots.

**Confirmation**: Honestly — hard to define a positive fitness function; the negative is more telling: if within 14 days *any* dealer reports "confirmation page looks weird/broken on my phone", that's a partial DENY for this variant.

---

## Variant D — Hybrid: managed Postgres + Cloudflare Workers + n8n + R2

**Y-summary**: In the context of a 20-dealer BHPH pilot, facing dev preference for serverless modernity and aversion to Supabase, this variant uses **Neon Postgres + Cloudflare Workers (action-link endpoints) + Cloudflare R2 (storage) + n8n Cloud + Twilio + OpenRouter** and rejects both single-vendor (Supabase) and traditional backend (Express), to achieve pay-per-use action-link endpoints with near-zero cold start and zero Deno coupling, accepting split business logic between n8n and Workers, 6 vendors, and Cloudflare-specific runtime.

**Stack components**:

| Layer | Choice | Why this over peers |
|---|---|---|
| Database | Neon Postgres Pro | Same as B and C |
| File storage | Cloudflare R2 | Same R2 as S3 but free egress to Cloudflare — cheaper if any future dashboard reads files |
| Workflow orch. | n8n Cloud Pro | Cron + webhooks + LLM calls |
| Action-link HTTP | Cloudflare Workers | Pay-per-request; free tier covers 100k req/day; clean HTML responses |
| Auth (V1.1+) | Clerk / Auth0 / Workers OAuth | TBD |

**Maturity ring**: `Trial` for the composition (Workers + Neon + n8n triangle is less battle-tested than Variant A's bundle) — individual components are `Adopt`.

**Pros**:
- ✅ Good, because Workers cold start typically <100ms on Cloudflare's edge (concrete: see Cloudflare's own published benchmarks https://blog.cloudflare.com/workers-cold-starts/)
- ✅ Good, because pay-per-use: 5 buttons × 20 dealers × ~10 clicks/day ≈ 1000 req/day ≈ free tier permanently
- ✅ Good, because R2 has zero egress fees → if V1.1+ dashboard reads raw CSV files, no surprise bill
- ✅ Good, because Postgres remains portable (Variant B's portability win without Variant B's backend overhead)

**Neutral**:
- ◐ Neutral, because Workers runtime supports both JavaScript and Python — dev can pick familiar language

**Cons**:
- ❌ Bad, because business logic split across n8n workflows (cron + LLM orchestration) AND Workers code (button handlers) — "split brain", harder to reason about end-to-end
- ❌ Bad, because still 6 vendors to learn (Neon + Cloudflare + n8n + Twilio + OpenRouter + monitoring) — same vendor-count as Variant B without the centralization win
- ❌ Bad, because Workers cold start, while fast, is still ~100ms vs <10ms for a warm Express process → button feel slightly slower on first click of the day
- ❌ Bad, because Auth-for-V1.1+-dashboard still has to be solved separately (no Supabase Auth bundle)

**Cost band**: ~$70–$80/mo at pilot scale. Sources:
- Neon Pro $19/mo [UNVERIFIED — knowledge cutoff Jan 2026]
- Cloudflare Workers free tier covers projected load [UNVERIFIED]
- R2 ~$5/mo at 52 GB [UNVERIFIED]
- n8n Cloud Pro $50/mo

**When to choose**: dev already knows Cloudflare ecosystem (Workers + R2 + maybe D1); zero appetite for Supabase OR Express; want serverless economics.

**When NOT to choose**: dev is new to Cloudflare (then learning curve negates the saved Deno-curve of Variant A); team wants centralized code-base (then Variant B); want bundled Auth for V1.1+ (then Variant A).

**Real-world precedent** [needs octocode verification in live skill]: Cloudflare Workers + Neon + n8n combos exist in indie-hacker space; less common than Variant A/B at commercial pilot scale.

**Confirmation**: Within 14 days — (a) Worker cold-start p95 < 200ms (Cloudflare analytics dashboard); (b) R2 egress at zero cost confirmed in first month's bill; (c) split-brain debugging exercise: when a button click fails, time-to-root-cause < 30 min on simulated failure.

---

## Pros and Cons Comparison Table

| Dimension | Variant A (Supabase+n8n) | Variant B (Node+Postgres+n8n+S3) | Variant C (n8n+Postgres) | Variant D (Neon+Workers+n8n+R2) |
|---|---|---|---|---|
| Vendor count (data plane) | 2 (Supabase, n8n) | 4 (Postgres, backend host, S3, n8n) | 3 (Postgres, n8n, S3) | 4 (Neon, Cloudflare, S3/R2, n8n) |
| Scaffold time est. | ~5 days | ~10–12 days | ~3–5 days | ~7–9 days |
| Action-link UX | ✅ Clean (Edge Funcs) | ✅ Clean (Express routes) | ❌ Iframe issue (§12 Ch.9) | ✅ Clean (Workers) |
| Business logic testability | ◐ Edge Funcs unit-testable | ✅ Backend code fully unit-testable | ❌ n8n JSON nodes hard to test | ◐ Workers testable; n8n nodes not |
| SaaS readiness (V1.1+) | ✅ Auth+RLS bundled | ◐ Backend exists but Auth TBD | ❌ Guaranteed pivot to A or B | ◐ Workers can host API but Auth TBD |
| Cost at pilot scale | $75–$100/mo | $85–$135/mo | $70–$80/mo | $70–$80/mo |
| Portability (exit cost) | ◐ Edge Funcs need rewrite | ✅ Pure Postgres+code | ✅ Pure Postgres | ◐ Workers need rewrite if leaving CF |
| Dev cognitive load | ◐ 2 mgd services + Deno | ◐ 4 services + boilerplate | ✅ 2 services only | ❌ 4 services + split brain |
| Risk of MVP-fail | Low | Low | Medium (UX bug) | Medium (split brain) |

---

## Honest Recommendation

> **⚠️ SUPERSEDED by the Variant F decision (2026-05-24) at the top of this document.** The recommendation below reflects only the original A–D dry-run, before the Supabase-native option and the Claude-Code operator model were considered.

**Start with Variant A (Supabase + n8n Cloud)**. The PRDv2 explicitly anticipates V1.1+ dealer dashboard (§6.3 "Future SaaS Readiness"), and Variant A is the only option where that Phase 2 step does *not* require touching the data layer at all — Supabase Auth + RLS layer onto the existing schema. The Deno learning curve for ~5 button-handler functions is a 1-day cost paid once, not a recurring tax. n8n iframe-bug for confirmation pages (Variant C's killer flaw, PRDv2 §12 Challenge 9) is structurally bypassed because Edge Functions return their own HTML responses.

**Reconsider in favor of Variant B if** the dev hire after the founding dev has zero appetite for Deno-style runtimes AND the V1.1+ dashboard timeline slips beyond 18 months — at that point the Supabase lock-in cost compounds, and Variant B's portability wins.

**Reject Variant C outright**. The n8n iframe-rendering issue is not a theoretical concern — PRDv2 §12 explicitly lists it as a known challenge. Dealers experiencing ugly/broken confirmation pages on their first button click is exactly the failure mode that erodes the trust loop the MVP depends on (PRDv2 §1.3 KPI #1 = "Dealers will pay…").

**Reject Variant D unless** dev is already deeply embedded in Cloudflare ecosystem. The "split brain" between n8n workflows and Workers handlers is a real cognitive cost, and the saved Deno-curve of Variant A is replaced by an equivalent Cloudflare-curve.

## Additional Questions for Final Sign-Off

1. What is the dev's primary language/runtime preference? (TypeScript/Node → A or B feasible. Python-only → B with FastAPI; A's Deno becomes painful.)
2. Is the V1.1+ dashboard timeline known? (≤12 months → A's Auth/RLS bundling is high-value; ≥24 months → portability of B matters more.)
3. Who maintains after the founding dev? (Solo continuation → A's fewer-dashboards wins. Future-team-of-2+ → B's familiar Express stack wins.)
4. Is there an existing Cloudflare relationship at WHW? (If yes → Variant D becomes interesting. If no → ignore D.)
5. Are there any compliance requirements that prohibit US-managed Postgres at any of these vendors? (PRD doesn't flag HIPAA/SOC2; assuming standard TCPA-only.)

---

## Dry-Run Self-Assessment (not part of artefact in production)

> This section is appended for the dev-pomogator skill prototype evaluation. Not part of normal output.

**What worked in the skeleton:**
- Y-summary forced concise framing of each variant's identity in one sentence — useful entry point for reader.
- Stack components table made compute/storage/auth axes explicit and comparable.
- "When to choose" / "When NOT to choose" pairing felt natural; "When NOT" especially valuable (would have been omitted without explicit slot).
- MADR-style `Good / Neutral / Bad` taxonomy — `Neutral` category was used 2 times legitimately (avoided fake-pro/fake-con padding).
- Honest Recommendation with explicit "reconsider in favor of" conditions and "reject outright" reasoning matches the BMAD facilitator pattern + tezgiden honest-recommendation pattern.

**What was awkward:**
- "Real-world precedent" section is hollow in dry-run (I cannot grep GitHub from memory honestly) — in a real skill execution this MUST be filled by octocode `githubSearchRepositories` call. Without that, this section becomes lip service.
- "Confirmation" (fitness function) was harder to write for Variant C — the honest answer was "I can't define a positive one" which is itself useful signal, but unusual.
- Cost numbers all marked [UNVERIFIED — knowledge cutoff Jan 2026] — feels like skill should mandatorily fetch pricing pages live OR present without numbers (with caveat). Putting fake-confident $X-$Y/mo with [UNVERIFIED] is uncomfortable middle ground.
- Decision Drivers section in header was tempting to skip but actually anchored the whole document — keep it mandatory in skill.
- Maturity ring (Adopt/Trial/Assess/Hold) felt forced when most components were "Adopt"; perhaps make it optional per-component-override only.

**Comparison with HANDOFF.md (will check after this file is saved):**
- My recommendation = Variant A (Supabase + n8n)
- HANDOFF reportedly = Supabase + n8n + Twilio + Claude Haiku (per dev-pomogator obvervation agent)
- If they match: skeleton is well-calibrated for at least this case.
- If they differ on storage/orchestration: investigate whether my Decision Drivers ordering matches Ivan's actual constraints.
