/**
 * BDD migrator — inventory stage (FR-M1 steps 1-2).
 *
 * Parses a vitest test file into a structured inventory of its cases, each classified by HOW it
 * exercises the code, so the scaffolder (next stage) and a human author know what kind of BDD
 * step-def to write. This is the mechanizable front of the proven hand-recipe used to migrate the
 * claim-evidence-gate file (SPECGEN004_186..198): the migrator codifies that recipe so the ~100
 * remaining vitest files are not done one-by-one by hand.
 *
 * Classification (mirrors the recipe's decision the author made each time):
 *   - runtime  : drives the real thing end-to-end (spawnSync/execSync/runInstaller/spawn) → BDD
 *                step spawns the real hook/CLI (the strongest twin).
 *   - artifact : reads files / checks structure (fs.existsSync/readFileSync) without spawning → BDD
 *                step asserts the real artifact's structure.
 *   - pure     : imports a production function and calls it directly → BDD step drives that function
 *                in-process (deterministic, CI-safe — no token/spawn).
 *   - manual   : it.skip / it.todo, OR any it() inside a describe.skip/.todo (whole suite skipped —
 *                often obsolete/env-gated, e.g. a suite inspecting a deleted src/ tree) → carry over
 *                as @wip until a human authors it; NOT auto-migratable.
 *
 * Pure regex/string parsing — node builtins only (dep-safe; the migrator may ship in the plugin).
 * Not a full TS AST: case "body" is approximated as the slice up to the next it()/describe(), which
 * is sufficient for signal scanning. Cross-checked against a real file in the BDD dogfood test.
 *
 * @see .specs/spec-generator-v4/FR.md FR-M1 (universal adaptive migrator)
 * @see C:/Users/stigm/.claude/plans/mighty-purring-meteor.md (P2 — build the migrator from the pilot)
 */

import * as fs from 'node:fs';

export type CaseKind = 'runtime' | 'artifact' | 'pure' | 'manual';

export interface VitestCase {
  /** DOMAIN001_NN style id parsed from the title, or null if the title has none. */
  id: string | null;
  /** The it()/test() description text. */
  title: string;
  /** The nearest enclosing describe() text (or '' at file scope). */
  describe: string;
  /** How the case exercises the code — drives the BDD step-def shape. */
  kind: CaseKind;
  /** Why it was classified so (the matched signals). */
  signals: string[];
}

export interface VitestInventory {
  file: string;
  framework: 'vitest';
  total: number;
  cases: VitestCase[];
  /** Relative ('../x') production modules imported — candidates to reuse in the step-defs. */
  prodImports: string[];
}

const ID_RE = /\b([A-Z][A-Z0-9]+\d+_\d+|[A-Z][A-Z0-9]{2,}_\d+)\b/;

