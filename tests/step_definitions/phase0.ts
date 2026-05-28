/**
 * Phase 0 step definitions — demonstrative scaffolding for SPECGEN004_01..02.
 *
 * Purpose: prove the cucumber-js runner is wired up and discovers steps. These
 * scenarios are intentionally PENDING / UNDEFINED in Phase 0 — the work of
 * actually emitting per-spec NDJSON happens in Phase 1 (parsers) and Phase 2
 * (MCP `ingest-ndjson`). Subsequent PRs inside Phase 0 will convert the
 * remaining `.feature` files into step definitions.
 *
 * @see .specs/spec-generator-v4/FR.md FR-1 (Phase 0 cucumber-js migration)
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_01..02
 * @see .claude/plans/nested-knitting-wreath.md section B.0
 */

import { Given, When } from '@cucumber/cucumber';

Given('dev-pomogator is installed with cucumber-js BDD enabled', function () {
  // Phase 0 scaffold — cucumber-js itself is installed (this file would not
  // load otherwise). Phase 2 will assert the MCP server is also running.
  return 'pending';
});

Given('a target TypeScript project with cucumber-js test suite', function () {
  return 'pending';
});

When('the developer runs {string}', function (_cmd: string) {
  // Phase 1 will actually spawn the command and capture exit/stdout/stderr
  // into the World. Phase 0 leaves the step pending so the runner shows
  // SPECGEN004_01..02 as awaiting implementation, not as broken assertions.
  return 'pending';
});
