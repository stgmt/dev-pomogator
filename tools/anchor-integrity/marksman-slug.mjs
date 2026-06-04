/**
 * `marksmanSlug` — the ONE source of truth for the slug Marksman assigns a heading
 * (FR-34a). Every consumer (graph parser `md.ts`, validator `specs-generator-core.mjs`,
 * the anchor-integrity check + fixer) MUST import this — no second slug implementation.
 *
 * Shipped as `.mjs` (plain ESM) on purpose: the validator is `.mjs` (native ESM) and
 * the parser is `.ts` (tsx) — a `.mjs` is the only form BOTH can import without the
 * `ERR_UNKNOWN_FILE_EXTENSION` barrier a `.ts` hits when required from an `.mjs`.
 *
 * The rule is GLFM (Marksman default `glfm_heading_ids.enable=true`), MEASURED against
 * the real binary via `textDocument/completion` and pinned by the golden fixture
 * `tests/fixtures/marksman/slug-rule.json` (regenerate with
 * `tools/anchor-integrity/capture-slug-fixture.cjs`). Observed behaviour:
 *   - lowercase, Unicode-aware: Cyrillic is KEPT (`Фаза` → `фаза`)
 *   - DROP punctuation entirely — dots removed, NOT dashed:
 *       `AC-1.1` → `ac-11`, `AC-27.1` → `ac-271`, `v2.0` → `v20`;
 *       `:` `!` `,` `&` `(` `)` `—`(em-dash) all removed
 *   - whitespace runs → a single `-`; existing `-` kept; collapse repeats; trim ends
 *
 * @see ./capture-slug-fixture.cjs                (regenerates the golden fixture)
 * @see ./__tests__/marksman-slug.golden.test.ts  (asserts parity with the binary)
 * @see .specs/spec-generator-v4/FR.md FR-34a
 *
 * @param {string} headingText
 * @returns {string} the Marksman/GLFM slug — Unicode-aware, idempotent
 */
export function marksmanSlug(headingText) {
  return headingText
    .toLowerCase()
    // Keep Unicode letters/digits, whitespace, and hyphens; DROP everything else
    // (punctuation incl. dots, so `AC-1.1` → `ac-11`, not `ac-1-1`).
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-') // whitespace runs → single hyphen
    .replace(/-+/g, '-') // collapse hyphen runs
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}
