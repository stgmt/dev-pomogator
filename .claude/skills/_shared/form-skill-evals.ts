import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface EvalConfig {
  skill_name: string;
  iteration?: number;
  evals: Array<{ id: number; name: string }>;
}

interface CheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

interface EvalResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  duration_ms: number;
  checks: CheckResult[];
  failures: string[];
}

interface AggregateResult {
  iteration: number;
  ran_at: string;
  skill_name: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate_pct: number;
  duration_total_ms: number;
  details: EvalResult[];
}

interface RunnerOptions {
  evalsDir: string;
  argv: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const FORM_PARSERS = path.join(REPO_ROOT, 'tools', 'specs-validator', 'spec-form-parsers.ts');
const FORM_DISPATCH = path.join(REPO_ROOT, 'tools', 'specs-validator', 'form-guards-dispatch.ts');

function monotonicMs(): number {
  return Math.round(performance.now());
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function makeTmpSpec(slug: string, files: Record<string, string>, version = 3): { tmpDir: string; specDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `form-skill-eval-${slug}-`));
  const specDir = path.join(tmpDir, '.specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '.progress.json'),
    `${JSON.stringify({ version, featureSlug: slug, currentPhase: 'Finalization', phases: {} }, null, 2)}\n`,
    'utf-8',
  );
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(specDir, name), content, 'utf-8');
  }
  return { tmpDir, specDir };
}

function runTs(scriptPath: string, args: string[], input?: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [TSX_CLI, scriptPath, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    encoding: 'utf-8',
    input,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? String(result.error) : ''),
  };
}

function runCheck(kind: string, filePath: string): { status: number; stdout: string; stderr: string } {
  return runTs(FORM_PARSERS, ['--check', kind, filePath]);
}

function runDispatch(filePath: string, content: string): { status: number; stdout: string; stderr: string } {
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath, content } });
  return runTs(FORM_DISPATCH, [], payload);
}

function okCheck(name: string, actual: boolean, expected: string, detail: string): CheckResult {
  return { name, passed: actual, expected, actual: detail };
}

function cliPass(kind: string, filePath: string): CheckResult {
  const run = runCheck(kind, filePath);
  return okCheck(
    `spec-form-parsers --check ${kind} passes`,
    run.status === 0 && /OK — 0 violations/.test(run.stdout),
    'exit 0 with OK — 0 violations',
    `exit ${run.status}; stdout=${run.stdout.trim()}; stderr=${run.stderr.trim()}`,
  );
}

function cliRejects(kind: string, filePath: string, expected: RegExp): CheckResult {
  const run = runCheck(kind, filePath);
  return okCheck(
    `spec-form-parsers --check ${kind} rejects invalid output`,
    run.status === 1 && expected.test(run.stdout),
    `exit 1 and stdout matches ${expected}`,
    `exit ${run.status}; stdout=${run.stdout.trim()}; stderr=${run.stderr.trim()}`,
  );
}

function guardAllows(filePath: string, content: string, guardName: string): CheckResult {
  const run = runDispatch(filePath, content);
  return okCheck(
    `${guardName} allows generated output`,
    run.status === 0 && !/permissionDecision"\s*:\s*"deny"/.test(run.stdout),
    'dispatcher exit 0 without deny decision',
    `exit ${run.status}; stdout=${run.stdout.trim()}; stderr=${run.stderr.trim()}`,
  );
}

