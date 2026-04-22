import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import crossSpawn from 'cross-spawn';
import { appPath, runInstaller, setupCleanState, runTsx } from './helpers';

const GUARD_SCRIPT = 'extensions/reqnroll-ce-guard/tools/reqnroll-ce-guard/ce_slash_guard.ts';

interface HookResult {
  status: number;
  stdout: string;
  stderr: string;
  decision?: 'allow' | 'deny';
  reason?: string;
}

function runHook(
  toolName: string,
  toolInput: Record<string, unknown>,
): HookResult {
  const result = runTsx(GUARD_SCRIPT, {
    input: {
      session_id: 'test-session',
      cwd: appPath(),
      tool_name: toolName,
      tool_input: toolInput,
    },
    timeout: 10000,
  });
  const stdout = result.stdout.trim();
  const base: HookResult = {
    status: result.status ?? 1,
    stdout,
    stderr: result.stderr.trim(),
  };
  if (stdout.startsWith('{')) {
    try {
      const parsed = JSON.parse(stdout);
      base.decision = parsed.hookSpecificOutput?.permissionDecision;
      base.reason = parsed.hookSpecificOutput?.permissionDecisionReason;
    } catch { /* fail-open parse */ }
  }
  return base;
}

function runHookRaw(rawStdin: string): HookResult {
  // For invalid JSON tests — bypass runTsx serialization
  const result = crossSpawn.sync('npx', ['tsx', appPath(GUARD_SCRIPT)], {
    input: rawStdin,
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 10000,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

describe('CEGUARD001: Reqnroll CE Slash Guard Hook', () => {
  // ==========================================================================
  // @feature1 — Core violation detection
  // ==========================================================================

  // @feature1
  it('CEGUARD001_01: deny on unescaped `/` in CE pattern without regex markers', () => {
    const result = runHook('Write', {
      file_path: '/tmp/ChannelSteps.cs',
      content: '[When(@"я запрашиваю GET /v1/models")]\npublic void Method() {}',
    });
    expect(result.status).toBe(2);
    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/line 1/);
    expect(result.reason).toMatch(/When/);
    // Both fix options must be present in the deny message
    expect(result.reason).toMatch(/\^\$/);
    expect(result.reason).toMatch(/\\\//);
  });

  // @feature1
  it('CEGUARD001_02: deny on multiple violations — both lines reported', () => {
    const result = runHook('Write', {
      file_path: '/tmp/Multi.cs',
      content:
        '[When(@"запрос через /v1/models")]\n' +
        'public void A() {}\n' +
        '[Then(@"курс USD/RUB корректен")]\n' +
        'public void B() {}\n',
    });
    expect(result.status).toBe(2);
    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/2 violation\(s\)/);
    expect(result.reason).toMatch(/line 1/);
    expect(result.reason).toMatch(/line 3/);
  });

  // @feature1
  it('CEGUARD001_03: deny via Edit tool checks `new_string`, not `old_string`', () => {
    const result = runHook('Edit', {
      file_path: '/tmp/X.cs',
      old_string: 'public void Foo() {}',
      new_string: '[Then(@"курс USD/RUB корректен")]\npublic void Foo() {}',
    });
    expect(result.status).toBe(2);
    expect(result.decision).toBe('deny');
  });

  // ==========================================================================
  // @feature2 — Regex detection: allow when pattern has regex metacharacters
  // ==========================================================================

  // @feature2
  it('CEGUARD001_04: allow when pattern contains `(.*)` regex capture group', () => {
    const result = runHook('Write', {
      file_path: '/tmp/X.cs',
      content: '[When(@"модель ""(.*)"" через /v1/models")]',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  // @feature2
  it('CEGUARD001_05: allow when pattern is anchored with `^` and `$`', () => {
    const result = runHook('Write', {
      file_path: '/tmp/X.cs',
      content: '[When(@"^я запрашиваю GET /v1/models$")]',
    });
    expect(result.status).toBe(0);
  });

  // @feature2
  it('CEGUARD001_06: allow when pattern contains `\\d` shorthand', () => {
    const result = runHook('Write', {
      file_path: '/tmp/X.cs',
      content: '[When(@"запрос № \\d+ через /v1")]',
    });
    expect(result.status).toBe(0);
  });

  // @feature2
  it('CEGUARD001_07: allow when pattern contains `[0-9]` character class', () => {
    const result = runHook('Write', {
      file_path: '/tmp/X.cs',
      content: '[When(@"код [0-9]+ для /path")]',
    });
    expect(result.status).toBe(0);
  });

  // ==========================================================================
  // @feature3 — CE escape: allow when `/` is properly escaped
  // ==========================================================================

  // @feature3
  it('CEGUARD001_08: allow when `/` is escaped as `\\/` in CE pattern', () => {
    const result = runHook('Write', {
      file_path: '/tmp/X.cs',
      content: '[When(@"я запрашиваю GET \\/v1\\/models")]',
    });
    expect(result.status).toBe(0);
  });

  // ==========================================================================
  // @feature4 — Scope: only relevant tools and files
  // ==========================================================================

  // @feature4
  it('CEGUARD001_09: skip non-`.cs` files even with matching content', () => {
    const result = runHook('Write', {
      file_path: '/tmp/X.ts',
      content: 'const bad = `[When(@"/v1/models")]`;',
    });
    expect(result.status).toBe(0);
  });

  // @feature4
  it('CEGUARD001_10: skip `.cs` files without any step definition attributes', () => {
    const result = runHook('Write', {
      file_path: '/tmp/Plain.cs',
      content: 'public class Foo { public void Bar() { /* url: /v1/models */ } }',
    });
    expect(result.status).toBe(0);
  });

  // @feature4
  it('CEGUARD001_11: skip non-Write/Edit tools (Bash, Read, etc.)', () => {
    const result = runHook('Bash', { command: 'curl /v1/models' });
    expect(result.status).toBe(0);
  });

  // ==========================================================================
  // @feature5 — Resilience: fail-open on unexpected input
  // ==========================================================================

  // @feature5
  it('CEGUARD001_12: fail-open on invalid JSON input', () => {
    const result = runHookRaw('{not valid json{{{');
    expect(result.status).toBe(0);
  });

  // ==========================================================================
  // @feature6 — Installer integration
  // ==========================================================================

  // @feature6
  describe('Installer integration', () => {
    beforeAll(async () => {
      await setupCleanState('claude');
      const { exitCode } = await runInstaller('--claude --all');
      expect(exitCode).toBe(0);
    }, 90000);

    // @feature6
    it('CEGUARD001_13: installer registers hook in claude settings with matcher "Write|Edit"', () => {
      const settingsPath = appPath('.claude/settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);
      const settings = fs.readJsonSync(settingsPath);
      const preToolUse = settings?.hooks?.PreToolUse ?? [];
      const entry = Array.isArray(preToolUse)
        ? preToolUse.find((h: { matcher?: string; hooks?: Array<{ command?: string }> }) =>
            h.hooks?.some((hh) => hh.command?.includes('reqnroll-ce-guard')),
          )
        : undefined;
      expect(entry, 'PreToolUse entry for reqnroll-ce-guard missing').toBeDefined();
      expect(entry?.matcher).toBe('Write|Edit');
    });

    // @feature6
    it('CEGUARD001_14: installer copies rule file to .claude/rules/', () => {
      const ruleFile = appPath('.claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md');
      expect(fs.existsSync(ruleFile), `rule file missing: ${ruleFile}`).toBe(true);
      const content = fs.readFileSync(ruleFile, 'utf-8');
      expect(content).toMatch(/Cucumber Expression/);
      expect(content).toMatch(/Alternative may not be empty/);
    });

    // @feature6
    it('CEGUARD001_15: installer copies hook script to .dev-pomogator/tools/', () => {
      const hookFile = appPath('.dev-pomogator/tools/reqnroll-ce-guard/ce_slash_guard.ts');
      expect(fs.existsSync(hookFile), `hook file missing: ${hookFile}`).toBe(true);
    });
  });
});
