#!/usr/bin/env npx tsx
/**
 * extension-json-meta-guard — PreToolUse hook.
 *
 * Protects `extension.json` and installed `.claude/settings.local.json`
 * from having form-guards removed from `hooks.PreToolUse`.
 *
 * Policy: additive-only for form-guard entries. Adding unrelated hooks is OK.
 * Removing or renaming any form-guard → DENY with message pointing to
 * human-in-the-loop path (edit file outside Claude Code).
 *
 * Rationale: agents tempted to disable protection via manifest edit.
 * This guard makes manifest itself non-editable for the form-guard subset.
 *
 * @see .specs/spec-generator-v3/FR.md FR-11, FR-12
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
 * Decide whether this path is a manifest we guard.
 * Protects:
 *  - source: `extensions/specs-workflow/extension.json`
 *  - installed: `.claude/settings.local.json` (any depth, inside project)
 */
function isGuardedManifest(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.endsWith('/extensions/specs-workflow/extension.json')) return true;
  if (norm.endsWith('/.claude/settings.local.json')) return true;
  if (norm.endsWith('/.claude/settings.json')) return true;
  return false;
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as PreToolUseInput;
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') process.exit(0);

  const filePath = data.tool_input?.file_path;
  if (!filePath) process.exit(0);
  if (!isGuardedManifest(filePath)) process.exit(0);

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

  const currentGuards = new Set(listProtectedPresent(current));
  const newGuards = new Set(listProtectedPresent(newContent));
  const removed: string[] = [];
  for (const name of currentGuards) {
    if (!newGuards.has(name)) removed.push(name);
  }

  if (removed.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const msg =
    `Meta-guard: cannot remove form-guards from manifest without human review.\n` +
    `  Removed entries: ${removed.join(', ')}\n` +
    `  File: ${filePath}\n\n` +
    `This hook protects form-guards from accidental or agent-driven removal.\n` +
    `To legitimately disable a form-guard, a human must edit this file outside\n` +
    `Claude Code (e.g. via IDE) and commit the change with a clear rationale.\n` +
    `Agents cannot bypass this.`;
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