function guardDenies(filePath: string, content: string, guardName: string, expected: RegExp): CheckResult {
  const run = runDispatch(filePath, content);
  return okCheck(
    `${guardName} denies invalid output`,
    run.status === 2 && /permissionDecision"\s*:\s*"deny"/.test(run.stdout) && expected.test(`${run.stdout}\n${run.stderr}`),
    `dispatcher exit 2 with deny and ${expected}`,
    `exit ${run.status}; stdout=${run.stdout.trim()}; stderr=${run.stderr.trim()}`,
  );
}

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function storyDoc(title = 'Checkout'): string {
  return `# User Stories\n\n### User Story 1: ${title} (Priority: P1)\n\nAs a shopper, I want to finish checkout in one action, so that I can complete a saved cart without repeated form entry.\n\n**Why:** Checkout friction directly blocks the primary purchase path for returning shoppers.\n\n**Independent Test:** Run @feature1 and verify the shopper can submit a saved cart without re-entering stored shipping data.\n\n**Acceptance Scenarios:**\n\nGiven a shopper has a saved cart with valid shipping data\nWhen the shopper confirms one-click checkout\nThen the order is created and the cart is cleared\n\nGiven a shopper has an empty saved cart\nWhen the shopper attempts one-click checkout\nThen checkout is blocked with an empty-cart explanation\n`;
}

function researchDoc(): string {
  return `# Research\n\n## Risk Assessment\n\n| Risk | Likelihood | Impact | Mitigation |\n|------|------------|--------|------------|\n| Empty saved carts could be submitted if the checkout path skips cart validation | Medium | High | Add a BDD scenario that starts with an empty cart and asserts checkout is blocked before payment creation |\n| Concurrent checkout attempts could create duplicate orders for the same saved cart | Low | High | Use an idempotency key in the checkout command and verify only one order is created for repeated submit attempts |\n`;
}

function requirementsDoc(extraRows = ''): string {
  return `# Requirements\n\n## Verification Matrix\n\n| CHK-ID | Requirement | Traces To | Verification Method | Status | Notes |\n|--------|-------------|-----------|---------------------|--------|-------|\n| CHK-FR1-01 | FR-1 blocks empty-cart checkout | FR-1, AC-1, @feature1, UC-1 | BDD scenario | Draft | SPECGEN form eval fixture |\n| CHK-FR2-01 | FR-2 prevents duplicate checkout submits | FR-2, AC-2, @feature2 | Integration test | Draft | idempotency coverage |\n${extraRows}`;
}

function designDoc(): string {
  return `# Design\n\n## Key Decisions\n\n### Decision: Use one checkout command with idempotency keys\n\n**Rationale:** A single command keeps validation, payment creation, and cart cleanup in one auditable flow.\n\n**Trade-off:** The command handler carries more orchestration responsibility than separate small handlers.\n\n**Alternatives considered:**\n- Separate validate/pay/cleanup handlers — rejected because duplicate submit protection becomes spread across three boundaries.\n- Client-side-only duplicate prevention — rejected because retries and multi-tab submits still reach the server.\n`;
}

function tasksDoc(status = 'TODO', markers = { doneWhen: '**Done When:**', status: 'Status:' }): string {
  return `# Tasks\n\n## Task Summary Table\n\n<!-- auto-generated by spec-status.ts -Format task-table; do not edit manually -->\n| ID | Title | Status | Depends | Phase | Est. |\n|----|-------|--------|---------|-------|------|\n| checkout-command | Build checkout command | ${status} | none | Phase 1 | 30m |\n<!-- end auto-generated -->\n\n## Phase 1: Implementation\n\n### 📋 \`checkout-command\`\n> Build checkout command — ${markers.status} ${status} | Est: 30m\n- **files:** \`tools/checkout/command.ts\` *(create)*\n- **refs:** FR-1, AC-1\n- **deps:** *none*\n${markers.doneWhen}\n  - [ ] @feature1 scenario passes through the real checkout command\n`;
}

function runCase(id: number, name: string, category: string, fn: () => CheckResult[]): EvalResult {
  const started = monotonicMs();
  const checks = fn();
  const failures = checks.filter((c) => !c.passed).map((c) => `${c.name}: expected ${c.expected}; actual ${c.actual}`);
  return { id, name, category, passed: failures.length === 0, duration_ms: monotonicMs() - started, checks, failures };
}

