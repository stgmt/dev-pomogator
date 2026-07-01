// Static artifact guards for the test-quality Stop-gate bundle (FR-35b).
//
// The spawn / pure-fn runtime cases (ENFORCE / DEFAULT / SHADOW / stop_hook_active /
// escape / parseModifiedSpecSlugs) are now BDD scenarios SPECGEN004_305-311 in
// .specs/spec-generator-v4/spec-generator-v4.feature, driven by
// tests/step_definitions/feature35_gate_spawn.ts.
//
// These three tests remain here because they guard STATIC FILE ARTIFACTS that have
// no production function to drive in-process: bundle exists on disk, bundle contains
// the required logic markers, and hooks.json references the bundle (not the raw .ts).
// Retiring them to BDD would require a step-def that just reads a file path — that
// is an "artifact" class test, not a runtime test, and belongs here per the conveyor rules.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');

// The gate ships to plugin users as a self-contained esbuild bundle (the raw .ts crashes
// on @cucumber/gherkin with no node_modules). These guard the shipped artifact.
describe('test-quality gate distribution bundle', () => {
  const bundle = path.join(here, '..', 'test_quality_gate_stop.bundle.mjs');
  const hooksJson = path.join(repoRoot, '.claude-plugin', 'hooks.json');

  it('committed bundle exists and is non-trivial (gherkin+builder inlined)', () => {
    expect(fs.existsSync(bundle), 'run `npm run build:gate` and commit the bundle').toBe(true);
    expect(fs.statSync(bundle).size).toBeGreaterThan(100_000);
  });

  it('bundle carries the gate logic (stale-bundle guard — re-run build:gate after edits)', () => {
    const t = fs.readFileSync(bundle, 'utf8');
    for (const marker of ['TASK_UNTESTED', 'TASK_TEST_QUALITY', 'skip-test-quality', 'test-quality-escapes']) {
      expect(t, `bundle missing '${marker}' — run \`npm run build:gate\``).toContain(marker);
    }
  });

  it('hooks.json launches the bundle, not the raw .ts (which needs gherkin/node_modules)', () => {
    const h = fs.readFileSync(hooksJson, 'utf8');
    expect(h).toContain('test_quality_gate_stop.bundle.mjs');
    expect(h).not.toContain('test_quality_gate_stop.ts');
    expect(h).toContain('CLAUDE_PLUGIN_ROOT');
  });
});
