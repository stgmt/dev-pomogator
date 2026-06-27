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
 *     to the MCP tools. Escape (both logged to spec-access-escapes.jsonl):
 *     `[skip-spec-access: <reason ≥8>]` in the Bash command TEXT (the per-call
 *     channel the agent controls — P21-2), OR session env `SPEC_ACCESS_SKIP=1`.
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
const ENGINE_RUNTIMES = new Set(['node', 'npx', 'tsx', 'bun', 'deno']);

/** Is this token the engine — a canonical CLI basename or a project script path? */
function isEngineToken(tok: string): boolean {
  const norm = tok.replace(/\\/g, '/');
  const base = norm.split('/').pop()!.replace(/\.(ts|js|mjs|cjs)$/i, '');
  if (ENGINE_CLI.includes(base)) return true; // (a) canonical CLI
  // (b) any project script (the engine's own code) — path-anchored, not basename.
  return /\.(ts|js|mjs|cjs)$/i.test(norm) && /(^|\/)(tools|\.claude\/skills)\//.test(norm);
}

/**
 * P21-2 git carve-out: VCS PLUMBING over `.specs/` is allowed under enforce —
 * committing door-written spec changes is version control, NOT a spec read/write
 * bypass. Allowed git subcommands move specs through the index/history WITHOUT
 * revealing or rewriting content (add/commit/status/stash + unstage-only forms).
 * DENIED: content-leak (show/diff/log/grep/blame) and worktree-rewriting forms
 * (checkout/switch, plain restore, plain rm, reset --hard) — those ARE raw
 * read/write of spec content and must go through the MCP door.
 *
 * Every pipeline segment that touches `.specs/` must itself be safe git plumbing;
 * a single non-plumbing spec-touching segment fails the whole command.
 */
