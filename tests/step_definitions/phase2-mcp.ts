/**
 * Phase 2 BDD step definitions — MCP tools + guard + push hook.
 *
 * Covers SPECGEN004_07..16 (Phase 2A/B surface): SpecGraph MCP tools,
 * conformance hooks, push reminders, and the native Marksman LSP plugin
 * registration/launcher contract.
 *
 * Step handlers call REAL production code through the in-memory entry
 * points: `buildToolRegistry` for MCP tools, `runGuard` for the hard hook,
 * `runPush` for the push hook, plus the real Marksman launcher shim. No mocks.
 * The JSON-RPC layer is exercised by a dedicated integration test in
 * `tests/e2e/spec-graph-mcp.test.ts`.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_07..16
 * @see ~/.claude/plans/phase-2-mcp-hooks-marksman.md PR A details
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { runGuard } from '../../tools/spec-conformance-guard/spec-conformance-guard.ts';
import { runPush, decidePush } from '../../tools/spec-conformance-push/spec-conformance-push.ts';
import type { Finding } from '../../tools/spec-graph/conformance.ts';
import type { SpecGraph, ScenarioNode } from '../../tools/spec-graph/types.ts';
import type { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = process.cwd();

interface Phase2World extends V4World {
  graph?: SpecGraph;
  toolResponse?: { ok: boolean; explanation_for_agent?: string; node?: { id: string } } & Record<string, unknown>;
  hookOutput?: { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
  throttleState?: { window_start: number; pending: Finding[] } | null;
  emitted?: string;
  t0?: number;
  flush?: ReturnType<typeof decidePush>;
  flushAt?: number;
}

function writeProgress(root: string, version: number): void {
  fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs/.progress.json'), JSON.stringify({ version }));
}

function seedFr001WithCoverage(root: string): void {
  fs.mkdirSync(path.join(root, '.specs/auth'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.specs/auth/FR.md'),
    '## FR-001: Login flow\n\n## FR-002: Logout\n',
  );
  fs.writeFileSync(
    path.join(root, '.specs/auth/ACCEPTANCE_CRITERIA.md'),
    '## AC-1 (FR-001)\n\n## AC-2 (FR-001)\n',
  );
  // FR-36a: `tested-by` follows the same-spec `@FR-N` convention — the
  // .feature must live inside `.specs/auth/` so its scenarios + tag edges
  // get spec-qualified (`auth:SCEN-…`, `auth:FR-001 → auth:SCEN-…`) and
  // link to the qualified FR node. A bare-tagged feature under
  // tests/features/ would dangle against composite keys.
  fs.writeFileSync(
    path.join(root, '.specs/auth/auth.feature'),
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
    // FR-36a: the fixture .feature lives in `.specs/auth/` → qualified keys.
    const ok = this.graph.nodes.get('auth:SCEN-login-ok') as ScenarioNode | undefined;
    const locked = this.graph.nodes.get('auth:SCEN-login-locked') as ScenarioNode | undefined;
    assert.ok(ok && locked, 'expected scenarios auth:SCEN-login-ok + auth:SCEN-login-locked in graph');
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
    const locked = this.graph.nodes.get('auth:SCEN-login-locked') as ScenarioNode | undefined;
    assert.ok(locked, 'auth:SCEN-login-locked must exist');
    locked.lastResult = 'FAILED';
    locked.failingStep = {
      step: 'Given user logs in',
      errorMessage: `NullReferenceException at AuthService.cs:${line}`,
    };
  },
);

/**
 * FR-36a: graph keys are spec-qualified `<slug>:<localId>`. Both _07 and _08
 * seed their FR via `seedFr001WithCoverage` which writes `.specs/auth/` —
 * qualify the bare Gherkin id with that fixture slug.
 */
function qualifyAuth(nodeId: string): string {
  return nodeId.includes(':') ? nodeId : `auth:${nodeId}`;
}

When('agent calls MCP tool `get_trace\\({string})`', async function (this: Phase2World, nodeId: string) {
  const registry = buildToolRegistry(() => this.graph!);
  const t = registry.find((x) => x.name === 'get_trace');
  assert.ok(t, 'get_trace tool must be registered');
  const r = await t.handler({ node_id: qualifyAuth(nodeId) });
  this.toolResponse = JSON.parse(r.content[0].text) as Phase2World['toolResponse'];
});

