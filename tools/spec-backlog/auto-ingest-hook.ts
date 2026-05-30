// Stop hook — auto-ingests cross-spec-reconcile findings into the backlog
// at end of session. Quiet by default (fails open). Limits to one run
// per session via a touch-file marker so a session with N Stop events
// doesn't re-ingest N times.
//
// Wired in .claude-plugin/hooks.json under Stop.

import fs from 'node:fs';
import path from 'node:path';
import { reconcileLight } from '../../.claude/skills/cross-spec-reconcile/scripts/reconcile.ts';
import { classify } from './classifier.ts';
import { appendEntry, entryId, readAllIds } from './writer.ts';

const MARKER_DIR = '.dev-pomogator/.specs-backlog';

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  // Once-per-session guard: marker file with session id (from env), TTL 12h.
  const sessionId =
    process.env.CLAUDE_SESSION_ID ||
    process.env.TEST_STATUSLINE_SESSION ||
    'unknown';
  const markerPath = path.join(
    repoRoot,
    MARKER_DIR,
    `.auto-ingest.${sessionId}.lock`,
  );
  if (fs.existsSync(markerPath)) {
    const age = Date.now() - fs.statSync(markerPath).mtimeMs;
    if (age < 12 * 3600 * 1000) return; // already ran this session
    try {
      fs.unlinkSync(markerPath);
    } catch {
      /* ignore */
    }
  }
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });

  try {
    const reports = reconcileLight({ repoRoot });
    // Batch-17 perf fix: cache existing ids once instead of N readEntry calls.
    const existingIds = readAllIds(repoRoot);
    let queued = 0;
    let dedupe = 0;
    let auto = 0;
    let noise = 0;
    const seen = new Set<string>();
    for (const r of reports) {
      for (const f of r.findings) {
        const v = classify(r.specSlug, f);
        if (v.verdict === 'AUTO_FIX') {
          auto++;
          continue;
        }
        if (v.verdict === 'NOISE') {
          noise++;
          continue;
        }
        if (!v.entry) continue;
        const id = entryId(r.specSlug, f.code, v.entry.evidence);
        if (seen.has(id)) {
          dedupe++;
          continue;
        }
        seen.add(id);
        if (existingIds.has(id)) {
          dedupe++;
          continue;
        }
        appendEntry(repoRoot, v.entry);
        existingIds.add(id);
        queued++;
      }
    }
    fs.writeFileSync(
      markerPath,
      JSON.stringify({
        at: new Date().toISOString(),
        sessionId,
        queued,
        dedupe,
        auto,
        noise,
      }),
    );
    if (queued > 0) {
      process.stderr.write(
        `[spec-backlog] auto-ingest: +${queued} new entries (${dedupe} duplicates skipped, ${auto} auto-fix, ${noise} noise)\n` +
          `  → list: \`dev-pomogator-spec-backlog list --slug <slug>\`\n` +
          `  → resolve: \`dev-pomogator-spec-backlog resolve --category <cat>\`\n`,
      );
    }
  } catch (err) {
    // Fail open: hook never blocks Stop. Write marker so we don't retry the same broken state.
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ at: new Date().toISOString(), sessionId, error: String(err) }),
    );
  }
}

main().catch(() => {
  // Silent fail — hook is best-effort.
});
