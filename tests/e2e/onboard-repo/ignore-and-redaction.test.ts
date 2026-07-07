/**
 * Phase 10 Green tests: ignore parser + secret redaction (@feature2 + NFR-S1).
 * Covers: ONBOARD028 (cursorignore respected), FR-17 aggregated ignore, NFR-S1 pre-write guard.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { runBeforeEach, type BeforeEachContext } from './hooks/before-each.ts';
import { runAfterEach } from './hooks/after-each.ts';
import {
  loadIgnoreMatcher,
  parsePatternLines,
  normalizePath,
  ALWAYS_EXCLUDE_PATTERNS,
  SUPPORTED_IGNORE_FILES,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/ignore-parser.ts';
import {
  detectSecrets,
  redactSecrets,
  assertNoSecretsInContent,
  assertNoSecretsInObject,
  SecretLeakageError,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/secret-redaction.ts';
import { finalize } from '../../../extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts';
import type {
  ParallelReconOutput,
  Phase0State,
  BaselineTestResult,
  CommandBlock,
} from '../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


function fakeRecon(): ParallelReconOutput {
  return {
    subagent_A_manifest_env: {
      manifests_found: ['pyproject.toml'],
      languages: [{ name: 'python', version: '3.11+', usage: 'all' }],
      frameworks: [{ name: 'FastAPI', version: '0.110', role: 'web framework' }],
      package_managers: ['uv'],
      env_files: ['.env.example'],
      required_env_vars: [],
      ci_configs: [],
    },
    subagent_B_tests_configs: {
      test_framework: 'pytest',
      test_commands: ['uv run pytest'],
      bdd_present: false,
      existing_ai_configs: [],
    },
    subagent_C_entry_points: {
      entry_points: [{ file: 'src/main.py', role: 'entry' }],
      top_level_dirs: ['src'],
      architecture_hint: 'layered FastAPI',
    },
  };
}


function makeBaseCtx(tmpdir: string, gitSha = '0000000000000000000000000000000000000000') {
  const state: Phase0State = {
    slug: 'test',
    projectPath: tmpdir,
    gitSha,
    gitAvailable: true,
    archetype: { archetype: 'python-api', confidence: 'high', evidence: 'pyproject.toml' },
    recon: fakeRecon(),
    scratch_used: false,
    warnings: [],
    startedAt: Date.now() - 5_000,
  };
  const baseline: BaselineTestResult = {
    framework: 'pytest',
    command: 'uv run pytest',
    via_skill: 'run-tests',
    passed: 10,
    failed: 0,
    skipped: 0,
    duration_s: 1.5,
    failed_test_ids: [],
    reason_if_null: null,
    skipped_by_user: false,
  };
  const commands: Record<string, CommandBlock> = {
    test: {
      via_skill: 'run-tests',
      preferred_invocation: '/run-tests',
      fallback_cmd: 'uv run pytest',
      raw_pattern_to_block: '^pytest',
      forbidden_if_skill_present: true,
      reason: 'test wrapper',
    },
  };
  return {
    state,
    baseline,
    commands,
    projectName: 'test-proj',
    projectPurpose: 'Minimal fixture',
    projectDomainProblem: 'Phase 10 ignore+redaction tests',
  };
}


describe('Phase 10: ignore-parser (FR-17, AC-17)', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // --- helpers ---
  describe('helpers', () => {
    it('parsePatternLines strips comments and empty lines', () => {
      const content = '# comment\n\n*.env\n\n  # indented comment\nfoo/\n';
      const parsed = parsePatternLines(content);
      expect(parsed).toEqual(['*.env', 'foo/']);
    });

    it('normalizePath converts backslashes and strips ./ prefix', () => {
      expect(normalizePath('src\\main.py')).toBe('src/main.py');
      expect(normalizePath('./src/main.py')).toBe('src/main.py');
      expect(normalizePath('src/main.py')).toBe('src/main.py');
    });

    it('SUPPORTED_IGNORE_FILES includes gitignore, cursorignore, aiderignore', () => {
      expect(SUPPORTED_IGNORE_FILES).toEqual(['.gitignore', '.cursorignore', '.aiderignore']);
    });

    it('ALWAYS_EXCLUDE_PATTERNS covers env/secrets/keys', () => {
      expect(ALWAYS_EXCLUDE_PATTERNS).toContain('.env');
      expect(ALWAYS_EXCLUDE_PATTERNS.some((p) => p.includes('*.pem'))).toBe(true);
      expect(ALWAYS_EXCLUDE_PATTERNS.some((p) => p.includes('credentials'))).toBe(true);
    });
  });

  // --- ONBOARD028 ---
  it('ONBOARD028: .cursorignore patterns excluded from AI scans', async () => {
    ctx = await runBeforeEach('fake-with-cursorignore');

    const matcher = await loadIgnoreMatcher(ctx.tmpdir);

    expect(matcher.externalConfigsFound).toContain('.cursorignore');
    expect(matcher.isIgnored('secrets/key.json')).toBe(true);
    expect(matcher.isIgnored('src/main.py')).toBe(false);
    expect(matcher.userExcludedPaths).toContain('secrets/**');
  });

  // --- FR-17 aggregation ---
  it('aggregates .gitignore + .cursorignore + .aiderignore patterns', async () => {
    ctx = await runBeforeEach('fake-python-api');

    await fsExtra.writeFile(path.join(ctx.tmpdir, '.cursorignore'), 'secrets/**\n');
    await fsExtra.writeFile(path.join(ctx.tmpdir, '.aiderignore'), 'private/**\n');

    const matcher = await loadIgnoreMatcher(ctx.tmpdir);

    expect(matcher.externalConfigsFound).toEqual(expect.arrayContaining(['.gitignore', '.cursorignore', '.aiderignore']));
    expect(matcher.isIgnored('secrets/x.txt')).toBe(true);
    expect(matcher.isIgnored('private/notes.md')).toBe(true);
    expect(matcher.isIgnored('src/main.py')).toBe(false);
  });

  // --- NFR-S3 always-exclude baseline regardless of ignore files ---
  it('NFR-S3: always-exclude patterns work even without any ignore file', async () => {
    ctx = await runBeforeEach('fake-python-api');
    await fsExtra.remove(path.join(ctx.tmpdir, '.gitignore'));

    const matcher = await loadIgnoreMatcher(ctx.tmpdir, { files: [] });

    expect(matcher.externalConfigsFound).toEqual([]);
    expect(matcher.isIgnored('.env')).toBe(true);
    expect(matcher.isIgnored('config/prod.pem')).toBe(true);
    expect(matcher.isIgnored('aws/credentials')).toBe(true);
    expect(matcher.isIgnored('src/main.py')).toBe(false);
  });

  // --- extraPatterns option ---
  it('extraPatterns option adds programmatic excludes', async () => {
    ctx = await runBeforeEach('fake-python-api');

    const matcher = await loadIgnoreMatcher(ctx.tmpdir, { extraPatterns: ['custom-secret/**'] });
    expect(matcher.isIgnored('custom-secret/x.txt')).toBe(true);
  });

  // --- filter() helper ---
  it('filter() returns subset of paths that passed the matcher', async () => {
    ctx = await runBeforeEach('fake-with-cursorignore');

    const matcher = await loadIgnoreMatcher(ctx.tmpdir);
    const passed = matcher.filter(['src/main.py', 'secrets/key.json', 'README.md', '.env']);

    expect(passed).toContain('src/main.py');
    expect(passed).toContain('README.md');
    expect(passed).not.toContain('secrets/key.json');
    expect(passed).not.toContain('.env');
  });
});


describe('Phase 10: secret-redaction (NFR-S1)', () => {
  describe('detectSecrets', () => {
    it('detects OpenAI sk- key', () => {
      const hits = detectSecrets('config = { key: "sk-abcd1234efgh5678ijkl9012mnop3456qrst" }');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].pattern).toBe('openai-api-key');
      expect(hits[0].severity).toBe('critical');
    });

    it('detects GitHub PAT', () => {
      const hits = detectSecrets('token: ghp_1234567890abcdefghijklmnopqrstuvwxyz12');
      expect(hits[0].pattern).toBe('github-pat');
      expect(hits[0].severity).toBe('critical');
    });

    it('detects AWS access key', () => {
      const hits = detectSecrets('AKIAIOSFODNN7EXAMPLE');
      expect(hits[0].pattern).toBe('aws-access-key');
    });

    it('detects Slack bot token', () => {
      const hits = detectSecrets('xoxb-1234567890-abcdefghij');
      expect(hits[0].pattern).toBe('slack-token');
    });

    it('detects Anthropic key', () => {
      const hits = detectSecrets('sk-ant-api03-abcd1234efgh5678');
      expect(hits[0].pattern).toBe('anthropic-api-key');
    });

    it('detects Google OAuth token', () => {
      const hits = detectSecrets('ya29.a0AfH6SMB1234567890abcdefghij');
      expect(hits[0].pattern).toBe('google-oauth');
    });

    it('detects JWT', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const hits = detectSecrets(jwt);
      expect(hits[0].pattern).toBe('jwt');
    });

    it('ignores non-secret text', () => {
      const hits = detectSecrets('just normal prose about an API key concept');
      expect(hits).toEqual([]);
    });

    it('ignores env var NAMES (not values)', () => {
      const hits = detectSecrets('required: AUTO_COMMIT_API_KEY, DATABASE_URL, JWT_SECRET');
      expect(hits).toEqual([]);
    });

    it('detects multiple secrets в одном тексте', () => {
      const content = 'sk-abcd1234efgh5678ijkl9012mnop3456qrst + ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl';
      const hits = detectSecrets(content);
      expect(hits.length).toBe(2);
      expect(hits.map((h) => h.pattern)).toEqual(expect.arrayContaining(['openai-api-key', 'github-pat']));
    });
  });

  describe('redactSecrets', () => {
    it('replaces secret with [REDACTED:<pattern>]', () => {
      const { redacted, hits, hasCritical } = redactSecrets('key: sk-abcd1234efgh5678ijkl9012mnop3456qrst, user: alice');
      expect(redacted).toContain('[REDACTED:openai-api-key]');
      expect(redacted).toContain('user: alice');
      expect(hits.length).toBe(1);
      expect(hasCritical).toBe(true);
    });

    it('no-op for clean content', () => {
      const result = redactSecrets('just prose');
      expect(result.redacted).toBe('just prose');
      expect(result.hits).toEqual([]);
      expect(result.hasCritical).toBe(false);
    });

    it('handles empty/null/non-string gracefully', () => {
      expect(redactSecrets('').redacted).toBe('');
      expect(redactSecrets(null as unknown as string).hits).toEqual([]);
    });
  });

  describe('assertNoSecretsInContent / InObject', () => {
    it('throws SecretLeakageError on critical leak', () => {
      expect(() => assertNoSecretsInContent('sk-abcd1234efgh5678ijkl9012mnop3456qrst')).toThrow(SecretLeakageError);
    });

    it('allows high-severity but не critical (JWT) через', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(() => assertNoSecretsInContent(jwt)).not.toThrow();
    });

    it('context prefix appears в error message', () => {
      try {
        assertNoSecretsInContent('sk-abcd1234efgh5678ijkl9012mnop3456qrst', 'test-context');
        expect.fail('should throw');
      } catch (err) {
        expect((err as Error).message).toContain('test-context');
      }
    });

    it('assertNoSecretsInObject serializes before scan', () => {
      const obj = { key: 'sk-abcd1234efgh5678ijkl9012mnop3456qrst' };
      expect(() => assertNoSecretsInObject(obj)).toThrow(SecretLeakageError);
    });

    it('SecretLeakageError exposes hits array', () => {
      try {
        assertNoSecretsInContent('sk-abcd1234efgh5678ijkl9012mnop3456qrst');
        expect.fail('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(SecretLeakageError);
        expect((err as SecretLeakageError).hits.length).toBe(1);
        expect((err as SecretLeakageError).hits[0].pattern).toBe('openai-api-key');
      }
    });
  });
});


describe('Phase 10: finalize integrates secret guard', () => {
  let ctx: BeforeEachContext;

  afterEach(async () => {
    if (ctx) await runAfterEach(ctx);
  });

  // NFR-S1 guard — Phase 0 aborts if secret leaks into rendered artifacts
  it('NFR-S1: finalize aborts if commands.reason contains a secret', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const base = makeBaseCtx(ctx.tmpdir);
    base.commands.test.reason = 'DO NOT CHECK IN: sk-abcd1234efgh5678ijkl9012mnop3456qrst';

    await expect(finalize(base)).rejects.toThrow(SecretLeakageError);

    // .onboarding.json MUST NOT have been written despite validation pass
    const jsonPath = path.join(ctx.tmpdir, '.specs', '.onboarding.json');
    expect(await fsExtra.pathExists(jsonPath)).toBe(false);
  });

  it('clean finalize (no secrets) completes successfully', async () => {
    ctx = await runBeforeEach('fake-python-api');
    const { result } = await finalize(makeBaseCtx(ctx.tmpdir));

    expect(await fsExtra.pathExists(result.jsonPath)).toBe(true);
    const content = await fsExtra.readFile(result.jsonPath, 'utf-8');
    expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });
});
