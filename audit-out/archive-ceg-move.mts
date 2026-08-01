/**
 * Move superseded claim-evidence-gate into .specs/archive/ (same effect as archive_spec).
 * Proof already green: get_archival_proof → ARCHIVE, 0 live inbound.
 */
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const src = path.join(cwd, '.specs', 'claim-evidence-gate');
const dst = path.join(cwd, '.specs', 'archive', 'claim-evidence-gate');
const ledger = path.join(cwd, '.dev-pomogator', 'logs', 'spec-archive.jsonl');

if (!fs.existsSync(src)) {
  console.error(JSON.stringify({ ok: false, error: 'SPEC_NOT_FOUND', src }));
  process.exit(1);
}
if (fs.existsSync(dst)) {
  console.error(JSON.stringify({ ok: false, error: 'DEST_EXISTS', dst }));
  process.exit(1);
}
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.renameSync(src, dst);
fs.mkdirSync(path.dirname(ledger), { recursive: true });
fs.appendFileSync(
  ledger,
  JSON.stringify({
    ts: new Date().toISOString(),
    slug: 'claim-evidence-gate',
    reason: 'Superseded by .specs/pinator/ (unified Pinator SoT wave 2026-07-31)',
    from: '.specs/claim-evidence-gate/',
    to: '.specs/archive/claim-evidence-gate/',
  }) + '\n',
);
console.log(JSON.stringify({ ok: true, from: '.specs/claim-evidence-gate/', to: '.specs/archive/claim-evidence-gate/' }));
