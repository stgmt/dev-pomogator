# Anchor-Integrity Guard + Auto-Fix — Design (keep long headings, automate the only downside)

> Decision (2026-06): keep **long / descriptive** headings (`## FR-7: Title`) — it is Marksman's
> documented standard (`glfm_heading_ids.enable = true`, default; slug from heading **text**),
> it is prettier in the editor outline, and 47/48 specs already use it. The ONE real downside —
> a descriptive anchor breaks when you rename the heading — is **automated away** by the tool
> below instead of by switching to non-standard short ids. Grounded in the existing repo infra.

## 1. Problem (precise)

GLFM slug = f(heading **text**). Rename `## FR-7: Phase 2` → `## FR-7: Phase 2 — native LSP`
and its slug flips `fr-7-phase-2` → `fr-7-phase-2-native-lsp`; every inbound
`[FR-7](FR.md#fr-7-phase-2)` is now a dangling anchor. Marksman's in-editor `rename` fixes this
when YOU drive it from the editor — but nothing protects edits made by an agent, a script, CI, or
a non-editor context. That gap is what this tool closes.

**Evidence the gap is real & narrow:**
- `validate-spec` already flags broken **cross-file** links (`specs-generator-core.mjs:1188`
  `CROSS_REF_LINKS`) but its `linkPattern` (`:1209`, requires `…\.md`) **never checks same-file
  `#anchor`** links — a whole class is unguarded.
- The slug rule is **implemented twice** — `core.mjs:423 toAnchorSlug` and `md.ts:74 slugify` +
  `md.ts:329` AC dot-drop — so the detector and the parser can silently disagree.
- Spec links are **id-bearing** (`[FR-7](…#…)`, `[AC-7.1](…#…)`) → the target heading is
  identifiable by id from the link **text**, so the majority of fixes need **no LLM**.

## 2. Architecture — 3 layers

```
 ┌─ Layer 1: DETECT ───────────────────────────────────────────────┐
 │ marksmanSlug(text)  ← ONE shared GLFM impl (md.ts + core.mjs use it)
 │ anchor-integrity check: every #anchor (same-file + cross-file)    │
 │   resolves to a heading whose slug matches → else BROKEN finding  │
 └─────────────────────────────────────────────────────────────────┘
        │ findings: {file,line,linkText,brokenAnchor,inferredId,currentSlug}
        ▼
 ┌─ Layer 2: CATCH IMMEDIATELY (hook + gate) ──────────────────────┐
 │ PostToolUse(Write/Edit *.md) → run check on touched spec →       │
 │   emit <system-reminder> with broken anchors + the fix           │
 │ Stop-gate → block "done" while the touched spec has broken        │
 │   anchors (escape hatch for intentional) — "адвисор не дает"      │
 └─────────────────────────────────────────────────────────────────┘
        │ on broken
        ▼
 ┌─ Layer 3: AUTO-FIX (deterministic + claude -p/-bg fallback) ─────┐
 │ A. DETERMINISTIC (majority): link text carries id (FR-7) →        │
 │    find heading by id → marksmanSlug → rewrite anchor. No LLM.     │
 │ B. AMBIGUOUS (long tail): prose link, text ≠ id → dispatch        │
 │    `claude -p` (headless) / background → pick the right heading →  │
 │    rewrite. Batched per spec, run in bg (proven pattern).         │
 └─────────────────────────────────────────────────────────────────┘
```

## 3. Layer detail

### Layer 1 — detector (the durable win, ships under ANY heading-form decision)
- **`tools/anchor-integrity/marksman-slug.ts`** — single `marksmanSlug(text)` implementing the
  GLFM rule **measured against the real binary**: lowercase → strip punctuation **including dots**
  (`AC-1.1`→`ac-11`, `AC-27.1`→`ac-271`) → spaces→`-` → collapse `-`. `md.ts` and `core.mjs`
  both import it (kills the 2-impl drift). Pinned by a **golden fixture** captured from the binary
  (`tests/fixtures/marksman/slug-rule.json`) so a Marksman version bump that changes slugging
  FAILS loudly.
