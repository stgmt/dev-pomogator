/**
 * spec-access-guard — FR-39c/f PreToolUse hook (P17-3, SHADOW by default).
 *
 * MCP-rails: the AGENT must read/write specs through the MCP door (read_spec_doc
 * / list_spec_docs / propose_spec_change / apply_spec_change), not by raw
 * Read/Grep/Glob/Edit/Write/Bash over `.specs/**`. This guard is the
 * enforcement point for the interactive main session (the phase agents enforce
 * it differently — via their allowed-tools, FR-41).
 *
 * Two tiers (FR-39c — SHADOW first, enforce LAST):
 *   - SHADOW (default): a match is LOGGED to spec-access.jsonl, NOT blocked.
 *   - ENFORCE (`SPEC_ACCESS_ENFORCE=true`): a match is DENIED with a pointer
 *     to the MCP tools. Escape: `[skip-spec-access: <reason ≥8>]` in the commit
 *     message is N/A here (no commit); use env `SPEC_ACCESS_SKIP=1` — logged.
 *
 * The Bash matcher is an ALGORITHM, not a substring (FR-39f): a command whose
 * executable is an ENGINE CLI (spec-verdict / validate-spec / audit-spec /
 * spec-status / corpus-health / collision-probe / spec-form-parsers /
 * scaffold-spec / anchor-integrity) is ALLOWED even with `.specs/` arguments —
 * those ARE the backing of the door. Generic readers/writers (cat/sed/grep/awk/
 * `node -e`/heredoc) touching `.specs/` are violations.
 *
 * NFR-Performance-10: the `.specs/` path filter runs BEFORE any other work.
 * NFR-Reliability-11: SOFT tier — any internal error → fail-open (exit 0).
 * FR-39d: registered LIVE in both manifests + protected by the meta-guard.
 *
 * @see .specs/spec-generator-v4/FR.md FR-39
 */
import fs from 'fs';
import path from 'path';
import { readStdin } from '../_shared/stdin.ts';

const HOOK_NAME = 'spec-access-guard';

/** Engine CLIs allowed to touch `.specs/` from Bash (FR-39f whitelist). */
const ENGINE_CLI = [
  'spec-verdict',
  'validate-spec',
  'audit-spec',
  'spec-status',
  'corpus-health',
  'collision-probe',
  'spec-form-parsers',
  'scaffold-spec',
  'anchor-integrity',
  'analyze-features',
];

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    path?: string;
    pattern?: string;
    glob?: string;
    command?: string;
  };
  cwd?: string;
}

/** Does any string argument touch `.specs/`? (fast, pre-I/O). */
function touchesSpecs(s: string | undefined): boolean {
  if (!s) return false;
  return s.replace(/\\/g, '/').includes('.specs/');
}

/**
 * Does the Bash command actually INVOKE the engine (FR-39f)? Two recognizers,
 * both token-based (a whole-command substring check was bypassed by comment bait
 * `cat .specs/x # spec-verdict` and path collision `cat .specs/audit-spec-notes/`
 * — 2026-06-07 review, HIGH):
 *
 *   (a) a canonical engine CLI by bare name / path — some token's basename (minus
 *       .ts/.js/.mjs/.cjs) ∈ ENGINE_CLI (covers PATH-installed `spec-verdict` and
 *       `tsx tools/.../spec-verdict.ts`); AND
 *   (b) ANY PROJECT SCRIPT — a `.ts/.js/.mjs/.cjs` token whose path is under
 *       `tools/` or `.claude/skills/`. The DESIGN rationale is "the engine reads
 *       /writes .specs/ as before — it IS the door's backend", and the engine is
 *       not just the 10 named CLIs: `node tools/anchor-integrity/fix.mjs --apply`,
 *       `tsx .../scripts/full-mode.ts`, `variant-matrix-cli.ts <spec-path>` etc.
 *       have basenames (`fix`/`full-mode`/`check`) too generic to whitelist, yet
 *       are legitimate engine invocations. A hand-maintained basename list drifts
 *       (it missed every directory-named tool — 2026-06-08 review, the second
 *       drift); recognizing the project-script PATH fixes the class.
 *
 * Inline code carries NO such script-path token, so it stays a violation:
 * `node -e "fs.readFileSync('.specs/…')"` and a `<<EOF`-to-`/tmp/x.mjs` heredoc
 * both fail (b) — `/tmp/x.mjs` is not under tools/ or .claude/skills/.
 */
