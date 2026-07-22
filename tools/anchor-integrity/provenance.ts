/**
 * Session-scoped provenance for the FR-34b anchor Stop-gate.
 *
 * A SessionStart baseline answers "did this path change after my session began?".
 * Per-file PostToolUse markers answer "did my session's Write/Edit touch this path?".
 * The gate attributes a dirty file only when BOTH facts hold. Git inspection is
 * read-only: status + index blob fingerprints, never add/reset/update-index.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface SpecFingerprint {
  status: string;
  worktree_sha256: string | null;
  index_sha256: string | null;
}

export interface AnchorSessionBaseline {
  version: 1;
  session_id: string;
  repo_root: string;
  captured_at: string;
  files: Record<string, SpecFingerprint>;
}

export interface ProvenanceClassification {
  baselineFound: boolean;
  currentPaths: string[];
  currentSlugs: string[];
  preexistingPaths: string[];
  preexistingSlugs: string[];
  unknownPaths: string[];
  unknownSlugs: string[];
}

function sha(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stateDir(repoRoot: string, sessionId: string): string {
  const key = sha(`${path.resolve(repoRoot)}\0${sessionId}`).slice(0, 24);
  return path.join(repoRoot, '.dev-pomogator', '.anchor-provenance', key);
}

export function baselinePath(repoRoot: string, sessionId: string): string {
  return path.join(stateDir(repoRoot, sessionId), 'baseline.json');
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, filePath);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already renamed */ }
  }
}

function normalizeRepoPath(repoRoot: string, filePath: string): string | null {
  const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(repoRoot, filePath);
  const relative = path.relative(path.resolve(repoRoot), absolute).replace(/\\/g, '/');
  if (!relative || relative === '..' || relative.startsWith('../')) return null;
  return /^\.specs\/[^/]+\/.+\.md$/i.test(relative) ? relative : null;
}

function parsePorcelainZ(stdout: string): Array<{ status: string; file: string }> {
  const records = stdout.split('\0');
  const found: Array<{ status: string; file: string }> = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || record.length < 4) continue;
    const status = record.slice(0, 2);
    const file = record.slice(3).replace(/\\/g, '/');
    if (/^[RC]/.test(status) || /[RC]$/.test(status)) i++; // consume rename/copy source
    if (/^\.specs\/[^/]+\/.+\.md$/i.test(file)) found.push({ status, file });
  }
  return found;
}

function worktreeFingerprint(repoRoot: string, relative: string): string | null {
  try {
    const stat = fs.statSync(path.join(repoRoot, ...relative.split('/')));
    if (!stat.isFile()) return null;
    return sha(fs.readFileSync(path.join(repoRoot, ...relative.split('/'))));
  } catch {
    return null;
  }
}

function indexFingerprint(repoRoot: string, relative: string): string | null {
  const result = spawnSync('git', ['ls-files', '-s', '-z', '--', relative], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout) return null;
  return sha(result.stdout);
}

function readDirtySpecFingerprints(repoRoot: string): { reliable: boolean; files: Record<string, SpecFingerprint> } {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.specs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return { reliable: false, files: {} };
  const files: Record<string, SpecFingerprint> = {};
  for (const { status, file } of parsePorcelainZ(result.stdout)) {
    files[file] = {
      status,
      worktree_sha256: worktreeFingerprint(repoRoot, file),
      index_sha256: indexFingerprint(repoRoot, file),
    };
  }
  return { reliable: true, files };
}

/** Snapshot every currently dirty spec Markdown file, including staged/unstaged/untracked. */
export function dirtySpecFingerprints(repoRoot: string): Record<string, SpecFingerprint> {
  return readDirtySpecFingerprints(repoRoot).files;
}

