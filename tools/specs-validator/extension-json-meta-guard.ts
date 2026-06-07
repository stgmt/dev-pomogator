#!/usr/bin/env npx tsx
/**
 * extension-json-meta-guard — PreToolUse hook.
 *
 * Protects manifest registrations from agent-driven removal (FR-24):
 *  - v3 targets: `.claude/settings.json` / `.claude/settings.local.json` —
 *    form-guards may not vanish from `hooks.PreToolUse`.
 *  - v4 targets (FR-24 extension scope, canonical plugin): `.claude-plugin/hooks.json`,
 *    `.claude-plugin/plugin.json`, `.mcp.json` — the spec-conformance-guard /
 *    spec-conformance-push hook registrations, the `dev-pomogator-specs` MCP
 *    server entry, and this guard's own registration (self-protection
 *    invariant) may not be removed.
 * (The legacy v1 `extension.json` target no longer exists.)
 *
 * Policy: additive-only for protected entries. Adding unrelated hooks is OK.
 * Removing or renaming any protected entry → DENY with message pointing to
 * human-in-the-loop path (edit file outside Claude Code).
 *
 * Rationale: agents tempted to disable protection via manifest edit.
 * This guard makes the manifests non-editable for the protected subset.
 * Tamper attempts are logged via audit-logger (DENY events in
 * ~/.dev-pomogator/logs/form-guards.log — the unified v3/v4 sink; FR-24's
 * `meta-guard.log` name resolved to the shared log, one inventory per FR-23).
 *
 * @see .specs/spec-generator-v4/FR.md FR-24 (meta-guard preservation + extension)
 * @see .specs/spec-generator-v4/DESIGN.md «(o) Inherited design decisions from v3»
 */

import fs from 'fs';
import path from 'path';
import { logEvent } from './audit-logger.ts';
import { readCurrentContent } from './spec-form-parsers.ts';

const HOOK_NAME = 'extension-json-meta-guard';

// Names (basename) of hook scripts that this guard protects.
// If any of these are removed from hooks.PreToolUse entries, deny.
const PROTECTED_HOOKS = [
  'phase-gate.ts',
  'user-story-form-guard.ts',
  'task-form-guard.ts',
  'design-decision-guard.ts',
  'requirements-chk-guard.ts',
  'risk-assessment-guard.ts',
  'extension-json-meta-guard.ts',
];

// v4 canonical-manifest registrations (FR-24 extension scope). Scanned as
// whole-text tokens in `.claude-plugin/hooks.json` / `plugin.json` / `.mcp.json`:
// token present before the edit but absent after ⇒ a registration was removed.
const PROTECTED_V4_TOKENS = [
  'spec-conformance-guard', // FR-5 hard PreToolUse guard (hooks.json)
  'spec-conformance-push', // FR-6 PostToolUse push hook (hooks.json)
  'dev-pomogator-specs', // FR-4 MCP server entry (.mcp.json) — carries get_trace etc.
  'extension-json-meta-guard', // self-protection invariant
];

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string; old_string?: string };
}

async function readStdin(): Promise<string> {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk.toString();
  return buf;
}

