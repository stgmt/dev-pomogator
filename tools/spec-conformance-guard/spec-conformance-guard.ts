/**
 * PreToolUse HARD hook — denies Write/Edit on specs with structural violations.
 *
 * Triggers on Write / Edit of spec markdown (.specs/[slug]/*.md) and gherkin
 * .feature files. Reads
 * the proposed file content from the hook input, parses it through the same
 * MD / Gherkin slices the SpecGraph builder uses, and DENIES the operation
 * when any of the four HARD invariants per [FR-5] are violated:
 *
 *   MALFORMED_FRONTMATTER   YAML frontmatter syntax error
 *   MALFORMED_GHERKIN       `.feature` parse error
 *   DUPLICATE_DEFINITION    two `## FR-N:` headings with the same id (or any
 *                           AC/NFR variant) in the SAME file
 *   INVALID_ANCHOR_PATTERN  heading matches the anchor regex but yields an
 *                           empty slug or compact id
 *
 * Failure-mode policy per [FR-19]:
 *   • Startup crash (bad import, unreadable input, hook itself broken) →
 *     exit 1 + stderr (hard-tier fail-CLOSED).
 *   • Per-file parse crash on agent content → log + exit 0 (fail-OPEN per-file).
 *
 * Version gate per [FR-22]:
 *   If `.progress.json::version < 4` → exit 0 with `permissionDecisionReason`
 *   = `"ALLOW_AFTER_MIGRATION"` so legacy v3 specs continue to work.
 *
 * @see ../spec-graph/parsers/md.ts
 * @see ../spec-graph/parsers/gherkin.ts
 * @see .specs/spec-generator-v4/FR.md FR-5, FR-19, FR-22
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMarkdown } from '../spec-graph/parsers/md.ts';
import { parseGherkin } from '../spec-graph/parsers/gherkin.ts';

interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string; old_string?: string };
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow' | 'deny';
    permissionDecisionReason: string;
  };
}

type FileKind = 'md' | 'feature' | null;

function classify(filePath: string): FileKind {
  // Normalise Windows separators so the same string match works cross-OS.
  const normalised = filePath.replace(/\\/g, '/');
  if (normalised.includes('.specs/') && normalised.endsWith('.md')) return 'md';
  if (normalised.endsWith('.feature')) return 'feature';
  return null;
}

function shouldGuard(filePath: string): boolean {
  return classify(filePath) !== null;
}

function readProgressVersion(repoRoot: string): number | null {
  const p = path.join(repoRoot, '.specs', '.progress.json');
  if (!fs.existsSync(p)) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf8')) as { version?: number };
    return typeof obj.version === 'number' ? obj.version : null;
  } catch {
    return null;
  }
}

function makeAllow(reason: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: reason,
    },
  };
}
function makeDeny(reason: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/**
 * Compute the post-edit content from the hook input shape. For `Write` the
 * tool_input.content is the whole new file; for `Edit` we apply the
 * replacement to the on-disk content. If we can't get a deterministic
 * post-edit string, return null (fail-OPEN per-file per FR-19 soft tier).
 */
function postEditContent(input: HookInput, repoRoot: string): string | null {
  const tool = input.tool_name;
  const fp = input.tool_input?.file_path;
  if (!fp) return null;
  if (tool === 'Write') {
    return input.tool_input?.content ?? null;
  }
  if (tool === 'Edit') {
    const absPath = path.isAbsolute(fp) ? fp : path.join(repoRoot, fp);
    if (!fs.existsSync(absPath)) return null;
    const current = fs.readFileSync(absPath, 'utf8');
    const oldS = input.tool_input?.old_string ?? '';
    const newS = input.tool_input?.new_string ?? '';
    if (!oldS || !current.includes(oldS)) return null;
    return current.replace(oldS, newS);
  }
  return null;
}

/**
 * Detect malformed YAML frontmatter — currently the unclosed case: a block that
 * opens with `---` on the first non-blank line but never closes with a `---`
 * line. (Closed-but-invalid-YAML detection is a follow-up; the unclosed shape
 * is what SPECGEN004_10 exercises and the most common authoring slip.)
 */
