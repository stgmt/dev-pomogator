#!/usr/bin/env npx tsx
/**
 * design-decision-guard — PreToolUse hook.
 *
 * Blocks Write/Edit of DESIGN.md in v3 specs when any `### Decision:` block
 * lacks Rationale / Trade-off / Alternatives considered (with ≥2 bullets).
 * Files without any `### Decision:` heading pass unblocked — Key Decisions
 * section is optional.
 *
 * @see .specs/spec-generator-v3/FR.md FR-6, FR-9, FR-10, FR-12
 */

import { isV3Spec } from './phase-constants.ts';
import { parseDecisionBlocks, extractSpecInfo, extractWriteContent } from './spec-form-parsers.ts';
import { logEvent } from './audit-logger.ts';

const HOOK_NAME = 'design-decision-guard';
const TARGET_FILE = 'DESIGN.md';

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

  const decisions = parseDecisionBlocks(content);
  if (decisions.length === 0) {
    // No Key Decisions section — optional, allow
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'no decisions');
    process.exit(0);
  }

  const violations = decisions.filter((d) => d.missingFirst !== null);
  if (violations.length === 0) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const lines = violations.map((d) =>
    `  line ${d.lineNumber} ("${d.heading.slice(0, 60)}"): missing ${d.missingFirst}`,
  );
  const msg =
    `${violations.length} Decision block(s) failed v3 form validation in ${specInfo.filename}:\n` +
    lines.join('\n') +
    `\n\nEach \`### Decision:\` block requires: **Rationale:**, **Trade-off:**, **Alternatives considered:** with ≥2 \`- {alt}\` bullets.\n` +
    `Fix: call Skill("requirements-chk-matrix") to generate decisions with full structure.`;
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
