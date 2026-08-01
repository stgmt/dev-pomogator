/**
 * Fix pinator audit blockers: AC FR back-links + FILE_CHANGES real paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';

const root = process.cwd();
const pin = path.join(root, '.specs', 'pinator');

let ac = fs.readFileSync(path.join(pin, 'ACCEPTANCE_CRITERIA.md'), 'utf8');
ac = ac.replace(
  /^# Claim-Evidence Gate — Acceptance Criteria \(EARS\)/m,
  '# Pinator — Acceptance Criteria (EARS)',
);
// Keep `## AC-N (FR-N):` header shape (LINK_VALIDITY matcher) + add clickable FR back-link.
ac = ac.replace(/^## (AC-(\d+) \(FR-(\d+)\):[^\n]*)\n(?!\*\*(?:FR|Требование):)/gm, (_m, full, _acN, frN) => {
  return `## ${full}\n**FR:** [FR-${frN}](FR.md#fr-${frN})\n`;
});

let fc = fs.readFileSync(path.join(pin, 'FILE_CHANGES.md'), 'utf8');
fc = fc.replace(
  '`tests/features/plugins/claim-evidence-gate/CEGATE001_pinator.feature` | edit | AC-1..AC-12 | Execute eligibility, lifecycle, merge, evidence, state, and distribution behavior through the real hook. |',
  '`tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature` | edit | AC-1..AC-12 | Executable BDD (unchanged path this wave); contract mirror is `pinator.feature`. |',
);
fc = fc.replace(
  '`.specs/spec-generator-v4/{FR.md,ACCEPTANCE_CRITERIA.md,DESIGN.md,USER_STORIES.md,TASKS.md,spec-generator-v4.feature}` | edit | FR-2, FR-5, FR-11 | Reconcile FR-49 ownership: generic spec census/router/replay stays; Pinator policy moves here. |',
  '`.specs/spec-generator-v4/FR.md` | edit | FR-2, FR-5, FR-11 | Reconcile FR-49 ownership: generic census/router stays; Pinator policy → pinator. |\n| `.specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md` | edit | FR-2, FR-5, FR-11 | AC-49.4 points at pinator boundary. |\n| `.specs/spec-generator-v4/DESIGN.md` | edit | FR-2, FR-5, FR-11 | Decision: FR-49 owns router, not Pinator policy. |\n| `.specs/spec-generator-v4/USER_STORIES.md` | edit | FR-2, FR-5, FR-11 | US-26 eligibility owned by pinator. |\n| `.specs/spec-generator-v4/spec-generator-v4.feature` | edit | FR-2, FR-5, FR-11 | Mark moved Pinator scenarios `@historical`. |',
);

let cached: ReturnType<typeof buildGraph> | undefined;
const tools = buildToolRegistry(
  () => (cached ??= buildGraph({ repoRoot: root, skipNdjson: true })),
  { refreshGraph: () => { cached = undefined; } },
);
const txn = tools.find((t) => t.name === 'apply_spec_transaction')!;
const result = await txn.handler({
  edits: [
    { spec: 'pinator', doc: 'ACCEPTANCE_CRITERIA.md', content: ac },
    { spec: 'pinator', doc: 'FILE_CHANGES.md', content: fc },
  ],
  reason: 'pinator wave: fix LINK_VALIDITY + FILE_CHANGES_VERIFY audit blockers',
});
console.log(result.content[0].text.slice(0, 2500));
