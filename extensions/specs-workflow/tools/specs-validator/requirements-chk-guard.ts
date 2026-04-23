#!/usr/bin/env npx tsx
/**
 * requirements-chk-guard — PreToolUse hook.
 *
 * Blocks Write/Edit of REQUIREMENTS.md in v3 specs when any CHK row has:
 *  - invalid ID (must match ^CHK-FR\d+-\d{2}$ — linked to parent FR)
 *  - Traces To without FR-N + (AC-N | @featureN | UC-N)
 *  - Verification Method not in allowed set
 *  - Status not in lifecycle set
 *
 * REQUIREMENTS.md without any CHK rows passes — CHK matrix is added by
 * `requirements-chk-matrix` skill in Phase 2, not at spec creation.
 *
 * @see .specs/spec-generator-v3/FR.md FR-7, FR-9, FR-10, FR-12
 */

import { isV3Spec } from './phase-constants.ts';
import { parseChkRows, extractSpecInfo, extractWriteContent } from './spec-form-parsers.ts';
import { logEvent } from './audit-logger.ts';

const HOOK_NAME = 'requirements-chk-guard';
const TARGET_FILE = 'REQUIREMENTS.md';

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

  const rows = parseChkRows(content);
  if (rows.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'no CHK rows');
    process.exit(0);
  }

  const violations = rows.filter((r) => r.missingFirst !== null);
  if (violations.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const lines = violations.map((r) =>
    `  line ${r.lineNumber} (${r.id}): ${r.missingFirst}`,
  );
  const msg =
    `${violations.length} CHK row(s) failed v3 form validation in ${specInfo.filename}:\n` +
    lines.join('\n') +
    `\n\nCHK ID format: CHK-FR{n}-{nn} (e.g. CHK-FR1-01).\n` +
    `Traces To must include FR-N + at least one of AC-N, @featureN, UC-N.\n` +
    `Verification Method: BDD scenario | Unit test | Manual review | Integration test | N/A.\n` +
    `Status: Draft | In Progress | Verified | Blocked.\n` +
    `Fix: call Skill("requirements-chk-matrix") to generate valid matrix.`;
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
