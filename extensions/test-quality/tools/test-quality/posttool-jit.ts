#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string };
  session_id?: string;
  cwd?: string;
}

interface DetectorCandidate {
  function: string;
  line: number;
  kind: string;
  returnType: string;
  suggestedInvariants: string[];
  rationale: string;
}

interface DetectorSuppressed {
  function: string;
  line: number;
  reason: string;
  reasonLength: number;
  reasonWarning: string | null;
}

interface DetectorOutput {
  schemaVersion: number;
  file: string;
  stack: string | null;
  candidates: DetectorCandidate[];
  suppressed: DetectorSuppressed[];
  scanDurationMs: number;
  astGrepVersion: string | null;
}

const PRODUCTION_INCLUDE = /\.(ts|tsx|py|cs)$/i;
const TEST_EXCLUDE = /(?:[/\\]tests?[/\\]|[/\\]Tests[/\\]|__tests__|\.test\.tsx?$|\.spec\.tsx?$|_test\.py$|\.test\.cs$|Steps\.cs$|Tests\.cs$|Test\.cs$|_test\.cs$|\.feature$|\.md$)/i;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 2000);
  });
}

function isProductionFile(filePath: string): boolean {
  if (!PRODUCTION_INCLUDE.test(filePath)) return false;
  if (TEST_EXCLUDE.test(filePath)) return false;
  return true;
}

function sanitizeReason(reason: string): string {
  return reason.replace(/[\r\n]/g, ' ');
}

function appendAuditLog(
  projectDir: string,
  file: string,
  functionRef: string,
  reason: string,
  sessionId: string,
  cwd: string,
  warning: string | null,
): void {
  const logDir = path.join(projectDir, '.claude', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'strong-tests-skips.jsonl');
  const entry = {
    ts: new Date().toISOString(),
    file: path.resolve(file),
    function: functionRef,
    reason: sanitizeReason(reason),
    session_id: sessionId,
    cwd,
    warning,
  };
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { flag: 'a', encoding: 'utf-8' });
}

function emitDegradationContext(reason: string): void {
  const response = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `JiT detector unavailable (${reason.trim().slice(0, 100)}) — invoke /strong-tests manually if the just-edited function returns a collection or contains N×M loops. Per .claude/rules/testing/output-invariants-first.md — composition bugs (leaves-correct, composition-broken class) require invariant tests beyond per-input cases.`,
    },
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function buildAdditionalContext(out: DetectorOutput): string {
  if (out.candidates.length === 0) return '';
  const lines: string[] = [];
  lines.push(
    `JiT auto-trigger (strong-tests) — ${out.candidates.length} candidate function(s) in ${out.file}:`,
  );
  for (const c of out.candidates) {
    lines.push(
      `  - ${out.file}:${c.line} — function \`${c.function}\` returns \`${c.returnType}\` (${c.kind}). Suggested invariants: ${c.suggestedInvariants.join(' / ')}. Rationale: ${c.rationale}`,
    );
  }
  lines.push('');
  lines.push(
    'Per `.claude/rules/testing/output-invariants-first.md` §"Class of bug: leaves correct, composition broken" — write invariant tests inline before reporting ready. Composition bugs (e.g., 5 worktrees × 5 entries = 25 rows instead of 5) are caught by invariant tests but missed by per-input tests.',
  );
  lines.push(
    'To suppress legitimate exceptions: `// strong-tests:skip <reason ≥8 chars>` (TS) or `# strong-tests:skip <reason>` (Python) on signature line OR above. Audit log: `.claude/logs/strong-tests-skips.jsonl`.',
  );
  return lines.join('\n');
}

function dbg(msg: string): void {
  if (process.env.JIT_DEBUG === '1') {
    process.stderr.write(`[jit-hook] ${msg}\n`);
  }
}

async function main(): Promise<void> {
  try {
    dbg('start');
    const stdin = await readStdin();
    dbg(`stdin len=${stdin.length}`);
    let input: HookInput = {};
    if (stdin.trim()) {
      try {
        input = JSON.parse(stdin) as HookInput;
      } catch (e) {
        dbg(`json parse fail: ${(e as Error).message}`);
        process.exit(0);
      }
    }
    const filePath = input.tool_input?.file_path;
    dbg(`filePath=${filePath}`);
    if (!filePath || !isProductionFile(filePath)) {
      dbg(`not production or no file_path; isProd=${filePath ? isProductionFile(filePath) : 'no-path'}`);
      process.exit(0);
    }
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    dbg(`projectDir=${projectDir}`);
    const sessionId = input.session_id ?? 'unknown';
    const cwd = input.cwd ?? process.cwd();
    const detectorPath = path.join(
      projectDir,
      '.claude',
      'skills',
      'strong-tests',
      'scripts',
      'detect-invariant-candidates.ts',
    );
    dbg(`detectorPath=${detectorPath} exists=${fs.existsSync(detectorPath)}`);
    if (!fs.existsSync(detectorPath)) {
      process.exit(0);
    }
    const detectorResult = spawnSync('npx', ['tsx', detectorPath, filePath], {
      encoding: 'utf-8',
      timeout: 5000,
      shell: process.platform === 'win32',
    });
    dbg(`detector status=${detectorResult.status} stderr=${detectorResult.stderr?.slice(0, 200)}`);
    if (detectorResult.status !== 0) {
      emitDegradationContext(detectorResult.stderr ?? 'detector failed');
      process.exit(0);
    }
    let detectorOutput: DetectorOutput;
    try {
      detectorOutput = JSON.parse(detectorResult.stdout) as DetectorOutput;
      dbg(`detector candidates=${detectorOutput.candidates.length} suppressed=${detectorOutput.suppressed.length}`);
    } catch (e) {
      dbg(`detector output parse fail: ${(e as Error).message}; stdout=${detectorResult.stdout?.slice(0, 200)}`);
      emitDegradationContext('detector output unparseable');
      process.exit(0);
    }
    for (const sup of detectorOutput.suppressed) {
      try {
        appendAuditLog(projectDir, filePath, sup.function, sup.reason, sessionId, cwd, sup.reasonWarning);
      } catch {
        // log failure must not block
      }
    }
    const additionalContext = buildAdditionalContext(detectorOutput);
    if (additionalContext) {
      const response = {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext,
        },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
