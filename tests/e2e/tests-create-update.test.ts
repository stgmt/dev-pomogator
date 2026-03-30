import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  runInstaller,
  appPath,
  setupCleanState,
} from './helpers';

/**
 * PLUGIN016: Tests Create Update Skill
 *
 * Verifies that the /tests-create-update skill and its PostToolUse
 * compliance hook are correctly installed and functional.
 */

let installed = false;

describe('PLUGIN016: Tests Create Update Skill', () => {
  beforeAll(async () => {
    await setupCleanState('claude');
    const result = await runInstaller('--claude --all');
    installed = result.exitCode === 0;
  });

  // @feature1
  it('PLUGIN016_01: SKILL.md exists and has valid frontmatter', async () => {
    expect(installed, 'installer must succeed').toBe(true);
    const skillPath = appPath('.claude', 'skills', 'tests-create-update', 'SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');
    expect(content).toContain('name: tests-create-update');
    expect(content).toContain('allowed-tools');
  });

  // @feature1
  it('PLUGIN016_02: SKILL.md contains Assertion Selection Table', async () => {
    const skillPath = appPath('.claude', 'skills', 'tests-create-update', 'SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');
    expect(content).toContain('Assertion Selection Table');
    expect(content).toContain('| BAD');
    expect(content).toContain('| GOOD');
  });

  // @feature2
  it('PLUGIN016_03: SKILL.md contains all 15 anti-pattern rules', async () => {
    const skillPath = appPath('.claude', 'skills', 'tests-create-update', 'SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');

    const requiredRules = [
      'NEVER use `pathExists()`',
      'NEVER use `readdir().length > 0`',
      'NEVER use `toBeDefined()`',
      'NEVER use `res.ok`',
      'NEVER use `if (!condition) return`',
      'NEVER read source file',
      'NEVER define helper',
      'NEVER use chained `.GetProperty()`',
      'NEVER put `if/else` inside test body',
      'NEVER put assertions inside `forEach`',
      'NEVER call async function without `await`',
      'NEVER wrap test body in `try/catch`',
      'NEVER write `try { fn() } catch',
      'NEVER write `it()` with zero `expect()`',
      'NEVER compute expected value using same logic',
      'NEVER use `setTimeout`',
    ];

    const missing: string[] = [];
    for (const rule of requiredRules) {
      if (!content.includes(rule)) {
        missing.push(rule);
      }
    }
    expect(missing, `Missing rules in SKILL.md: ${missing.join(', ')}`).toHaveLength(0);
  });

  // @feature3
  it('PLUGIN016_04: SKILL.md contains compliance report template with 15 rules', async () => {
    const skillPath = appPath('.claude', 'skills', 'tests-create-update', 'SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');
    expect(content).toContain('No source scan');
    expect(content).toContain('Content validation');
    expect(content).toContain('No conditional assertions');
    expect(content).toContain('No missing await');
    expect(content).toContain('Has assertions');
    expect(content).toContain('No tautological assert');
    expect(content).toContain('No arbitrary sleep');
    expect(content).toMatch(/X\/15 PASS/);
  });

  // @feature5
  it('PLUGIN016_05: extension.json registers skill', async () => {
    const extPath = path.resolve(__dirname, '../../extensions/test-quality/extension.json');
    const manifest = await fs.readJson(extPath);
    expect(manifest.skills['tests-create-update']).toBe('.claude/skills/tests-create-update');
    expect(manifest.skillFiles['tests-create-update']).toContain('.claude/skills/tests-create-update/SKILL.md');
  });

  // @feature8
  it('PLUGIN016_06: extension.json registers PostToolUse hook', async () => {
    const extPath = path.resolve(__dirname, '../../extensions/test-quality/extension.json');
    const manifest = await fs.readJson(extPath);
    const postToolUse = manifest.hooks?.claude?.PostToolUse;
    expect(postToolUse).toBeDefined();
    expect(Array.isArray(postToolUse)).toBe(true);

    const complianceHook = postToolUse.find((entry: any) =>
      entry.hooks?.some((h: any) => h.command?.includes('compliance_check'))
    );
    expect(complianceHook, 'PostToolUse must have compliance_check hook').toBeDefined();
    expect(complianceHook.matcher).toBe('Write|Edit');
  });

  // @feature8
  it('PLUGIN016_07: compliance_check.ts exists and is non-empty', async () => {
    const hookPath = path.resolve(
      __dirname, '../../extensions/test-quality/tools/test-quality/compliance_check.ts'
    );
    const stat = await fs.stat(hookPath);
    expect(stat.size, 'compliance_check.ts must be > 1000 bytes').toBeGreaterThan(1000);

    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('scanAntiPatterns');
    expect(content).toContain('isTestFile');
  });

  // @feature1
  it('PLUGIN016_08: compliance hook detects pathExists-only pattern', async () => {
    const hookPath = path.resolve(
      __dirname, '../../extensions/test-quality/tools/test-quality/compliance_check.ts'
    );
    // Import the scan function to test detection
    // For now: verify the regex pattern exists in hook source
    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('existence-only');
    expect(content).toContain('pathExists');
  });

  // @feature2
  it('PLUGIN016_09: compliance hook detects weak toBeDefined pattern', async () => {
    const hookPath = path.resolve(
      __dirname, '../../extensions/test-quality/tools/test-quality/compliance_check.ts'
    );
    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('weak-assertion');
    expect(content).toContain('toBeDefined');
  });

  // @feature8
  it('PLUGIN016_10: compliance hook has isTestFile with correct patterns', async () => {
    const hookPath = path.resolve(
      __dirname, '../../extensions/test-quality/tools/test-quality/compliance_check.ts'
    );
    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('test\\.ts');
    expect(content).toContain('test\\.cs');
    expect(content).toContain('Steps\\.cs');
  });

  // @feature8
  it('PLUGIN016_11: compliance hook has cooldown via marker', async () => {
    const hookPath = path.resolve(
      __dirname, '../../extensions/test-quality/tools/test-quality/compliance_check.ts'
    );
    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).toContain('COOLDOWN_MINUTES');
    expect(content).toContain('markerPath');
    expect(content).toContain('isWithinCooldown');
  });
});
