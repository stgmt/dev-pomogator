#!/usr/bin/env npx tsx
/**
 * user-story-form-guard — PreToolUse hook.
 *
 * Blocks Write/Edit of USER_STORIES.md in v3 specs when any User Story block
 * is missing one of: Priority, Why, Independent Test, Acceptance Scenarios.
 *
 * Exit codes: 0 (allow) | 2 (deny).
 * Fail-open on any exception.
 * No env var bypass — agents cannot disable. To recover from a buggy parser,
 * humans edit extension.json outside Claude Code.
 *
 * @see .specs/spec-generator-v3/FR.md FR-4, FR-9, FR-10, FR-12
 */

import { isV3Spec } from './phase-constants.ts';
import { parseUserStoryBlocks, extractSpecInfo, extractWriteContent } from './spec-form-parsers.ts';
import { logEvent } from './audit-logger.ts';

const HOOK_NAME = 'user-story-form-guard';
const TARGET_FILE = 'USER_STORIES.md';

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

  // Migration guard — existing v1/v2 specs pass through
  if (!isV3Spec(specInfo.specDir)) {
    logEvent(HOOK_NAME, 'ALLOW_AFTER_MIGRATION', filePath);
    process.exit(0);
  }

  const content = extractWriteContent(data.tool_input as Record<string, unknown>);
  if (!content.trim()) process.exit(0);

  const blocks = parseUserStoryBlocks(content);
  // Empty USER_STORIES.md (no User Story headings yet) is allowed — let
  // discovery-forms skill populate it in a subsequent Write.
  if (blocks.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'no User Story blocks yet');
    process.exit(0);
  }

  const violations = blocks.filter((b) => b.missingFirst !== null);
  if (violations.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const lines = violations.map((b) =>
    `  line ${b.lineNumber} ("${b.heading.slice(0, 60)}"): missing ${b.missingFirst}`,
  );
  const msg =
    `${violations.length} User Story block(s) failed v3 form validation in ${specInfo.filename}:\n` +
    lines.join('\n') +
    `\n\nRequired fields per User Story: (Priority: P1|P2|P3), **Why:**, **Independent Test:**, **Acceptance Scenarios:**.\n` +
    `Fix: call Skill("discovery-forms") to auto-generate the correct format, or edit manually to add missing fields.`;
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
