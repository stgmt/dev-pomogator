/**
 * All-or-nothing migrate of claim-evidence-gate → pinator via apply_spec_transaction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';

const root = process.cwd();
const src = path.join(root, '.specs', 'claim-evidence-gate');

const DOC_MAP = [
  { from: 'FR.md', to: 'FR.md' },
  { from: 'NFR.md', to: 'NFR.md' },
  { from: 'ACCEPTANCE_CRITERIA.md', to: 'ACCEPTANCE_CRITERIA.md' },
  { from: 'DESIGN.md', to: 'DESIGN.md' },
  { from: 'REQUIREMENTS.md', to: 'REQUIREMENTS.md' },
  { from: 'FILE_CHANGES.md', to: 'FILE_CHANGES.md' },
  { from: 'CHANGELOG.md', to: 'CHANGELOG.md' },
  { from: 'USER_STORIES.md', to: 'USER_STORIES.md' },
  { from: 'USE_CASES.md', to: 'USE_CASES.md' },
  { from: 'RESEARCH.md', to: 'RESEARCH.md' },
  { from: 'TASKS.md', to: 'TASKS.md' },
  { from: 'claim-evidence-gate.feature', to: 'pinator.feature' },
];

const MODULE_README = `# Pinator (canonical)

Stop-time drive-loop: while the session has authoritative unfinished work, the agent must not lazy-stop. Pinator evaluates Stop (eligibility + judge + evidence) and contracts next-step / async carve-outs.

**Canonical name:** Pinator = this spec.
**Runtime path (this wave):** \`tools/claim-evidence-gate/\` (not renamed yet).
**Not Pinator:** \`prompt-suggest\` / former npm script \`build:pinator\` (use \`build:prompt-suggest\`).

## Module map

| Module | Content | Status |
|--------|---------|--------|
| M0 Intent | goal once / drive until genuine decision (#63) | open backlog |
| M1 Eligibility | task/plan/spec/\`/goal\` | migrated from claim-evidence-gate |
| M2 Judge+evidence | classifier, Meridian, carry-over, normative (#149/#161/#193) | migrated + issue links |
| M3 Next-step contract | packet \`next*\`; census owned by spec-generator-v4 FR-49 | migrated boundary |
| M4 Async | bg in-flight via [bg-task-guard](../bg-task-guard/README.md) | dependency link |
| M5 User suggest | optional [prompt-suggest](../prompt-suggest/README.md) | link only |
| M6 Polarity flip | #74 referent carve-out | open backlog |
| M7 Orchestration | #212/#215 Dynamic Workflow | open / OUT_OF_SCOPE impl this wave |

## Where code lives

\`tools/claim-evidence-gate/\` (\`claim_evidence_gate_stop.ts\`, \`meridian-judge.ts\`, …); bundle \`claim_evidence_gate_stop.bundle.mjs\`. Hooks: Claude Stop route. Executable BDD: \`tests/features/plugins/claim-evidence-gate/CEGATE001_*.feature\` (unchanged this wave).

## Related

- Supersedes \`claim-evidence-gate\` after archival.
- Census/router infra: [spec-generator-v4 FR-49](../spec-generator-v4/FR.md) (generic only; Pinator policy lives here).
- Inbound-ref inventory: \`audit-out/pinator-inbound-refs.json\`.
`;

function adaptBody(doc, body) {
  let out = body;
  out = out.replace(/claim-evidence-gate\.feature/g, 'pinator.feature');
  if (doc === 'RESEARCH.md') {
    const inventory = fs.readFileSync(
      path.join(root, 'audit-out', 'pinator-inbound-refs.json'),
      'utf8',
    );
    out +=
      `\n\n## Naming freeze + inbound inventory (2026-07-31)\n\n` +
      `Canonical: Pinator = this Stop-judge drive-loop. Runtime stays \`tools/claim-evidence-gate/\` until a follow-up rename wave.\n\n` +
      `Inbound refs snapshot (pre-migrate):\n\n\`\`\`json\n` +
      inventory +
      `\n\`\`\`\n`;
  }
  if (doc === 'FR.md') {
    out =
      `# Pinator — Functional Requirements\n\n` +
      `> Migrated from claim-evidence-gate. Modules: **M1–M4** = FR-1..FR-12 below. ` +
      `M0/M6/M7 are open backlog (see README), not COMPLETE.\n\n` +
      out.replace(/^# Claim-Evidence Gate[^\n]*/m, '').trimStart();
  }
  if (doc === 'pinator.feature') {
    out = out.replace(/@claim-evidence-gate @pinator/, '@pinator @claim-evidence-gate');
  }
  return out;
}

const edits = DOC_MAP.map(({ from, to }) => {
  const content = adaptBody(to, fs.readFileSync(path.join(src, from), 'utf8'));
  return { spec: 'pinator', doc: to, content };
});
edits.push({ spec: 'pinator', doc: 'README.md', content: MODULE_README });

let cached;
const getGraph = () => (cached ??= buildGraph({ repoRoot: root, skipNdjson: true }));
const tools = buildToolRegistry(getGraph, {
  refreshGraph: () => {
    cached = undefined;
  },
});
const tool = tools.find((t) => t.name === 'apply_spec_transaction');
if (!tool) throw new Error('apply_spec_transaction missing');

const res = await tool.handler({
  edits,
  reason: 'migrate claim-evidence-gate into canonical pinator (all-or-nothing)',
});
const envelope = JSON.parse(res.content[0].text);
fs.writeFileSync(
  path.join(root, 'audit-out', 'pinator-txn-result.json'),
  JSON.stringify(envelope, null, 2),
);
console.log(JSON.stringify({ ok: envelope.ok, error: envelope.error, findings: (envelope.findings || []).slice(0, 15) }, null, 2));
if (!envelope.ok) {
  const more = (envelope.findings || []).slice(0, 40);
  for (const f of more) console.log(JSON.stringify(f));
  process.exit(1);
}
