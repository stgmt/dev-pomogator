/**
 * Feature-strength gate (FR-49 V2, "сразу жёстко") — the MCP door HARD-REFUSES a
 * `.feature` write that INTRODUCES a placeholder/skeleton scenario. It mechanically
 * enforces rule #4 of `feature-creation-rules.md §6` ("no `[TBD]`/placeholder on ship"):
 * a skeleton scenario must never reach the spec graph dressed up as real coverage.
 *
 * Two design constraints, both from the over-fire lesson (the advisor's H1 warning +
 * `.claude/rules/scope-gate`, `dead-integration-guard`):
 *
 * 1. NET-NEW, doc-scoped. Only placeholders the CURRENT write ADDS are refused. A doc
 *    that already carries a legacy placeholder can still be edited — pre-existing
 *    violators never clog unrelated writes (`.specs/spec-generator-v4` FR-48b AC).
 *    Scoping lives in `featureStrengthFindings(current, next)`: it compares counts in
 *    the doc being written, NOT the whole graph (the door's conformance layer is
 *    whole-graph and WOULD brick every spec with a legacy skeleton).
 *
 * 2. PRECISE signal only — never a fuzzy one. A hard door-gate on "no negative
 *    scenario" / "needs an invariant" would re-create the exact false-refusal pain the
 *    pinator just shed. Those JUDGMENT criteria stay AUTHORING rules (§6) + the
 *    `strong-tests` audit. Here we flag ONLY what is unambiguous:
 *      - a step whose ENTIRE text is a `<…>` token CONTAINING WHITESPACE (a prose stub
 *        like `<precondition or initial state>`). Whitespace inside `<>` is impossible
 *        for a Gherkin Scenario-Outline parameter (params are single identifiers), so
 *        Outlines (`<amount>`) are NEVER flagged.
 *      - the literal `[TBD]` marker the `scenario-writer` resolver stamps.
 *
 * @see .claude/skills/create-spec/references/feature-creation-rules.md §6
 * @see tools/spec-backlog/resolvers/scenario-writer.ts (the skeleton producer this gates)
 */

import { parseGherkin } from './parsers/gherkin.ts';

/** Literal `[TBD]` marker (the scenario-writer skeleton stamp). Case-insensitive, global (count). */
const TBD_RE = /\[TBD\]/gi;

/**
 * A step whose ENTIRE text (optional surrounding backticks, trimmed) is a `<…>` token
 * that CONTAINS WHITESPACE — i.e. a prose placeholder. The whitespace requirement is the
 * precision guard: a Scenario-Outline parameter is a single identifier (`<amount>`), so
 * it can never match; only a stub like `<action or event>` does.
 */
const PROSE_PLACEHOLDER_STEP = /^`?<[^>]*\s[^>]*>`?$/;

export interface PlaceholderScenario {
  /** the scenario node id (SCEN-<slug>) — readable enough for the deny message */
  id: string;
  line: number;
}

/**
 * Scenarios in `featureText` that are still unfilled skeletons (a step that is wholly a
 * prose `<…>` placeholder). `[TBD]` markers are comment-level (stripped by the Gherkin
 * AST) and counted separately in {@link featureStrengthFindings}.
 */
export function placeholderScenarios(featureText: string): PlaceholderScenario[] {
  const out: PlaceholderScenario[] = [];
  const { nodes } = parseGherkin(featureText, 'strength-probe.feature');
  for (const n of nodes) {
    if (n.type !== 'Scenario') continue;
    const stub = (n.steps ?? []).some((s) => PROSE_PLACEHOLDER_STEP.test(s.text.trim()));
    if (stub) out.push({ id: n.id, line: n.line });
  }
  return out;
}

export interface StrengthFinding {
  line: number;
  message: string;
}

/** Line of the first `[TBD]` in `text` (1-based), or 1 if none. */
function firstTbdLine(text: string): number {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (/\[TBD\]/i.test(lines[i])) return i + 1;
  return 1;
}

/**
 * Error findings for placeholders the write ADDS (net-new), comparing the doc's current
 * on-disk content (`current`, null for a brand-new doc) against the proposed `next`.
 * Empty array = the write introduces no new skeleton → the door lets it through.
 *
 * Net-new is by COUNT (per doc): more placeholder-step scenarios than before, or more
 * `[TBD]` markers than before. Keeping a legacy skeleton (same count) passes; filling one
 * in (lower count) passes; adding one (higher count) is refused.
 */
export function featureStrengthFindings(current: string | null, next: string): StrengthFinding[] {
  const cur = current ?? '';
  const curPh = placeholderScenarios(cur);
  const nextPh = placeholderScenarios(next);
  const findings: StrengthFinding[] = [];

  if (nextPh.length > curPh.length) {
    for (const p of nextPh) {
      findings.push({
        line: p.line,
        message:
          `STRONG_TEST_PLACEHOLDER: сценарий ${p.id} (строка ${p.line}) содержит незаполненные шаги-заготовки ` +
          `(\`<...>\`) — впиши реальные Given/When/Then перед записью. ` +
          `Дверь не принимает сценарии-пустышки (см. feature-creation-rules.md §6).`,
      });
    }
  }

  const curTbd = (cur.match(TBD_RE) ?? []).length;
  const nextTbd = (next.match(TBD_RE) ?? []).length;
  if (nextTbd > curTbd) {
    findings.push({
      line: firstTbdLine(next),
      message:
        `STRONG_TEST_TBD: добавлен \`[TBD]\`-маркер незавершённого сценария ` +
        `(строка ${firstTbdLine(next)}) — заполни сценарий реальными шагами до записи ` +
        `(дверь, hard-gate; feature-creation-rules.md §6).`,
    });
  }

  return findings;
}
