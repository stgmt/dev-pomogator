#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';

// ast-grep NAPI — preferred AST-based detection for TypeScript stack (regex fallback if unavailable)
let astGrepModule: { parse: Function; Lang: Record<string, string> } | null = null;
try {
  astGrepModule = require('@ast-grep/napi');
} catch {
  // NAPI unavailable — fallback к regex everywhere
}

type Stack = 'ts' | 'python' | 'csharp' | 'go';

interface Candidate {
  function: string;
  line: number;
  endLine: number;
  kind: 'collection-returning' | 'nxm-overlap' | 'composition-chain';
  returnType: string;
  suggestedInvariants: string[];
  rationale: string;
}

interface Suppressed {
  function: string;
  line: number;
  reason: string;
  reasonLength: number;
  reasonWarning: 'REASON_TOO_SHORT' | null;
}

interface DetectorOutput {
  schemaVersion: 1;
  file: string;
  stack: Stack | null;
  candidates: Candidate[];
  suppressed: Suppressed[];
  scanDurationMs: number;
  astGrepVersion: string | null;
}

const COLLECTION_TS = /\)\s*:\s*(Array<[^>]+>|ReadonlyArray<[^>]+>|Set<[^>]+>|Map<[^,>]+,\s*[^>]+>|Iterator<[^>]+>|Iterable<[^>]+>|[A-Za-z_$][\w$]*\[\])/;
const FUNCTION_TS = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)\s*[<(]|const\s+(\w+)\s*(?::\s*[^=]+?)?\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+?)?\s*=>)/;
const COLLECTION_PY = /->\s*(list\[[^\]]+\]|dict\[[^\]]+\]|set\[[^\]]+\]|tuple\[[^\]]+\]|Iterator\[[^\]]+\]|Iterable\[[^\]]+\]|Sequence\[[^\]]+\]|pd\.DataFrame|List\[[^\]]+\]|Dict\[[^\]]+\]|Set\[[^\]]+\]|Tuple\[[^\]]+\])/;
const FUNCTION_PY = /^\s*def\s+(\w+)\s*\(/;
const COLLECTION_CS = /(?:public|private|protected|internal|static|async|virtual|override|abstract|partial|sealed|new|readonly)\s+(?:(?:Task|ValueTask)<\s*)?((?:List|IList|IEnumerable|IReadOnlyList|IReadOnlyCollection|IReadOnlyDictionary|ICollection|Dictionary|IDictionary|HashSet|ISet|Queue|Stack)<[^>]+>|[A-Z][\w.]*\[\])\s*>?\s+\w+\s*[(<]/;
const FUNCTION_CS = /^\s*(?:(?:public|private|protected|internal|static|async|virtual|override|abstract|partial|sealed|new|readonly)\s+){1,6}[\w.<>,\s\[\]?]+\s+(\w+)\s*(?:<[^>]+>)?\s*\(/;
const COLLECTION_GO = /\)\s*(?:\(\s*)?(\[\]\*?[\w.]+|map\[[^\]]+\]\*?[\w.]+|chan\s+[\w.]+|<-chan\s+[\w.]+|chan<-\s+[\w.]+)/;
const FUNCTION_GO = /^\s*func\s+(?:\(\s*\w+\s+\*?[\w.]+\s*\)\s+)?(\w+)\s*(?:\[[^\]]+\])?\s*\(/;
const SUPPRESS_TS = /\/\/\s*strong-tests:skip\s+(.+?)\s*$/;
const SUPPRESS_PY = /#\s*strong-tests:skip\s+(.+?)\s*$/;
const SUPPRESS_CS = /\/\/\s*strong-tests:skip\s+(.+?)\s*$/;
const SUPPRESS_GO = /\/\/\s*strong-tests:skip\s+(.+?)\s*$/;

// Composition-chain detection — function body содержит ≥2 chained method calls on collection types
// TS/JS: .map().filter().reduce() patterns
const CHAIN_TS = /\.(map|filter|flatMap|reduce|forEach|find|some|every|sort|concat|slice|splice|fromEntries|entries|keys|values|reverse|fill|includes|indexOf)\s*\([^)]*\)\s*\.\s*(map|filter|flatMap|reduce|forEach|find|some|every|sort|concat|slice|splice|fromEntries|entries|keys|values|reverse|fill|includes|indexOf)\s*\(/g;
// C# LINQ: .Select().Where().GroupBy() patterns
const CHAIN_CS = /\.(Select|Where|GroupBy|Aggregate|SelectMany|OrderBy|OrderByDescending|ThenBy|ThenByDescending|ToList|ToArray|ToDictionary|First|FirstOrDefault|Single|SingleOrDefault|Any|All|Count|Sum|Min|Max|Average|Distinct|Skip|Take|Concat|Union|Intersect|Except|Zip|Join)\s*\([^)]*\)\s*\.\s*(Select|Where|GroupBy|Aggregate|SelectMany|OrderBy|OrderByDescending|ThenBy|ThenByDescending|ToList|ToArray|ToDictionary|First|FirstOrDefault|Single|SingleOrDefault|Any|All|Count|Sum|Min|Max|Average|Distinct|Skip|Take|Concat|Union|Intersect|Except|Zip|Join)\s*\(/g;
// Python: list/dict comprehension stacking + sequential collection-typed assignments
const CHAIN_PY = /\[\s*\w+\s+for\s+\w+\s+in[^\]]+\]\s*$\s*\n?\s*\w+\s*=\s*\[\s*\w+\s+for\s+\w+\s+in\s+\w+/m;
// Go: sequential collection-returning calls с прокидываением результата
const CHAIN_GO = /^\s*\w+\s*:?=\s*\w+\([^)]*\)[^\n]*\n\s*\w+\s*:?=\s*\w+\(\s*\w+/m;

function detectStack(filePath: string): Stack | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'ts';
  if (ext === '.py') return 'python';
  if (ext === '.cs') return 'csharp';
  if (ext === '.go') return 'go';
  return null;
}

// strong-tests:skip pure-leaf mapping: kind+returnType → hardcoded invariants taxonomy
function suggestInvariants(kind: Candidate['kind'], returnType: string): string[] {
  const base = ['cardinality', 'uniqueness'];
  if (kind === 'nxm-overlap') return [...base, 'conservation'];
  if (kind === 'composition-chain') return [...base, 'conservation', 'monotonicity'];
  if (/dict|Map|Dict/i.test(returnType)) return [...base, 'coverage', 'no-leak'];
  if (/Iterator|Iterable/.test(returnType)) return [...base, 'idempotence', 'monotonicity'];
  return [...base, 'conservation'];
}

function functionRegexFor(stack: Stack): RegExp {
  if (stack === 'ts') return FUNCTION_TS;
  if (stack === 'python') return FUNCTION_PY;
  if (stack === 'go') return FUNCTION_GO;
  return FUNCTION_CS;
}

function collectionRegexFor(stack: Stack): RegExp {
  if (stack === 'ts') return COLLECTION_TS;
  if (stack === 'python') return COLLECTION_PY;
  if (stack === 'go') return COLLECTION_GO;
  return COLLECTION_CS;
}

function suppressRegexFor(stack: Stack): RegExp {
  if (stack === 'ts') return SUPPRESS_TS;
  if (stack === 'python') return SUPPRESS_PY;
  if (stack === 'go') return SUPPRESS_GO;
  return SUPPRESS_CS;
}

function chainRegexFor(stack: Stack): RegExp {
  if (stack === 'ts') return CHAIN_TS;
  if (stack === 'python') return CHAIN_PY;
  if (stack === 'go') return CHAIN_GO;
  return CHAIN_CS;
}

function chainCount(body: string, stack: Stack): number {
  const re = chainRegexFor(stack);
  if (re.global) return (body.match(re) ?? []).length;
  return re.test(body) ? 1 : 0;
}

function nestedLoopCount(body: string, stack: Stack): number {
  if (stack === 'python') return (body.match(/^\s*for\s+\w+\s+in\s+/gm) ?? []).length;
  if (stack === 'csharp') return (body.match(/(?:^|\s)(?:for|foreach)\s*\(/g) ?? []).length;
  if (stack === 'go') return (body.match(/(?:^|[\s{};])for\b\s*[\w{;]/g) ?? []).length;
  return (body.match(/for\s*\(/g) ?? []).length;
}

// ast-grep TS function detection — returns map line→name for ALL function-like nodes in file
// (single parse, cached, used by findFunctionAt for ts stack instead of regex)
interface AstGrepCacheEntry {
  contentHash: string;
  functionsByLine: Map<number, string>;
}
let astGrepCache: AstGrepCacheEntry | null = null;

// strong-tests:skip pure AST traversal — Map keys = AST node line numbers (unique by construction); composition invariants tested via integration test that ast-grep output matches regex fallback on same fixture
function getTsFunctionsViaAstGrep(content: string): Map<number, string> | null {
  if (!astGrepModule) return null;
  // Simple content hash для cache invalidation across multiple scan() calls
  const hash = `${content.length}:${content.slice(0, 200)}`;
  if (astGrepCache && astGrepCache.contentHash === hash) {
    return astGrepCache.functionsByLine;
  }
  try {
    const root = astGrepModule.parse(astGrepModule.Lang.TypeScript, content);
    const node = root.root();
    const functionsByLine = new Map<number, string>();
    // Find named function declarations: `function foo(...)` and arrow functions assigned to const
    for (const match of node.findAll({ rule: { kind: 'function_declaration' } }) ?? []) {
      const nameNode = match.field?.('name');
      if (nameNode) {
        const line = match.range().start.line;
        functionsByLine.set(line, nameNode.text());
      }
    }
    for (const match of node.findAll({ rule: { kind: 'lexical_declaration' } }) ?? []) {
      // const foo = (...) => ... pattern
      const declarator = match.children().find((c: any) => c.kind() === 'variable_declarator');
      if (!declarator) continue;
      const valueNode = declarator.field?.('value');
      if (valueNode && (valueNode.kind() === 'arrow_function' || valueNode.kind() === 'function_expression')) {
        const nameNode = declarator.field?.('name');
        if (nameNode) {
          const line = match.range().start.line;
          functionsByLine.set(line, nameNode.text());
        }
      }
    }
    astGrepCache = { contentHash: hash, functionsByLine };
    return functionsByLine;
  } catch {
    return null;
  }
}

function findFunctionAt(lines: string[], i: number, stack: Stack): { name: string; line: number } | null {
  // For TS — try ast-grep first; fallback к regex if unavailable or returns empty
  if (stack === 'ts' && astGrepModule) {
    const fullContent = lines.join('\n');
    const tsFunctions = getTsFunctionsViaAstGrep(fullContent);
    if (tsFunctions && tsFunctions.has(i)) {
      const name = tsFunctions.get(i);
      if (name) return { name, line: i };
    }
    // If ast-grep parsed но не нашёл на этой строке — попробуем regex как safety net
  }

  const re = functionRegexFor(stack);
  const m = re.exec(lines[i]);
  if (!m) return null;
  const name = (m[1] || m[2] || '').trim();
  if (!name) return null;
  return { name, line: i };
}

function scan(content: string, stack: Stack): { candidates: Candidate[]; suppressed: Suppressed[] } {
  const lines = content.split('\n');
  const candidates: Candidate[] = [];
  const suppressed: Suppressed[] = [];
  const suppressRe = suppressRegexFor(stack);
  const typeRe = collectionRegexFor(stack);
  const suppressedLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(suppressRe);
    if (!m) continue;
    const reason = m[1].trim();
    let target: { name: string; line: number } | null = findFunctionAt(lines, i, stack);
    if (!target) {
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        if (lines[j].trim() === '') continue;
        const next = findFunctionAt(lines, j, stack);
        if (next) {
          target = next;
          break;
        }
        break;
      }
    }
    if (target) {
      suppressedLines.add(target.line);
      suppressed.push({
        function: `${target.name}:${target.line + 1}`,
        line: target.line + 1,
        reason,
        reasonLength: reason.length,
        reasonWarning: reason.length < 8 ? 'REASON_TOO_SHORT' : null,
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (suppressedLines.has(i)) continue;
    const target = findFunctionAt(lines, i, stack);
    if (!target) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
    const typeMatch = typeRe.exec(window);
    if (!typeMatch) continue;
    const returnType = typeMatch[1].trim();
    const endLine = Math.min(lines.length - 1, i + 40);
    const body = lines.slice(i, endLine + 1).join('\n');
    const nestedFor = nestedLoopCount(body, stack);
    const chains = chainCount(body, stack);
    let kind: Candidate['kind'] = 'collection-returning';
    let rationale = `function signature returns ${returnType}`;
    if (nestedFor >= 2) {
      kind = 'nxm-overlap';
      rationale += `; nested loop body detected (${nestedFor} loop statements)`;
    } else if (chains >= 1) {
      kind = 'composition-chain';
      rationale += `; composition chain detected (${chains} chained call site(s))`;
    }
    candidates.push({
      function: target.name,
      line: target.line + 1,
      endLine: endLine + 1,
      kind,
      returnType,
      suggestedInvariants: suggestInvariants(kind, returnType),
      rationale,
    });
  }

  return { candidates, suppressed };
}

export { detectStack, scan, suggestInvariants, nestedLoopCount };
export type { Stack, Candidate, Suppressed, DetectorOutput };

function main(): void {
  const t0 = Date.now();
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Usage: detect-invariant-candidates.ts <file-path>\n');
    process.exit(2);
  }
  const stack = detectStack(filePath);
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    process.stderr.write(`File not readable: ${filePath}\n`);
    process.exit(2);
  }
  let candidates: Candidate[] = [];
  let suppressed: Suppressed[] = [];
  if (stack === 'ts' || stack === 'python' || stack === 'csharp' || stack === 'go') {
    const result = scan(content, stack);
    candidates = result.candidates;
    suppressed = result.suppressed;
  }
  const output: DetectorOutput = {
    schemaVersion: 1,
    file: filePath,
    stack,
    candidates,
    suppressed,
    scanDurationMs: Date.now() - t0,
    astGrepVersion: null,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(0);
}

const isDirectRun =
  process.argv[1]?.endsWith('detect-invariant-candidates.ts') ||
  process.argv[1]?.endsWith('detect-invariant-candidates.js');
if (isDirectRun) {
  main();
}
