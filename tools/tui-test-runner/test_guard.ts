#!/usr/bin/env node
/**
 * PreToolUse Hook — Test Guard
 * FR-12: Blocks direct test commands, requires /run-tests skill
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (blocked, use /run-tests instead)
 *
 * Fail-open: any error → exit(0)
 */

import { readFileSync } from 'node:fs';

/**
 * Does a PARTIAL/dry cucumber run's EFFECTIVE config write the canonical ndjson? Reads the actual
 * config (the `-c`/`--config` path, or the default `cucumber.json`) and any CLI `--format message:`
 * and checks whether ANY message formatter targets `.last-test-run` (the canonical). A temp config
 * that COPIED cucumber.json's format still clobbers — the old "-c is safe" assumption was the gap
 * (an agent's collision dry-run via a scoped temp config that kept the canonical format wiped it,
 * 2026-06-20). cucumber MERGES formats, so a CLI `--format throwaway` does NOT cancel a canonical
 * format in the config. builtins-only (fs); fail-open on read error EXCEPT the default cucumber.json
 * (which is known to write the canonical).
 */
function partialRunWritesCanonical(command: string): boolean {
  if (/--format\s+message:\S*last-test-run/.test(command)) return true;
  const m = command.match(/(?:^|\s)(?:-c|--config)(?:\s|=)\s*"?([^\s"]+)"?/);
  const cfgPath = m ? m[1] : 'cucumber.json';
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, { format?: unknown[] }>;
    return Object.values(cfg).some(
      (p) => Array.isArray(p?.format) && p.format.some((f) => typeof f === 'string' && /message:\S*last-test-run/.test(f)),
    );
  } catch {
    return cfgPath === 'cucumber.json'; // default config writes the canonical; unreadable temp → can't tell, allow
  }
}

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

/** Patterns that indicate direct test commands, paired with target framework name.
 *  Used by smart converter (FR-12, v0.3.0) to build a ready-to-paste wrapper invocation. */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; framework: string }> = [
  { pattern: /\bnpm\s+test\b/, framework: 'vitest' },
  { pattern: /\bnpm\s+run\s+test\b/, framework: 'vitest' },
  { pattern: /\bnpx\s+vitest\b/, framework: 'vitest' },
  { pattern: /\bnpx\s+jest\b/, framework: 'jest' },
  { pattern: /\bpytest\b/, framework: 'pytest' },
  { pattern: /\bpython\s+-m\s+pytest\b/, framework: 'pytest' },
  { pattern: /\bdotnet\s+test\b/, framework: 'dotnet' },
  { pattern: /\bcargo\s+test\b/, framework: 'rust' },
  { pattern: /\bgo\s+test\b/, framework: 'go' },
];

/** Patterns that indicate the command is already wrapped (allow) */
const ALLOWED_PATTERNS = [
  /test_runner_wrapper/,
  /docker-test\.sh/,       // project Docker test script (used by /run-tests --docker)
  /docker-bdd\.sh/,        // project Docker BDD/cucumber script (the ONLY sanctioned cucumber path)
  /docker compose.*test/,  // direct docker compose test invocation
  /cucumber\.docker\.json/, // in-container cucumber config (docker-bdd.sh spawns this)
  /test:bdd:docker/,       // npm run test:bdd:docker
  /test:e2e:docker/,       // internal Docker test command
  /vitest.*--reporter/,    // vitest inside Docker (npm run test:e2e:docker)
];

/** Build a ready-to-paste wrapper invocation from raw test command.
 *  Returns string suitable for direct copy into Bash tool. */
function buildConvertedCommand(originalCommand: string, framework: string): string {
  const wrapperPath = 'tools/test-statusline/test_runner_wrapper.cjs';
  // Pass framework explicitly + original command as separate argument list after --
  return `node ${wrapperPath} --framework ${framework} -- ${originalCommand.trim()}`;
}

