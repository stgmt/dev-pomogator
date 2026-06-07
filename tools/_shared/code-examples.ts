/**
 * Shared «code is an EXAMPLE, not a claim» strippers.
 *
 * One disease, several carriers (2026-06-06 producer-bug incident: 9 auto-[TBD]
 * skeleton FRs drafted from example strings like `` `### FR-001: Login` ``
 * quoted inside AC text): any harvester that mines requirement ids / paths /
 * identifiers out of spec PROSE must ignore fenced blocks AND inline code
 * spans. Before this module the strip logic lived as three independent copies
 * (fr-author line-loop, cross-spec-reconcile wholesale, tasks-parser noCode) —
 * /simplify 2026-06-07 consolidated the TS carriers here.
 * (`specs-generator-core.mjs` keeps its own copy — .mjs cannot import .ts.)
 *
 * @see .claude/skills/spec-generator-dev/SKILL.md — producer-fix registry
 */

/** Strip fenced code blocks (```...```) — they hold examples, not decisions. */
export function stripFencedBlocks(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '');
}

/** Fenced blocks AND inline code spans removed wholesale (line numbers NOT preserved). */
export function stripCodeExamples(body: string): string {
  return stripFencedBlocks(body).replace(/`[^`\n]*`/g, '');
}

/**
 * Line-preserving variant: iterate prose lines with fence tracking; the
 * callback receives the line WITH inline code spans stripped (`noCode`) plus
 * the original text and 0-based index — for harvesters that must report
 * `file:line` (fr-author citations, task refs).
 */
export function forEachProseLine(
  body: string,
  cb: (noCode: string, original: string, idx: number) => void,
): void {
  let inFence = false;
  body.split('\n').forEach((lineText, idx) => {
    if (/^\s*```/.test(lineText)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    cb(lineText.replace(/`[^`\n]*`/g, ''), lineText, idx);
  });
}
