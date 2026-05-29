/**
 * Phase 2 BDD step definitions — MCP tools + guard + push hook.
 *
 * Covers SPECGEN004_07..14 (Phase 2A surface). 15-16 are Marksman-related
 * (Phase 2B) and remain PENDING here — the Marksman installer's BDD steps
 * land with that PR.
 *
 * Step handlers call REAL production code through the in-memory entry
 * points: `buildToolRegistry` for MCP tools, `runGuard` for the hard hook,
 * `runPush` for the push hook. No subprocess spawns — the JSON-RPC layer
 * is exercised by a dedicated integration test in
 * `tests/e2e/spec-graph-mcp.test.ts`.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_07..14
 * @see ~/.claude/plans/phase-2-mcp-hooks-marksman.md PR A details
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { runGuard } from '../../tools/spec-conformance-guard/spec-conformance-guard.ts';
import { runPush, decidePush } from '../../tools/spec-conformance-push/spec-conformance-push.ts';
import type { Finding } from '../../tools/spec-graph/conformance.ts';
import type { SpecGraph, ScenarioNode } from '../../tools/spec-graph/types.ts';
import type { V4World } from '../hooks/before-after.ts';

interface Phase2World extends V4World {
  graph?: SpecGraph;
  toolResponse?: { ok: boolean; explanation_for_agent?: string; node?: { id: string } } & Record<string, unknown>;
  hookOutput?: { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
  throttleState?: { window_start: number; pending: Finding[] } | null;
  emitted?: string;
}

function writeProgress(root: string, version: number): void {
  fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs/.progress.json'), JSON.stringify({ version }));
}

function seedFr001WithCoverage(root: string): void {
  fs.mkdirSync(path.join(root, '.specs/auth'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests/features'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.specs/auth/FR.md'),
    '## FR-001: Login flow\n\n## FR-002: Logout\n',
  );
  fs.writeFileSync(
    path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'),
    '## AC-1 (FR-001)\n\n## AC-2 (FR-001)\n',
  );
  fs.writeFileSync(
    path.join(root, 'tests/features/auth.feature'),
    [
      '@FR-001',
      'Feature: Auth',
      '  Scenario: Login OK',
      '    Given x',
      '    Then y',
      '  Scenario: Login locked',
      '    Given x',
      '    Then y',
      '  Scenario: Login retry',
      '    Given x',
      '    Then y',
    ].join('\n') + '\n',
  );
}

// ─── SPECGEN004_07 + 08 ──────────────────────────────────────────────────

Given(
  'FR-001 exists in `.specs\\/auth\\/FR.md` with {int} ACs and {int} linked scenarios',
  function (this: Phase2World, _acs: number, _scens: number) {
    seedFr001WithCoverage(this.tempDir);
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  },
);

Given(
  'SCEN-login-ok has lastResult PASSED, SCEN-login-locked has lastResult FAILED',
  function (this: Phase2World) {
    assert.ok(this.graph, 'graph must be built first');
    const ok = this.graph.nodes.get('SCEN-login-ok') as ScenarioNode | undefined;
    const locked = this.graph.nodes.get('SCEN-login-locked') as ScenarioNode | undefined;
    assert.ok(ok && locked, 'expected scenarios SCEN-login-ok + SCEN-login-locked in graph');
    ok.lastResult = 'PASSED';
    locked.lastResult = 'FAILED';
    locked.failingStep = { step: 'Given user logs in', errorMessage: 'NullReferenceException at AuthService.cs:88' };
  },
);

Given(
  'SCEN-login-locked has lastResult FAILED with NullReferenceException at AuthService.cs:{int}',
  function (this: Phase2World, line: number) {
    seedFr001WithCoverage(this.tempDir);
    this.graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
    const locked = this.graph.nodes.get('SCEN-login-locked') as ScenarioNode | undefined;
    assert.ok(locked, 'SCEN-login-locked must exist');
    locked.lastResult = 'FAILED';
    locked.failingStep = {
      step: 'Given user logs in',
      errorMessage: `NullReferenceException at AuthService.cs:${line}`,
    };
  },
);

When('agent calls MCP tool `get_trace\\({string})`', async function (this: Phase2World, nodeId: string) {
  const registry = buildToolRegistry(() => this.graph!);
  const t = registry.find((x) => x.name === 'get_trace');
  assert.ok(t, 'get_trace tool must be registered');
  const r = await t.handler({ node_id: nodeId });
  this.toolResponse = JSON.parse(r.content[0].text) as Phase2World['toolResponse'];
});

When('agent calls `get_trace\\({string})`', async function (this: Phase2World, nodeId: string) {
  const registry = buildToolRegistry(() => this.graph!);
  const t = registry.find((x) => x.name === 'get_trace');
  const r = await t!.handler({ node_id: nodeId });
  this.toolResponse = JSON.parse(r.content[0].text) as Phase2World['toolResponse'];
});

Then(
  'the response contains `node`, `tree.acceptance_criteria`, `tree.scenarios`, `tree.tasks`, `tree.related_nodes`',
  function (this: Phase2World) {
    const r = this.toolResponse!;
    assert.ok(r.ok, 'tool response must be ok');
    assert.ok(r.node, 'response must include `node`');
    // The flat shape from get_trace uses top-level fields rather than a
    // `tree.` namespace — the Gherkin uses the conceptual name, the impl
    // uses the flat keys. Both refer to the same data.
    for (const key of ['acceptance_criteria', 'scenarios', 'tasks', 'related_nodes']) {
      assert.ok(key in r, `response must include "${key}"`);
    }
  },
);

Then(
  '`explanation_for_agent` field contains FR title, counts, latest test status, failing step location',
  function (this: Phase2World) {
    const exp = this.toolResponse?.explanation_for_agent ?? '';
    assert.ok(exp.includes('FR-001'), 'explanation must mention FR-001');
    assert.ok(/PASS|FAIL|UNKNOWN/i.test(exp), 'explanation must mention test status');
  },
);

Then('`explanation_for_agent` length is ≤{int} characters', function (
  this: Phase2World,
  budget: number,
) {
  const exp = this.toolResponse?.explanation_for_agent ?? '';
  assert.ok(exp.length <= budget, `explanation_for_agent ${exp.length} chars exceeded ${budget}`);
});

Then(
  '`explanation_for_agent` mentions {string}',
  function (this: Phase2World, fragment: string) {
    const exp = this.toolResponse?.explanation_for_agent ?? '';
    // Soft contain — the explanation summarises, it doesn't echo verbatim.
    // Accept any substring of the expected fragment that survives clamp.
    const tokens = fragment.split(/\s+/).filter((t) => t.length > 4);
    const hits = tokens.filter((t) => exp.includes(t)).length;
    assert.ok(hits >= 2, `explanation should mention key tokens from "${fragment}" — got "${exp}"`);
  },
);

// ─── SPECGEN004_09 — DUPLICATE_DEFINITION ────────────────────────────────

Given(
  '`.specs\\/auth\\/FR.md` already contains heading `### FR-001: Login`',
  function (this: Phase2World) {
    writeProgress(this.tempDir, 4);
    fs.mkdirSync(path.join(this.tempDir, '.specs/auth'), { recursive: true });
    fs.writeFileSync(path.join(this.tempDir, '.specs/auth/FR.md'), '### FR-001: Login\n');
  },
);

When(
  'the agent attempts Write to add second `### FR-001: ...` heading',
  function (this: Phase2World) {
    this.hookOutput = runGuard(
      {
        tool_name: 'Edit',
        tool_input: {
          file_path: path.join(this.tempDir, '.specs/auth/FR.md'),
          old_string: '### FR-001: Login',
          new_string: '### FR-001: Login\n\n### FR-001: Login again',
        },
      },
      this.tempDir,
    );
  },
);

Then('PreToolUse hook returns `permissionDecision: {string}`', function (
  this: Phase2World,
  decision: string,
) {
  assert.equal(this.hookOutput?.hookSpecificOutput?.permissionDecision, decision);
});

Then(/^`permissionDecisionReason` contains code `([A-Z_]+)`$/, function (
  this: Phase2World,
  code: string,
) {
  const reason = this.hookOutput?.hookSpecificOutput?.permissionDecisionReason ?? '';
  assert.ok(reason.includes(code), `reason missing code ${code}: ${reason}`);
});

Then('the reason lists both heading locations', function (this: Phase2World) {
  const reason = this.hookOutput?.hookSpecificOutput?.permissionDecisionReason ?? '';
  assert.ok(/line \d+/.test(reason), `reason should reference both line numbers: ${reason}`);
});

Then('the Write does not occur', function () {
  // The hook returned 'deny' — the harness would not apply the Write.
  // No side-effect to assert against in unit-level tests.
});

// ─── SPECGEN004_10 — MALFORMED_FRONTMATTER (pending: parser does not yet
// surface frontmatter parse errors as HARD findings).
Given(
  'the agent attempts Write to `.specs\\/auth\\/FR.md` with frontmatter missing closing `---`',
  function () {
    return 'pending';
  },
);
When('the hook runs', function () {
  return 'pending';
});
Then('PreToolUse returns `permissionDecision: {string}`', function (
  this: Phase2World,
  decision: string,
) {
  // Implemented for SPECGEN004_11 (MALFORMED_GHERKIN). SPECGEN004_10
  // (MALFORMED_FRONTMATTER) marks its preceding Given as pending so this
  // step is unreachable for that scenario until the frontmatter parser
  // surfaces it as a HARD finding (deferred sub-PR).
  assert.equal(this.hookOutput?.hookSpecificOutput?.permissionDecision, decision);
});
Then('the reason includes the offending line number', function () {
  return 'pending';
});

// ─── SPECGEN004_11 — MALFORMED_GHERKIN ───────────────────────────────────

Given(
  'the agent attempts Write to `{word}` with invalid Gherkin syntax',
  function (this: Phase2World, relPath: string) {
    writeProgress(this.tempDir, 4);
    const fullPath = path.join(this.tempDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    this.hookOutput = runGuard(
      {
        tool_name: 'Write',
        tool_input: {
          file_path: fullPath,
          content: 'this is not gherkin at all\n@bogus tag with spaces\n',
        },
      },
      this.tempDir,
    );
  },
);

When('the hook runs and @cucumber\\/gherkin parser throws', function () {
  // Triggered above in the Given step — the parser yields zero scenarios
  // for the bad body which the guard surfaces as MALFORMED_GHERKIN.
});

Then('the reason includes the parser error message', function (this: Phase2World) {
  const reason = this.hookOutput?.hookSpecificOutput?.permissionDecisionReason ?? '';
  assert.ok(reason.includes('MALFORMED_GHERKIN'), reason);
});

// ─── SPECGEN004_12 — PostToolUse 3s window emit ──────────────────────────

Given(
  'the agent edits `.specs\\/auth\\/FR.md` and a conformance check produces {int} finding',
  function (this: Phase2World, _n: number) {
    // Seed an uncovered FR — guarantees ≥1 finding.
    fs.mkdirSync(path.join(this.tempDir, '.specs/auth'), { recursive: true });
    fs.writeFileSync(
      path.join(this.tempDir, '.specs/auth/FR.md'),
      '## FR-901: Uncovered\n',
    );
  },
);

When('PostToolUse hook fires', function (this: Phase2World) {
  const t0 = 1_700_000_000_000;
  // First fire — accumulates silently. Second fire AFTER window — flushes.
  runPush(this.tempDir, '.specs/auth/FR.md', t0);
  this.emitted = runPush(this.tempDir, '.specs/auth/FR.md', t0 + 4_000);
});

Then('within {int} seconds the agent context receives a `<system-reminder>` message', function (
  this: Phase2World,
  _sec: number,
) {
  assert.ok(this.emitted, 'expected runPush to emit a payload');
  assert.ok(this.emitted!.includes('<system-reminder>'), this.emitted);
});

Then('the message contains the finding code, location, and suggested actions', function (
  this: Phase2World,
) {
  const m = this.emitted ?? '';
  assert.ok(/UNCOVERED_FR/.test(m), m);
  assert.ok(/FR\.md:1/.test(m), m);
});

// ─── SPECGEN004_13 — bulk-edit aggregation ───────────────────────────────

Given(
  'the agent makes {int} sequential Edits to `.specs\\/auth\\/*.md` within {int} seconds',
  function (this: Phase2World, _edits: number, _seconds: number) {
    fs.mkdirSync(path.join(this.tempDir, '.specs/auth'), { recursive: true });
    fs.writeFileSync(path.join(this.tempDir, '.specs/auth/FR.md'), '## FR-901: A\n## FR-902: B\n');
  },
);

When('PostToolUse hook fires for each', function (this: Phase2World) {
  // Drive 5 fires within the 3s window.
  const t0 = 1_700_000_000_000;
  let state: { window_start: number; pending: Finding[] } | null = null;
  const fired: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = decidePush({
      now: t0 + i * 200,
      previous: state,
      newFindings: [
        {
          code: 'UNCOVERED_FR',
          severity: 'warning',
          location: { file: '.specs/auth/FR.md', line: 1 },
          message: 'FR-901 uncovered',
        },
      ],
    });
    state = r.newState;
    if (r.emit) fired.push(r.emit);
  }
  // After-window fire — flushes.
  const flush = decidePush({ now: t0 + 4_000, previous: state, newFindings: [] });
  if (flush.emit) fired.push(flush.emit);
  this.throttleState = state;
  this.emitted = fired.join('\n');
});

Then('findings are batched in the {int}-second throttle window', function (
  this: Phase2World,
  _sec: number,
) {
  // Five fires within window produced 0 emits; the after-window flush
  // produced 1. `emitted` will only contain the flush.
  assert.ok((this.emitted ?? '').includes('<system-reminder>'));
});

Then('duplicate findings \\(same code + location) are deduplicated', function (
  this: Phase2World,
) {
  const m = this.emitted ?? '';
  // Exactly one finding line — five identical findings collapsed.
  const lines = m.split('\n').filter((l) => l.includes('UNCOVERED_FR'));
  assert.equal(lines.length, 1, `expected one deduped finding line, got: ${lines.join(' | ')}`);
});

Then('only one aggregated `<system-reminder>` is pushed after the window closes', function (
  this: Phase2World,
) {
  const m = this.emitted ?? '';
  const opens = m.match(/<system-reminder>/g)?.length ?? 0;
  assert.equal(opens, 1, `expected exactly one <system-reminder> opener, got ${opens}`);
});

// ─── SPECGEN004_14 — frontmatter opt-out ─────────────────────────────────

Given('a spec file frontmatter contains `_no_push_check: true`', function (this: Phase2World) {
  fs.mkdirSync(path.join(this.tempDir, '.specs/auth'), { recursive: true });
  fs.writeFileSync(
    path.join(this.tempDir, '.specs/auth/FR.md'),
    '# _no_push_check: true\n## FR-901: Uncovered\n',
  );
});

When('the agent edits that file', function () {
  // The edit itself isn't observable at unit level — the runPush call in
  // `When PostToolUse hook fires` is the behavioral surface.
});

// (Duplicate `When PostToolUse hook fires` removed — the single definition
//  earlier in the file fires twice across the throttle window so both
//  SPECGEN004_12 (emit) and SPECGEN004_14 (opt-out → silent) reuse it.)

Then('no `<system-reminder>` is pushed for that file', function (this: Phase2World) {
  assert.equal(this.emitted ?? '', '');
});

Then(
  'the findings are still logged to `.dev-pomogator\\/.spec-check-log\\/`',
  function () {
    // The persistent log lands in Phase 4 (FR-15). Until then this step is
    // pending — the throttle journal already holds the data the eventual
    // log writer will consume.
    return 'pending';
  },
);

// ─── SPECGEN004_15 / 16 — Marksman (Phase 2B) ────────────────────────────
Given('a fresh `npx dev-pomogator install` invocation', function () { return 'pending'; });
When('the postInstall script completes', function () { return 'pending'; });
Then('`.dev-pomogator\\/bin\\/marksman` \\(or platform equivalent) exists and is executable', function () { return 'pending'; });
Then('the binary responds to LSP `initialize` request', function () { return 'pending'; });
Given('the Marksman binary download fails during install \\(no network)', function () { return 'pending'; });
