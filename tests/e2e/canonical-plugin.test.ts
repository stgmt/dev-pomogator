import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { appPath, readPluginHooks, pluginHookCommands } from './helpers';

/**
 * CANON001: canonical-plugin manifest integrity (drift test) + v1→v2 migration.
 *
 * The three `.claude-plugin/*.json` manifests are maintained BY HAND (there is
 * no build aggregator). This guards the drift that bites: a hook listed in
 * hooks.json whose script was renamed/moved/never-created (or vice-versa).
 *
 * 1:1 with .specs/dev-pomogator-canonical-plugin/dev-pomogator-canonical-plugin.feature:
 *   CANON001_10  manifests valid + required fields            (@feature1)
 *   CANON001_90  every hook command resolves to a tools/ file (@feature9, drift)
 *   CANON001_70  migrate --dry-run detects v1, modifies nothing (@feature7)
 *
 * Real code only: reads the committed manifests via the repo helpers and runs
 * the real migration script via `npx tsx`. No mocks, no inline copies.
 */

/** Extract the `-- "tools/.../script.ext"` argument a hook bootstrap forwards. */
function hookScriptPath(command: string): string | null {
  const m = command.match(/--\s+"([^"]+)"/);
  return m ? m[1] : null;
}

/** Sorted list of relative file paths under dir (to assert "nothing modified"). */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out.sort();
}

describe('CANON001: canonical plugin manifest integrity + migration', () => {
  // @feature1
  it('CANON001_10: plugin/marketplace/hooks manifests are valid with required fields', () => {
    const plugin = fs.readJsonSync(appPath('.claude-plugin', 'plugin.json'));
    for (const k of ['name', 'version', 'description']) {
      expect(plugin[k], `plugin.json missing required field "${k}"`).toBeTruthy();
    }

    const mkt = fs.readJsonSync(appPath('.claude-plugin', 'marketplace.json'));
    expect(mkt.name, 'marketplace.json missing name').toBeTruthy();
    expect(Array.isArray(mkt.plugins), 'marketplace.json plugins must be an array').toBe(true);
    expect(mkt.plugins.length, 'marketplace.json has no plugins').toBeGreaterThan(0);

    const hooks = readPluginHooks();
    expect(Object.keys(hooks).length, 'hooks.json declares no events').toBeGreaterThan(0);
  });

  // @feature1 — component fields MUST be arrays, not strings.
  // A bare string passes `claude plugin marketplace validate` but makes
  // `claude plugin install` fail ("skills/commands/hooks/mcpServers: Invalid input"),
  // so the plugin would never install for users. Verified against claude 2.1.152.
  // See .claude/skills/verify-plugin-install/SKILL.md.
  it('CANON001_11: plugin.json component fields are arrays (claude plugin install schema)', () => {
    const plugin = fs.readJsonSync(appPath('.claude-plugin', 'plugin.json'));
    for (const k of ['skills', 'commands', 'hooks', 'mcpServers']) {
      if (plugin[k] === undefined) continue; // optional — auto-discovery if omitted
      expect(
        Array.isArray(plugin[k]),
        `plugin.json "${k}" must be an array of path strings (a bare string fails \`claude plugin install\`)`,
      ).toBe(true);
    }
  });

  // @feature9 — drift: manifest → disk
  it('CANON001_90: every hooks.json command references an existing script under tools/', () => {
    // The shared loader every hook bootstraps through must exist.
    expect(
      fs.existsSync(appPath('tools', '_shared', 'bootstrap.cjs')),
      'tools/_shared/bootstrap.cjs (hook loader) is missing',
    ).toBe(true);

    const hooks = readPluginHooks();
    const missing: string[] = [];
    let checked = 0;
    for (const event of Object.keys(hooks)) {
      for (const cmd of pluginHookCommands(event)) {
        const rel = hookScriptPath(cmd);
        if (!rel) continue; // not a bootstrap-style command (skip)
        checked++;
        if (!fs.existsSync(appPath(rel))) missing.push(`${event}: ${rel}`);
      }
    }
    expect(checked, 'no bootstrap-style hook commands found to verify').toBeGreaterThan(0);
    expect(missing, `hooks.json references missing scripts:\n${missing.join('\n')}`).toEqual([]);
  });

  // @feature7 — migration dry-run
  it('CANON001_70: migrate-v1-to-v2 --dry-run detects a v1 install and modifies nothing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canon-v1-'));
    try {
      // Build a v1 install fixture in a throwaway dir (the real .dev-pomogator/
      // is gitignored, so we construct it at runtime rather than commit it).
      fs.outputJsonSync(
        path.join(tmp, '.dev-pomogator', '.claude-plugin', 'plugin.json'),
        { name: 'dev-pomogator', version: '1.5.0' },
      );
      fs.outputFileSync(
        path.join(tmp, '.claude', 'skills', 'sample-skill', 'SKILL.md'),
        '---\nname: sample-skill\n---\nfixture skill body\n',
      );
      fs.outputFileSync(
        path.join(tmp, '.gitignore'),
        '# >>> dev-pomogator managed >>>\n.dev-pomogator/\n# <<< dev-pomogator managed <<<\nuser-kept-entry\n',
      );

      const before = snapshot(tmp);
      const script = appPath('tools', 'migrate-v1-to-v2', 'migrate-v1-to-v2.ts');
      const r = spawnSync('npx', ['tsx', script, '--dry-run', '--project-only'], {
        cwd: tmp,
        encoding: 'utf-8',
      });
      const out = `${r.stdout || ''}${r.stderr || ''}`;

      expect(r.status, `migration exited non-zero:\n${out}`).toBe(0);
      expect(out).toContain('[DRY RUN]');
      expect(out, 'dry-run did not report detecting the v1 fixture').toMatch(
        /Detected v1 install \(version 1\.5\.0\)/,
      );
      // Dry-run must not touch anything on disk.
      expect(snapshot(tmp), 'dry-run modified the fixture').toEqual(before);
    } finally {
      fs.removeSync(tmp);
    }
  });
});
