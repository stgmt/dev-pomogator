/**
 * Multi-language NDJSON adapter (FR-9).
 *
 * Reqnroll v3+ (.NET), behave with the `message` formatter (Python), and
 * Cucumber-JVM with `--plugin message:…` (Java) all emit the canonical
 * `@cucumber/messages` envelope schema that `./ndjson.ts` already parses.
 * Phase 3 does NOT need a per-language parser — only:
 *
 *   1. Detection of the source runner from the `meta` envelope (so the
 *      MCP server can surface «which language produced this run») and
 *   2. A thin passthrough wrapper to the canonical ingester so any code
 *      that wants to be explicit about «I'm ingesting Reqnroll output»
 *      can spell that intent without re-importing the generic helper.
 *
 * The result is the same `TestResultPatch` regardless of source language —
 * downstream graph builders + conformance checks are language-agnostic.
 *
 * @see ./ndjson.ts   (canonical Cucumber Messages ingester)
 * @see .specs/spec-generator-v4/FR.md FR-9 (multi-language BDD support)
 */

import fs from 'node:fs';
import { parseNdjson, parseNdjsonFile, type TestResultPatch } from './ndjson.ts';

export type RunnerLanguage =
  | 'cucumber-js'
  | 'reqnroll'
  | 'cucumber-jvm'
  | 'behave'
  | 'unknown';

/**
 * Heuristic detection from the first `meta` envelope. Cucumber Messages
 * `meta.implementation.name` carries the runner identifier exactly:
 *   `cucumber-js`, `Reqnroll`, `cucumber-jvm`, `behave`.
 * Returns `'unknown'` if no `meta.implementation.name` is present.
 */
export function detectRunner(source: string): RunnerLanguage {
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const env = JSON.parse(line) as {
        meta?: { implementation?: { name?: string } };
      };
      const name = env.meta?.implementation?.name?.toLowerCase();
      if (!name) continue;
      if (name.includes('cucumber-jvm') || name.includes('cucumber/jvm')) return 'cucumber-jvm';
      if (name.includes('cucumber-js') || name === 'cucumber') return 'cucumber-js';
      if (name.includes('reqnroll') || name.includes('specflow')) return 'reqnroll';
      if (name.includes('behave')) return 'behave';
      return 'unknown';
    } catch {
      // Skip malformed line — `parseNdjson` itself is resilient to these,
      // we only need a best-effort name lookup.
      continue;
    }
  }
  return 'unknown';
}

/**
 * Ingest NDJSON output from any of the four supported runners. Returns the
 * canonical `TestResultPatch` shape AND the detected language tag for
 * downstream surfacing in MCP responses.
 */
export function ingestMultilang(source: string): {
  language: RunnerLanguage;
  patch: TestResultPatch;
} {
  return {
    language: detectRunner(source),
    patch: parseNdjson(source),
  };
}

/** Convenience file wrapper that mirrors `parseNdjsonFile` shape. */
export function ingestMultilangFile(absPath: string): {
  language: RunnerLanguage;
  patch: TestResultPatch;
} {
  return {
    language: detectRunner(readFileBest(absPath)),
    patch: parseNdjsonFile(absPath),
  };
}

function readFileBest(absPath: string): string {
  try {
    // We re-read here only to extract the meta envelope for language
    // detection; the byte cost is negligible against the broader parse
    // already happening in `parseNdjsonFile`.
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return '';
  }
}
