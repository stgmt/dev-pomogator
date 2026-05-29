// CLI for the side-channel conformance log (FR-15 reader).
//
// Usage:
//   node --import tsx tools/spec-check-log/cli.ts [options]
//
//   --since DURATION   accepts Nh/Nm/Nd/Nw suffixes (e.g. 24h, 30m, 7d)
//   --grep PATTERN     case-insensitive substring vs message
//   --code CODE        exact match vs finding_code
//   --severity LEVEL   one of error / warning / info
//   --source SOURCE    exact match vs source
//   --json             re-emit matched entries as JSONL (for piping)
//   --count            print just the count of matched entries
//   --root PATH        override repoRoot (default cwd or env)
//
// repoRoot defaults to process.cwd() or DEV_POMOGATOR_REPO_ROOT env var.
//
// See also: ./writer.ts and .specs/spec-generator-v4/FR.md FR-15

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LogEntry } from './writer.ts';

const SEV_RANK: Record<LogEntry['severity'], number> = { error: 0, warning: 1, info: 2 };

interface CliArgs {
  repoRoot: string;
  sinceMs?: number;
  grep?: string;
  code?: string;
  severity?: LogEntry['severity'];
  source?: string;
  emitJson: boolean;
  countOnly: boolean;
}

const DURATION_RE = /^(\d+)([smhdw])$/;

export function parseDuration(input: string): number | null {
  const m = input.trim().toLowerCase().match(DURATION_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 's': return n * 1_000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    case 'w': return n * 604_800_000;
    default:  return null;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repoRoot: process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd(),
    emitJson: false,
    countOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '--since': {
        const ms = parseDuration(next ?? '');
        if (ms === null) throw new Error(`invalid --since "${next}"`);
        args.sinceMs = ms;
        i++;
        break;
      }
      case '--grep':
        args.grep = (next ?? '').toLowerCase();
        i++;
        break;
      case '--code':
        args.code = next;
        i++;
        break;
      case '--severity':
        if (next !== 'error' && next !== 'warning' && next !== 'info') {
          throw new Error(`--severity must be error|warning|info, got "${next}"`);
        }
        args.severity = next;
        i++;
        break;
      case '--source':
        args.source = next;
        i++;
        break;
      case '--json':
        args.emitJson = true;
        break;
      case '--count':
        args.countOnly = true;
        break;
      case '--root':
        args.repoRoot = next;
        i++;
        break;
      case '--help':
      case '-h':
        process.stdout.write(`Usage: dev-pomogator spec-check-log [options]\n`);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown flag "${a}"`);
    }
  }
  return args;
}

export function entryMatches(entry: LogEntry, args: CliArgs, now: number): boolean {
  if (args.sinceMs !== undefined) {
    const ts = Date.parse(entry.timestamp);
    if (Number.isNaN(ts) || ts < now - args.sinceMs) return false;
  }
  if (args.code && entry.finding_code !== args.code) return false;
  if (args.severity && entry.severity !== args.severity) return false;
  if (args.source && entry.source !== args.source) return false;
  if (args.grep && !entry.message.toLowerCase().includes(args.grep)) return false;
  return true;
}

/** Iterate every shard's entries in insertion order. Exported for tests. */
export function* iterateEntries(repoRoot: string): IterableIterator<LogEntry> {
  const dir = path.join(repoRoot, '.dev-pomogator', '.spec-check-log');
  if (!fs.existsSync(dir)) return;
  const shards = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .sort();
  for (const name of shards) {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as LogEntry;
      } catch {
        // Malformed line — skip silently. The writer is append-only with
        // O_APPEND so partial-write corruption is rare, but be robust.
      }
    }
  }
}

export interface RunResult {
  matched: LogEntry[];
  text: string;
}

export function run(argv: string[], now: number = Date.now()): RunResult {
  const args = parseArgs(argv);
  const matched: LogEntry[] = [];
  for (const entry of iterateEntries(args.repoRoot)) {
    if (entryMatches(entry, args, now)) matched.push(entry);
  }
  // Stable severity ordering for human output: errors first, then warnings,
  // then info — within each, chronological. JSON mode keeps source order.
  if (!args.emitJson) {
    matched.sort((a, b) => {
      const s = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (s !== 0) return s;
      return a.timestamp.localeCompare(b.timestamp);
    });
  }
  let text: string;
  if (args.countOnly) {
    text = `${matched.length}\n`;
  } else if (args.emitJson) {
    text = matched.map((e) => JSON.stringify(e)).join('\n') + (matched.length ? '\n' : '');
  } else {
    text = matched
      .map(
        (e) =>
          `${e.timestamp} [${e.severity.toUpperCase()}] ${e.finding_code} ${e.location.file}:${e.location.line} — ${e.message}`,
      )
      .join('\n') + (matched.length ? '\n' : '');
  }
  return { matched, text };
}

// CLI entry guard: argv[1] is a possibly-relative path on Node CLI invocation,
// so resolve it to a `file://` URL the same way `import.meta.url` is shaped.
function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  try {
    const { text } = run(process.argv.slice(2));
    process.stdout.write(text);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[spec-check-log] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
