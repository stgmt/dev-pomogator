import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appPath } from './helpers';

const SKILL_PATH = appPath('.claude/skills/claude-in-chrome-multisession/SKILL.md');
const MANIFEST_PATH = appPath('extensions/claude-in-chrome-multisession/extension.json');

describe('PLUGIN018: claude-in-chrome-multisession — SKILL.md + manifest static checks (FR-1, FR-4)', () => {
  // @feature4 — FR-4: SKILL.md frontmatter
  it('PLUGIN018: SKILL.md frontmatter has correct name and allowed-tools', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf-8');
    const fm = content.match(/^---\n([\s\S]+?)\n---/);
    expect(fm, 'SKILL.md must have frontmatter').not.toBeNull();
    expect(fm![1]).toMatch(/^\s*name:\s*claude-in-chrome-multisession\s*$/m);
    expect(fm![1]).toMatch(/allowed-tools:\s*[^\n]*mcp__claude-in-chrome__/);
    expect(fm![1]).toMatch(/allowed-tools:\s*[^\n]*Bash/);
    expect(fm![1]).toMatch(/allowed-tools:\s*[^\n]*Read/);
  });

  // @feature4 — FR-4: SKILL.md must have all 9 mandatory sections
  it('PLUGIN018: SKILL.md body contains 9 mandatory section headings', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf-8');
    const required = [
      '## Mission',
      '## Architecture',
      '## Triggers',
      '## Protocol',
      '## Hard rules',
      '## When NOT to use',
      '## Compatibility',
      '## Verification',
      '## State files',
    ];
    for (const heading of required) {
      expect(content).toContain(heading);
    }
  });

  // @feature4 — FR-4: Triggers contain ≥8 keywords + Russian
  it('PLUGIN018: SKILL.md Triggers section has ≥8 keywords including required ones', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf-8');
    const m = content.match(/## Triggers\n([\s\S]+?)(?=\n## )/);
    expect(m, 'Triggers section not found').not.toBeNull();
    const triggers = m![1].toLowerCase();

    for (const kw of ['navigate', 'screenshot', 'console']) {
      expect(triggers).toContain(kw);
    }

    // ≥2 Russian phrases
    const russianMatches = triggers.match(/[а-яё]+/gi);
    expect(russianMatches?.length ?? 0).toBeGreaterThanOrEqual(2);

    // Rough keyword density: count bullet items
    const bullets = m![1].split('\n').filter((l) => l.trim().startsWith('-'));
    const tokenCount = bullets.reduce(
      (acc, line) => acc + (line.match(/[a-zа-я"`]+/gi)?.length ?? 0),
      0,
    );
    expect(tokenCount).toBeGreaterThanOrEqual(8);
  });

  // @feature4 — FR-4: Protocol section has 4 numbered/labeled steps
  it('PLUGIN018: SKILL.md Protocol section describes 4 steps', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf-8');
    const m = content.match(/## Protocol[^\n]*\n([\s\S]+?)(?=\n## )/);
    expect(m, 'Protocol section not found').not.toBeNull();
    const block = m![1];
    expect(block).toMatch(/Step 1/i);
    expect(block).toMatch(/Step 2/i);
    expect(block).toMatch(/Step 3/i);
    expect(block).toMatch(/Step 4/i);
    expect(block).toContain('tabs_create_mcp');
    expect(block).toContain('tabs_context_mcp');
    expect(block).toContain('claim-tab.mjs');
  });

  // @feature3 — FR-1: extension.json manifest sanity
  it('PLUGIN018: extension.json manifest has required fields', () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(m.name).toBe('claude-in-chrome-multisession');
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(m.platforms).toEqual(['claude']);
    expect(m.tools?.['claude-in-chrome-multisession']).toBe('tools/claude-in-chrome-multisession');
    expect(m.toolFiles?.['claude-in-chrome-multisession']).toEqual(
      expect.arrayContaining([
        '.dev-pomogator/tools/claude-in-chrome-multisession/cims-guard.ts',
        '.dev-pomogator/tools/claude-in-chrome-multisession/claim-tab.mjs',
      ]),
    );
    expect(m.skills?.['claude-in-chrome-multisession']).toBe(
      '.claude/skills/claude-in-chrome-multisession',
    );
    expect(m.skillFiles?.['claude-in-chrome-multisession']).toEqual([
      '.claude/skills/claude-in-chrome-multisession/SKILL.md',
    ]);
  });

  // @feature3 — FR-9: extension.json hooks declaration (format 2 — object with matcher+command)
  it('PLUGIN018: extension.json declares PreToolUse + PostToolUse hooks for mcp__claude-in-chrome__.*', () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const pre = m.hooks?.claude?.PreToolUse;
    const post = m.hooks?.claude?.PostToolUse;
    expect(pre?.matcher).toBe('mcp__claude-in-chrome__.*');
    expect(pre?.command).toContain('cims-guard.ts');
    expect(post?.matcher).toBe('mcp__claude-in-chrome__.*');
    expect(post?.command).toContain('cims-guard.ts');
  });

  // FR-1: skillFiles paths exist on disk
  it('PLUGIN018: manifest skillFiles paths exist on disk', () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const skillFiles: string[] = m?.skillFiles?.['claude-in-chrome-multisession'] ?? [];
    expect(skillFiles.length).toBeGreaterThan(0);
    for (const rel of skillFiles) {
      expect(fs.existsSync(path.join(appPath(), rel))).toBe(true);
    }
  });

  // FR-10: README references upstream issues
  it('PLUGIN018: extension README references ≥3 Anthropic upstream issues', () => {
    const readme = fs.readFileSync(
      appPath('extensions/claude-in-chrome-multisession/README.md'),
      'utf-8',
    );
    const issues = ['#15173', '#15193', '#20100', '#26120', '#39637'];
    const matchedIssues = issues.filter((i) => readme.includes(i));
    expect(matchedIssues.length).toBeGreaterThanOrEqual(3);
  });
});