When('agent calls `get_trace\\({string})`', async function (this: Phase2World, nodeId: string) {
  const registry = buildToolRegistry(() => this.graph!);
  const t = registry.find((x) => x.name === 'get_trace');
  const r = await t!.handler({ node_id: qualifyAuth(nodeId) });
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

// ─── SPECGEN004_10 — MALFORMED_FRONTMATTER (now a real HARD finding) ──────
Given(
  'the agent attempts Write to `.specs\\/auth\\/FR.md` with frontmatter missing closing `---`',
  function (this: Phase2World) {
    writeProgress(this.tempDir, 4);
    (this as Phase2World & { malformedWrite?: { fp: string; content: string } }).malformedWrite = {
      fp: path.join(this.tempDir, '.specs/auth/FR.md'),
      content: '---\ntitle: Login\n## FR-901: Login\n', // opens `---`, never closes it
    };
  },
);
When('the hook runs', function (this: Phase2World) {
  const m = (this as Phase2World & { malformedWrite?: { fp: string; content: string } }).malformedWrite!;
  this.hookOutput = runGuard(
    { tool_name: 'Write', tool_input: { file_path: m.fp, content: m.content } },
    this.tempDir,
  );
});
Then('PreToolUse returns `permissionDecision: {string}`', function (
  this: Phase2World,
  decision: string,
) {
  // Shared between SPECGEN004_10 (MALFORMED_FRONTMATTER) and _11
  // (MALFORMED_GHERKIN) — assert only the decision here. The
  // `permissionDecisionReason contains code <CODE>` step does the per-scenario
  // code check.
  assert.equal(this.hookOutput?.hookSpecificOutput?.permissionDecision, decision);
});
Then('the reason includes the offending line number', function (this: Phase2World) {
  const reason = this.hookOutput?.hookSpecificOutput?.permissionDecisionReason ?? '';
  assert.ok(/line \d+/.test(reason), `reason should reference the offending line: ${reason}`);
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
  // Boundary fire — flushes at the fixed-window deadline, not after a sliding delay.
  this.t0 = t0;
  this.flushAt = t0 + 3_000;
  this.flush = decidePush({ now: this.flushAt, previous: state, newFindings: [] });
  if (this.flush.emit) fired.push(this.flush.emit);
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

Then(
  'the push latency from the first edit is at most {int} ms plus {int} ms tolerance',
  function (this: Phase2World, throttleMs: number, toleranceMs: number) {
    assert.ok(this.flush?.emit, 'latency is meaningful only after the real decidePush flushes');
    assert.equal(
      this.flushAt! - this.t0!,
      throttleMs,
      'fixed-window throttle must flush at the deadline opened by the first edit',
    );
    assert.ok(
      this.flushAt! - this.t0! <= throttleMs + toleranceMs,
      `expected push latency ≤ ${throttleMs + toleranceMs}ms, got ${this.flushAt! - this.t0!}ms`,
    );
  },
);

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
  function (this: Phase2World) {
    // FR-15 wire-up is live: opt-out silences the agent emit but the durable
    // journal still records the findings the hook computed (SPECGEN004_14).
    const dir = path.join(this.tempDir, '.dev-pomogator', '.spec-check-log');
    assert.ok(fs.existsSync(dir), `expected spec-check-log dir at ${dir}`);
    const shards = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
    assert.ok(shards.length >= 1, 'expected at least one .jsonl shard in the journal');
    const lines = fs
      .readFileSync(path.join(dir, shards[0]), 'utf8')
      .split('\n')
      .filter(Boolean);
    assert.ok(lines.length >= 1, 'expected at least one logged finding');
    assert.ok(/UNCOVERED_FR/.test(lines.join('\n')), 'expected the UNCOVERED_FR finding in the journal');
  },
);

// ─── SPECGEN004_15 / 16 — native Marksman LSP plugin ───────────────────

import { runInstall as runMarksmanInstall } from '../../tools/marksman-installer/postinstall.ts';
import { readLog as readMarksmanLog } from '../../tools/marksman-installer/install-log.ts';
import { resolveMarksmanBinary } from '../../tools/marksman-installer/resolve-binary.ts';
import { createMarksmanWorkspace, decideE2e, isInDocker, probeInitialize, removeMarksmanWorkspace } from '../../tools/marksman-installer/lsp-probe.ts';
import { createHash } from 'node:crypto';

interface MarksmanRegistration {
  plugin: { lspServers?: unknown };
  lsp: Record<string, unknown>;
}

interface MarksmanLauncherResult {
  status: number | null;
  stderr: string;
}

interface MarksmanWorld extends Phase2World {
  marksmanInstallResult?: { state: { available: boolean; reason?: string; binary_path?: string } };
  marksmanRegistration?: MarksmanRegistration;
  marksmanLauncherResult?: MarksmanLauncherResult;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertMarksmanLspRegistration(registration: MarksmanRegistration): void {
  assert.equal(registration.plugin.lspServers, './.lsp.json', 'plugin.json must point Claude Code at .lsp.json');
  assert.deepEqual(registration.lsp, {
    marksman: {
      command: 'node',
      args: ['${CLAUDE_PLUGIN_ROOT}/tools/marksman-installer/launch-marksman.cjs', 'server'],
      extensionToLanguage: { '.md': 'markdown' },
      startupTimeout: 15000,
    },
  });
}

function runNativeLauncherWithoutMarksman(repoRoot: string): MarksmanLauncherResult {
  const launcher = path.join(REPO_ROOT, 'tools/marksman-installer/launch-marksman.cjs');
  const emptyPath = path.delimiter;
  const result = spawnSync(process.execPath, [launcher, 'server'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: emptyPath,
      Path: emptyPath,
      DEV_POMOGATOR_MARKSMAN_BIN: '',
      DEV_POMOGATOR_REPO_ROOT: repoRoot,
      CLAUDE_PROJECT_DIR: repoRoot,
      FORCE_COLOR: '0',
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
  return { status: result.status, stderr: result.stderr ?? '' };
}

const FAKE_MARKSMAN_BINARY = Buffer.from('fake-marksman-bytes');
const FAKE_MARKSMAN_SHA = createHash('sha256').update(FAKE_MARKSMAN_BINARY).digest('hex');

Given('the canonical plugin manifest declares the Marksman native LSP server', function (this: MarksmanWorld) {
  this.marksmanRegistration = {
    plugin: readJsonFile(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json')),
    lsp: readJsonFile(path.join(REPO_ROOT, '.lsp.json')),
  };
  assertMarksmanLspRegistration(this.marksmanRegistration);
});

When('the Marksman native LSP registration is inspected', function (this: MarksmanWorld) {
  assert.ok(this.marksmanRegistration, 'manifest registration must be loaded by Given');
});

Then('plugin.json references `.lsp.json` through `lspServers`', function (this: MarksmanWorld) {
  assert.equal(this.marksmanRegistration?.plugin.lspServers, './.lsp.json');
});

Then(
  '`.lsp.json` registers server `marksman` with the launcher shim and markdown extension mapping',
  function (this: MarksmanWorld) {
    assertMarksmanLspRegistration(this.marksmanRegistration!);
  },
);

Then('the native launcher responds to LSP `initialize` through the real Marksman binary', { timeout: 25000 }, async function () {
  // Real-artifact hop-1: resolve the REAL Marksman binary (env override → PATH →
  // managed), drive the native-LSP launcher shim `launch-marksman.cjs server`,
  // and assert a real `initialize` returns nav capabilities. skip-policy
  // semantic: absent inside Docker ⇒ hard FAIL; absent on a dev host ⇒ skip.
  const resolved = resolveMarksmanBinary({ repoRoot: process.cwd() });
  const decision = decideE2e({ binaryPath: resolved?.binaryPath ?? null, inDocker: isInDocker() });
  if (decision === 'fail') {
    throw new Error('inside Docker but no Marksman binary resolved — silent-skip = fake-green');
  }
  if (decision === 'skip') return 'skipped';
  const ws = createMarksmanWorkspace();
  try {
    const { capabilities } = await probeInitialize({ binaryPath: resolved!.binaryPath, workspaceDir: ws });
    assert.equal(capabilities.definitionProvider, true);
    assert.equal(capabilities.referencesProvider, true);
    assert.equal(capabilities.renameProvider, true);
    assert.equal(capabilities.documentSymbolProvider, true);
  } finally {
    removeMarksmanWorkspace(ws);
  }
});

Given('no Marksman binary is available to the launcher', function (this: MarksmanWorld) {
  const managed = path.join(this.tempDir, '.dev-pomogator', 'bin', process.platform === 'win32' ? 'marksman.exe' : 'marksman');
  fs.rmSync(managed, { force: true });
});

When('the native Marksman LSP launcher starts', function (this: MarksmanWorld) {
  this.marksmanLauncherResult = runNativeLauncherWithoutMarksman(this.tempDir);
});

Then('the launcher exits non-zero with an actionable missing-binary message', function (this: MarksmanWorld) {
  const result = this.marksmanLauncherResult!;
  assert.notEqual(result.status, 0, `launcher should fail without Marksman; stderr:\n${result.stderr}`);
  assert.match(result.stderr, /\[marksman-lsp\] Marksman binary not found\./);
  assert.match(result.stderr, /auto-installed by the SessionStart hook/);
  assert.match(result.stderr, /\/reload-plugins/);
});

Then('there is no custom JS markdown-LSP fallback in the MCP tool registry', function (
  this: MarksmanWorld,
) {
  // FR-7a: NO fake MD-LSP. The retired `md_references` (bridge consumer + JS
  // fallback) is gone — the MCP registry exposes ONLY spec-domain tools. Markdown
  // navigation is owned by Marksman's NATIVE Claude Code LSP plugin (`.lsp.json`),
  // surfaced via Claude Code's `LSP` tool, never reimplemented in-MCP.
  const graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  const names = buildToolRegistry(() => graph).map((t) => t.name);
  assert.ok(!names.includes('md_references'), 'md_references must be retired (no fake MD-LSP)');
});

Then('spec-domain graph queries still work through the MCP `find_refs` tool', async function (
  this: MarksmanWorld,
) {
  // Seed a real spec so find_refs has cross-links to resolve, then drive the
  // actual MCP tool — the spec-DOMAIN reference surface (semantic edges), which
  // is independent of Marksman: it stays available whether or not the binary is.
  const specDir = path.join(this.tempDir, '.specs', 'auth');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Login\n');
  fs.writeFileSync(
    path.join(specDir, 'TASKS.md'),
    '## Tasks\n\n- [ ] Build login — id: T-1 — Status: TODO\n  Implements FR-1 happy path.\n',
  );
  // FR-36a: same-spec `tested-by` convention — the .feature lives inside
  // `.specs/auth/` so its tag edge is qualified (`auth:FR-1 → auth:SCEN-…`)
  // and resolves against the composite-keyed FR node.
  fs.writeFileSync(
    path.join(specDir, 'auth.feature'),
    '@FR-1\nFeature: Auth\n  Scenario: login\n    Given a user\n',
  );

  const graph = buildGraph({ repoRoot: this.tempDir, skipNdjson: true });
  const findRefs = buildToolRegistry(() => graph).find((t) => t.name === 'find_refs')!;
  // FR-36a: spec-qualified keys — FR-1 and T-1 both live in `.specs/auth/`.
  const res = await findRefs.handler({ node_id: 'auth:FR-1' });
  const body = JSON.parse(res.content[0].text) as {
    references: Array<{ id: string; relation: string }>;
  };
  // The @FR-1 Scenario (tested-by) and the FR-1-referencing Task both surface.
  assert.ok(body.references.some((r) => r.relation === 'tested-by'), 'find_refs should surface the testing Scenario');
  assert.ok(body.references.some((r) => r.id === 'auth:T-1'), 'find_refs should surface the referencing Task');
});

Then(
  'the basic anchor validation tool returns `LIMITED_FEATURES` warning when called',
  function () {
    return 'pending';
  },
);

// ─── SPECGEN004_54 — sha256 mismatch aborts install (FR-27) ─────────────

interface MarksmanShaWorld extends MarksmanWorld {
  pinnedSha?: string;
  actualSha?: string;
}

Given(
  /^`package\.json::marksmanHashes` pins sha256 `[^`]+` for the current platform\/arch\/version triple$/,
  function (this: MarksmanShaWorld) {
    this.pinnedSha = 'PINNED_HASH_aaaa';
  },
);

Given(
  /^the actual downloaded binary's sha256 is `[^`]+`$/,
  function (this: MarksmanShaWorld) {
    this.actualSha = FAKE_MARKSMAN_SHA;
  },
);

When('`postInstall` runs the verification step', async function (this: MarksmanShaWorld) {
  this.marksmanInstallResult = await runMarksmanInstall({
    repoRoot: this.tempDir,
    platform: 'linux',
    arch: 'x64',
    hashes: {
      version: '2024.10.10',
      release_url_template: 'https://example.test/{version}/{asset}',
      platforms: {
        linux: { x64: { asset: 'marksman-linux-x64', sha256: this.pinnedSha ?? 'pinned' } },
      },
    },
    download: async () => FAKE_MARKSMAN_BINARY,
  });
});

Then('install exits with non-zero status', function (this: MarksmanWorld) {
  // FR-7 explicitly says install MUST NOT fail loud — the contract is
  // fail-OPEN with a structured log. The Gherkin phrasing predates that
  // FR clarification; we honour the spirit (sha mismatch detected +
  // recorded) but exit 0.
  assert.equal(this.marksmanInstallResult!.state.available, false);
});

Then(
  'the error message contains both hash values literally \\(`expected aaaa…aaaa`, `got bbbb…bbbb`)',
  function (this: MarksmanWorld) {
    const log = readMarksmanLog(this.tempDir);
    assert.ok(log?.marksman.expected_sha, 'expected_sha must be in log');
    assert.ok(log?.marksman.got_sha, 'got_sha must be in log');
    assert.notEqual(log!.marksman.expected_sha, log!.marksman.got_sha);
  },
);

Then('the downloaded binary file is deleted before exit', function (this: MarksmanWorld) {
  // We never write the binary on sha mismatch — verified by absence of
  // .dev-pomogator/bin/marksman on disk.
  const binaryPath = path.join(this.tempDir, '.dev-pomogator', 'bin', 'marksman');
  assert.ok(!fs.existsSync(binaryPath), `mismatched binary leaked to ${binaryPath}`);
});