function buildDenyMessage(blockedCommand: string, framework: string): string {
  // Extract the matched test command for display
  let matched = blockedCommand.trim();
  if (matched.length > 80) matched = matched.substring(0, 80) + '...';

  const converted = buildConvertedCommand(blockedCommand, framework);

  return [
    `🚫 Direct test command blocked: "${matched}"`,
    '',
    '✅ Copy this exact wrapper invocation (smart-converter v0.3.0):',
    '',
    `  ${converted}`,
    '',
    'OR use /run-tests skill (recommended — handles dispatch, filters, Docker mode):',
    '',
    '  /run-tests              — auto-detect framework, run all tests',
    '  /run-tests auth         — run tests matching "auth" filter',
    '  /run-tests --framework vitest -- --watch  — explicit framework + extra args',
    '  /run-tests --docker     — run through Docker Compose',
    '  /run-tests --framework generic -- npm run build  — wrap non-test long bg command',
    '',
    'Supported frameworks: vitest, jest, pytest, dotnet, rust (cargo), go, generic',
    'Auto-detected from: vitest.config.ts, jest.config.js, pytest.ini, Cargo.toml, go.mod, *.csproj',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  // TTY = interactive terminal, not a hook invocation
  if (process.stdin.isTTY) {
    process.exit(0);
  }

  let inputData = '';
  for await (const chunk of process.stdin) {
    inputData += chunk.toString();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  const data: PreToolUseInput = JSON.parse(inputData);

  // Only guard Bash tool
  if (data.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = data.tool_input?.command;
  if (!command) {
    process.exit(0);
  }

  // Check if already wrapped (allow)
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.test(command)) {
      process.exit(0);
    }
  }

  // HARD host-execution block (incident 2026-06-24): the cucumber/BDD suite MUST run in Docker,
  // never on the host. A host run (a) executes Linux/Docker-only scenarios in the wrong env →
  // false reds; (b) takes ~70 min; (c) CLOBBERS the canonical .dev-pomogator/.last-test-run.ndjson
  // with host-isolation-artifact results (concurrent e2e tests mutate shared settings.json/.specs
  // mid-run). This is the cucumber-path analogue of tests/setup/ensure-docker.ts ("no bypass by
  // design"), which only ever guarded the vitest suite — `node scripts/run-bdd.mjs` (full) and raw
  // host `cucumber.js` slipped straight through. Docker-wrapped runs already returned above via
  // ALLOWED_PATTERNS (docker-bdd.sh / docker compose / cucumber.docker.json), so reaching here means
  // a bare host invocation. Prose (git/echo/…) that merely MENTIONS cucumber is exempt (anchor to a
  // real run, mirroring the clobber-guard's isProse).
  const isProseBdd = /^\s*(?:git|echo|printf|cat|sed|awk|grep|rg|ls|stat)\b/.test(command.trimStart());
  const isBddRun =
    !isProseBdd &&
    (/scripts[/\\]run-bdd\.mjs/.test(command) ||
      /cucumber(?:\.js|-js)\b/.test(command) ||
      /@cucumber\/cucumber/.test(command));
  // Harm-precise: only a FULL host run clobbers the canonical .last-test-run.ndjson and runs the
  // whole suite in the wrong env (the 2026-06-24 incident). A FILTERED run (--name/--tags/--dry-run)
  // routes to a throwaway via run-bdd.mjs and leaves the canonical intact — single-scenario host
  // iteration stays working; partial runs against the DEFAULT config are still caught by the
  // clobber guard below. So block only the full (unfiltered) host run here.
  const isFilteredRun = /(?:^|\s)(?:--name|-n|--tags|-t|--dry-run)(?:\s|=|$)/.test(command);
  if (isBddRun && !isFilteredRun) {
    const msg = [
      '🚫 The BDD/cucumber suite must run in Docker, NOT on the host.',
      '   A host run false-reds Linux/Docker-only scenarios, is slow (~70 min), and clobbers the',
      '   canonical .dev-pomogator/.last-test-run.ndjson with host-isolation artifacts (incident 2026-06-24).',
      '',
      '✅ Run it in Docker (WSL-routed):',
      '   bash scripts/docker-bdd.sh                          — full suite (refreshes the canonical)',
      '   bash scripts/docker-bdd.sh --name "SPECGEN004_15"   — one scenario (clobber-safe, canonical untouched)',
      '   npm run test:bdd:docker      OR      /run-tests --docker',
    ].join('\n');
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[test-guard:host-bdd] ${msg}`,
      },
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(2);
  }

  // Cucumber clobber guard (FR-52a / P28-1): a PARTIAL / non-authoritative cucumber run against the
  // DEFAULT config overwrites the canonical .dev-pomogator/.last-test-run.ndjson → every spec not in
  // the result then reads not_run (poisons the honesty gate/census). PARTIAL = a filter
  // (--name/-n/--tags/-t) OR a --dry-run (executes nothing, writes an ALL-skipped ndjson — the exact
  // vector that clobbered the canonical live on 2026-06-19; the old guard only caught --name). A FULL
  // real run is fine (it is the intended way to refresh the canonical).
  //   Allow ONLY when isolated to a throwaway: a temp config (-c/--config NOT cucumber.json — `-c
  //   cucumber.json` still writes the canonical, so it is NOT safe), or an explicit --format message:
  //   to a non-canonical target.
  //   A prose command (git/echo/cat/…) may MENTION cucumber + a flag in its text (e.g. a commit
  //   message describing THIS guard) but never RUNS it — anchor to a real invocation so we don't deny
  //   a commit/echo/doc (false-positive that blocked a commit 2026-06-19).
  const isProse = /^\s*(?:git|echo|printf|cat|sed|awk|grep|rg)\b/.test(command.trimStart());
  const isCucumber =
    !isProse && (/cucumber(?:\.js|-js)\b/.test(command) || /@cucumber\/cucumber/.test(command));
  const isPartial = /(?:^|\s)(?:--name|-n|--tags|-t|--dry-run)(?:\s|=|$)/.test(command);
  // Unsafe ONLY if the run's EFFECTIVE config actually writes the canonical (read the config, don't
  // guess from the command text — a temp config can still copy cucumber.json's canonical format).
  if (isCucumber && isPartial && partialRunWritesCanonical(command)) {
    const filterArgs =
      command.replace(/^[\s\S]*?cucumber(?:\.js|-js)?\s*/, '').trim() || '--tags "@featureN"';
    const msg = [
      '🚫 Partial/dry-run cucumber run against the default config would CLOBBER the canonical',
      '   .dev-pomogator/.last-test-run.ndjson with a partial/all-skipped result (other specs → not_run).',
      '',
      '✅ Use the clobber-safe runner (routes a filtered run to a throwaway + archives the run to',
      '   .dev-pomogator/.test-history/ with timings):',
      '',
      `  node scripts/run-bdd.mjs ${filterArgs}`,
      '',
      '   (or pass an explicit -c <temp-config> / --format message:<throwaway> for an isolated run).',
    ].join('\n');
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[test-guard:cucumber-clobber] ${msg}`,
      },
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(2);
  }

  // Check if direct test command (block + smart converter)
  for (const entry of BLOCKED_PATTERNS) {
    if (entry.pattern.test(command)) {
      const denyMessage = buildDenyMessage(command, entry.framework);

      const output = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `[test-guard] ${denyMessage}`,
        },
      };

      process.stdout.write(JSON.stringify(output));
      process.exit(2);
    }
  }

  // Not a test command — allow
  process.exit(0);
}

// Fail-open wrapper
main().catch(() => {
  process.exit(0);
});