const GIT_PLUMBING_SAFE = new Set(['add', 'commit', 'status', 'stash']);
const GIT_CONTENT_LEAK = new Set(['show', 'diff', 'log', 'grep', 'blame', 'cat-file', 'checkout', 'switch']);
function isSpecVcsPlumbingOnly(rawCmd: string): boolean {
  // Strip heredoc BODIES, comments AND quoted strings FIRST — a commit message is
  // DATA, not a command: `git commit -m "…(.specs/x)…"` must not be shredded by the
  // segment splitter (the message's parens/slashes/`.specs/` are not shell structure).
  // A multi-line message via `git commit -F - -- <paths> <<'EOF' … EOF` carries the
  // message as a HEREDOC; without removing the body the `\n` splitter turns each
  // message line into a pseudo-segment that isn't `git …`, so the carve-out wrongly
  // fails (dogfood 2026-06-21: the bdd-migrator's own recommended multi-line-commit
  // form was DENIED over a `.specs/` pathspec — its body lines split into non-git segments).
  const cmd = rawCmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, ' ')
    .replace(/(^|\s)#.*$/gm, '$1')
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
  const segments = cmd.split(/&&|\|\||[|;&\n()]+/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  // EVERY pipeline segment must be safe git plumbing (we're here only because the
  // raw command mentions `.specs/`; a single non-plumbing segment fails it).
  for (const seg of segments) {
    const argv = seg.replace(/[<>].*$/, '').trim().split(/\s+/).filter(Boolean);
    let k = 0;
    while (k < argv.length && /^[A-Za-z_]\w*=/.test(argv[k])) k++; // skip env prefixes
    if (argv[k] !== 'git') return false; // a non-git command segment → not plumbing
    const rest = argv.slice(k + 1);
    const sub = rest.find((a) => !a.startsWith('-')) ?? ''; // first non-flag = subcommand
    const flags = rest.filter((a) => a.startsWith('-')); // ALL flags, any position
    if (GIT_CONTENT_LEAK.has(sub) || !GIT_PLUMBING_SAFE.has(sub)) {
      // restore/rm/reset are safe ONLY in their unstage-only (no-worktree-write) forms.
      const unstageOnly =
        (sub === 'restore' && flags.includes('--staged')) ||
        (sub === 'rm' && flags.includes('--cached')) ||
        (sub === 'reset' && !flags.includes('--hard'));
      if (!unstageOnly) return false;
    }
  }
  return true;
}

function invokesEngineCli(rawCmd: string): boolean {
  const cmd = rawCmd.replace(/(^|\s)#.*$/gm, '$1'); // strip comments-to-EOL
  // Per PIPELINE SEGMENT — the engine must be in COMMAND position, never a
  // redirect target or a plain arg: `cat .specs/x > tools/y.ts` and
  // `cp .specs/x tools/y.ts` are content-read bypasses if a `tools/*.ts` token
  // anywhere counted (2026-06-08 review #3). Split on pipeline/sequence ops.
  const segments = cmd.split(/&&|\|\||[|;&\n()]+/).map((s) => s.trim()).filter(Boolean);
  return segments.some((seg) => {
    // Drop redirect targets (everything from the first < or > onward is not argv).
    const argv = seg.replace(/[<>].*$/, '').trim().split(/\s+/).filter(Boolean);
    if (argv.length === 0) return false;
    if (isEngineToken(argv[0])) return true; // engine is argv[0] (bare CLI or ./script)
    // OR: a JS runtime + (flags / chained runtime) + the engine script as first real arg.
    const exe = argv[0].replace(/\\/g, '/').split('/').pop()!;
    if (!ENGINE_RUNTIMES.has(exe)) return false;
    for (let i = 1; i < argv.length; i++) {
      if (argv[i].startsWith('-')) continue; // flag, e.g. --import
      if (ENGINE_RUNTIMES.has(argv[i])) continue; // npx tsx … (chained runtime)
      return isEngineToken(argv[i]); // first real arg must BE the engine script
    }
    return false;
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
    // P21-2: git VCS plumbing over specs (commit door-written changes) is ALLOWED.
    if (isSpecVcsPlumbingOnly(cmd)) return null;
    return { tool: 'Bash', detail: cmd.slice(0, 120) };
  }
  return null;
}

/**
 * #3 actionable DENY: if a DENIED Bash command was a grep/rg over .specs/, map it to the concrete
 * graph-aware door call the agent should have run instead — e.g. `grep "jira-mode" .specs/` →
 * `spec-door.ts search "jira-mode"`. Best-effort: the first quoted pattern (or first non-flag /
 * non-path bareword) after the grep tool. Returns null when no clean search term is recoverable.
 */
export function suggestDoorCall(command: string | undefined): string | null {
  if (!command || !/\b(?:grep|egrep|fgrep|rg)\b/.test(command)) return null;
  const quoted = command.match(/\b(?:grep|egrep|fgrep|rg)\b[^\n]*?(["'])(.+?)\1/);
  let pattern: string | undefined = quoted?.[2];
  if (!pattern) {
    const after = command.split(/\b(?:grep|egrep|fgrep|rg)\b/)[1] ?? '';
    pattern = after
      .trim()
      .split(/\s+/)
      .find((tok) => tok && !tok.startsWith('-') && !tok.includes('/') && !tok.includes('.specs'));
  }
  const term = (pattern ?? '').replace(/["'`]/g, '').trim().slice(0, 60);
  if (!term) return null;
  return `node --import tsx scripts/spec-door.ts search ${JSON.stringify(term)}`;
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

/**
 * P21-2 inline escape: `[skip-spec-access: <reason>]` in a Bash command's TEXT —
 * the per-call channel the agent actually controls (an env PREFIX like
 * `SPEC_ACCESS_SKIP=1 cmd` never reaches the hook: the hook reads its OWN process
 * env = the session env, not the spawned command's). Mirrors the sibling
 * commit-marker gates (`[skip-scope-verify: …]`). Returns the trimmed reason when
 * the marker is present (`''` if present-but-empty), or null when absent. The
 * caller honours it only when `reason.length >= 8` (substantive rationale), else
 * WARNs and still denies — same anti-gaming bar as the sibling gates.
 */
export function extractSkipMarker(cmd: string | undefined): string | null {
  if (!cmd) return null;
  const m = cmd.match(/\[skip-spec-access:\s*([^\]]*)\]/i);
  return m ? m[1].trim() : null;
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

/**
 * Is enforce ON? Set manually (SPEC_ACCESS_ENFORCE — dogfood/CI) OR via the plugin's
 * `userConfig.spec_access_enforce` toggle, which Claude Code auto-exports to plugin
 * subprocesses as `CLAUDE_PLUGIN_OPTION_<key>` (casing matched both ways) — so INSTALLED
 * users get enforce from the enable-time toggle, no settings.json hand-editing. Env
 * inherits through the bootstrap→tsx-runner→guard chain. Exported pure for the BDD bind.
 */
export function enforceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const onish = (v: string | undefined): boolean => v === 'true' || v === '1';
  return (
    onish(env.SPEC_ACCESS_ENFORCE) ||
    onish(env.CLAUDE_PLUGIN_OPTION_spec_access_enforce) ||
    onish(env.CLAUDE_PLUGIN_OPTION_SPEC_ACCESS_ENFORCE)
  );
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as PreToolUseInput;
  const v = violationOf(data);
  if (!v) process.exit(0); // not a spec-access tool call — pre-I/O fast path

  const repoRoot = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  const enforce = enforceEnabled(process.env);

  // Escape hatch (enforce only), both logged for audit:
  //  (1) env SPEC_ACCESS_SKIP=1 — session-level deliberate opt-out (all tools).
  //  (2) P21-2: `[skip-spec-access: <reason ≥8>]` in a Bash command's TEXT — the
  //      per-call channel the agent controls (the env prefix never reached here).
  if (enforce && process.env.SPEC_ACCESS_SKIP === '1') {
    logEscape(repoRoot, 'SPEC_ACCESS_SKIP=1');
    logAccess(repoRoot, { hook: HOOK_NAME, tool: v.tool, decision: 'escaped', detail: v.detail });
    process.exit(0);
  }
  if (enforce && v.tool === 'Bash') {
    const marker = extractSkipMarker(data.tool_input?.command);
    if (marker !== null && marker.length >= 8) {
      logEscape(repoRoot, `[skip-spec-access] ${marker}`);
      logAccess(repoRoot, { hook: HOOK_NAME, tool: v.tool, decision: 'escaped', detail: v.detail });
      process.exit(0);
    }
    if (marker !== null) {
      // Present but too short — NOT honoured (anti-gaming); fall through to DENY.
      process.stderr.write(`[${HOOK_NAME}] [skip-spec-access] reason too short (<8 chars) — not honoured\n`);
    }
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

  const escapeLine =
    v.tool === 'Bash'
      ? `  escape (deliberate): append \`# [skip-spec-access: <reason ≥8 chars>]\` to the command, or set SPEC_ACCESS_SKIP=1 (both logged).`
      : `  escape (deliberate): set SPEC_ACCESS_SKIP=1 (logged); the inline marker is Bash-only — read/write THIS through the door.`;
  const suggestion = v.tool === 'Bash' ? suggestDoorCall(data.tool_input?.command) : null;
  const suggestionLine = suggestion ? `  → THIS grep maps to: ${suggestion}\n` : '';
  const reason =
    `[${HOOK_NAME}] ${v.tool} on .specs/ is not allowed — read/write specs through the MCP door:\n` +
    suggestionLine +
    `  read:  list_spec_docs / read_spec_doc / get_trace / get_node / search\n` +
    `  write: propose_spec_change / apply_spec_change / create_spec\n` +
    `  no live MCP? harness CLI (no .specs/ literal in the command — use INSTEAD of grepping .specs/):\n` +
    `         node --import tsx scripts/spec-door.ts search "<query>" | trace <node_id> | list <spec> | read <spec> <doc>\n` +
    `  detail: ${v.detail}\n` +
    escapeLine;
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
