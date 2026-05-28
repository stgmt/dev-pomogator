/**
 * AC evidence-claim detection (honest-status-command FR-4, deterministic slice).
 *
 * The full ✓verified / ⏸blocked / ❌claimed-only classification is the sub-agent's
 * job (it reads files and judges whether a test *actually* verifies an AC). This
 * module is the deterministic pre-pass the sub-agent (and the tests) build on:
 *   - parse AC IDs + their FR link from ACCEPTANCE_CRITERIA.md
 *   - parse which FRs are marked done ([x]) in TASKS.md
 *   - flag AC as a `claimed_only` CANDIDATE when its FR is marked done but no test
 *     file in scope references that AC/FR id (no evidence link).
 * "claimed_only candidate" is the anti-overclaim signal; the sub-agent confirms.
 */

export interface AcClaim {
  id: string;
  fr: string | null;
  claimedDone: boolean;
  hasEvidenceRef: boolean;
  candidate: 'claimed_only' | 'needs-verify';
}

/** Parse `## AC-N (FR-M): ...` headers. */
export function parseAcIds(acContent: string): { id: string; fr: string | null }[] {
  const out: { id: string; fr: string | null }[] = [];
  const re = /^##+\s*(AC-\d+)\s*(?:\((FR-\d+)\))?/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(acContent)) !== null) out.push({ id: m[1], fr: m[2] ?? null });
  return out;
}

/** FRs referenced by a checked `- [x] ... FR-N` task line. */
export function parseDoneFrs(tasksContent: string): Set<string> {
  const done = new Set<string>();
  for (const line of tasksContent.split('\n')) {
    if (!/^\s*-\s*\[[xX]\]/.test(line)) continue;
    for (const fr of line.match(/FR-\d+/g) ?? []) done.add(fr);
  }
  return done;
}

/**
 * Classify each AC's claim status from spec docs + the test files in scope.
 * @param testContents  raw contents of every test file in the spec's scope
 */
export function classifyAcClaims(
  acContent: string,
  tasksContent: string,
  testContents: string[],
): AcClaim[] {
  const doneFrs = parseDoneFrs(tasksContent);
  const allTests = testContents.join('\n');
  return parseAcIds(acContent).map(({ id, fr }) => {
    const claimedDone = fr != null && doneFrs.has(fr);
    const hasEvidenceRef = allTests.includes(id) || (fr != null && allTests.includes(fr));
    return {
      id,
      fr,
      claimedDone,
      hasEvidenceRef,
      candidate: claimedDone && !hasEvidenceRef ? 'claimed_only' : 'needs-verify',
    };
  });
}
