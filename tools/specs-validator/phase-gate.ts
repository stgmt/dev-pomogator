#!/usr/bin/env npx tsx
/**
 * Phase Gate — PreToolUse Hook
 *
 * Blocks Write/Edit to spec files of future phases until current phase STOP is confirmed.
 * Reads .progress.json to determine current workflow state.
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (blocked by phase gate)
 *
 * Fail-open: any error → exit(0) (never block due to hook bugs)
 *
 * Reference implementations:
 *   - SienkLogic/plan-build-run check-phase-boundary.js
 *   - Hitenze/Claude-suite check_phase.py
 */

import path from 'path';
import { readProgressState, checkPhaseAllowed } from './phase-constants.ts';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    [key: string]: unknown;
  };
  tool_use_id?: string;
}

/**
 * Extract feature slug and filename from a .specs/ path.
 * Returns null if path is not inside .specs/.
 */
function extractSpecInfo(filePath: string): { slug: string; filename: string; specDir: string } | null {
  const normalized = filePath.replace(/\\/g, '/');

  // Match .specs/<slug>/<filename> pattern
  const match = normalized.match(/[/\\]?\.specs\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  const slug = match[1];
  const filename = match[2];

  // Reconstruct specDir from the original path
  const specsIdx = normalized.lastIndexOf('.specs/' + slug);
  if (specsIdx < 0) return null;
  const specDir = filePath.substring(0, specsIdx + '.specs/'.length + slug.length);

  return { slug, filename, specDir };
}

async function main(): Promise<void> {
  let inputData = '';

  if (process.stdin.isTTY) {
    process.exit(0);
  }

  for await (const chunk of process.stdin) {
    inputData += chunk.toString();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  const data: PreToolUseInput = JSON.parse(inputData);

  // Only gate Write and Edit tools
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') {
    process.exit(0);
  }

  const filePath = data.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
  }

  // Check if file is inside .specs/
  const specInfo = extractSpecInfo(filePath);
  if (!specInfo) {
    process.exit(0); // not a spec file, pass-through
  }

  // Read .progress.json
  const progress = readProgressState(specInfo.specDir);
  if (!progress) {
    process.exit(0); // no workflow state, fail-open
  }

  // Check if phase is allowed
  const denyReason = checkPhaseAllowed(specInfo.filename, progress, specInfo.slug);
  if (!denyReason) {
    process.exit(0); // allowed
  }

  // DENY — block the write
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[phase-gate] ${denyReason}`,
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// Fail-open wrapper: any error → allow
main().catch((_e) => {
  process.stderr.write(`[phase-gate] Error: ${_e}\n`);
  process.exit(0);
});
