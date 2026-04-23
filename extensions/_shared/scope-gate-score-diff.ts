/**
 * scope-gate — scoreDiff() weighted heuristic
 *
 * Pure function. Analyzes a `git diff --cached` unified diff and returns a suspicion
 * score indicating how likely the diff modifies a guard/policy gate that should be
 * verified by /verify-generic-scope-fix before commit.
 *
 * Spec: .specs/verify-generic-scope-fix/FR.md#fr-6 + FR-4 dampening
 * Calibration: tests/fixtures/scope-gate/stocktaking-diff.patch → score >= 4 (regression pin)
 */

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export interface ScoreOptions {
  /**
   * File paths (typically from `git diff --cached --name-only`) to apply dampening to.
   * Per FR-4: docs/md files -2, docs/tests path files -1.
   */
  dampenFiles?: string[];
}

const GUARD_FILE_SUFFIX = /(Service|Validator|Gate|Guard|Policy|Rule|Predicate|Filter)\.(ts|tsx|cs|java|kt|py|rb|go)$/i;
const GUARD_PATH = /\/(domain|policies|validation)\//i;
const PREDICATE_NAME = /^(is|should|can|has|must|check|validate|verify|allow|permit)[A-Z]/;
const DOCS_FILE = /\.(md|txt|rst)$/i;
const TEST_PATH = /(\/|^)(docs?|tests?|__tests__|spec)\//i;

/**
 * Is the given file path a potential scope-gate candidate (guard/policy file)?
 * Reusable by plan-pomogator (plan-gate advisory) and specs-workflow (audit-spec check).
 */
export function isGuardFile(filePath: string): boolean {
  return GUARD_FILE_SUFFIX.test(filePath) || GUARD_PATH.test(filePath);
}

/**
 * Filter a list of paths to those matching guard-file patterns.
 * Returns empty array if none match — callers can use `.length > 0` as advisory trigger.
 */
export function detectGuardFiles(paths: string[]): string[] {
  return paths.filter(isGuardFile);
}

interface ParsedFile {
  path: string;
  hunks: ParsedHunk[];
}

interface ParsedHunk {
  /** lines with context; each entry: { kind, content, lineNumber } */
  lines: Array<{ kind: 'add' | 'del' | 'ctx'; content: string; lineNumber: number }>;
}

/**
 * Parse a unified diff (`git diff --cached` output) into per-file hunks with line classification.
 * Minimal parser — handles standard `diff --git` / `@@` markers. Fail-open on malformed sections.
 */
export function parseFilesFromDiff(unifiedDiff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  if (!unifiedDiff) return files;

  const lines = unifiedDiff.split(/\r?\n/);
  let currentFile: ParsedFile | null = null;
  let currentHunk: ParsedHunk | null = null;
  let newLineNumber = 0;

  for (const line of lines) {
    const diffGit = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffGit) {
      if (currentFile) files.push(currentFile);
      currentFile = { path: diffGit[2], hunks: [] };
      currentHunk = null;
      continue;
    }
    if (!currentFile) continue;

    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      currentHunk = { lines: [] };
      currentFile.hunks.push(currentHunk);
      newLineNumber = parseInt(hunkHeader[1], 10);
      continue;
    }
    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({ kind: 'add', content: line.slice(1), lineNumber: newLineNumber });
      newLineNumber += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({ kind: 'del', content: line.slice(1), lineNumber: newLineNumber });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({ kind: 'ctx', content: line.slice(1), lineNumber: newLineNumber });
      newLineNumber += 1;
    }
  }
  if (currentFile) files.push(currentFile);
  return files;
}

/**
 * Heuristic: is the given added line a string literal inside an enum/array/Set/union-type body?
 * Uses 3-line context window: opening bracket/keyword before, closing/more items after.
 */
