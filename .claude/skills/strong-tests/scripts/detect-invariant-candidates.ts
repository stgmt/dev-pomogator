#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';

type Stack = 'ts' | 'python' | 'csharp';

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
const SUPPRESS_TS = /\/\/\s*strong-tests:skip\s+(.+?)\s*$/;
const SUPPRESS_PY = /#\s*strong-tests:skip\s+(.+?)\s*$/;
const SUPPRESS_CS = /\/\/\s*strong-tests:skip\s+(.+?)\s*$/;

function detectStack(filePath: string): Stack | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'ts';
  if (ext === '.py') return 'python';
  if (ext === '.cs') return 'csharp';
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
  return FUNCTION_CS;
}

function collectionRegexFor(stack: Stack): RegExp {
  if (stack === 'ts') return COLLECTION_TS;
  if (stack === 'python') return COLLECTION_PY;
  return COLLECTION_CS;
}

function suppressRegexFor(stack: Stack): RegExp {
  if (stack === 'ts') return SUPPRESS_TS;
  if (stack === 'python') return SUPPRESS_PY;
  return SUPPRESS_CS;
}

function nestedLoopCount(body: string, stack: Stack): number {
  if (stack === 'python') return (body.match(/^\s*for\s+\w+\s+in\s+/gm) ?? []).length;
  if (stack === 'csharp') return (body.match(/(?:^|\s)(?:for|foreach)\s*\(/g) ?? []).length;
  return (body.match(/for\s*\(/g) ?? []).length;
}

function findFunctionAt(lines: string[], i: number, stack: Stack): { name: string; line: number } | null {
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
    let kind: Candidate['kind'] = 'collection-returning';
    let rationale = `function signature returns ${returnType}`;
    if (nestedFor >= 2) {
      kind = 'nxm-overlap';
      rationale += `; nested loop body detected (${nestedFor} for/foreach statements)`;
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
  if (stack === 'ts' || stack === 'python' || stack === 'csharp') {
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

main();
