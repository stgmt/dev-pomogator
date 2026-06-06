/**
 * @feature38 step definitions — full spec lifecycle via MCP (FR-38), bound to
 * the REAL `get_spec_status` handler over graphs built by the REAL builder,
 * with run data arriving through the REAL NDJSON ingest contract (cucumber
 * messages envelopes — the same shape `builder.test.ts` pins against the
 * real producer). No hand-injected results.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_102..106
 * @see .specs/spec-generator-v4/FR.md FR-38
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';

interface F38World extends V4World {
  statusSpec?: string;
  statusPayload?: {
    ok: boolean;
    lifecycle?: string;
    last_run?: null | { at: string | null; source: string; summary: Record<string, number> };
    counts?: Record<string, number>;
    gaps?: Record<string, number>;
    hint?: string;
  };
  skipNdjson?: boolean;
}

/**
 * Real cucumber-messages NDJSON for one scenario at `<uri>:3` with `status`
 * (line 3 = the `Scenario:` heading in the fixture feature: tag/Feature/Scenario).
 */
function ndjsonFor(uri: string, status: string): string {
  return [
    JSON.stringify({ meta: { protocolVersion: '32.2.0' } }),
    JSON.stringify({
      gherkinDocument: { uri, feature: { children: [{ scenario: { id: 'sc-1', location: { line: 3 } } }] } },
    }),
    JSON.stringify({ pickle: { id: 'pk-1', uri, name: 'one', astNodeIds: ['sc-1'] } }),
    JSON.stringify({ testCase: { id: 'tc-1', pickleId: 'pk-1' } }),
    JSON.stringify({
      testCaseStarted: { id: 'tcs-1', testCaseId: 'tc-1', timestamp: { seconds: 1_700_000_000, nanos: 0 } },
    }),
    JSON.stringify({
      testStepFinished: {
        testCaseStartedId: 'tcs-1',
        testStepResult: { status },
        timestamp: { seconds: 1_700_000_001, nanos: 0 },
      },
    }),
    JSON.stringify({
      testCaseFinished: { testCaseStartedId: 'tcs-1', timestamp: { seconds: 1_700_000_001, nanos: 0 } },
    }),
  ].join('\n');
}

function writeStatusFixture(w: F38World, opts: { scenarios: boolean; runStatus?: string }): void {
  const slug = 'status-demo';
  const dir = path.join(w.tempDir, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Status demo\n\nBody.\n');
  fs.writeFileSync(path.join(dir, 'ACCEPTANCE_CRITERIA.md'), '## AC-1 (FR-1)\n\nWHEN x THEN y SHALL z.\n');
  if (opts.scenarios) {
    fs.writeFileSync(path.join(dir, 's.feature'), '@FR-1\nFeature: S\n  Scenario: one\n    Given x\n');
  }
  if (opts.runStatus) {
    const ndjsonDir = path.join(w.tempDir, '.dev-pomogator');
    fs.mkdirSync(ndjsonDir, { recursive: true });
    fs.writeFileSync(
      path.join(ndjsonDir, '.last-test-run.ndjson'),
      ndjsonFor(`.specs/${slug}/s.feature`, opts.runStatus),
    );
    w.skipNdjson = false;
  } else {
    w.skipNdjson = true;
  }
  w.statusSpec = slug;
}

Given('a spec with FR and AC docs but zero scenarios', function (this: F38World) {
  writeStatusFixture(this, { scenarios: false });
});

Given('a spec whose scenarios carry no last result', function (this: F38World) {
  writeStatusFixture(this, { scenarios: true });
});

Given('a spec whose last run holds a failed scenario', function (this: F38World) {
  writeStatusFixture(this, { scenarios: true, runStatus: 'FAILED' });
});

Given('a spec whose last run passed every scenario', function (this: F38World) {
  writeStatusFixture(this, { scenarios: true, runStatus: 'PASSED' });
});

Given(
  'a spec whose last run has undefined scenarios and zero failures',
  function (this: F38World) {
    writeStatusFixture(this, { scenarios: true, runStatus: 'UNDEFINED' });
  },
);

When('get_spec_status runs for that spec', async function (this: F38World) {
  const graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: this.skipNdjson ?? true });
  const tools = buildToolRegistry(() => graph);
  const tool = tools.find((t) => t.name === 'get_spec_status')!;
  const r = (await tool.handler({ spec: this.statusSpec! })) as { content: Array<{ text: string }> };
  this.statusPayload = JSON.parse(r.content[0].text);
});

Then('the lifecycle is SPEC_ONLY and last_run is null', function (this: F38World) {
  assert.equal(this.statusPayload!.lifecycle, 'SPEC_ONLY');
  assert.equal(this.statusPayload!.last_run, null);
});

Then('the lifecycle is TESTS_NOT_RUN and last_run is null', function (this: F38World) {
  assert.equal(this.statusPayload!.lifecycle, 'TESTS_NOT_RUN');
  assert.equal(this.statusPayload!.last_run, null, 'a run that never happened must not be fabricated (FR-38b)');
});

Then('the lifecycle is RED', function (this: F38World) {
  assert.equal(this.statusPayload!.lifecycle, 'RED');
});

Then('the lifecycle is GREEN', function (this: F38World) {
  assert.equal(this.statusPayload!.lifecycle, 'GREEN');
});

Then('the lifecycle is PARTIAL', function (this: F38World) {
  assert.equal(this.statusPayload!.lifecycle, 'PARTIAL', 'undefined steps must never read as GREEN (AC-38.4)');
});

Then('the last_run summary counts the failure and identifies the run', function (this: F38World) {
  const lr = this.statusPayload!.last_run!;
  assert.ok(lr, 'last_run must be linked when run data exists');
  assert.equal(lr.summary.failed, 1);
  assert.ok(lr.at, 'run timestamp must identify the run');
  assert.match(lr.source, /\.last-test-run\.ndjson$/);
});

Then('the last_run summary counts the passes and identifies the run', function (this: F38World) {
  const lr = this.statusPayload!.last_run!;
  assert.equal(lr.summary.passed, 1);
  assert.equal(lr.summary.failed, 0);
  assert.ok(lr.at && lr.source, 'at + source must identify the run');
});

Then('the response carries counts gaps and an agent hint', function (this: F38World) {
  const p = this.statusPayload!;
  assert.ok(p.counts && p.counts.scenarios >= 1, 'counts must be present');
  assert.ok(p.gaps && typeof p.gaps.UNCOVERED_FR === 'number', 'FR-37b gap counts must be present');
  assert.ok(p.hint && p.hint.length > 10, 'agent hint must be present');
});
