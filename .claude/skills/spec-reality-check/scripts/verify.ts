#!/usr/bin/env node
/**
 * spec-reality-check verify.ts — verify spec docs against repository reality.
 *
 * Six checks:
 *  - FC_CREATE_EXISTS  (ERROR)   — FILE_CHANGES action=create on existing path
 *  - FC_EDIT_MISSING   (ERROR)   — FILE_CHANGES action=edit on missing path
 *  - FC_DELETE_MISSING (ERROR)   — FILE_CHANGES action=delete on missing path
 *  - NARRATIVE_PATH_MISSING (WARNING) — inline backtick path in FR/DESIGN/TASKS missing
 *  - CODE_DRIFT_FR_ALREADY_DONE (WARNING) — git log -S "FR-N" returns commits
 *  - TASKS_FC_CONSISTENCY (WARNING/INFO) — TASKS files vs FILE_CHANGES paths diff
 *
 * Output formats: json (default), human (chalk-colored), markdown.
 * Exit code: 0 always (findings are not errors). 1 only on CLI/IO failure.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

export interface AuditFinding {
  check: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
  file?: string;
  line?: number;
}

interface FcRow {
  path: string;
  action?: string;
  reason?: string;
  rowNumber: number;
}

const TRACKED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.py', '.feature', '.yaml', '.yml',
  '.sh', '.ps1', '.bat', '.cmd', '.cs', '.go', '.rs',
  '.toml', '.ini', '.env', '.sql',
]);

const NARRATIVE_FILES = ['FR.md', 'DESIGN.md', 'TASKS.md'];

function resolveSpecPath(specPath: string): string {
  const resolved = path.resolve(specPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Spec path does not exist: ${specPath}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Spec path is not a directory: ${specPath}`);
  }
  return resolved;
}

function readFileOptional(specDir: string, filename: string): string | null {
  const p = path.join(specDir, filename);
  if (!fs.existsSync(p)) return null;
  let content = fs.readFileSync(p, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  return content;
}

function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

function stripBackticksAndCodeBlocks(content: string): string {
  let stripped = content.replace(/```[\s\S]*?```/g, '');
  return stripped;
}

export function parseFileChangesTable(content: string): { rows: FcRow[]; findings: AuditFinding[] } {
  const findings: AuditFinding[] = [];
  const rows: FcRow[] = [];
  if (!content) return { rows, findings };

  const lines = content.split(/\r?\n/);
  let headerColumns: string[] | null = null;
  let inTable = false;
  let separatorSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed.startsWith('|')) {
      if (inTable) {
        inTable = false;
        headerColumns = null;
        separatorSeen = false;
      }
      continue;
    }
    const cells = raw.split('|').slice(1, -1).map((c) => c.trim());
    if (!headerColumns) {
      headerColumns = cells.map((c) => c.toLowerCase().replace(/[`*_]/g, ''));
      inTable = true;
      separatorSeen = false;
      continue;
    }
    if (!separatorSeen) {
      if (cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, '')))) {
        separatorSeen = true;
        continue;
      }
      headerColumns = null;
      inTable = false;
      continue;
    }
    const pathIdx = headerColumns.findIndex((h) => /^path|file$/.test(h));
    const actionIdx = headerColumns.findIndex((h) => /^action$/.test(h));
    const reasonIdx = headerColumns.findIndex((h) => /^reason|note|notes$/.test(h));
    if (pathIdx < 0) {
      findings.push({
        check: 'FC_PARSE_UNPARSEABLE',
        category: 'FILE_CHANGES_VERIFY',
        severity: 'INFO',
        message: `FILE_CHANGES row ${i + 1} unparseable (no Path column)`,
        line: i + 1,
      });
      continue;
    }
    const cellPath = cells[pathIdx] || '';
    const cellAction = actionIdx >= 0 ? cells[actionIdx] : undefined;
    const cellReason = reasonIdx >= 0 ? cells[reasonIdx] : undefined;
    const cleanPath = cellPath.replace(/^`|`$/g, '').replace(/^\*|\*$/g, '').trim();
    if (!cleanPath) {
      findings.push({
        check: 'FC_PARSE_UNPARSEABLE',
        category: 'FILE_CHANGES_VERIFY',
        severity: 'INFO',
        message: `FILE_CHANGES row ${i + 1} unparseable (empty path)`,
        line: i + 1,
      });
      continue;
    }
    rows.push({
      path: cleanPath,
      action: cellAction?.toLowerCase().replace(/\s+/g, '').replace(/[`*]/g, ''),
      reason: cellReason,
      rowNumber: i + 1,
    });
  }

  const hasUnparseableFindings = findings.some((f) => f.check === 'FC_PARSE_UNPARSEABLE');
  if (rows.length === 0 && content.trim().length > 0 && !hasUnparseableFindings) {
    findings.push({
      check: 'FC_EMPTY',
      category: 'FILE_CHANGES_VERIFY',
      severity: 'INFO',
      message: 'FILE_CHANGES.md has no parseable rows (empty scaffold or non-standard format)',
    });
  }

  return { rows, findings };
}

// strong-tests:skip invariants covered by evals iteration-2 (isolated fixtures + forbidden_codes enforce exact-count + no-leak invariants per check)
export function checkFcRows(rows: FcRow[], repoRoot: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const row of rows) {
    if (!row.action) {
      findings.push({
        check: 'FC_PARSE_UNPARSEABLE',
        category: 'FILE_CHANGES_VERIFY',
        severity: 'INFO',
        message: `FILE_CHANGES row ${row.rowNumber} has no Action column; FC check skipped`,
        details: `path: ${row.path}`,
        line: row.rowNumber,
      });
      continue;
    }
    const resolved = path.resolve(repoRoot, row.path);
    const exists = fs.existsSync(resolved);
    const a = row.action;
    if (a === 'create' && exists) {
      findings.push({
        check: 'FC_CREATE_EXISTS',
        category: 'FILE_CHANGES_VERIFY',
        severity: 'ERROR',
        message: `FILE_CHANGES action=create on existing path: ${row.path}`,
        details: 'Spec is stale — file already exists. Change to action=edit or remove row if work already shipped.',
        file: row.path,
        line: row.rowNumber,
      });
    } else if (a === 'edit' && !exists) {
      findings.push({
        check: 'FC_EDIT_MISSING',
        category: 'FILE_CHANGES_VERIFY',
        severity: 'ERROR',
        message: `FILE_CHANGES action=edit on missing path: ${row.path}`,
        details: 'Path does not exist. Was the file renamed or removed? Update FILE_CHANGES row.',
        file: row.path,
        line: row.rowNumber,
      });
    } else if (a === 'delete' && !exists) {
      findings.push({
        check: 'FC_DELETE_MISSING',
        category: 'FILE_CHANGES_VERIFY',
        severity: 'ERROR',
        message: `FILE_CHANGES action=delete on missing path: ${row.path}`,
        details: 'File already deleted. Remove row from FILE_CHANGES (work already done).',
        file: row.path,
        line: row.rowNumber,
      });
    }
  }
  return findings;
}

export function extractInlineCodePaths(content: string): { value: string; line: number }[] {
  const stripped = stripBackticksAndCodeBlocks(content);
  const results: { value: string; line: number }[] = [];
  const lines = stripped.split(/\r?\n/);
  const pathRegex = /`([^`\s]+\.[A-Za-z][A-Za-z0-9]{1,8})`/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    pathRegex.lastIndex = 0;
    while ((match = pathRegex.exec(line)) !== null) {
      const candidate = match[1];
      const ext = path.extname(candidate).toLowerCase();
      if (!TRACKED_EXTENSIONS.has(ext)) continue;
      if (candidate.includes('://')) continue;
      results.push({ value: candidate, line: i + 1 });
    }
  }
  return results;
}

// strong-tests:skip invariants covered by evals iteration-2 isolated narrative-only fixture + negative fenced-skip
export function checkNarrativePaths(specDir: string, repoRoot: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const file of NARRATIVE_FILES) {
    const content = readFileOptional(specDir, file);
    if (!content) continue;
    const refs = extractInlineCodePaths(content);
    for (const ref of refs) {
      const segments = ref.value.split(/[\\/]/);
      if (segments.length === 1) continue;
      const resolved = path.resolve(repoRoot, ref.value);
      if (fs.existsSync(resolved)) continue;
      if (resolved.startsWith(specDir)) continue;
      findings.push({
        check: 'NARRATIVE_PATH_MISSING',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `Narrative path '${ref.value}' in ${file} does not exist`,
        details: 'Path mentioned in narrative is missing on disk. Update path or mark as [historical].',
        file: `${file}:${ref.line}`,
        line: ref.line,
      });
    }
  }
  return findings;
}

// strong-tests:skip uniqueness invariant covered by SRC002_04 (tests/e2e/spec-reality-check.test.ts) — duplicate FR-1 collapse asserted
export function extractFrIds(content: string): string[] {
  const ids = new Set<string>();
  if (!content) return [];
  const regex = /\bFR-(\d+[a-z]?)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    ids.add(`FR-${match[1]}`);
  }
  return [...ids];
}

// strong-tests:skip cardinality covered by evals iteration-2 (code-drift-only isolated + code-drift-skipped-no-git negative + forbidden_codes)
export function checkCodeDrift(specDir: string, repoRoot: string, fcPaths: string[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    findings.push({
      check: 'CODE_DRIFT_SKIPPED',
      category: 'LOGIC_GAPS',
      severity: 'INFO',
      message: 'git unavailable (.git missing) — code-drift check skipped',
    });
    return findings;
  }
  const frContent = readFileOptional(specDir, 'FR.md') || '';
  const frIds = extractFrIds(frContent);
  if (frIds.length === 0 || fcPaths.length === 0) return findings;
  for (const frId of frIds) {
    const args = ['log', '--max-count=20', '-S', frId, '--pretty=format:%H'];
    const limitedPaths = fcPaths.slice(0, 50);
    if (limitedPaths.length > 0) args.push('--', ...limitedPaths);
    const result = spawnSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      windowsHide: true,
    });
    if (result.error || result.status !== 0) continue;
    const shas = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
    if (shas.length > 0) {
      findings.push({
        check: 'CODE_DRIFT_FR_ALREADY_DONE',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `${frId} has ${shas.length} matching git commits — feature may already be shipped`,
        details: `commits: ${shas.slice(0, 3).join(', ')}${shas.length > 3 ? ' …' : ''}`,
      });
    }
  }
  return findings;
}

// strong-tests:skip OUT_OF_SCOPE/strikethrough filter invariant covered by SRC002_05 in tests/e2e/spec-reality-check.test.ts
export function extractTaskPaths(content: string): string[] {
  if (!content) return [];
  const paths = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (/\[OUT_OF_SCOPE/i.test(line)) continue;
    if (/~~[^~]+~~/.test(line)) continue;
    const filesMatch = line.match(/\*\*files?:\*\*\s*(.+)/i);
    if (!filesMatch) continue;
    const tail = filesMatch[1];
    const pathRegex = /`([^`]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = pathRegex.exec(tail)) !== null) {
      const cleaned = m[1].replace(/\s*\([a-z]+\)\s*$/i, '').trim();
      if (cleaned) paths.add(cleaned);
    }
  }
  return [...paths];
}

// strong-tests:skip orphan-detection invariant covered by evals iteration-2 (tasks-fc-only isolated fixture + forbidden_codes enforces no other check fires)
export function checkTasksFcConsistency(specDir: string, fcPaths: string[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const tasksContent = readFileOptional(specDir, 'TASKS.md');
  if (!tasksContent) return findings;
  const taskPaths = extractTaskPaths(tasksContent);
  const fcSet = new Set(fcPaths.map((p) => p.replace(/\\/g, '/')));
  const taskSet = new Set(taskPaths.map((p) => p.replace(/\\/g, '/')));
  for (const tp of taskSet) {
    if (!fcSet.has(tp)) {
      findings.push({
        check: 'TASKS_FC_CONSISTENCY',
        category: 'INCONSISTENCY',
        severity: 'WARNING',
        message: `TASKS.md references '${tp}' not in FILE_CHANGES.md`,
        details: 'Orphan TASK file: add to FILE_CHANGES or remove from TASKS.',
      });
    }
  }
  for (const fp of fcSet) {
    if (!taskSet.has(fp)) {
      findings.push({
        check: 'TASKS_FC_CONSISTENCY',
        category: 'INCONSISTENCY',
        severity: 'INFO',
        message: `FILE_CHANGES.md path '${fp}' not in TASKS.md`,
        details: 'Orphan FC file: TASKS may be incomplete.',
      });
    }
  }
  return findings;
}

export interface RunResult {
  findings: AuditFinding[];
  summary: {
    total: number;
    by_severity: { ERROR: number; WARNING: number; INFO: number };
    by_check: Record<string, number>;
  };
}

export function runChecks(specDir: string, repoRoot: string): RunResult {
  const findings: AuditFinding[] = [];
  const fcContent = readFileOptional(specDir, 'FILE_CHANGES.md');
  const { rows, findings: parseFindings } = parseFileChangesTable(fcContent || '');
  findings.push(...parseFindings);
  findings.push(...checkFcRows(rows, repoRoot));
  findings.push(...checkNarrativePaths(specDir, repoRoot));
  findings.push(...checkCodeDrift(specDir, repoRoot, rows.map((r) => r.path)));
  findings.push(...checkTasksFcConsistency(specDir, rows.map((r) => r.path)));

  const by_severity = { ERROR: 0, WARNING: 0, INFO: 0 };
  const by_check: Record<string, number> = {};
  for (const f of findings) {
    by_severity[f.severity]++;
    by_check[f.check] = (by_check[f.check] || 0) + 1;
  }
  findings.sort((a, b) => {
    const order = { ERROR: 0, WARNING: 1, INFO: 2 };
    return order[a.severity] - order[b.severity];
  });
  return { findings, summary: { total: findings.length, by_severity, by_check } };
}

function loadChalk() {
  try {
    const chalk = require('chalk');
    return chalk.default || chalk;
  } catch {
    return null;
  }
}

function formatJson(result: RunResult): string {
  return JSON.stringify(result, null, 2);
}

function formatHuman(result: RunResult): string {
  const chalk = loadChalk();
  const lines: string[] = [];
  const sevColor = (sev: string, text: string) => {
    if (!chalk) return text;
    if (sev === 'ERROR') return chalk.red(text);
    if (sev === 'WARNING') return chalk.yellow(text);
    return chalk.blue(text);
  };
  lines.push(`Reality check: ${result.summary.total} findings (${result.summary.by_severity.ERROR} ERROR / ${result.summary.by_severity.WARNING} WARNING / ${result.summary.by_severity.INFO} INFO)`);
  lines.push('');
  for (const f of result.findings) {
    const head = `${sevColor(f.severity, f.severity.padEnd(7))} ${f.check}`;
    lines.push(head);
    lines.push(`  ${f.message}`);
    if (f.file) lines.push(`  → ${f.file}${f.line ? `:${f.line}` : ''}`);
    if (f.details) lines.push(`  ${f.details}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatMarkdown(result: RunResult): string {
  const lines: string[] = [];
  lines.push(`# Reality Check Report`);
  lines.push('');
  lines.push(`Total findings: ${result.summary.total} (${result.summary.by_severity.ERROR} ERROR / ${result.summary.by_severity.WARNING} WARNING / ${result.summary.by_severity.INFO} INFO)`);
  lines.push('');
  lines.push('| Check | Severity | File | Message | Suggested fix |');
  lines.push('|-------|----------|------|---------|---------------|');
  for (const f of result.findings) {
    const file = f.file ? `\`${f.file}${f.line ? `:${f.line}` : ''}\`` : '';
    const msg = f.message.replace(/\|/g, '\\|');
    const details = (f.details || '').replace(/\|/g, '\\|');
    lines.push(`| ${f.check} | ${f.severity} | ${file} | ${msg} | ${details} |`);
  }
  return lines.join('\n');
}

interface CliArgs {
  specPath: string;
  format: 'json' | 'human' | 'markdown';
}

function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let format: CliArgs['format'] = 'json';
  let specPath = '';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--format') {
      const next = args[i + 1];
      if (next !== 'json' && next !== 'human' && next !== 'markdown') {
        throw new Error(`Unknown --format value: ${next}`);
      }
      format = next;
      i++;
    } else if (a.startsWith('--format=')) {
      const v = a.split('=')[1];
      if (v !== 'json' && v !== 'human' && v !== 'markdown') {
        throw new Error(`Unknown --format value: ${v}`);
      }
      format = v;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (!specPath) {
      specPath = a;
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
  }
  if (!specPath) {
    throw new Error('Missing required <spec-path> argument');
  }
  return { specPath, format };
}

function printHelp(): void {
  console.log(`Usage: verify.ts <spec-path> [--format json|human|markdown]

Verify spec docs against repository reality. Outputs AuditFinding[] shape.

Options:
  --format <type>   Output format (json default, human ANSI-colored, markdown table)
  -h, --help        Show this help

Exit codes:
  0  Always (findings are not errors)
  1  CLI/IO failure
`);
}

export function main(argv: string[]): number {
  let cli: CliArgs;
  try {
    cli = parseCliArgs(argv);
  } catch (e: any) {
    console.error(`verify.ts: ${e.message}`);
    printHelp();
    return 1;
  }
  let specDir: string;
  try {
    specDir = resolveSpecPath(cli.specPath);
  } catch (e: any) {
    console.error(`verify.ts: ${e.message}`);
    return 1;
  }
  const repoRoot = findRepoRoot(specDir);
  const result = runChecks(specDir, repoRoot);
  if (cli.format === 'json') {
    process.stdout.write(formatJson(result) + '\n');
  } else if (cli.format === 'human') {
    process.stdout.write(formatHuman(result) + '\n');
  } else {
    process.stdout.write(formatMarkdown(result) + '\n');
  }
  return 0;
}

const isDirectRun = (() => {
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    return true;
  }
  try {
    const entry = process.argv[1] || '';
    return entry.endsWith('verify.ts') || entry.endsWith('verify.js') || entry.endsWith('verify.mjs');
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exit(main(process.argv));
}
