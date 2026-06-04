/**
 * PostToolUse hook (FR-34b) — after a Write/Edit to a `.specs/<slug>/...md`, run the
 * anchor-integrity check on that spec and inject a `<system-reminder>` listing any
 * broken link anchors + the one-command fix. SOFT tier (FR-19): any error → exit 0,
 * never block the edit on a checker bug.
 *
 * Mirrors the FR-6 `spec-conformance-push` idiom (stdin JSON → file_path → reminder).
 *
 * @see ../anchor-integrity/check.mjs
 * @see .specs/spec-generator-v4/FR.md FR-34b / AC-34.3
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkSpecDir } from './check.mjs';

interface HookInput {
  tool_input?: { file_path?: string };
  session_id?: string;
}

/** Derive {repoRoot, slug, specDir} from an absolute `.specs/<slug>/…md` path, or null. */
export function specOfPath(absPath: string): { repoRoot: string; slug: string; specDir: string } | null {
  if (!absPath || !absPath.endsWith('.md')) return null;
  const norm = absPath.replace(/\\/g, '/');
  const idx = norm.indexOf('/.specs/');
  if (idx === -1) return null;
  const repoRoot = norm.slice(0, idx);
  const slug = norm.slice(idx + '/.specs/'.length).split('/')[0];
  if (!slug) return null;
  return { repoRoot, slug, specDir: path.join(repoRoot, '.specs', slug) };
}

/** The `<system-reminder>` payload for a touched spec file, or null when clean / N/A. */
export function buildReminder(absPath: string | null): string | null {
  if (!absPath) return null;
  const spec = specOfPath(absPath);
  if (!spec) return null;
  let broken;
  try {
    broken = checkSpecDir(spec.specDir, spec.repoRoot);
  } catch {
    return null; // unreadable → soft
  }
  if (!broken.length) return null;
  const lines: string[] = [
    '<system-reminder>',
    `⚠️ anchor-integrity (FR-34): ${broken.length} broken link anchor(s) in .specs/${spec.slug} after this edit — they will NOT resolve in the Marksman LSP.`,
  ];
  for (const b of broken.slice(0, 8)) {
    lines.push(`  ${b.file}:${b.line}  [${b.linkText}] #${b.brokenAnchor}` + (b.currentSlug ? ` → fix to #${b.currentSlug}` : '  (ambiguous → claude -p)'));
  }
  if (broken.length > 8) lines.push(`  …and ${broken.length - 8} more`);
  lines.push(`Fix: node tools/anchor-integrity/fix.mjs --spec .specs/${spec.slug} --apply   (or invoke the anchor-fix skill).`);
  lines.push('</system-reminder>');
  return lines.join('\n') + '\n';
}

async function readStdinJson(): Promise<HookInput> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      try {
        resolve(text ? (JSON.parse(text) as HookInput) : {});
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main(): Promise<void> {
  const input = await readStdinJson();
  const out = buildReminder(input.tool_input?.file_path ?? null);
  if (out) process.stdout.write(out);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[anchor-check-post] soft-tier error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  });
}
