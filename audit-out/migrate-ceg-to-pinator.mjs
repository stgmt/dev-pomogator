/**
 * Migrate claim-evidence-gate docs into pinator via spec-door apply (full content).
 * Instruction JSON files live under audit-out/ (no .specs/ in argv path for guard).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const src = path.join(root, '.specs', 'claim-evidence-gate');
const outDir = path.join(root, 'audit-out', 'pinator-migrate-instr');
fs.mkdirSync(outDir, { recursive: true });

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
**Not Pinator:** \`prompt-suggest\` / former npm script \`build:pinator\` (renamed to \`build:prompt-suggest\`).

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

- Supersedes archived \`.specs/archive/…/claim-evidence-gate\` (after archival).
- Census/router infra: [spec-generator-v4 FR-49](../spec-generator-v4/FR.md) (generic only; Pinator policy lives here).
- Inbound-ref inventory: \`audit-out/pinator-inbound-refs.json\`.
`;

function adaptBody(doc, body) {
  let out = body;
  // Retarget sibling links from claim-evidence-gate README style
  out = out.replace(/claim-evidence-gate\.feature/g, 'pinator.feature');
  if (doc === 'RESEARCH.md') {
    const inventory = fs.readFileSync(
      path.join(root, 'audit-out', 'pinator-inbound-refs.json'),
      'utf8',
    );
    out =
      out +
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
  if (doc === 'pinator.feature' || doc.endsWith('.feature')) {
    out = out.replace(/@claim-evidence-gate @pinator/, '@pinator @claim-evidence-gate');
    out = out.replace(
      /Feature: Pinator judges only active current-session work/,
      'Feature: Pinator judges only active current-session work',
    );
  }
  return out;
}

const results = [];

for (const { from, to } of DOC_MAP) {
  const abs = path.join(src, from);
  if (!fs.existsSync(abs)) {
    results.push({ doc: to, ok: false, err: 'missing source' });
    continue;
  }
  const content = adaptBody(to, fs.readFileSync(abs, 'utf8'));
  const instrPath = path.join(outDir, `apply-${to.replace(/\./g, '_')}.json`);
  fs.writeFileSync(
    instrPath,
    JSON.stringify(
      {
        action: 'apply',
        spec: 'pinator',
        doc: to,
        content,
        reason: 'migrate claim-evidence-gate contract into canonical pinator M1-M4',
      },
      null,
      2,
    ),
    'utf8',
  );
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/spec-door.ts', instrPath],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const stdout = (r.stdout || '') + (r.stderr || '');
  let ok = r.status === 0;
  let err;
  try {
    const j = JSON.parse(r.stdout || '{}');
    ok = j.ok !== false && r.status === 0;
    if (!ok) err = JSON.stringify(j).slice(0, 500);
  } catch {
    ok = false;
    err = stdout.slice(0, 500);
  }
  results.push({ doc: to, ok, err });
  console.log(ok ? 'OK' : 'FAIL', to, err || '');
}

// README via door
{
  const instrPath = path.join(outDir, 'apply-README_md.json');
  fs.writeFileSync(
    instrPath,
    JSON.stringify(
      {
        action: 'apply',
        spec: 'pinator',
        doc: 'README.md',
        content: MODULE_README,
        reason: 'canonical pinator README with module map + naming freeze',
      },
      null,
      2,
    ),
    'utf8',
  );
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/spec-door.ts', instrPath], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log('README', r.status === 0 ? 'OK' : 'FAIL', (r.stdout || '').slice(0, 200));
}

fs.writeFileSync(
  path.join(root, 'audit-out', 'pinator-migrate-results.json'),
  JSON.stringify(results, null, 2),
);
console.log('done', results.filter((x) => x.ok).length, '/', results.length);