/** Match it / test, with an optional modifier (.skip/.only/.todo/.each), capturing the quoted title. */
const CASE_RE = /\b(?:it|test)(\.\w+)?\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*?)\2/g;
const DESCRIBE_RE = /\bdescribe(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const IMPORT_RE = /^\s*import\b[^;]*?from\s+(['"])(\.[^'"]+)\1/gm;

/**
 * Names of helper functions in the file whose own body spawns a process (e.g. a `runHook` that
 * wraps spawnSync). A case that CALLS such a helper is runtime even though its own body has no
 * spawnSync — the real-process drive is one level down. Found by taking the nearest function/const
 * declared before each spawnSync/execSync occurrence.
 */
function findRuntimeHelpers(source: string): string[] {
  const names = new Set<string>();
  // Only FUNCTION-defining declarations — `function NAME(` or `const NAME = (..)=>` / `= function` —
  // so the nearest decl before a spawnSync is the enclosing helper (e.g. runHook), NOT the
  // `const res = spawnSync(...)` on the same line.
  const DECL = /\bfunction\s+(\w+)\s*\(|\bconst\s+(\w+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::\s*[^=]+?)?=>)/g;
  for (const m of source.matchAll(/\b(?:spawnSync|execSync)\b/g)) {
    const before = source.slice(0, m.index ?? 0);
    const decls = [...before.matchAll(DECL)];
    const last = decls[decls.length - 1];
    const name = last?.[1] ?? last?.[2];
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * Variables assigned inside an fs-WRITING setup hook (beforeEach/beforeAll that writes a real
 * corpus). A case body that references such a var depends on the real filesystem → it is `artifact`
 * even though its own body has no `fs.read` (the read is via a helper like findInboundLinks(root,…)).
 * Without this, a test whose fixture is built in beforeEach looks falsely `pure`.
 */
/** The `{…}` block body starting at/after `from`, brace-matched (so it does not bleed into the
 * next function). Naive (ignores braces in strings) — fine for short setup hooks. */
function braceBody(source: string, from: number): string {
  const open = source.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

function findFsSetupVars(source: string): string[] {
  const vars = new Set<string>();
  for (const m of source.matchAll(/\b(?:beforeEach|beforeAll)\s*\(/g)) {
    const body = braceBody(source, m.index ?? 0); // precise hook body — not a fixed window
    if (!/\bfs\.(?:writeFileSync|mkdirSync|mkdtempSync|cpSync|writeFile)\b/.test(body)) continue;
    for (const a of body.matchAll(/(?:\bconst\s+|\blet\s+|\bvar\s+|[;{]\s*)([a-zA-Z_]\w*)\s*=/g)) vars.add(a[1]);
  }
  return [...vars];
}

/**
 * Char spans of describe.skip(...) / describe.todo(...) bodies. Every it() whose position falls inside
 * such a span is skipped at the SUITE level (the per-it modifier is absent, so classifyBody can't see
 * it) — these are not auto-migratable: the suite is usually obsolete or env-gated. Brace-matched so a
 * nested describe.skip catches only its own its, not the rest of the file.
 */
export function skippedDescribeSpans(source: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const m of source.matchAll(/\bdescribe\.(?:skip|todo)\b\s*\(/g)) {
    const open = source.indexOf('{', m.index ?? 0);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) {
        spans.push({ start: open, end: i + 1 });
        break;
      }
    }
  }
  return spans;
}

function classifyBody(
  body: string,
  modifier: string,
  runtimeHelpers: string[],
  fsSetupVars: string[],
): { kind: CaseKind; signals: string[] } {
  if (modifier === '.skip' || modifier === '.todo') return { kind: 'manual', signals: [`it${modifier}`] };
  const signals: string[] = [];
  if (/\b(?:spawnSync|execSync|runInstaller|spawn\s*\(|child_process)/.test(body)) {
    signals.push('spawn/exec — drives the real process');
    return { kind: 'runtime', signals };
  }
  const calledHelper = runtimeHelpers.find((h) => new RegExp(`\\b${h}\\s*\\(`).test(body));
  if (calledHelper) {
    signals.push(`calls runtime helper ${calledHelper}() — drives the real process`);
    return { kind: 'runtime', signals };
  }
  if (/\bfs\.(?:existsSync|readFileSync|readdirSync|statSync)\b/.test(body)) {
    signals.push('fs read — checks a real artifact');
    return { kind: 'artifact', signals };
  }
  const usedSetupVar = fsSetupVars.find((v) => new RegExp(`\\b${v}\\b`).test(body));
  if (usedSetupVar) {
    signals.push(`uses fs-setup var ${usedSetupVar} — depends on a real corpus (artifact)`);
    return { kind: 'artifact', signals };
  }
  signals.push('direct in-process call — pure');
  return { kind: 'pure', signals };
}

/** Find the text of the nearest describe() opened before `pos`. */
function enclosingDescribe(describes: Array<{ pos: number; text: string }>, pos: number): string {
  let best = '';
  for (const d of describes) {
    if (d.pos < pos) best = d.text;
    else break;
  }
  return best;
}

export function inventoryVitestSource(source: string, file = '<source>'): VitestInventory {
  const describes: Array<{ pos: number; text: string }> = [];
  for (const m of source.matchAll(DESCRIBE_RE)) describes.push({ pos: m.index ?? 0, text: m[2] });

  const hits: Array<{ pos: number; modifier: string; title: string }> = [];
  for (const m of source.matchAll(CASE_RE)) {
    hits.push({ pos: m.index ?? 0, modifier: m[1] ?? '', title: m[3] });
  }

  const runtimeHelpers = findRuntimeHelpers(source);
  const fsSetupVars = findFsSetupVars(source);
  const skippedSpans = skippedDescribeSpans(source);

  const cases: VitestCase[] = hits.map((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].pos : source.length;
    const body = source.slice(h.pos, end);
    const inSkippedSuite = skippedSpans.some((s) => h.pos >= s.start && h.pos < s.end);
    const { kind, signals } = inSkippedSuite
      ? { kind: 'manual' as const, signals: ['describe.skip/.todo — whole suite skipped, not auto-migratable'] }
      : classifyBody(body, h.modifier, runtimeHelpers, fsSetupVars);
    const idMatch = h.title.match(ID_RE);
    return {
      id: idMatch ? idMatch[1] : null,
      title: h.title,
      describe: enclosingDescribe(describes, h.pos),
      kind,
      signals,
    };
  });

  const prodImports = [...source.matchAll(IMPORT_RE)].map((m) => m[2]);

  return { file, framework: 'vitest', total: cases.length, cases, prodImports: [...new Set(prodImports)] };
}

export function inventoryVitestFile(filePath: string): VitestInventory {
  const src = fs.readFileSync(filePath, 'utf-8');
  return { ...inventoryVitestSource(src, filePath) };
}

// CLI: `node --import tsx tools/bdd-migrator/inventory.ts <vitest-test-file>` → JSON inventory.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('usage: inventory.ts <vitest-test-file>\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(inventoryVitestFile(target), null, 2) + '\n');
}