function invokesEngineCli(rawCmd: string): boolean {
  const cmd = rawCmd.replace(/(^|\s)#.*$/gm, '$1'); // strip comments-to-EOL
  const tokens = cmd.split(/[\s|;&()<>]+/).filter(Boolean);
  return tokens.some((tok) => {
    const norm = tok.replace(/\\/g, '/');
    const base = norm.split('/').pop()!.replace(/\.(ts|js|mjs|cjs)$/i, '');
    if (ENGINE_CLI.includes(base)) return true; // (a) canonical CLI
    // (b) any project script (the engine's own code) — path-anchored, not basename.
    return /\.(ts|js|mjs|cjs)$/i.test(norm) && /(^|\/)(tools|\.claude\/skills)\//.test(norm);
  });
}

/**
 * Decide whether this tool call is a spec-access VIOLATION. Pure — exported
 * for the contract test. Returns the offending detail or null.
 */
export function violationOf(data: PreToolUseInput): { tool: string; detail: string } | null {
  const t = data.tool_name;
  const inp = data.tool_input ?? {};
  if (t === 'Read' || t === 'Edit' || t === 'Write') {
    if (touchesSpecs(inp.file_path)) return { tool: t, detail: inp.file_path! };
    return null;
  }
  if (t === 'Glob') {
    // For Glob, `pattern` IS the path scope (e.g. ".specs/**/*.md").
    if (touchesSpecs(inp.path) || touchesSpecs(inp.pattern)) {
      return { tool: t, detail: inp.path ?? inp.pattern ?? '' };
    }
    return null;
  }
  if (t === 'Grep') {
    // For Grep, `pattern` is SEARCH TEXT, not a path — gate on the path/glob
    // SCOPE only (a search for the literal '.specs/' over src/ is not a
    // spec-access violation; a Grep scoped by glob '.specs/**' IS).
    if (touchesSpecs(inp.path) || touchesSpecs(inp.glob)) {
      return { tool: t, detail: inp.path ?? inp.glob ?? '' };
    }
    return null;
  }
  if (t === 'Bash') {
    const cmd = inp.command ?? '';
    if (!touchesSpecs(cmd)) return null;
    // FR-39f: an engine-CLI invocation is ALLOWED even with .specs/ args.
    if (invokesEngineCli(cmd)) return null;
    return { tool: 'Bash', detail: cmd.slice(0, 120) };
  }
  return null;
}

function logAccess(repoRoot: string, event: Record<string, unknown>): void {
  try {
    const dir = path.join(repoRoot, '.dev-pomogator', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'spec-access.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n',
      'utf-8',
    );
  } catch {
    /* SOFT tier — never break the call over the audit log */
  }
}

function logEscape(repoRoot: string, reason: string): void {
  try {
    const dir = path.join(repoRoot, '.claude', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'spec-access-escapes.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), reason, cwd: repoRoot }) + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort */
  }
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as PreToolUseInput;
  const v = violationOf(data);
  if (!v) process.exit(0); // not a spec-access tool call — pre-I/O fast path

  const repoRoot = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  const enforce = process.env.SPEC_ACCESS_ENFORCE === 'true';

  // Escape hatch (enforce only): env opt-out, logged for audit.
  if (enforce && process.env.SPEC_ACCESS_SKIP === '1') {
    logEscape(repoRoot, 'SPEC_ACCESS_SKIP=1');
    logAccess(repoRoot, { hook: HOOK_NAME, tool: v.tool, decision: 'escaped', detail: v.detail });
    process.exit(0);
  }

  logAccess(repoRoot, {
    hook: HOOK_NAME,
    tool: v.tool,
    decision: enforce ? 'denied' : 'shadow',
    detail: v.detail,
  });

  if (!enforce) {
    process.stderr.write(`[${HOOK_NAME}] shadow: ${v.tool} touches .specs/ — use the MCP spec tools\n`);
    process.exit(0);
  }

  const reason =
    `[${HOOK_NAME}] ${v.tool} on .specs/ is not allowed — read/write specs through the MCP door:\n` +
    `  read:  list_spec_docs / read_spec_doc / get_trace / get_node / search\n` +
    `  write: propose_spec_change / apply_spec_change / create_spec\n` +
    `  detail: ${v.detail}\n` +
    `  escape (deliberate): set SPEC_ACCESS_SKIP=1 (logged).`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(2);
}

const isDirectRun =
  process.argv[1]?.endsWith('spec-access-guard.ts') || process.argv[1]?.endsWith('spec-access-guard.js');
if (isDirectRun) {
  main().catch((e) => {
    process.stderr.write(`[${HOOK_NAME}] fail-open: ${e}\n`);
    process.exit(0); // SOFT tier
  });
}
