import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../.claude/skills/pomogator-doctor/scripts/engine/index.ts';

// Regression for issue #71: pomogator-doctor crashed on the canonical v2 plugin.json
// shape (skills/commands as arrays of path strings, not { name } objects). C15 threw
// `The "path" argument must be of type string. Received undefined`; C3/C13/C14 reported
// false criticals/warnings because they only knew the v1 installer artefacts.

interface CanonicalOpts {
  skills?: string[]; // skill dir names to create with a SKILL.md
  commands?: string[]; // command basenames to create as <name>.md
  skillsWithoutManifest?: string[]; // dirs under skills/ WITHOUT SKILL.md (support folders)
  skillsPath?: string; // override manifest skills path (to point at a missing dir)
  version?: string;
}

function buildCanonicalProject(opts: CanonicalOpts): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-canonical-'));
  const pluginDir = path.join(root, '.claude-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });

  for (const s of opts.skills ?? []) {
    const dir = path.join(root, '.claude', 'skills', s);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${s}\n`);
  }
  for (const s of opts.skillsWithoutManifest ?? []) {
    fs.mkdirSync(path.join(root, '.claude', 'skills', s), { recursive: true });
  }
  for (const c of opts.commands ?? []) {
    const dir = path.join(root, '.claude', 'commands');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${c}.md`), `# ${c}\n`);
  }

  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'dev-pomogator',
      version: opts.version ?? '2.0.1',
      skills: [opts.skillsPath ?? './.claude/skills'],
      commands: ['./.claude/commands'],
    }),
  );

  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('POMOGATORDOCTOR002 — Canonical v2 plugin manifest (issue #71)', () => {
  let project: { root: string; cleanup: () => void } | null = null;

  beforeEach(() => {
    project = null;
  });
  afterEach(() => {
    project?.cleanup();
  });

  it('POMOGATORDOCTOR002_01: C15 does not crash and reports OK on canonical string-array manifest', async () => {
    project = buildCanonicalProject({ skills: ['create-spec', 'run-tests'], commands: ['reflect'] });
    const report = await runDoctor({ homeDir: project.root, projectRoot: project.root });
    const c15 = report.results.find((r) => r.id === 'C15');
    expect(c15?.message).not.toMatch(/internal error/i);
    expect(c15?.severity).toBe('ok');
    expect(c15?.message).toMatch(/3 declared/); // 2 skills + 1 command
  });

  it('POMOGATORDOCTOR002_02: support folder under skills/ without SKILL.md is not flagged broken', async () => {
    project = buildCanonicalProject({
      skills: ['create-spec'],
      skillsWithoutManifest: ['answer-simple-workspace'],
    });
    const report = await runDoctor({ homeDir: project.root, projectRoot: project.root });
    const c15 = report.results.find((r) => r.id === 'C15');
    expect(c15?.severity).toBe('ok');
    expect(c15?.message).not.toMatch(/answer-simple-workspace/);
  });

  it('POMOGATORDOCTOR002_03: manifest pointing at a missing skills dir reports C15 critical', async () => {
    project = buildCanonicalProject({ skills: ['create-spec'], skillsPath: './.claude/does-not-exist' });
    const report = await runDoctor({ homeDir: project.root, projectRoot: project.root });
    const c15 = report.results.find((r) => r.id === 'C15');
    expect(c15?.severity).toBe('critical');
    expect(c15?.state).toBe('BROKEN-missing');
  });

  it('POMOGATORDOCTOR002_04: canonical install does not false-critical C3/C13/C14', async () => {
    project = buildCanonicalProject({ skills: ['create-spec'], version: '2.0.1' });
    const report = await runDoctor({ homeDir: project.root, projectRoot: project.root });
    const byId = (id: string) => report.results.find((r) => r.id === id);
    // C3: no v1 config.json, but canonical → ok (not critical)
    expect(byId('C3')?.severity).toBe('ok');
    // C14: no managed gitignore block, but canonical → ok (not warning)
    expect(byId('C14')?.severity).toBe('ok');
    // C13: falls back to plugin.json version; package.json read from the doctor's own
    // package may differ, so accept ok OR warning — but never crash/critical-by-missing.
    expect(['ok', 'warning']).toContain(byId('C13')?.severity);
  });
});
