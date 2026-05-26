#!/usr/bin/env node
/**
 * PostToolUse hook for research-workflow skill marker enforcement.
 *
 * Reads PostToolUse event payload from stdin (JSON).
 * Filters: only proceeds if tool was `Skill` AND skill name matches `research-workflow`.
 * Scans tool_response output for required markers from the research-workflow skill:
 *   [VERIFIED], [UNVERIFIED], [NEEDS_CONFIRMATION], [SINGLE_SOURCE],
 *   [ASSUMED], [STALE_RISK], [INCOMPLETE_READING], [CIRCULAR_RISK], [CITED_NOT_FETCHED]
 *
 * If none found → emit stderr warning with reference to SKILL.md AP-1..AP-8 anti-patterns.
 * Always exits 0 (warn-only, no block per FR-4 of dev-pomogator-canonical-plugin spec).
 * Fail-soft: any parse error → exit 0 silently.
 */

import { readFileSync } from 'node:fs';

const REQUIRED_MARKERS = [
  '[VERIFIED]',
  '[VERIFIED:',
  '[UNVERIFIED]',
  '[NEEDS_CONFIRMATION]',
  '[NEEDS_CONFIRMATION:',
  '[SINGLE_SOURCE]',
  '[SINGLE_SOURCE:',
  '[ASSUMED]',
  '[STALE_RISK]',
  '[STALE_RISK:',
  '[INCOMPLETE_READING]',
  '[CIRCULAR_RISK]',
  '[CITED_NOT_FETCHED]',
];

const SKILL_NAME = 'research-workflow';

function readStdinSync(): string {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function main(): void {
  let payload: unknown;
  try {
    const raw = readStdinSync();
    if (!raw.trim()) return;
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  if (typeof payload !== 'object' || payload === null) return;

  const p = payload as Record<string, unknown>;
  const toolName = typeof p.tool_name === 'string' ? p.tool_name : '';
  if (toolName !== 'Skill' && toolName !== 'mcp__skill') return;

  const toolInput = (p.tool_input ?? {}) as Record<string, unknown>;
  const skillField = typeof toolInput.skill === 'string' ? toolInput.skill : '';
  if (!skillField.includes(SKILL_NAME)) return;

  const toolResponse = p.tool_response;
  let outputText = '';
  if (typeof toolResponse === 'string') {
    outputText = toolResponse;
  } else if (typeof toolResponse === 'object' && toolResponse !== null) {
    const tr = toolResponse as Record<string, unknown>;
    if (typeof tr.content === 'string') {
      outputText = tr.content;
    } else if (Array.isArray(tr.content)) {
      outputText = tr.content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null) {
            const it = item as Record<string, unknown>;
            return typeof it.text === 'string' ? it.text : '';
          }
          return '';
        })
        .join('\n');
    } else if (typeof tr.output === 'string') {
      outputText = tr.output;
    } else {
      outputText = JSON.stringify(toolResponse);
    }
  }

  if (!outputText) return;

  const hasMarker = REQUIRED_MARKERS.some((marker) => outputText.includes(marker));
  if (hasMarker) return;

  process.stderr.write(
    [
      '⚠ research-workflow output missing required markers',
      '  Expected at least one of: [VERIFIED] / [UNVERIFIED] / [NEEDS_CONFIRMATION] /',
      '                            [SINGLE_SOURCE] / [ASSUMED] / [CITED_NOT_FETCHED] /',
      '                            [CIRCULAR_RISK] / [STALE_RISK] / [INCOMPLETE_READING]',
      '  Agent may not have followed updated SKILL.md guidance.',
      '  See AP-1..AP-8 anti-patterns в .claude/skills/research-workflow/SKILL.md',
      '',
    ].join('\n'),
  );
}

try {
  main();
} catch {
  // fail-soft per FR-4: warn-only, exit 0
}

process.exit(0);
