/**
 * Phase-0 bash-post-test ingest (FR-1 / SPECGEN004_02).
 *
 * After a BDD run writes the master `.dev-pomogator/.last-test-run.ndjson`, this
 * splits it into per-spec `.specs/<slug>/.test-results.ndjson` shards so each
 * spec carries only its own pickles + their downstream envelopes. The master is
 * read-only here — it is always preserved.
 *
 * Cucumber Messages don't all carry a uri: only `source` / `gherkinDocument` /
 * `pickle` do. The rest reference a pickle by an id chain
 * (pickle → testCase → testCaseStarted → testStep../testCaseFinished), so we
 * resolve each envelope's slug by walking that chain. Global envelopes (`meta`,
 * `stepDefinition`, `testRunStarted/Finished`, …) belong to no spec and are
 * dropped from the shards.
 *
 * @see .specs/spec-generator-v4/FR.md FR-1
 * @see ../spec-graph/parsers/ndjson.ts (the consumer of these shards)
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Derive `<slug>` from a `.specs/<slug>/...feature` uri (handles `\` on Windows). */
export function slugOfUri(uri: string): string | null {
  const norm = uri.replace(/\\/g, '/');
  const m = norm.match(/(?:^|\/)\.specs\/([^/]+)\//);
  return m ? m[1] : null;
}

interface Envelope {
  gherkinDocument?: { uri?: string };
  source?: { uri?: string };
  pickle?: { id?: string; uri?: string };
  testCase?: { id?: string; pickleId?: string };
  testCaseStarted?: { id?: string; testCaseId?: string };
  testStepStarted?: { testCaseStartedId?: string };
  testStepFinished?: { testCaseStartedId?: string };
  testCaseFinished?: { testCaseStartedId?: string };
}

export interface SplitResult {
  slugs: string[];
  files: Record<string, string>;
  counts: Record<string, number>;
}

/**
 * Split `masterPath` into per-spec shards under `repoRoot/.specs/<slug>/`.
 * Returns the slugs written, their shard paths, and per-slug line counts.
 * The master file is never modified.
 */
export function splitNdjsonBySpec(opts: { masterPath: string; repoRoot: string }): SplitResult {
  const { masterPath, repoRoot } = opts;
  const parsed: Array<{ line: string; obj: Envelope }> = [];
  for (const line of fs.readFileSync(masterPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      parsed.push({ line, obj: JSON.parse(line) as Envelope });
    } catch {
      // Defensive: a truncated tail line shouldn't abort the whole split.
    }
  }

  // Resolve the pickle → testCase → testCaseStarted id chain to slugs.
  const pickleSlug = new Map<string, string>();
  const testCaseSlug = new Map<string, string>();
  const testCaseStartedSlug = new Map<string, string>();
  for (const { obj } of parsed) {
    if (obj.pickle?.id && obj.pickle.uri) {
      const s = slugOfUri(obj.pickle.uri);
      if (s) pickleSlug.set(obj.pickle.id, s);
    }
  }
  for (const { obj } of parsed) {
    if (obj.testCase?.id && obj.testCase.pickleId) {
      const s = pickleSlug.get(obj.testCase.pickleId);
      if (s) testCaseSlug.set(obj.testCase.id, s);
    }
  }
  for (const { obj } of parsed) {
    if (obj.testCaseStarted?.id && obj.testCaseStarted.testCaseId) {
      const s = testCaseSlug.get(obj.testCaseStarted.testCaseId);
      if (s) testCaseStartedSlug.set(obj.testCaseStarted.id, s);
    }
  }

  const slugOf = (obj: Envelope): string | null => {
    if (obj.gherkinDocument?.uri) return slugOfUri(obj.gherkinDocument.uri);
    if (obj.source?.uri) return slugOfUri(obj.source.uri);
    if (obj.pickle?.uri) return slugOfUri(obj.pickle.uri);
    if (obj.testCase?.pickleId) return testCaseSlug.get(obj.testCase.id ?? '') ?? pickleSlug.get(obj.testCase.pickleId) ?? null;
    if (obj.testCaseStarted?.testCaseId) return testCaseSlug.get(obj.testCaseStarted.testCaseId) ?? null;
    if (obj.testStepStarted?.testCaseStartedId) return testCaseStartedSlug.get(obj.testStepStarted.testCaseStartedId) ?? null;
    if (obj.testStepFinished?.testCaseStartedId) return testCaseStartedSlug.get(obj.testStepFinished.testCaseStartedId) ?? null;
    if (obj.testCaseFinished?.testCaseStartedId) return testCaseStartedSlug.get(obj.testCaseFinished.testCaseStartedId) ?? null;
    return null;
  };

  const bySlug = new Map<string, string[]>();
  for (const { line, obj } of parsed) {
    const slug = slugOf(obj);
    if (!slug) continue;
    let list = bySlug.get(slug);
    if (!list) {
      list = [];
      bySlug.set(slug, list);
    }
    list.push(line);
  }

  const files: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const [slug, lines] of bySlug) {
    const dir = path.join(repoRoot, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, '.test-results.ndjson');
    const tmp = `${out}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, `${lines.join('\n')}\n`);
    fs.renameSync(tmp, out); // atomic write per `atomic-config-save`
    files[slug] = out;
    counts[slug] = lines.length;
  }
  return { slugs: [...bySlug.keys()].sort(), files, counts };
}

/** Hook entry — resolve the master under repoRoot and split it. No-op if absent. */
export function runIngest(repoRoot: string): SplitResult | null {
  const master = path.join(repoRoot, '.dev-pomogator', '.last-test-run.ndjson');
  if (!fs.existsSync(master)) return null;
  return splitNdjsonBySpec({ masterPath: master, repoRoot });
}

/** True when a Bash command line looks like a BDD test run worth re-splitting. */
export function isBddTestCommand(command: string | undefined): boolean {
  if (!command) return false;
  return /\btest:bdd\b|cucumber(?:-js)?\b/.test(command);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

// PostToolUse(Bash) hook entry: only split after a BDD test run so the master is
// fresh and we don't re-shard on every unrelated Bash command. Fail-soft.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async (): Promise<void> => {
    const repoRoot = process.env.CLAUDE_PROJECT_DIR ?? process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
    try {
      const raw = await readStdin();
      const command = raw
        ? (JSON.parse(raw) as { tool_input?: { command?: string } }).tool_input?.command
        : undefined;
      // When invoked with stdin (real hook), gate on the command; a bare CLI
      // invocation (no stdin) runs unconditionally for manual use.
      if (raw && !isBddTestCommand(command)) return;
      const res = runIngest(repoRoot);
      if (res) {
        process.stdout.write(
          `[bash-post-test] split master NDJSON into ${res.slugs.length} spec shard(s): ${res.slugs.join(', ')}\n`,
        );
      }
    } catch (err) {
      // Soft tier — a post-test split failure must never fail the developer's run.
      process.stderr.write(
        `[bash-post-test] ingest skipped: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  })();
}
