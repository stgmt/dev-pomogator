// normalize-evidence — forgiving adapter that lets resolvers accept BOTH
// the canonical post-classifier shape AND a raw cross-spec-reconcile finding
// shape when called directly (e.g. in-process from tests or ad-hoc scripts).
//
// Background (Bug #2): the normal pipeline path is
//   reconcile.ts (finding) → classifier.ts (normalize) → backlog entry → resolver.
// Direct callers that skip the classifier hand resolvers raw findings whose
// evidence keys don't match what resolvers read:
//   • finding.referenced_in     → entry.evidence.file
//   • finding.spec_a (with `.specs/<slug>` prefix) → entry.evidence.spec_a (bare slug)
//   • finding.spec_b (with `.specs/<slug>` prefix) → entry.evidence.spec_b (bare slug)
//   • finding.expected_path     → entry.evidence.target / target_path
// Without this normalization, every direct call bails with 'missing-evidence'
// even though the finding has all the data — just under different keys.
//
// This helper is idempotent: when called on an already-normalized entry it
// returns it unchanged. It NEVER overwrites a present canonical key.
//
// Mirrors the mapping logic in classifier.ts so the two stay in sync — if
// you change one, change the other.

import type { BacklogEntry } from '../types.ts';

/** Strip `.specs/` (or `./.specs/`) prefix from a slug, matching classifier.ts. */
function stripSpecsPrefix(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  return s.replace(/^\.?[\/\\]?\.specs[\/\\]/, '');
}

/**
 * Accepts either a `BacklogEntry` (canonical post-classifier shape) OR an
 * object that looks like a raw reconcile finding flattened into entry form
 * (i.e. `referenced_in`/`spec_a`/`spec_b`/`expected_path` at the top level or
 * inside `evidence`). Returns an entry whose `evidence` contains the keys
 * resolvers actually read.
 *
 * Existing canonical keys win — we only fill in missing ones from fallback
 * locations. This keeps already-normalized entries byte-for-byte identical.
 */
export function normalizeEvidence(entry: BacklogEntry): BacklogEntry {
  // Tolerate the case where the caller passed a raw finding flat-mixed with
  // entry-shape fields. We read fallbacks from BOTH the top-level entry
  // (cast through unknown) and entry.evidence.
  const raw = entry as unknown as Record<string, unknown>;
  const ev = (entry.evidence ?? {}) as Record<string, unknown>;

  const next: Record<string, unknown> = { ...ev };

  // `file` ← evidence.file (canonical) | evidence.referenced_in (raw) | top-level referenced_in
  if (next.file == null) {
    const fallback = ev.referenced_in ?? raw.referenced_in;
    if (typeof fallback === 'string' && fallback) {
      next.file = fallback;
    }
  }

  // `referenced_in` ← evidence.referenced_in | evidence.file | top-level referenced_in
  // (some resolvers — wrap-deprecated-ref — read this preferentially)
  if (next.referenced_in == null) {
    const fallback = ev.file ?? raw.referenced_in ?? next.file;
    if (typeof fallback === 'string' && fallback) {
      next.referenced_in = fallback;
    }
  }

  // `spec_a` ← evidence.spec_a | top-level spec_a (with `.specs/` prefix stripped)
  if (next.spec_a == null) {
    const fallback = raw.spec_a;
    if (typeof fallback === 'string' && fallback) {
      next.spec_a = stripSpecsPrefix(fallback);
    }
  }

  // `spec_b` ← evidence.spec_b | top-level spec_b (with `.specs/` prefix stripped)
  if (next.spec_b == null) {
    const fallback = raw.spec_b;
    if (typeof fallback === 'string' && fallback) {
      next.spec_b = stripSpecsPrefix(fallback);
    }
  }

  // `target` ← evidence.target | evidence.expected_path | top-level expected_path
  if (next.target == null) {
    const fallback = ev.expected_path ?? raw.expected_path;
    if (typeof fallback === 'string' && fallback) {
      next.target = fallback;
    }
  }

  // `target_path` ← evidence.target_path | evidence.target | evidence.expected_path
  // (wrap-deprecated-ref reads target_path preferentially; keep both filled)
  if (next.target_path == null) {
    const fallback = ev.target ?? ev.expected_path ?? raw.expected_path ?? next.target;
    if (typeof fallback === 'string' && fallback) {
      next.target_path = fallback;
    }
  }

  // `version` ← evidence.version | top-level version (wrap-deprecated-ref only)
  if (next.version == null) {
    const fallback = raw.version;
    if (typeof fallback === 'string' && fallback) {
      next.version = fallback;
    }
  }

  // No-op short-circuit: if nothing changed, return the original reference
  // so callers can still rely on identity comparison where it matters.
  let identical = Object.keys(next).length === Object.keys(ev).length;
  if (identical) {
    for (const k of Object.keys(next)) {
      if (next[k] !== ev[k]) {
        identical = false;
        break;
      }
    }
  }
  if (identical) return entry;

  return { ...entry, evidence: next as BacklogEntry['evidence'] };
}

// Export for unit tests
export const __test__ = { stripSpecsPrefix };
