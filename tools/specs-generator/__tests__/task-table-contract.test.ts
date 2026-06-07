/**
 * FR-21 / T-Trans.3 — `spec-status -Format task-table` is a STABLE PUBLIC CONTRACT.
 *
 * The table shape (columns, id derivation, status mapping, em-dash title cut,
 * deps/est extraction) is consumed by the task-board-forms skill, v3 workflow
 * tooling and third-party scripts. This test byte-compares the real CLI output
 * on a frozen input spec against a committed baseline — any shape change fails
 * loudly and forces a deliberate baseline regen + changelog entry.
 *
 * Degraded-mode proof (FR-21 / NFR-Reliability-7): no MCP server is started
 * anywhere in this suite — the CLI MUST produce the contract shape standalone
 * (direct MD parse). If a future minor version swaps the source to MCP-routed
 * get_trace, this same test keeps passing only if the fallback stays intact.
 *
 * Regen (deliberate changes only):
 *   TMP=$(mktemp -d) && mkdir -p "$TMP/.specs/task-table-fixture" \
 *     && cp tools/specs-generator/__fixtures__/task-table-input/TASKS.md "$TMP/.specs/task-table-fixture/" \
 *     && SPECS_GENERATOR_ROOT="$TMP" node tools/specs-generator/specs-generator-core.mjs \
 *        spec-status -Path .specs/task-table-fixture -Format task-table \
 *        > tools/specs-generator/__fixtures__/task-table.baseline.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOL_DIR = path.resolve(__dirname, '..');
const CORE = path.join(TOOL_DIR, 'specs-generator-core.mjs');
const FIXTURE_INPUT = path.join(TOOL_DIR, '__fixtures__', 'task-table-input', 'TASKS.md');
const BASELINE = path.join(TOOL_DIR, '__fixtures__', 'task-table.baseline.md');

let corpusRoot: string;

/** Run the REAL CLI (the exact `node core spec-status …` line the spec-status.ts
 *  wrapper execs) against the frozen fixture corpus. No mocks, no MCP server. */
function runTaskTable(): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync(
    process.execPath,
    [CORE, 'spec-status', '-Path', '.specs/task-table-fixture', '-Format', 'task-table'],
    {
      encoding: 'utf-8',
      env: { ...process.env, SPECS_GENERATOR_ROOT: corpusRoot },
      timeout: 60_000,
    },
  );
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

beforeAll(() => {
  corpusRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'task-table-contract-'));
  const specDir = path.join(corpusRoot, '.specs', 'task-table-fixture');
  fs.mkdirSync(specDir, { recursive: true });
  fs.copyFileSync(FIXTURE_INPUT, path.join(specDir, 'TASKS.md'));
});

afterAll(() => {
  fs.rmSync(corpusRoot, { recursive: true, force: true });
});

describe('SPECGEN004 FR-21: task-table CLI contract (T-Trans.3)', () => {
  it('byte-matches the committed baseline on the frozen input spec', () => {
    const baseline = fs.readFileSync(BASELINE, 'utf-8').replace(/\r\n/g, '\n').trimEnd();
    const run = runTaskTable();
    expect(run.status, `stderr: ${run.stderr}`).toBe(0);
    expect(run.stdout.replace(/\r\n/g, '\n').trimEnd()).toBe(baseline);
  });

  it('covers every contract branch in the baseline itself (fixture self-check)', () => {
    // Guards against the fixture being quietly gutted: the baseline must keep
    // exercising id derivation (Phase -1 + heading id), all 4 statuses,
    // deps extraction and the em-dash title cut.
    const baseline = fs.readFileSync(BASELINE, 'utf-8');
    expect(baseline).toContain('| ID | Title | Status | Depends | Phase | Est. |');
    expect(baseline).toContain('| T-1-01 |'); // Phase -1 id derivation
    expect(baseline).toContain('| heading-format-task |'); // ### 📋 `id` form
    for (const status of ['DONE', 'TODO', 'IN_PROGRESS', 'BLOCKED']) {
      expect(baseline, `status ${status} must stay exercised`).toContain(`| ${status} |`);
    }
    expect(baseline).toContain('| red-scenarios, seed-env |'); // multi-dep extraction
    expect(baseline).toContain('| Write failing scenarios |'); // em-dash title cut
  });

  it('is idempotent and needs no MCP server (degraded mode, NFR-Reliability-7)', () => {
    // No MCP server was started in this suite; two consecutive runs must
    // produce identical bytes — the direct-MD-parse path is deterministic.
    const first = runTaskTable();
    const second = runTaskTable();
    expect(first.status).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(first.stderr).toBe('');
  });

  it('fails loudly (exit 1 + ERROR on stderr) when TASKS.md is absent', () => {
    const emptyDir = path.join(corpusRoot, '.specs', 'no-tasks-spec');
    fs.mkdirSync(emptyDir, { recursive: true });
    const r = spawnSync(
      process.execPath,
      [CORE, 'spec-status', '-Path', '.specs/no-tasks-spec', '-Format', 'task-table'],
      { encoding: 'utf-8', env: { ...process.env, SPECS_GENERATOR_ROOT: corpusRoot }, timeout: 60_000 },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('TASKS.md not found');
  });
});
