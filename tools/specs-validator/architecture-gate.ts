#!/usr/bin/env npx tsx
/**
 * Architecture Gate — PreToolUse Hook (FR-21: guarantee Phase 1.75 ran).
 *
 * For a GREENFIELD spec, blocks Write/Edit of Requirements-phase artefacts (FR/DESIGN/...)
 * until Phase 1.75 actually produced `ARCHITECTURE/` (axes/INDEX/COMPLETENESS) OR an explicit
 * skip marker. Makes the architecture-decision step mechanically guaranteed, not trust-based:
 * you cannot write FR/DESIGN in a greenfield vacuum without first fixing (or consciously skipping)
 * the stack.
 *
 * Exit: 0 allow / 2 deny. Fail-open: any error → allow (never block on hook bugs).
 */

import fs from 'node:fs';
import path from 'node:path';
import { readProgressState } from './phase-constants.ts';
import { detectAxes } from '../specs-generator/architecture-decision/axis-detector.ts';

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: { file_path?: string; [k: string]: unknown };
}

// Requirements-phase artefacts — written AFTER 1.75. Discovery/Context files are NOT gated.
const REQUIREMENTS_FILES = new Set([
  'FR.md',
  'DESIGN.md',
  'REQUIREMENTS.md',
  'NFR.md',
  'ACCEPTANCE_CRITERIA.md',
  'FILE_CHANGES.md',
]);

function extractSpecInfo(filePath: string): { slug: string; filename: string; specDir: string } | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\.specs\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const slug = match[1];
  const specsIdx = normalized.lastIndexOf('.specs/' + slug);
  if (specsIdx < 0) return null;
  const specDir = filePath.substring(0, specsIdx + '.specs/'.length + slug.length);
  return { slug, filename: match[2], specDir };
}

/** PRD-equivalent content of a spec = the discovery docs the architecture decision reads. */
function readPrdEquivalent(specDir: string): string {
  const parts: string[] = [];
  for (const f of ['USER_STORIES.md', 'USE_CASES.md', 'RESEARCH.md', 'PRD.md', 'PRDv2.md']) {
    const p = path.join(specDir, f);
    if (fs.existsSync(p)) {
      try {
        parts.push(fs.readFileSync(p, 'utf-8'));
      } catch {
        /* skip */
      }
    }
  }
  return parts.join('\n');
}

/** 1.75 ran iff ARCHITECTURE/ holds real artefacts. */
function architectureDone(specDir: string): boolean {
  const dir = path.join(specDir, 'ARCHITECTURE');
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir);
  return files.some((f) => f === 'INDEX.md' || f === 'COMPLETENESS.md' || /^AXIS-.*\.md$/.test(f));
}

/** Explicit conscious skip — reuses the existing escape-hatch marker. */
function skipped(specDir: string, prd: string): boolean {
  if (fs.existsSync(path.join(specDir, 'ARCHITECTURE', '.skip'))) return true;
  if (fs.existsSync(path.join(specDir, '.no-architecture'))) return true;
  return /\[skip-architecture-axis:|## Architecture Decisions[\s\S]{0,80}Skipped:/i.test(prd);
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk.toString();
  if (!raw.trim()) process.exit(0);

  const data: PreToolUseInput = JSON.parse(raw);
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') process.exit(0);
  const filePath = data.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const info = extractSpecInfo(filePath);
  if (!info || !REQUIREMENTS_FILES.has(info.filename)) process.exit(0); // only gate Requirements files

  // Migration guard: pre-v4 specs predate Phase 1.75 → no-op allow.
  const progress = readProgressState(info.specDir);
  const version = (progress as { version?: number } | null)?.version;
  if (typeof version === 'number' && version < 4) process.exit(0);

  // Greenfield? Decided exactly like Phase 1.75: detect-axes on the PRD-equivalent.
  const prd = readPrdEquivalent(info.specDir);
  if (!prd.trim()) process.exit(0); // no discovery content yet → fail-open
  const det = detectAxes(prd);
  const greenfield = det.axes_detected > 0; // brownfield (manifest) → axes_detected=0 → not gated
  if (!greenfield) process.exit(0);

  if (architectureDone(info.specDir) || skipped(info.specDir, prd)) process.exit(0);

  const reason =
    `[architecture-gate] Greenfield spec "${info.slug}" (detect-axes found ${det.axes_detected} stack axes) — ` +
    `Phase 1.75 has NOT run: no .specs/${info.slug}/ARCHITECTURE/ artefacts. ` +
    `Writing ${info.filename} now means FR/DESIGN in a stack vacuum. ` +
    `Fix: run Skill("architecture-decision-builder") to choose the stack (creates ARCHITECTURE/), ` +
    `OR consciously skip with "[skip-architecture-axis: <reason ≥12 chars>]" in RESEARCH.md ` +
    `or an .specs/${info.slug}/ARCHITECTURE/.skip file.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
  process.exit(2);
}

main().catch((e) => {
  process.stderr.write(`[architecture-gate] Error: ${e}\n`);
  process.exit(0);
});
