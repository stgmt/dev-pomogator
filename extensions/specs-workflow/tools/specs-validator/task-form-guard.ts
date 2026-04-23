#!/usr/bin/env npx tsx
/**
 * task-form-guard — PreToolUse hook.
 *
 * Blocks Write/Edit of TASKS.md in v3 specs when any task block is missing:
 * `**Done When:**` block with ≥1 checkbox, `Status:` tag, or `Est:` tag.
 * Phase -1 (Infrastructure) tasks are relaxed — only warned, never denied.
 * Tasks explicitly marked `_waived: {reason}_` are allowed.
 *
 * @see .specs/spec-generator-v3/FR.md FR-5, FR-9, FR-10, FR-12
 */

import { isV3Spec } from './phase-constants.ts';
import { parseTaskBlocks, extractSpecInfo, extractWriteContent } from './spec-form-parsers.ts';
import { logEvent } from './audit-logger.ts';

const HOOK_NAME = 'task-form-guard';
const TARGET_FILE = 'TASKS.md';

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string };
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

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as PreToolUseInput;
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') process.exit(0);

  const filePath = data.tool_input?.file_path;
  if (!filePath || !filePath.endsWith(TARGET_FILE)) process.exit(0);

  const specInfo = extractSpecInfo(filePath);
  if (!specInfo) process.exit(0);

  if (!isV3Spec(specInfo.specDir)) {
    logEvent(HOOK_NAME, 'ALLOW_AFTER_MIGRATION', filePath);
    process.exit(0);
  }

  const content = extractWriteContent(data.tool_input as Record<string, unknown>);
  if (!content.trim()) process.exit(0);

  const tasks = parseTaskBlocks(content);
  if (tasks.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'no tasks yet');
    process.exit(0);
  }

  const violations = tasks.filter((t) => t.missingFirst !== null);
  if (violations.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const lines = violations.map((t) =>
    `  line ${t.lineNumber} ("${t.title.slice(0, 60)}") [${t.phase}]: missing ${t.missingFirst}`,
  );
  const msg =
    `${violations.length} task(s) failed v3 form validation in ${specInfo.filename}:\n` +
    lines.join('\n') +
    `\n\nRequired per task: **Done When:** block with ≥1 \`- [ ]\` checkbox, \`Status: TODO|IN_PROGRESS|DONE|BLOCKED\`, \`Est: <N>m\`.\n` +
    `Tasks in Phase -1 (Infrastructure) are exempt; mark explicit waivers with \`_waived: {reason}_\`.\n` +
    `Fix: call Skill("task-board-forms") to enrich tasks with Done When/Status/Est.`;
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
