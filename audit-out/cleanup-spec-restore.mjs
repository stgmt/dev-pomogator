import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const baseline = 'e0ecebb8';
const spec = 'specs-management-as-skill';
const docs = [
  'FR.md',
  'ACCEPTANCE_CRITERIA.md',
  'DESIGN.md',
  'FILE_CHANGES.md',
  'specs-management-as-skill.feature',
];

for (const doc of docs) {
  const repoPath = `.specs/${spec}/${doc}`;
  const content = execFileSync('git', ['show', `${baseline}:${repoPath}`], {
    cwd: repo,
    encoding: 'utf8',
  });
  const instructionPath = path.join(repo, 'audit-out', `cleanup-restore-${doc.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
  fs.writeFileSync(instructionPath, JSON.stringify({
    action: 'apply',
    spec,
    doc,
    content,
    reason: 'Restore the verified pre-incident document and remove wrong-project procurement requirements while preserving unrelated spec content.',
  }, null, 2));
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/spec-door.ts', instructionPath], {
    cwd: repo,
    stdio: 'inherit',
  });
}
