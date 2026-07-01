// Tests for the migrate-v3-to-v4 CLI run() entry.
//
// Three contracts pinned:
//   1. --suggest-only prints diff + leaves files byte-stable on disk
//   2. default mode writes the converted body atomically + bumps
//      .specs/.progress.json::version 3 → 4 when at least one heading
//      converts
//   3. an already-v4 repo is a no-op (idempotent re-run)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { run, parseArgs, dispatch, runInteractive, predictFeatureTags, type InteractivePrompt } from '../cli.ts';
import { promptApplyTimeout } from '../interactive.ts';

/** An input source that never yields — only the prompt's timer can resolve. */
const idleInput: AsyncIterable<string> = {
  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    await new Promise(() => {});
  },
};

/** A single-line input source (drives the real `promptApplyTimeout` parser). */
function lineInput(line: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<string> {
      yield line;
    },
  };
}

function seedV3Repo(root: string): void {
  fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
  fs.mkdirSync(path.join(root, '.specs', 'billing'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.specs/auth/FR.md'),
    [
      '### Requirement: FR-001 Login flow',
      '',
      '_Jira: AUTH-1_',
      '',
      'Body.',
      '',
      '### Requirement: FR-002 Logout',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(root, '.specs/billing/FR.md'),
    '### Requirement: FR-010 Invoice\n',
  );
  fs.mkdirSync(path.join(root, '.specs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.specs/.progress.json'), JSON.stringify({ version: 3 }));
}

describe('run — --suggest-only mode', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-suggest-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    seedV3Repo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('lists every legacy heading + does NOT modify files', () => {
    const before = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    const r = run({ repoRoot: root, suggestOnly: true });
    expect(r.totalHeadingsConverted).toBe(3);
    expect(r.files.some((f) => f.applied)).toBe(false);
    // Source unchanged.
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toBe(before);
    // Diff visible in output.
    expect(r.text).toContain('## FR-001');
    expect(r.text).toContain('## FR-010');
  });

  it('never bumps .progress.json in suggest-only mode', () => {
    run({ repoRoot: root, suggestOnly: true });
    const p = JSON.parse(fs.readFileSync(path.join(root, '.specs/.progress.json'), 'utf8')) as {
      version: number;
    };
    expect(p.version).toBe(3);
  });
});

describe('run — default mode (apply)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-apply-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    seedV3Repo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('rewrites files to v4 form + bumps version 3 → 4', () => {
    const r = run({ repoRoot: root, suggestOnly: false });
    expect(r.totalHeadingsConverted).toBe(3);
    expect(r.versionBumped).toBe(true);
    const auth = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    expect(auth).toContain('### FR-001: Login flow');
    expect(auth).toContain('### FR-002: Logout');
    expect(auth).not.toContain('Requirement: FR-001');
    const p = JSON.parse(fs.readFileSync(path.join(root, '.specs/.progress.json'), 'utf8')) as {
      version: number;
    };
    expect(p.version).toBe(4);
  });

  it('preserves Jira trace lines + body content byte-for-byte', () => {
    run({ repoRoot: root, suggestOnly: false });
    const auth = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    expect(auth).toContain('_Jira: AUTH-1_');
    expect(auth).toContain('Body.');
  });

  it('idempotent — second run is a zero-conversion no-op', () => {
    run({ repoRoot: root, suggestOnly: false });
    const second = run({ repoRoot: root, suggestOnly: false });
    expect(second.totalHeadingsConverted).toBe(0);
    expect(second.versionBumped).toBe(false);
  });

  it('limits scope when --slug is supplied', () => {
    const r = run({ repoRoot: root, suggestOnly: false, slugs: ['billing'] });
    expect(r.totalHeadingsConverted).toBe(1);
    // auth/FR.md untouched.
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toContain(
      'Requirement: FR-001',
    );
  });
});

// ─── dispatch routing (SPECGEN004_25 — no-flag → interactive) ───────────
describe('dispatch — mode routing', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-dispatch-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    seedV3Repo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('no-flag → interactive: the per-file prompt IS consulted (not auto-apply)', async () => {
    const seen: string[] = [];
    const prompt: InteractivePrompt = async (ctx) => {
      seen.push(ctx.file);
      return { decision: 'skip', timedOut: false };
    };
    const r = await dispatch({ repoRoot: root, suggestOnly: false }, { prompt });
    // The prompt was asked about every changed file — interactive routing fired.
    expect(seen.length).toBeGreaterThan(0);
    // All skipped → nothing written, no version bump.
    expect(r.files.some((f) => f.applied)).toBe(false);
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toContain(
      'Requirement: FR-001',
    );
    expect(r.versionBumped).toBe(false);
  });

  it('--yes → non-interactive auto-apply: the prompt is NEVER consulted', async () => {
    let called = false;
    const prompt: InteractivePrompt = async (ctx) => {
      called = true;
      return { decision: 'skip', timedOut: false, rawInput: ctx.file };
    };
    const r = await dispatch({ repoRoot: root, suggestOnly: false, yes: true }, { prompt });
    expect(called).toBe(false);
    expect(r.versionBumped).toBe(true);
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toContain('### FR-001:');
  });

  it('--suggest-only → dry-run: prompt never consulted, files byte-stable', async () => {
    let called = false;
    const prompt: InteractivePrompt = async () => {
      called = true;
      return { decision: 'apply', timedOut: false };
    };
    const before = fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8');
    await dispatch({ repoRoot: root, suggestOnly: true }, { prompt });
    expect(called).toBe(false);
    expect(fs.readFileSync(path.join(root, '.specs/auth/FR.md'), 'utf8')).toBe(before);
  });
});

