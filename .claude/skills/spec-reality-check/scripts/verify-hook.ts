#!/usr/bin/env npx tsx
/**
 * spec-reality-check verify-hook.ts — PreToolUse hook for ExitPlanMode.
 *
 * Reads stdin JSON, extracts `.specs/{slug}/` references from tool_input.plan
 * (and optional planFilePath content), runs verify.ts on each spec, aggregates
 * ERROR-severity findings. If any ERROR — outputs deny JSON for Claude Code.
 *
 * Fail-open: any internal exception → stderr warning + permits.
 *
 * Spec: .specs/spec-reality-check/FR.md FR-7, FR-8
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'node:url';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    plan?: string;
    planFilePath?: string;
    [k: string]: unknown;
  };
}

interface AuditFinding {
  check: string;
  category: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  details?: string;
  file?: string;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

export function extractSpecRefs(text: string): string[] {
  if (!text) return [];
  const refs = new Set<string>();
  const regex = /\.specs\/(?:backlog\/)?([A-Za-z0-9][A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const slug = m[1];
    if (slug.endsWith('.md') || slug.endsWith('.json') || slug.endsWith('.feature')) continue;
    refs.add(m[0]);
  }
  return [...refs];
}

function findVerifyScript(): string | null {
  const __filename = (() => {
    try {
      return fileURLToPath(import.meta.url);
    } catch {
      return process.argv[1] || '';
    }
  })();
  const here = __filename ? path.dirname(__filename) : process.cwd();
  const candidates = [
    path.join(here, 'verify.ts'),
    path.join(here, 'verify.js'),
    path.resolve(here, '..', '..', '..', 'spec-reality-check', 'scripts', 'verify.ts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function runVerifyOnSpec(specRelativeOrAbsolute: string, cwd: string, verifyScript: string): AuditFinding[] {
  const specPath = path.isAbsolute(specRelativeOrAbsolute)
    ? specRelativeOrAbsolute
    : path.resolve(cwd, specRelativeOrAbsolute);
  if (!fs.existsSync(specPath)) return [];
  const isWin = process.platform === 'win32';
  const quote = (s: string) => isWin ? `"${s.replace(/"/g, '\\"')}"` : `'${s.replace(/'/g, "'\\''")}'`;
  const cmd = `npx tsx ${quote(verifyScript)} ${quote(specPath)} --format json`;
  const result = spawnSync(cmd, {
    cwd,
    encoding: 'utf-8',
    windowsHide: true,
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout || '{"findings":[]}');
    return parsed.findings || [];
  } catch {
    return [];
  }
}

function loadPlanFileText(planFilePath: string | undefined, cwd: string): string {
  if (!planFilePath) return '';
  const candidates = [
    planFilePath,
    path.isAbsolute(planFilePath) ? planFilePath : path.resolve(cwd, planFilePath),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return fs.readFileSync(c, 'utf-8');
    } catch {
      continue;
    }
  }
  return '';
}

function formatDenyReason(specToFindings: Record<string, AuditFinding[]>): string {
  const sections: string[] = [];
  sections.push('[spec-reality-check] Detected drift between spec docs and repository reality.');
  sections.push('');
  for (const [spec, findings] of Object.entries(specToFindings)) {
    const errors = findings.filter((f) => f.severity === 'ERROR');
    if (errors.length === 0) continue;
    sections.push(`Spec: ${spec} (${errors.length} ERROR)`);
    for (const f of errors.slice(0, 8)) {
      sections.push(`  • [${f.check}] ${f.message}`);
      if (f.details) sections.push(`     ${f.details}`);
    }
    if (errors.length > 8) sections.push(`  … +${errors.length - 8} more`);
    sections.push('');
  }
  sections.push('To proceed:');
  sections.push('  1. Fix the listed drift in spec docs (FILE_CHANGES paths / narrative refs)');
  sections.push('  2. Re-run: npx tsx .claude/skills/spec-reality-check/scripts/verify.ts <spec-path> --format human');
  sections.push('  3. When verify reports 0 ERRORs — call ExitPlanMode again');
  return sections.join('\n').slice(0, 2000);
}

async function mainImpl(): Promise<number> {
  const raw = await readStdin();
  if (!raw.trim()) return 0;
  let input: PreToolUseInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (input.tool_name !== 'ExitPlanMode') return 0;
  const cwd = input.cwd || process.cwd();
  const planText = input.tool_input?.plan || '';
  const planFileText = loadPlanFileText(input.tool_input?.planFilePath, cwd);
  const combinedText = `${planText}\n${planFileText}`;
  const refs = extractSpecRefs(combinedText);
  if (refs.length === 0) return 0;

  const verifyScript = findVerifyScript();
  if (!verifyScript) return 0;

  const specToFindings: Record<string, AuditFinding[]> = {};
  let totalErrors = 0;
  for (const ref of refs) {
    const findings = runVerifyOnSpec(ref, cwd, verifyScript);
    if (findings.length === 0) continue;
    specToFindings[ref] = findings;
    totalErrors += findings.filter((f) => f.severity === 'ERROR').length;
  }
  if (totalErrors === 0) return 0;

  const reason = formatDenyReason(specToFindings);
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(output));
  return 0;
}

export async function main(): Promise<number> {
  try {
    return await mainImpl();
  } catch (e: any) {
    try {
      process.stderr.write(`[spec-reality-check] hook execution failed (fail-open): ${e?.message || e}\n`);
    } catch {}
    return 0;
  }
}

const isDirectRun = (() => {
  try {
    const entry = process.argv[1] || '';
    return entry.endsWith('verify-hook.ts') || entry.endsWith('verify-hook.js') || entry.endsWith('verify-hook.mjs');
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().then((code) => process.exit(code));
}
