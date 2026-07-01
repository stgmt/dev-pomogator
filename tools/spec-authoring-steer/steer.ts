#!/usr/bin/env npx tsx
/**
 * spec-authoring-steer — PreToolUse hook (SHADOW by default, like spec-access-guard).
 *
 * PROBLEM it fixes (2026-06-29, bdd-test-scanner session): the agent hand-authored
 * every spec FORM doc via raw `apply_spec_change` per document instead of the
 * create-spec workflow's automator sub-skills — so it fought the cross-doc anchor
 * web + the form guards by hand. The spec-access-guard already forces spec access
 * through the MCP door, but "hand-writing a whole form doc THROUGH the door" is not
 * caught (the door call is sanctioned). This guard catches THAT and steers to the
 * sub-skill that auto-fills the v3 forms + wires the FR/AC/@feature links.
 *
 * Two tiers (mirror spec-access-guard FR-39c):
 *   - SHADOW (default): a match is LOGGED + a stderr nudge; the call PROCEEDS.
 *   - ENFORCE (`SPEC_AUTHORING_ENFORCE=true`): a match is DENIED with the sub-skill
 *     pointer. Escape: `[skip-spec-steer: <reason ≥8>]` in the reason/text, or
 *     session env `SPEC_AUTHORING_SKIP=1` (both logged).
 *
 * Scope: only a FULL-doc author of a FORM doc that HAS an automator sub-skill —
 *   USER_STORIES.md / RESEARCH.md -> discovery-forms
 *   REQUIREMENTS.md / DESIGN.md   -> requirements-chk-matrix
 *   TASKS.md                      -> task-board-forms
 * A small targeted edit (old_string/new_string, no full `content`) is NOT a match —
 * point fixes and the sub-skills' own writes stay free.
 *
 * Reliability: builtins-only (node:fs/node:path), fail-open (any error -> exit 0).
 * Decision logic is the pure exported `steerDecision(...)`, unit/BDD-testable.
 */
import fs from 'node:fs';
import path from 'node:path';

const HOOK_NAME = 'spec-authoring-steer';

/** Form doc -> the create-spec automator sub-skill that should author it. */
const DOC_SKILL: Record<string, string> = {
  'USER_STORIES.md': 'discovery-forms',
  'RESEARCH.md': 'discovery-forms',
  'REQUIREMENTS.md': 'requirements-chk-matrix',
  'DESIGN.md': 'requirements-chk-matrix',
  'TASKS.md': 'task-board-forms',
};

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: {
    spec?: string;
    doc?: string;
    content?: string;
    old_string?: string;
    file_path?: string;
    reason?: string;
  };
  cwd?: string;
}

/** basename of a doc/file path (handles both `doc` names and full `.specs/...` paths). */
function docBasename(s: string | undefined): string | null {
  if (!s) return null;
  return s.replace(/\\/g, '/').split('/').pop() ?? null;
}

/**
 * Is this a FULL-doc hand-author of a form doc that has an automator skill?
 * Pure — exported for the contract test. Returns the steer or null.
 *
 * Match conditions (ALL):
 *  - tool is the MCP `apply_spec_change` OR a raw Write of a `.specs/**` form doc;
 *  - the target doc basename is one of the automator form docs;
 *  - the write carries a FULL `content` body (whole-doc authoring), not a
 *    targeted old_string/new_string edit, and the body is non-trivial (> 400 chars).
 */
export function steerDecision(data: PreToolUseInput): { doc: string; skill: string } | null {
  const t = data.tool_name ?? '';
  const inp = data.tool_input ?? {};
  const isDoorApply = /(^|__)apply_spec_change$/.test(t);
  const isRawWrite = t === 'Write';
  if (!isDoorApply && !isRawWrite) return null;

  const docName = isDoorApply ? docBasename(inp.doc) : docBasename(inp.file_path);
  if (!docName || !(docName in DOC_SKILL)) return null;

  // Raw Write must actually target a spec tree (the MCP door is spec-scoped already).
  if (isRawWrite && !(inp.file_path ?? '').replace(/\\/g, '/').includes('.specs/')) return null;

  // FULL-doc author only: a `content` body present, and no targeted edit anchor.
  const content = inp.content;
  if (typeof content !== 'string' || inp.old_string) return null;
  if (content.length < 400) return null; // tiny stub/placeholder — not worth steering

  return { doc: docName, skill: DOC_SKILL[docName] };
}

/**
 * Deliberate per-call escape marker in the door `reason` (NOT the doc content — a
 * marker in `content` would pollute the spec doc). The automator sub-skills put
 * `[skip-spec-steer: <skill> autofill]` in their apply reason so enforce never
 * blocks their own full-content writes; the agent uses the same channel for a
 * legitimate hand-write the sub-skill can't do.
 */
export function extractSkip(data: PreToolUseInput): string | null {
  const hay = `${data.tool_input?.reason ?? ''}`;
  const m = hay.match(/\[skip-spec-steer:\s*([^\]]*)\]/i);
  return m ? m[1].trim() : null;
}

export function enforceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const on = (v: string | undefined) => v === 'true' || v === '1';
  return (
    on(env.SPEC_AUTHORING_ENFORCE) ||
    on(env.CLAUDE_PLUGIN_OPTION_spec_authoring_enforce) ||
    on(env.CLAUDE_PLUGIN_OPTION_SPEC_AUTHORING_ENFORCE)
  );
}

function log(repoRoot: string, event: Record<string, unknown>): void {
  try {
    const dir = path.join(repoRoot, '.dev-pomogator', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'spec-authoring-steer.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n',
      'utf-8',
    );
  } catch {
    /* SOFT — never break the call over the audit log */
  }
}

function readStdinSync(): string {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function main(): void {
  if (process.stdin.isTTY) return;
  const raw = readStdinSync();
  if (!raw.trim()) return;

  const data = JSON.parse(raw) as PreToolUseInput;
  const hit = steerDecision(data);
  if (!hit) return; // not a form-doc hand-author — fast pass

  const repoRoot = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const enforce = enforceEnabled(process.env);
  const skip = extractSkip(data);

  if (process.env.SPEC_AUTHORING_SKIP === '1' || (skip !== null && skip.length >= 8)) {
    log(repoRoot, { hook: HOOK_NAME, doc: hit.doc, decision: 'escaped', skill: hit.skill });
    return;
  }

  const msg =
    `[${HOOK_NAME}] hand-authoring ${hit.doc} — use Skill("${hit.skill}") instead: it auto-fills the v3 form ` +
    `AND wires the FR/AC/@feature links, so you don't fight the cross-doc anchor web + form guards by hand. ` +
    `Targeted old_string/new_string fixes are fine; whole-doc authoring should go through the sub-skill. ` +
    `Escape: [skip-spec-steer: <reason ≥8>] in the reason, or SPEC_AUTHORING_SKIP=1.`;

  log(repoRoot, { hook: HOOK_NAME, doc: hit.doc, decision: enforce ? 'denied' : 'shadow', skill: hit.skill });

  if (!enforce) {
    process.stderr.write(msg + '\n');
    return; // SHADOW — proceed
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: msg,
      },
    }),
  );
  process.exit(2);
}

const isDirectRun =
  process.argv[1]?.endsWith('steer.ts') || process.argv[1]?.endsWith('steer.js');
if (isDirectRun) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`[${HOOK_NAME}] fail-open: ${e}\n`);
    process.exit(0);
  }
}