// ─── runInteractive (SPECGEN004_25 — 30s default-skip timeout) ──────────
describe('runInteractive — per-file decision (SPECGEN004_25)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-interactive-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
    seedV3Repo(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('timeout → skip leaves the file unchanged AND proceeds to the next file', async () => {
    const authPath = path.join(root, '.specs/auth/FR.md');
    const billingPath = path.join(root, '.specs/billing/FR.md');
    const authBefore = fs.readFileSync(authPath, 'utf8');

    // The ambiguous file (auth) times out via the REAL prompt timer; the next
    // file (billing) is applied through the REAL parser on an "apply" line.
    const prompt: InteractivePrompt = (ctx) =>
      ctx.file.includes('auth')
        ? promptApplyTimeout({ input: idleInput, write: () => {}, timeoutMs: 15, context: ctx })
        : promptApplyTimeout({ input: lineInput('apply'), write: () => {}, timeoutMs: 5_000, context: ctx });

    const r = await runInteractive({ repoRoot: root, suggestOnly: false }, prompt);

    const auth = r.files.find((f) => f.file.includes('auth'));
    const billing = r.files.find((f) => f.file.includes('billing'));

    // Ambiguous file: timed-out → default skip → byte-stable on disk.
    expect(auth?.decision).toBe('skip');
    expect(auth?.timedOut).toBe(true);
    expect(auth?.applied).toBe(false);
    expect(fs.readFileSync(authPath, 'utf8')).toBe(authBefore);

    // Loop proceeded to the next file (billing was visited + applied).
    expect(billing).toBeDefined();
    expect(billing?.applied).toBe(true);
    expect(fs.readFileSync(billingPath, 'utf8')).toContain('### FR-010: Invoice');

    // Version bumped because at least one file was actually applied.
    expect(r.versionBumped).toBe(true);
  });

  it('skipping every file leaves the version unbumped', async () => {
    const prompt: InteractivePrompt = (ctx) =>
      promptApplyTimeout({ input: idleInput, write: () => {}, timeoutMs: 15, context: ctx });
    const r = await runInteractive({ repoRoot: root, suggestOnly: false }, prompt);
    expect(r.files.every((f) => !f.changed || f.timedOut === true)).toBe(true);
    expect(r.files.some((f) => f.applied)).toBe(false);
    expect(r.versionBumped).toBe(false);
  });
});

describe('parseArgs', () => {
  it('default is apply mode against cwd', () => {
    const a = parseArgs([]);
    expect(a.suggestOnly).toBe(false);
    expect(a.repoRoot).toBe(process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd());
  });
  it('--suggest-only flips to dry-run', () => {
    expect(parseArgs(['--suggest-only']).suggestOnly).toBe(true);
  });
  it('--yes flips to non-interactive auto-apply', () => {
    expect(parseArgs(['--yes']).yes).toBe(true);
    expect(parseArgs(['-y']).yes).toBe(true);
  });
  it('--root overrides repoRoot', () => {
    expect(parseArgs(['--root', '/x/y']).repoRoot).toBe('/x/y');
  });
  it('--slug accumulates into an array', () => {
    expect(parseArgs(['--slug', 'a', '--slug', 'b']).slugs).toEqual(['a', 'b']);
  });
  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--wat'])).toThrow(/unknown flag/);
  });
});

// ─── FR-11 tag prediction wired through the CLI (integration) ────────────
describe('predictFeatureTags — CLI tag prediction (FR-11)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `migrate-tags-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.specs/auth/FR.md'),
      '## FR-001: User login and authentication\nThe system SHALL allow a user to login with email and password.\n## FR-002: Export report to PDF\nGenerate a PDF export of the dashboard.\n',
    );
    fs.writeFileSync(
      path.join(root, '.specs/auth/auth.feature'),
      'Feature: auth\n\n  Scenario: User logs in\n    Given the login page\n\n  @FR-002\n  Scenario: Export the report\n    Given a dashboard\n',
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('suggests @FR-001 for the untagged scenario and skips the tagged one', () => {
    const { text, suggested } = predictFeatureTags(root);
    expect(suggested).toBe(1);
    expect(text).toContain('User logs in');
    expect(text).toContain('@FR-001');
    expect(text).not.toContain('Export the report'); // already @FR-002 → omitted
  });

  it('surfaces tag suggestions in a --suggest-only run without writing tags', () => {
    const before = fs.readFileSync(path.join(root, '.specs/auth/auth.feature'), 'utf8');
    const r = run({ repoRoot: root, suggestOnly: true });
    expect(r.text).toContain('"User logs in" → @FR-001');
    expect(r.text).toContain('#   tag suggestions:        1');
    // advisory only — the .feature is byte-stable (no tag auto-written).
    expect(fs.readFileSync(path.join(root, '.specs/auth/auth.feature'), 'utf8')).toBe(before);
  });
});