- **`tools/anchor-integrity/check.ts`** — for a spec (or whole corpus): build heading→slug map,
  scan **both** same-file `[t](#a)` and cross-file `[t](f.md#a)` links, return `BrokenAnchor[]`.
  Extends, not duplicates, `CROSS_REF_LINKS` (adds the same-file class it misses).

### Layer 2 — catch on edit + gate on ship
- **PostToolUse hook** (reuse the `spec-conformance-push` idiom already wired in `hooks.json`):
  matcher `Write|Edit`, on a `*.md` change run `check.ts` on that file's spec; if broken → inject a
  `<system-reminder>` listing each broken anchor + its deterministic fix. Throttled like the
  existing push (3s). This is "ловит сразу".
- **Stop-gate** (`tools/anchor-integrity/anchor_gate_stop.ts`, modeled on the existing
  `claim-evidence-gate` Stop hook): if the session touched a spec that now has broken anchors and
  no fix was applied → block with an actionable message + escape hatch `[skip-anchor-fix: reason]`.
  This is "не дает" ship a rename that orphaned links.

### Layer 3 — auto-fix handler
- **`tools/anchor-integrity/fix.ts`** — modes `--suggest` (report) / `--apply` (rewrite) /
  `--claude` (enable LLM fallback).
  - **Deterministic branch** (no LLM, the bulk): for each broken `[FR-7](FR.md#fr-7-old)`, extract
    the id from the link text, locate that id's heading in the target file, compute `marksmanSlug`,
    rewrite the anchor. Idempotent.
  - **`claude -p` / `-bg` branch** (ambiguous long tail): prose links whose text doesn't name a
    heading id → build a prompt (broken link + candidate headings in the target file) → dispatch
    headless `claude -p --output-format json` (or background for batches) → it returns the chosen
    heading → rewrite. The exact headless-dispatch pattern is already proven this session
    (the LSP hop-2 e2e). Background so it never blocks the edit.

## 4. Why this is the right shape

- Keeps the **Marksman-standard** descriptive headings + readable outline (the thing the user liked).
- Turns the only short-form advantage (stable anchors) into **automation**, not a format downgrade.
- The detector + shared slug + golden fixture are the **report's P0/P1 durable wins** — they ship
  regardless and double as the rename-safety net.
- Most fixes are **deterministic** (id-bearing links); `claude -p` is the fallback for the few prose
  links, dispatched in background so editing stays snappy.

## 5. Build order (each a commit, verified)

| # | Item | Lives in | Effort | Verify |
|---|---|---|---|---|
| 1 | `marksmanSlug()` shared + golden fixture; `md.ts`/`core.mjs` consume it | `tools/anchor-integrity/marksman-slug.ts`, `tests/fixtures/marksman/slug-rule.json` | M | golden test vs captured binary output |
| 2 | `check.ts` (same-file + cross-file integrity) + corpus test | `tools/anchor-integrity/check.ts`, `__tests__/` | M | run over all 48 specs → 0 broken (baseline) |
| 3 | `fix.ts` deterministic branch + idempotence test | `tools/anchor-integrity/fix.ts` | M | rename a heading in a fixture → fix → links resolve; `fix(fix(x))==fix(x)` |
| 4 | PostToolUse hook + Stop-gate (escape hatch) | `hooks.json` + `anchor_gate_stop.ts` | M | edit a heading in a tmp spec → reminder fires; Stop blocks until fixed |
| 5 | `claude -p`/`-bg` ambiguous-link fallback | `fix.ts --claude` | L | mocked unit + 1 real background smoke |
| 6 | Wire detector into `validate-spec` (replace its partial check) + markdown-lsp skill note | `core.mjs`, `markdown-lsp/SKILL.md` | S | validate-spec catches same-file breaks |

## 6. Open question for the user

- **v4 revert:** spec-generator-v4 is currently the one **short**-form spec. To make the corpus
  uniform on the chosen long standard, revert it to `## FR-7: Title` (+ its links back to long
  slugs). The parser stays dual-form regardless. Small, reversible — confirm before doing it.
