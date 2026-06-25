/**
 * Dead-integration guard for plugin-distributed hooks (builtins-only, no deps).
 *
 * The canonical plugin install ships NO node_modules, so any `.claude-plugin/hooks.json`
 * command that launches a raw `.ts`/`.cjs` whose import chain (transitively) pulls a real
 * npm package crashes `ERR_MODULE_NOT_FOUND` for users. `findDepsUnsafeHooks` returns the
 * offending `script -> packages` list; a clean tree returns `[]`. A command pointing at a
 * `.bundle.mjs` is safe (deps inlined) and is skipped.
 *
 * Pure (repoRoot in, string[] out) + node-builtins-only so this guard can itself run for
 * plugin users with no installed deps (rule: dead-integration-guard).
 *
 * @see .claude/rules/testing/dead-integration-guard.md (plugin-distributed sub-class)
 * @see .specs/dev-pomogator-canonical-plugin/FR.md FR-14
 */
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const BUILTIN = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const isBuiltin = (s: string): boolean => BUILTIN.has(s) || BUILTIN.has(`node:${s.replace(/^node:/, '')}`);
const pkgName = (s: string): string => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
const IMPORT_RE = /^\s*(?:import\b[^'"]*|.*\brequire\()\s*['"]([^'"]+)['"]/gm;

/** Transitively collect the real (non-builtin) packages a script imports. */
export function realPackages(entry: string): string[] {
  const pkgs = new Set<string>();
  const seen = new Set<string>();
  const walk = (file: string): void => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const base = path.join(path.dirname(file), spec);
        for (const ext of ['', '.ts', '.mjs', '.cjs', '.js']) {
          if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
            walk(base + ext);
            break;
          }
        }
      } else if (!isBuiltin(spec) && /^[@a-z]/.test(spec)) {
        pkgs.add(pkgName(spec));
      }
    }
  };
  walk(entry);
  return [...pkgs];
}

/** Every script a hooks.json command actually launches (the last `tools/**` token, raw only). */
export function hookScripts(repoRoot: string): string[] {
  const manifest = path.join(repoRoot, '.claude-plugin', 'hooks.json');
  if (!fs.existsSync(manifest)) return [];
  const j = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  };
  const out = new Set<string>();
  for (const groups of Object.values(j.hooks ?? {})) {
    for (const g of groups) {
      for (const h of g.hooks ?? []) {
        const cmd = h.command ?? '';
        if (/\.bundle\.mjs/.test(cmd)) continue; // bundled — deps inlined
        const m = [...cmd.matchAll(/tools\/[a-z0-9_/-]+\.(?:ts|cjs)/gi)];
        if (m.length) out.add(m[m.length - 1][0]);
      }
    }
  }
  return [...out];
}

/** `script -> pkgs` for every raw-.ts hook that reaches a real package; `[]` when clean. */
export function findDepsUnsafeHooks(repoRoot: string): string[] {
  const offenders: string[] = [];
  for (const script of hookScripts(repoRoot)) {
    const abs = path.join(repoRoot, script);
    if (!fs.existsSync(abs)) continue;
    const pkgs = realPackages(abs);
    if (pkgs.length) offenders.push(`${script} -> ${pkgs.join(', ')}`);
  }
  return offenders;
}
