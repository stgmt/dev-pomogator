// Automated dead-integration guard (`.claude/rules/testing/dead-integration-guard.md`,
// "Под-класс: plugin-distributed код"). The canonical plugin install ships NO node_modules,
// so any hooks.json command that launches a raw `.ts`/`.cjs` whose import chain (transitively)
// pulls a real npm package crashes ERR_MODULE_NOT_FOUND for users. This test FAILS such a
// hook in CI — it must be bundled (esbuild, deps inlined) or rewritten builtins-only.
// Caught 4 real dead-integrations (test-quality gate, spec-conformance-guard/push, spec-backlog
// auto-ingest); without this guard the next one ships silently (the dogfood has node_modules).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILTIN = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const isBuiltin = (s: string) => BUILTIN.has(s) || BUILTIN.has(`node:${s.replace(/^node:/, '')}`);
const pkgName = (s: string) => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
const IMPORT_RE = /^\s*(?:import\b[^'"]*|.*\brequire\()\s*['"]([^'"]+)['"]/gm;

/** Transitively collect the real (non-builtin) packages a script imports. */
function realPackages(entry: string): string[] {
  const pkgs = new Set<string>();
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const base = path.join(path.dirname(file), spec);
        for (const ext of ['', '.ts', '.mjs', '.cjs', '.js']) {
          if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) { walk(base + ext); break; }
        }
      } else if (!isBuiltin(spec) && /^[@a-z]/.test(spec)) {
        pkgs.add(pkgName(spec));
      }
    }
  };
  walk(entry);
  return [...pkgs];
}

/** Every script a hooks.json command actually launches (the last `tools/**` token). */
function hookScripts(): string[] {
  const raw = fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'hooks.json'), 'utf8');
  const j = JSON.parse(raw) as { hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>> };
  const out = new Set<string>();
  for (const groups of Object.values(j.hooks ?? {})) {
    for (const g of groups) {
      for (const h of g.hooks ?? []) {
        const cmd = h.command ?? '';
        // a command launches EITHER a .bundle.mjs (safe) OR a raw tools/**.ts|.cjs (must be checked)
        if (/\.bundle\.mjs/.test(cmd)) continue; // bundled — deps inlined
        const m = [...cmd.matchAll(/tools\/[a-z0-9_/-]+\.(?:ts|cjs)/gi)];
        if (m.length) out.add(m[m.length - 1][0]);
      }
    }
  }
  return [...out];
}

describe('plugin hooks are deps-safe for users (no node_modules shipped)', () => {
  it('no raw-.ts hook command transitively imports a real npm package', () => {
    const offenders: string[] = [];
    for (const script of hookScripts()) {
      const abs = path.join(repoRoot, script);
      if (!fs.existsSync(abs)) continue;
      const pkgs = realPackages(abs);
      if (pkgs.length) offenders.push(`${script} → ${pkgs.join(', ')}`);
    }
    expect(
      offenders,
      `These hooks launch a raw .ts that pulls a real package — they CRASH for plugin users ` +
        `(no node_modules). Bundle them (npm run build:bundles) + point hooks.json at the .bundle.mjs, ` +
        `or rewrite builtins-only:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