function deny(reason: string, filepath: string): never {
  logEvent(HOOK_NAME, 'DENY', filepath, reason);
  process.stderr.write(`[${HOOK_NAME}] ${reason}\n`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[${HOOK_NAME}] ${reason}`,
    },
  }));
  process.exit(2);
}

/**
 * Extract form-guard names **present in hooks.PreToolUse commands** (not in
 * other sections like toolFiles). Parses JSON; on parse error, falls back to
 * string scan (fail-safe — malformed JSON is not our concern, installer will
 * catch it).
 *
 * Protection scope is hooks.PreToolUse specifically: if a form-guard is
 * removed from the hooks array while still listed in toolFiles, the installer
 * would stop running it → that's the exact attack surface we guard.
 */
function listProtectedPresent(text: string): string[] {
  try {
    const parsed = JSON.parse(text);
    const hookSpecs: unknown[] = [];
    const preTool = parsed?.hooks?.claude?.PreToolUse ?? parsed?.hooks?.PreToolUse;
    if (Array.isArray(preTool)) {
      for (const group of preTool) {
        if (group?.hooks && Array.isArray(group.hooks)) {
          hookSpecs.push(...group.hooks);
        } else if (group?.command) {
          hookSpecs.push(group);
        }
      }
    } else if (preTool && typeof preTool === 'object') {
      hookSpecs.push(preTool);
    }
    const commands = hookSpecs
      .map((h) => (typeof (h as { command?: unknown }).command === 'string' ? (h as { command: string }).command : ''))
      .join(' ');
    return PROTECTED_HOOKS.filter((name) => commands.includes(name));
  } catch {
    // Fallback: string scan (tolerates malformed JSON).
    return PROTECTED_HOOKS.filter((name) => text.includes(name));
  }
}

/**
 * Classify the manifest kind for a path (null = not guarded).
 *  - 'settings' — `.claude/settings.json` / `.claude/settings.local.json`
 *    (v3 semantics: form-guards scoped to hooks.PreToolUse)
 *  - 'v4' — `.claude-plugin/hooks.json` / `.claude-plugin/plugin.json` /
 *    `.mcp.json` (FR-24 extension: whole-text token scan, hooks + v4 tokens)
 */
function manifestKind(filePath: string): 'settings' | 'v4' | null {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.endsWith('/.claude/settings.local.json')) return 'settings';
  if (norm.endsWith('/.claude/settings.json')) return 'settings';
  if (norm.endsWith('/.claude-plugin/hooks.json')) return 'v4';
  if (norm.endsWith('/.claude-plugin/plugin.json')) return 'v4';
  if (norm.endsWith('/.mcp.json')) return 'v4';
  return null;
}

/**
 * Protected tokens present in a v4 canonical manifest (whole-text scan —
 * these manifests register entries in heterogeneous shapes: hook command
 * strings, mcpServers keys, inline launcher code — JSON-walking each shape
 * would under-match; token presence/absence is the removal-proof signal).
 */
function listV4TokensPresent(text: string): string[] {
  return [...PROTECTED_HOOKS, ...PROTECTED_V4_TOKENS].filter((t) => text.includes(t));
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as PreToolUseInput;
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') process.exit(0);

  const filePath = data.tool_input?.file_path;
  if (!filePath) process.exit(0);
  const kind = manifestKind(filePath);
  if (!kind) process.exit(0);

  const current = readCurrentContent(filePath);
  if (current === null) {
    // new file — no previous state to protect. Allow.
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'new manifest');
    process.exit(0);
  }

  // Determine new content: Write → content field, Edit → synthesize from old/new_string
  let newContent: string;
  if (typeof data.tool_input?.content === 'string') {
    newContent = data.tool_input.content;
  } else if (typeof data.tool_input?.old_string === 'string' && typeof data.tool_input?.new_string === 'string') {
    // Apply Edit replacement to current content
    const idx = current.indexOf(data.tool_input.old_string);
    if (idx < 0) {
      // Edit won't apply — let Claude Code handle the mismatch, don't block
      logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'edit old_string not found');
      process.exit(0);
    }
    newContent =
      current.slice(0, idx) +
      data.tool_input.new_string +
      current.slice(idx + data.tool_input.old_string.length);
  } else {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'unknown tool_input shape');
    process.exit(0);
  }

  const scan = kind === 'settings' ? listProtectedPresent : listV4TokensPresent;
  const currentGuards = new Set(scan(current));
  const newGuards = new Set(scan(newContent));
  const removed: string[] = [];
  for (const name of currentGuards) {
    if (!newGuards.has(name)) removed.push(name);
  }

  if (removed.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const msg =
    `Meta-guard: cannot remove protected registrations from a manifest without human review.\n` +
    `  Removed entries: ${removed.join(', ')}\n` +
    `  File: ${filePath}\n\n` +
    `This hook protects form-guards, the spec-conformance guard/push hooks and\n` +
    `the dev-pomogator-specs MCP server entry from accidental or agent-driven\n` +
    `removal (FR-24). To legitimately disable one, a human must edit this file\n` +
    `outside Claude Code (e.g. via IDE) and commit the change with a clear\n` +
    `rationale. Agents cannot bypass this.`;
  deny(msg, filePath);
}

main().catch((e) => {
  try {
    logEvent(HOOK_NAME, 'PARSER_CRASH', process.env.PWD || '', String(e?.message || e));
  } catch {
    // ignore
  }
  process.stderr.write(`[${HOOK_NAME}] fail-open: ${e}\n`);
  process.exit(0);
});
