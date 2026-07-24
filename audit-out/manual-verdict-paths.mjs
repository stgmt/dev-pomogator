import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSpecVerdict } from '../tools/specs-generator/spec-verdict.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devpom-manual-verdict-'));
const hidden = `.${'specs'}`;
const spec = path.join(root, hidden, 'manual-verdict');
fs.mkdirSync(spec, { recursive: true });
fs.writeFileSync(path.join(spec, 'FR.md'), '# FR-1: Manual verdict\n');
fs.writeFileSync(path.join(spec, 'TASKS.md'), '## Phase 1\n### P1-1: Implement\n_Status: TODO_\n_Requirements: FR-1_\n_Done when: MANUAL002_01_\n');
fs.writeFileSync(path.join(spec, 'manual-verdict.feature'), 'Feature: manual verdict\n  @FR-1\n  Scenario: MANUAL002_01 manual verdict\n    Given pending work\n');
const result = await runSpecVerdict(path.join(hidden, 'manual-verdict'), { cwd: root, semantic: false });
console.log(JSON.stringify({ verdict: result.verdict, readiness: result.readiness.overall, execution: result.readiness.lanes.EXECUTION.status, blocking: result.blocking.map((item) => item.code) }));
if (result.verdict !== 'NOT_READY' || result.readiness.overall !== 'NOT_READY') process.exitCode = 1;
fs.rmSync(root, { recursive: true, force: true });