function isEnumLikeItem(
  line: { kind: string; content: string },
  hunk: ParsedHunk,
  lineIndex: number,
): boolean {
  // Must look like a string literal or enum member ('foo', "foo", foo = 'bar',)
  const content = line.content.trim();
  if (!content) return false;
  const isStringItem = /^['"`][^'"`]+['"`]\s*,?\s*$/.test(content);
  const isEnumMember = /^\w+\s*(=\s*['"`][^'"`]+['"`])?\s*,?\s*$/.test(content);
  if (!isStringItem && !isEnumMember) return false;

  // Context window: 3 lines before and after, looking at any kind (add/del/ctx)
  const start = Math.max(0, lineIndex - 3);
  const end = Math.min(hunk.lines.length, lineIndex + 4);
  let openerSeen = false;
  let enumContext = false;
  for (let i = start; i < lineIndex; i++) {
    const prev = hunk.lines[i].content;
    if (/\[|new Set\(\[|new Set<.+>\(\[/.test(prev) ||
        /enum\s+\w+\s*\{/.test(prev) ||
        /type\s+\w+\s*=\s*$/.test(prev) ||
        /\|\s*['"`]/.test(prev) ||
        /:\s*\[$/.test(prev)) {
      openerSeen = true;
      enumContext = true;
      break;
    }
    // Also detect union-type continuation: previous was a string literal with trailing |
    if (/^\s*['"`][^'"`]+['"`]\s*\|\s*$/.test(prev) || /^\s*['"`][^'"`]+['"`]\s*,\s*$/.test(prev)) {
      openerSeen = true;
      break;
    }
  }
  if (!openerSeen) return false;

  // Validate closing or continuation within next 3 lines
  for (let i = lineIndex + 1; i < end; i++) {
    const next = hunk.lines[i].content;
    if (/^\s*\]/.test(next) || /^\s*\}/.test(next)) return true;
    // Another string item → continuation, still in enum/array
    if (/^\s*['"`][^'"`]+['"`]\s*,?\s*$/.test(next)) return true;
    if (/\|\s*['"`]/.test(next)) return true;
  }
  // If nothing after within window but we had opener, still likely enum (last item before close on same hunk boundary)
  return enumContext;
}

/** Is the added line a `case X:` statement inside a switch block? */
function isSwitchCase(
  line: { kind: string; content: string },
  hunk: ParsedHunk,
  lineIndex: number,
): boolean {
  const content = line.content.trim();
  if (!/^case\s+[\w'"`.]+\s*:/.test(content)) return false;

  // Strong signal: explicit `switch (...)` opener in hunk context
  const start = Math.max(0, lineIndex - 20);
  for (let i = lineIndex - 1; i >= start; i--) {
    if (/switch\s*\(/.test(hunk.lines[i].content)) return true;
    if (/^\s*function\s+\w+/.test(hunk.lines[i].content)) break;
  }

  // Weaker signal: other `case X:` lines within 20-line window in any direction.
  // Diff hunks typically don't include the switch opener (it's above the change).
  const end = Math.min(hunk.lines.length, lineIndex + 10);
  for (let i = start; i < end; i++) {
    if (i === lineIndex) continue;
    if (/^\s*case\s+[\w'"`.]+\s*:/.test(hunk.lines[i].content)) return true;
  }

  return false;
}

/** Find the enclosing function name for a hunk by scanning backward through added/context lines. */
function findEnclosingFunction(hunk: ParsedHunk, lineIndex: number): string | null {
  for (let i = lineIndex; i >= 0; i--) {
    const content = hunk.lines[i].content;
    const fn = content.match(/function\s+(\w+)\s*\(|(\w+)\s*(?::\s*\w+)?\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|,\s]+)?\s*\{|(?:public|private|protected|static|async|export)\s+(?:async\s+)?function\s+(\w+)/);
    if (fn) return fn[1] || fn[2] || fn[3] || fn[4] || null;
  }
  return null;
}

/**
 * Compute suspicionScore for a unified diff.
 *
 * @param unifiedDiff — output of `git diff --cached`
 * @param opts — dampening inputs (file list for FR-4 adjustments)
 * @returns { score, reasons } — numeric score + per-rule contribution trace
 */
export function scoreDiff(unifiedDiff: string, opts: ScoreOptions = {}): ScoreResult {
  const reasons: string[] = [];

  if (!unifiedDiff || !unifiedDiff.trim()) {
    return { score: 0, reasons: ['empty/unparseable diff'] };
  }

  let files: ParsedFile[];
  try {
    files = parseFilesFromDiff(unifiedDiff);
  } catch {
    return { score: 0, reasons: ['empty/unparseable diff'] };
  }

  if (files.length === 0) {
    return { score: 0, reasons: ['empty/unparseable diff'] };
  }

  let score = 0;

  for (const file of files) {
    const isGuardFile = GUARD_FILE_SUFFIX.test(file.path) || GUARD_PATH.test(file.path);
    if (isGuardFile) {
      score += 1;
      reasons.push(`+1 filename:${file.path}`);
    }

    for (const hunk of file.hunks) {
      for (let i = 0; i < hunk.lines.length; i++) {
        const line = hunk.lines[i];
        if (line.kind !== 'add') continue;

        if (isEnumLikeItem(line, hunk, i)) {
          score += 2;
          reasons.push(`+2 enum-item:${file.path}:${line.lineNumber}`);
        } else if (isSwitchCase(line, hunk, i)) {
          score += 2;
          reasons.push(`+2 switch-case:${file.path}:${line.lineNumber}`);
        }
      }

      // Predicate-name rule: if any line in hunk is inside a predicate-named function, +1 (once per hunk)
      for (let i = 0; i < hunk.lines.length; i++) {
        if (hunk.lines[i].kind !== 'add') continue;
        const fnName = findEnclosingFunction(hunk, i);
        if (fnName && PREDICATE_NAME.test(fnName)) {
          score += 1;
          reasons.push(`+1 predicate:${fnName}`);
          break; // count once per hunk
        }
      }
    }
  }

  // FR-4 dampening
  if (opts.dampenFiles) {
    for (const f of opts.dampenFiles) {
      if (DOCS_FILE.test(f)) {
        score -= 2;
        reasons.push(`-2 docs:${f}`);
      } else if (TEST_PATH.test(f)) {
        score -= 1;
        reasons.push(`-1 test:${f}`);
      }
    }
  }

  return { score, reasons };
}

/**
 * Short-circuit check per FR-4 rule (c): are ALL staged files docs/tests-only?
 * @param nameOnlyOutput — lines from `git diff --cached --name-only`
 */
export function isDocsOrTestsOnly(nameOnlyOutput: string): boolean {
  const files = nameOnlyOutput.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  if (files.length === 0) return false;
  return files.every(f => DOCS_FILE.test(f) || TEST_PATH.test(f));
}