/** Capture-once: a repeated SessionStart delivery cannot move the baseline forward. */
export function captureSessionBaseline(repoRoot: string, sessionId: string): AnchorSessionBaseline | null {
  if (!sessionId) return null;
  const file = baselinePath(repoRoot, sessionId);
  const existing = readBaseline(repoRoot, sessionId);
  if (existing) return existing;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let lockFd: number | undefined;
  try {
    lockFd = fs.openSync(lock, 'wx');
    const afterLock = readBaseline(repoRoot, sessionId);
    if (afterLock) return afterLock;
    const snapshot = readDirtySpecFingerprints(repoRoot);
    if (!snapshot.reliable) return null;
    const baseline: AnchorSessionBaseline = {
      version: 1,
      session_id: sessionId,
      repo_root: path.resolve(repoRoot),
      captured_at: new Date().toISOString(),
      files: snapshot.files,
    };
    atomicWriteJson(file, baseline);
    return baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return readBaseline(repoRoot, sessionId);
    throw error;
  } finally {
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
      try { fs.unlinkSync(lock); } catch { /* already removed */ }
    }
  }
}

function readBaseline(repoRoot: string, sessionId: string): AnchorSessionBaseline | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath(repoRoot, sessionId), 'utf8')) as AnchorSessionBaseline;
    return parsed.version === 1 && parsed.session_id === sessionId ? parsed : null;
  } catch {
    return null;
  }
}

/** Record one exact PostToolUse path. Separate marker files avoid shared-list lost updates. */
export function recordSessionTouch(repoRoot: string, sessionId: string, filePath: string): string | null {
  if (!sessionId) return null;
  const relative = normalizeRepoPath(repoRoot, filePath);
  if (!relative) return null;
  const touchFile = path.join(stateDir(repoRoot, sessionId), 'touches', `${sha(relative).slice(0, 24)}.json`);
  atomicWriteJson(touchFile, { version: 1, session_id: sessionId, path: relative });
  return relative;
}

function readTouchedPaths(repoRoot: string, sessionId: string): Set<string> {
  const dir = path.join(stateDir(repoRoot, sessionId), 'touches');
  const paths = new Set<string>();
  let entries: string[] = [];
  try { entries = fs.readdirSync(dir).filter((entry) => entry.endsWith('.json')); } catch { return paths; }
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as { session_id?: string; path?: string };
      if (parsed.session_id === sessionId && typeof parsed.path === 'string') paths.add(parsed.path);
    } catch { /* malformed marker is not provenance */ }
  }
  return paths;
}

function equalFingerprint(a: SpecFingerprint | undefined, b: SpecFingerprint): boolean {
  return !!a && a.status === b.status && a.worktree_sha256 === b.worktree_sha256 && a.index_sha256 === b.index_sha256;
}

function slugs(paths: string[]): string[] {
  return [...new Set(paths.map((file) => file.match(/^\.specs\/([^/]+)\//)?.[1]).filter((v): v is string => !!v))].sort();
}

/** Classify without changing the worktree or Git index. Unknown provenance always fails open. */
export function classifySessionSpecChanges(repoRoot: string, sessionId?: string): ProvenanceClassification {
  const snapshot = readDirtySpecFingerprints(repoRoot);
  const current = snapshot.files;
  const allCurrent = Object.keys(current).sort();
  const baseline = sessionId ? readBaseline(repoRoot, sessionId) : null;
  if (!snapshot.reliable || !sessionId || !baseline) {
    return {
      baselineFound: false,
      currentPaths: [], currentSlugs: [], preexistingPaths: [], preexistingSlugs: [],
      unknownPaths: allCurrent, unknownSlugs: slugs(allCurrent),
    };
  }

  const touched = readTouchedPaths(repoRoot, sessionId);
  const currentPaths: string[] = [];
  const preexistingPaths: string[] = [];
  const unknownPaths: string[] = [];
  for (const file of allCurrent) {
    if (equalFingerprint(baseline.files[file], current[file])) {
      preexistingPaths.push(file);
    } else if (touched.has(file)) {
      currentPaths.push(file);
    } else {
      unknownPaths.push(file);
    }
  }
  return {
    baselineFound: true,
    currentPaths, currentSlugs: slugs(currentPaths),
    preexistingPaths, preexistingSlugs: slugs(preexistingPaths),
    unknownPaths, unknownSlugs: slugs(unknownPaths),
  };
}

export function unknownProvenanceNotice(classification: ProvenanceClassification): string | null {
  if (!classification.unknownSlugs.length) return null;
  return `anchor-integrity (FR-34): provenance unknown for dirty spec changes in ${classification.unknownSlugs.join(', ')}; not attributing them to this session and failing open.`;
}
