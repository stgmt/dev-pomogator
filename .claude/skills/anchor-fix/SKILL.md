---
name: anchor-fix
description: >
  Keep spec/markdown cross-reference links clickable in the editor (Marksman) when
  you RENAME a heading. Long descriptive headings (`## FR-7: Title`) are Marksman's
  standard, but their GLFM slug is derived from the heading TEXT — so renaming a
  heading silently breaks every inbound `[text](file.md#old-slug)` link. This skill
  DETECTS broken anchors and AUTO-FIXES them: ~99% deterministically (id-bearing
  links), the rest via `claude -p`. INVOKE after renaming/retitling a heading,
  before declaring spec work done, or to clean a corpus of broken anchors.
  Triggers (RU): "почини якоря", "битые ссылки в спеках", "переименовал заголовок
  ссылки", "anchor fix", "проверь ссылки спек". Triggers (EN): "fix broken anchors",
  "spec links broken after rename", "check spec link integrity", "anchor integrity".
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# /anchor-fix — detect & auto-fix broken markdown anchors after a heading rename

## The problem this solves (hard-won, measured)

Marksman (the markdown LSP) computes a heading's anchor slug from its **text** (GLFM,
`glfm_heading_ids.enable=true` — the documented default). So `## FR-7: Phase 2` has
slug `fr-7-phase-2`. **Rename it** to `## FR-7: Phase 2 — native LSP` and the slug
becomes `fr-7-phase-2-native-lsp` — every inbound `[FR-7](FR.md#fr-7-phase-2)` link
is now a dangling anchor. Marksman's in-editor `rename` fixes this when YOU drive it;
nothing protects edits by an agent/script/CI. This skill is that protection.

> Real finding (2026-06): the dev-pomogator corpus had **1744 broken anchors across
> 39 specs** — VERIFIED against the real binary. A historical slugifier dropped
> compound-word dashes Marksman keeps (`#fr-3-devpomogator-…` vs real
> `fr-3-dev-pomogator-…`). 1719/1744 (99%) were deterministically fixable.

## The measured Marksman slug rule (DO NOT GUESS — `tools/anchor-integrity/marksman-slug.mjs`)

Captured ground-truth from the binary via `textDocument/completion` (see
`capture-slug-fixture.cjs`), pinned by `tests/fixtures/marksman/slug-rule.json`:

- lowercase, **Unicode-aware** — Cyrillic is KEPT (`Фаза` → `фаза`)
- **DROP** punctuation entirely — dots removed, NOT dashed: `AC-1.1` → `ac-11`,
  `AC-27.1` → `ac-271`, `config.json` → `configjson`, `v2.0` → `v20`
- `@feature2` → `feature2` (the `@` dropped, the rest kept)
- compound dashes KEPT: `dev-pomogator` → `dev-pomogator`, `per-extension` → `per-extension`
- whitespace runs → one `-`; collapse repeats; trim ends
- bare `[[X]]` targets a DOCUMENT (by H1 title/filename), NOT an H2; custom `{#id}` anchors do NOT resolve

`marksmanSlug()` is the ONE source of truth — `md.ts` and `specs-generator-core.mjs`
both delegate to it. If Marksman is version-bumped, re-run `capture-slug-fixture.cjs`
and the golden test will flag any rule change.

## Workflow

1. **Detect** — list broken anchors (same-file + cross-file; code spans/fences skipped):
   ```bash
   node tools/anchor-integrity/check.mjs --spec .specs/<slug>   # one spec
   node tools/anchor-integrity/check.mjs --all                  # whole corpus
   ```
2. **Fix deterministically** (the ~99% — id-bearing links, no LLM):
   ```bash
   node tools/anchor-integrity/fix.mjs --spec .specs/<slug>            # dry run (suggest)
   node tools/anchor-integrity/fix.mjs --spec .specs/<slug> --apply    # write
   ```
   `--apply` rewrites each stale `#anchor` → the heading's current `marksmanSlug`.
   Idempotent. **Ambiguous** links (link text doesn't name a heading id) are left
   UNTOUCHED — never guess-rewritten.
3. **`claude -p` for the ambiguous tail** (FR-34c) — for prose links the deterministic
   pass skipped, dispatch headless `claude -p` with the broken link + candidate
   headings to pick the target, then rewrite (background; non-blocking).
4. **Verify** — re-run `check.mjs --spec …` → expect `0 broken anchors`.

## When to invoke

- Right after **renaming/retitling** any `## FR-N`/`## AC-N`/`## UC-N`/section heading.
- **Before declaring spec work done** (the Stop-gate `anchor_gate_stop` enforces this).
- **Corpus cleanup** — `fix.mjs --all --apply` (review per-spec; these are foreign-spec
  edits — commit one spec per commit).

## Guardrails (from the spec, FR-34)

- Keep **long descriptive headings** — that's the Marksman standard + readable outline.
  Do NOT switch to short bare-id headings (lossy outline; not the standard).
- Never auto-rewrite an anchor the tool couldn't unambiguously resolve.
- The auto-fix `claude -p` branch runs in the background and must not block the edit.
- PostToolUse anchor-check failures are SOFT (log + exit 0) — never block on a checker bug.

## See also

- `.specs/spec-generator-v4/FR.md` FR-34 (+34a/b/c), AC-34.1–34.5 — the spec.
- `tools/anchor-integrity/` — marksman-slug.mjs, check.mjs, fix.mjs, capture-slug-fixture.cjs.
- `markdown-lsp` skill — navigating/refactoring specs with the LSP (the upstream usage).