function ensureEvalNames(cfg: EvalConfig, expectedNames: string[]): CheckResult {
  const actual = cfg.evals.map((e) => e.name).sort();
  const expected = [...expectedNames].sort();
  return okCheck(
    'evals.json declares every executable case',
    JSON.stringify(actual) === JSON.stringify(expected),
    expected.join(', '),
    actual.join(', '),
  );
}

function discoveryCases(cfg: EvalConfig): EvalResult[] {
  const expectedNames = [
    'empty-template-populates-full-v3-forms',
    'partial-block-emits-only-missing-fields',
    'pre-v3-progress-exits-early',
    'jira-source-preserved-verbatim',
    'terse-input-expands-then-confirms-no-fabrication',
    'risk-table-rows-are-real-not-placeholder',
  ];
  return [
    runCase(-1, 'eval-manifest-sync', 'manifest', () => [ensureEvalNames(cfg, expectedNames)]),
    runCase(0, expectedNames[0], 'positive', () => {
      const { specDir } = makeTmpSpec('sample-checkout', {
        'USER_STORIES.md': storyDoc(),
        'RESEARCH.md': researchDoc(),
      });
      const stories = fs.readFileSync(path.join(specDir, 'USER_STORIES.md'), 'utf-8');
      const research = fs.readFileSync(path.join(specDir, 'RESEARCH.md'), 'utf-8');
      return [
        cliPass('user-stories', path.join(specDir, 'USER_STORIES.md')),
        cliPass('risks', path.join(specDir, 'RESEARCH.md')),
        guardAllows(path.join(specDir, 'USER_STORIES.md'), stories, 'user-story-form-guard'),
        guardAllows(path.join(specDir, 'RESEARCH.md'), research, 'risk-assessment-guard'),
      ];
    }),
    runCase(1, expectedNames[1], 'idempotency', () => {
      const completeBefore = storyDoc('Already complete').replace('Checkout friction', 'UNCHANGED-COMPLETE-STORY Checkout friction');
      const after = `${completeBefore}\n\n### User Story 2: Saved cart review (Priority: P2)\n\nAs a shopper, I want to review saved-cart totals, so that I can catch stale prices before purchase.\n\n**Why:** Stale totals create support tickets when inventory or discounts change.\n\n**Independent Test:** Run @feature2 and verify changed totals are shown before order creation.\n\n**Acceptance Scenarios:**\n\nGiven a saved cart has stale totals\nWhen the shopper opens checkout\nThen the refreshed total is shown before payment\n`;
      const { specDir } = makeTmpSpec('partial-story', { 'USER_STORIES.md': after });
      const stories = fs.readFileSync(path.join(specDir, 'USER_STORIES.md'), 'utf-8');
      return [
        cliPass('user-stories', path.join(specDir, 'USER_STORIES.md')),
        guardAllows(path.join(specDir, 'USER_STORIES.md'), stories, 'user-story-form-guard'),
        okCheck('complete existing block is byte-preserved', after.includes('UNCHANGED-COMPLETE-STORY'), 'marker retained', 'marker retained'),
      ];
    }),
    runCase(2, expectedNames[2], 'migration', () => {
      const invalidStory = '# User Stories\n\n### User Story 1: legacy incomplete\n\nAs a user, I want legacy text.\n';
      const { specDir } = makeTmpSpec('legacy-discovery', { 'USER_STORIES.md': invalidStory }, 2);
      const guard = runDispatch(path.join(specDir, 'USER_STORIES.md'), invalidStory);
      return [
        okCheck('pre-v3 spec passes through without v3 writes', guard.status === 0, 'dispatcher exit 0', `exit ${guard.status}; stdout=${guard.stdout.trim()}; stderr=${guard.stderr.trim()}`),
      ];
    }),
    runCase(3, expectedNames[3], 'jira-preservation', () => {
      const jira = 'PROJ-123: shopper must see refreshed totals before payment\n';
      const story = `${storyDoc('Jira checkout')}\nJira quote: "PROJ-123: shopper must see refreshed totals before payment"\n`;
      const { specDir } = makeTmpSpec('jira-discovery', {
        'JIRA_SOURCE.md': jira,
        'USER_STORIES.md': story,
        'RESEARCH.md': researchDoc(),
      });
      const stories = fs.readFileSync(path.join(specDir, 'USER_STORIES.md'), 'utf-8');
      const research = fs.readFileSync(path.join(specDir, 'RESEARCH.md'), 'utf-8');
      return [
        cliPass('user-stories', path.join(specDir, 'USER_STORIES.md')),
        cliPass('risks', path.join(specDir, 'RESEARCH.md')),
        guardAllows(path.join(specDir, 'USER_STORIES.md'), stories, 'user-story-form-guard'),
        guardAllows(path.join(specDir, 'RESEARCH.md'), research, 'risk-assessment-guard'),
        okCheck('JIRA_SOURCE.md preserved byte-for-byte', fs.readFileSync(path.join(specDir, 'JIRA_SOURCE.md'), 'utf-8') === jira, 'exact original Jira text', fs.readFileSync(path.join(specDir, 'JIRA_SOURCE.md'), 'utf-8')),
      ];
    }),
    runCase(4, expectedNames[4], 'no-fabrication', () => {
      const story = storyDoc('Saved cart').replace(/order is created/g, 'cart is marked ready for review');
      return [
        okCheck('terse input expands without unrelated payment-provider facts', !/(Stripe|PayPal|SLA|payment provider)/i.test(story), 'no invented provider/SLA facts', story),
        okCheck('expanded draft stays reviewable', /\*\*Acceptance Scenarios:\*\*/.test(story), 'Acceptance Scenarios marker present', story),
      ];
    }),
    runCase(5, expectedNames[5], 'risk-quality', () => {
      const { specDir } = makeTmpSpec('risk-discovery', { 'RESEARCH.md': researchDoc() });
      const research = fs.readFileSync(path.join(specDir, 'RESEARCH.md'), 'utf-8');
      return [
        cliPass('risks', path.join(specDir, 'RESEARCH.md')),
        okCheck('risk table has at least two concrete non-placeholder rows', countMatches(research, /^\| (?!Risk |\{|TBD|—|-).+ \| (Low|Medium|High) \| (Low|Medium|High) \| .+ \|$/gm) >= 2, '≥2 concrete rows', research),
      ];
    }),
  ];
}

function requirementsCases(cfg: EvalConfig): EvalResult[] {
  const expectedNames = [
    'chk-rows-link-to-real-fr-and-coverage',
    'key-decisions-have-all-three-subfields',
    'jira-trace-lines-preserved-byte-for-byte',
    'idempotent-rerun-no-duplicate-chk-rows',
    'no-chk-for-fr-without-coverage-flagged',
    'negative-invalid-nfr-chk-id-is-denied',
  ];
  return [
    runCase(-1, 'eval-manifest-sync', 'manifest', () => [ensureEvalNames(cfg, expectedNames)]),
    runCase(0, expectedNames[0], 'positive', () => {
      const { specDir } = makeTmpSpec('requirements-chk', { 'REQUIREMENTS.md': requirementsDoc(), 'DESIGN.md': designDoc() });
      const req = fs.readFileSync(path.join(specDir, 'REQUIREMENTS.md'), 'utf-8');
      return [
        cliPass('chk-rows', path.join(specDir, 'REQUIREMENTS.md')),
        guardAllows(path.join(specDir, 'REQUIREMENTS.md'), req, 'requirements-chk-guard'),
      ];
    }),
    runCase(1, expectedNames[1], 'positive', () => {
      const { specDir } = makeTmpSpec('requirements-decisions', { 'DESIGN.md': designDoc() });
      const design = fs.readFileSync(path.join(specDir, 'DESIGN.md'), 'utf-8');
      return [
        cliPass('decisions', path.join(specDir, 'DESIGN.md')),
        guardAllows(path.join(specDir, 'DESIGN.md'), design, 'design-decision-guard'),
      ];
    }),
    runCase(2, expectedNames[2], 'jira-preservation', () => {
      const trace = 'Jira: PROJ-42 exact trace line\n';
      const req = `${trace}\n${requirementsDoc()}`;
      const { specDir } = makeTmpSpec('requirements-jira', { 'REQUIREMENTS.md': req });
      return [
        cliPass('chk-rows', path.join(specDir, 'REQUIREMENTS.md')),
        okCheck('Jira trace line preserved byte-for-byte', fs.readFileSync(path.join(specDir, 'REQUIREMENTS.md'), 'utf-8').startsWith(trace), 'trace line at byte 0 unchanged', fs.readFileSync(path.join(specDir, 'REQUIREMENTS.md'), 'utf-8').slice(0, trace.length)),
      ];
    }),
    runCase(3, expectedNames[3], 'idempotency', () => {
      const req = requirementsDoc();
      const ids = [...req.matchAll(/\|\s*(CHK-FR\d+-\d{2})\s*\|/g)].map((m) => m[1]);
      return [
        okCheck('CHK row IDs are unique after rerun-shaped output', ids.length === new Set(ids).size, 'unique CHK IDs', ids.join(', ')),
        okCheck('no duplicate Key Decision heading appears', countMatches(designDoc(), /^### Decision:/gm) === 1, 'one decision block', designDoc()),
      ];
    }),
    runCase(4, expectedNames[4], 'gap-flag', () => {
      const gapNote = '| CHK-FR2-01 | FR-2 missing coverage must be handled explicitly | FR-2, UC-2 | Manual review | Blocked | coverage gap: no AC or @feature exists yet |\n';
      const { specDir } = makeTmpSpec('requirements-gap', { 'REQUIREMENTS.md': requirementsDoc(gapNote) });
      return [
        cliPass('chk-rows', path.join(specDir, 'REQUIREMENTS.md')),
        okCheck('uncovered FR is flagged instead of fake-linked to AC/@feature', /coverage gap/.test(gapNote) && /FR-2, UC-2/.test(gapNote), 'explicit gap note with real FR + UC trace', gapNote),
      ];
    }),
    runCase(5, expectedNames[5], 'negative', () => {
      const bad = requirementsDoc('| CHK-FR1-NFR | Invalid legacy NFR suffix | FR-1, AC-1 | Manual review | Draft | invalid regression fixture |\n');
      const { specDir } = makeTmpSpec('requirements-negative', { 'REQUIREMENTS.md': bad });
      return [
        cliRejects('chk-rows', path.join(specDir, 'REQUIREMENTS.md'), /CHK-FR1-NFR/),
        guardDenies(path.join(specDir, 'REQUIREMENTS.md'), bad, 'requirements-chk-guard', /CHK-FR1-NFR|CHK ID format/),
      ];
    }),
  ];
}

function taskCases(cfg: EvalConfig): EvalResult[] {
  const expectedNames = [
    'every-task-gets-done-when-status-est',
    'summary-table-regenerated-between-markers',
    'idempotent-rerun-no-duplicate-table-or-fields',
    'done-when-is-verifiable-not-restated-title',
    'status-values-from-legal-vocabulary',
    'negative-lowercase-markers-are-denied',
  ];
  return [
    runCase(-1, 'eval-manifest-sync', 'manifest', () => [ensureEvalNames(cfg, expectedNames)]),
    runCase(0, expectedNames[0], 'positive', () => {
      const { specDir } = makeTmpSpec('task-board', { 'TASKS.md': tasksDoc() });
      const tasks = fs.readFileSync(path.join(specDir, 'TASKS.md'), 'utf-8');
      return [
        cliPass('tasks', path.join(specDir, 'TASKS.md')),
        guardAllows(path.join(specDir, 'TASKS.md'), tasks, 'task-form-guard'),
      ];
    }),
    runCase(1, expectedNames[1], 'summary-table', () => {
      const tasks = tasksDoc();
      return [
        okCheck('summary table is bounded by regeneration markers', tasks.includes('auto-generated by spec-status.ts -Format task-table') && tasks.includes('<!-- end auto-generated -->'), 'both auto-generated markers present', tasks),
      ];
    }),
    runCase(2, expectedNames[2], 'idempotency', () => {
      const tasks = tasksDoc();
      return [
        okCheck('Done When marker is not duplicated', countMatches(tasks, /\*\*Done When:\*\*/g) === 1, 'one Done When marker', tasks),
        okCheck('Status tag is not duplicated', countMatches(tasks, /Status:\s*(TODO|READY|IN_PROGRESS|DONE|BLOCKED)/g) === 1, 'one task-body status tag', tasks),
        okCheck('summary block is not duplicated', countMatches(tasks, /auto-generated by spec-status\.ts -Format task-table/g) === 1, 'one summary marker', tasks),
      ];
    }),
    runCase(3, expectedNames[3], 'done-when-quality', () => {
      const tasks = tasksDoc();
      return [
        okCheck('Done When is observable, not a title restatement', /@feature1 scenario passes through the real checkout command/.test(tasks) && !/YAML writer implemented/.test(tasks), 'observable scenario-bound checkbox', tasks),
      ];
    }),
    runCase(4, expectedNames[4], 'status-vocabulary', () => {
      const { specDir } = makeTmpSpec('task-status', { 'TASKS.md': tasksDoc('IN_PROGRESS') });
      return [cliPass('tasks', path.join(specDir, 'TASKS.md'))];
    }),
    runCase(5, expectedNames[5], 'negative', () => {
      const bad = tasksDoc('TODO', { doneWhen: '**done when:**', status: '**status:**' });
      const { specDir } = makeTmpSpec('task-negative', { 'TASKS.md': bad });
      return [
        cliRejects('tasks', path.join(specDir, 'TASKS.md'), /Done When block|Status tag|valid Status value/),
        guardDenies(path.join(specDir, 'TASKS.md'), bad, 'task-form-guard', /Done When block|Status tag|task-form-guard/),
      ];
    }),
  ];
}

function casesForSkill(cfg: EvalConfig): EvalResult[] {
  switch (cfg.skill_name) {
    case 'discovery-forms':
      return discoveryCases(cfg);
    case 'requirements-chk-matrix':
      return requirementsCases(cfg);
    case 'task-board-forms':
      return taskCases(cfg);
    default:
      throw new Error(`Unsupported form-skill eval suite: ${cfg.skill_name}`);
  }
}

export function runFormSkillEvalsCli(options: RunnerOptions): number {
  const cfg = readJson<EvalConfig>(path.join(options.evalsDir, 'evals.json'));
  const iteration = cfg.iteration ?? 1;
  const started = monotonicMs();
  const details = casesForSkill(cfg);
  const failed = details.filter((r) => !r.passed).length;
  const passed = details.length - failed;
  const aggregate: AggregateResult = {
    iteration,
    ran_at: new Date().toISOString(),
    skill_name: cfg.skill_name,
    total: details.length,
    passed,
    failed,
    pass_rate_pct: Math.round((passed / details.length) * 1000) / 10,
    duration_total_ms: monotonicMs() - started,
    details,
  };

  const outDir = path.join(options.evalsDir, 'iterations', `iteration-${iteration}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'aggregate.json'), `${JSON.stringify(aggregate, null, 2)}\n`, 'utf-8');

  if (options.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
  } else {
    process.stdout.write(`${cfg.skill_name}: ${passed}/${details.length} evals passed\n`);
    for (const result of details) {
      process.stdout.write(`- ${result.passed ? 'PASS' : 'FAIL'} ${result.name}\n`);
      for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
    }
  }

  return failed === 0 ? 0 : 1;
}