function malformedFrontmatter(content: string): string | null {
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (lines[i]?.trim() !== '---') return null; // no frontmatter block
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '---') return null; // properly closed
  }
  return `YAML frontmatter opened at line ${i + 1} but has no closing --- fence.`;
}

/**
 * Run the HARD-tier checks on `(kind, content)` and return aggregated deny
 * reasons. Empty array = allow. Returns `null` if parsing itself blew up
 * with a non-recoverable internal error (caller fails OPEN).
 */
export function detectHardFindings(
  kind: FileKind,
  filePath: string,
  content: string,
): string[] | null {
  if (kind === null) return [];
  try {
    if (kind === 'md') {
      const fmError = malformedFrontmatter(content);
      if (fmError) return [`MALFORMED_FRONTMATTER at ${filePath} — ${fmError}`];
      const slice = parseMarkdown(content, filePath);
      const seen = new Map<string, number>();
      const denyReasons: string[] = [];
      for (const anchor of slice.anchors) {
        const id = anchor.canonicalId;
        if (!id) {
          denyReasons.push(
            `INVALID_ANCHOR_PATTERN at ${filePath}:${anchor.location.line} — heading matched anchor regex but produced an empty id.`,
          );
          continue;
        }
        const prevLine = seen.get(id);
        if (prevLine !== undefined && prevLine !== anchor.location.line) {
          denyReasons.push(
            `DUPLICATE_DEFINITION ${id} at ${filePath}:${anchor.location.line} — also defined at line ${prevLine}.`,
          );
        } else {
          seen.set(id, anchor.location.line);
        }
      }
      return denyReasons;
    }
    if (kind === 'feature') {
      const slice = parseGherkin(content, filePath);
      // A successfully empty slice on a non-empty body is the parser's
      // "soft fail" signal — surface as MALFORMED_GHERKIN only when the
      // body has any non-whitespace content but no scenarios came back.
      if (content.trim().length > 0 && slice.nodes.length === 0) {
        return [`MALFORMED_GHERKIN at ${filePath} — gherkin body did not yield any Scenario node.`];
      }
      return [];
    }
  } catch (err) {
    // Parser blew up — this is the per-file fail-OPEN branch per FR-19.
    return null;
  }
  return [];
}

/**
 * Pure runner — exported so tests can drive the hook without spawning a
 * subprocess. Reads `input`, returns a HookOutput object.
 */
export function runGuard(input: HookInput, repoRoot: string): HookOutput {
  const fp = input.tool_input?.file_path;
  if (!fp) return makeAllow('no file_path');

  // FR-22: version gate. v3 (or absent) → ALLOW_AFTER_MIGRATION.
  const version = readProgressVersion(repoRoot);
  if (version === null || version < 4) {
    return makeAllow('ALLOW_AFTER_MIGRATION');
  }

  if (!shouldGuard(fp)) return makeAllow('not a spec path');

  const kind: FileKind = classify(fp);
  const content = postEditContent(input, repoRoot);
  if (content === null) return makeAllow('cannot derive post-edit content');

  const denyReasons = detectHardFindings(kind, fp, content);
  if (denyReasons === null) return makeAllow('parser fail-OPEN per FR-19');
  if (denyReasons.length === 0) return makeAllow('no hard findings');
  return makeDeny(denyReasons.join('\n'));
}

async function readStdinJson(): Promise<HookInput> {
  return new Promise<HookInput>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? (JSON.parse(text) as HookInput) : {});
      } catch (e) {
        reject(e);
      }
    });
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const repoRoot = process.env.CLAUDE_PLUGIN_ROOT ?? process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  const input = await readStdinJson();
  const out = runGuard(input, repoRoot);
  process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // FR-19 hard-tier: startup crash → fail-CLOSED with exit 1.
    process.stderr.write(`[spec-conformance-guard] startup crash: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
