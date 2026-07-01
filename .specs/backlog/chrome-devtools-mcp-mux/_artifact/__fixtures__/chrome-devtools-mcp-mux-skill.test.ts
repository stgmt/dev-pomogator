import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { appPath } from './helpers';

describe('PLUGIN017: chrome-devtools-mcp-mux — skill + manifest static checks', () => {
  // @feature3 — FR-3: SKILL.md DEFAULT directive + 5 mandatory sections
  it('PLUGIN017_04: SKILL.md contains DEFAULT directive and 5 mandatory sections', () => {
    const skillPath = appPath('.claude/skills/chrome-devtools-mcp-mux/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);

    const content = fs.readFileSync(skillPath, 'utf-8');

    // Frontmatter must declare correct name
    const fm = content.match(/^---\n([\s\S]+?)\n---/);
    expect(fm).not.toBeNull();
    expect(fm![1]).toMatch(/^\s*name:\s*chrome-devtools-mcp-mux\s*$/m);

    // DEFAULT phrase (case-insensitive)
    expect(content.toLowerCase()).toContain('first and default');

    // 5 mandatory sections
    const required = ['## Triggers', '## Decision Tree', '## Hard rules', '## Compatibility', '## When NOT to use'];
    for (const heading of required) {
      expect(content).toContain(heading);
    }

    // Triggers section: at least 10 keywords including the four core ones
    const triggersMatch = content.match(/## Triggers\n([\s\S]+?)(?=\n## )/);
    expect(triggersMatch).not.toBeNull();
    const triggersBlock = triggersMatch![1].toLowerCase();
    for (const kw of ['browser', 'screenshot', 'console', 'navigate']) {
      expect(triggersBlock).toContain(kw);
    }
    // Count enumerated bullets / inline keywords (rough heuristic — quoted tokens or list items)
    const triggerLines = triggersBlock.split('\n').filter((l) => l.trim().startsWith('-'));
    const bulletKeywordCount = triggerLines.reduce(
      (acc, line) => acc + (line.match(/[a-zа-я"`]+/gi)?.length ?? 0),
      0,
    );
    expect(bulletKeywordCount).toBeGreaterThanOrEqual(10);

    // Hard rules section forbids vanilla mcp__chrome-devtools-mcp__ when mux is configured
    const hardMatch = content.match(/## Hard rules[^\n]*\n([\s\S]+?)(?=\n## )/);
    expect(hardMatch).not.toBeNull();
    expect(hardMatch![1]).toMatch(/mcp__chrome-devtools-mcp__/);
  });

  // @feature7 — FR-7: extension.json declares exact pinned version
  it('PLUGIN017_10: extension.json declares exact pinned version (no @latest, no semver prefixes)', () => {
    const manifestPath = appPath('extensions/chrome-devtools-mcp-mux/extension.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const args: unknown[] = manifest?.mcpServers?.['chrome-devtools-mcp-mux']?.args;
    expect(Array.isArray(args)).toBe(true);
    const pkgSpec = (args as string[]).find((a) => typeof a === 'string' && a.startsWith('chrome-devtools-mcp-mux@'));
    expect(pkgSpec).toBeDefined();
    expect(pkgSpec!).toMatch(/^chrome-devtools-mcp-mux@\d+\.\d+\.\d+$/);
    expect(pkgSpec!).not.toContain('@latest');
    expect(pkgSpec!).not.toContain('@^');
    expect(pkgSpec!).not.toContain('@~');
  });

  // @feature9 — FR-9 marker: skill body documents first-run browser preference prompt + invokes configure-browser.mjs
  it('PLUGIN017: SKILL.md describes FR-9 first-run prompt + references configure-browser.mjs', () => {
    const skillPath = appPath('.claude/skills/chrome-devtools-mcp-mux/SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    expect(content).toContain('First-run browser preference prompt');
    expect(content).toContain('configure-browser.mjs');
    // Five options A..E referenced
    for (const opt of ['(A)', '(B)', '(C)', '(D)', '(E)']) {
      expect(content).toContain(opt);
    }
    // Marker file path
    expect(content).toContain('.cdmm-browser-choice.json');
  });

  // Sanity check: skill SKILL.md path matches manifest's skillFiles entry
  it('PLUGIN017: manifest skillFiles paths exist on disk (extension-layout rule)', () => {
    const manifest = JSON.parse(
      fs.readFileSync(appPath('extensions/chrome-devtools-mcp-mux/extension.json'), 'utf-8'),
    );
    const skillFiles: string[] = manifest?.skillFiles?.['chrome-devtools-mcp-mux'] ?? [];
    expect(skillFiles.length).toBeGreaterThan(0);
    for (const rel of skillFiles) {
      const abs = path.join(appPath(), rel);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });
});
