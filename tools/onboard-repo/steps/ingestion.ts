/**
 * Phase 0 Step 3: Ingestion (FR-2 ingestion block, NFR-P5 token budget).
 *
 * Compresses the repo for subsequent reasoning:
 *  - Primary: spawn `repomix --compress -o /tmp/.onboarding-<slug>.xml` (~70% token reduction)
 *  - Fallback: shell-based top-N ranking (size + recency + reverse-imports)
 *
 * Repomix availability is detected via DI (`availability` callback) to allow
 * deterministic tests без реального `which repomix` call.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-2, NFR.md#performance}.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import * as fsExtra from 'fs-extra';
import { glob } from 'glob';
import type { OnboardingJson } from '../lib/types.ts';


export type IngestionMethod = 'repomix' | 'fallback';


export interface IngestionResult {
  method: IngestionMethod;
  output_path: string | null;
  compression_ratio: number;
  files_included: number;
  total_tokens_estimate: number;
}


export interface IngestionContext {
  slug: string;
  projectPath: string;
  /** Absolute directory where output artifact is written (default: os.tmpdir()) */
  outputDir?: string;
  /** Max files for fallback top-N (default: 50) */
  fallbackMaxFiles?: number;
}


export interface IngestionDeps {
  /** Returns true if `repomix` CLI is available in PATH or node_modules/.bin */
  repomixAvailable: () => boolean;
  /** Spawns `repomix` with args, returns exit code + stdout preview */
  runRepomix: (projectPath: string, outputPath: string) => { status: number; message: string };
}


export function defaultDeps(): IngestionDeps {
  return {
    repomixAvailable() {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const result = spawnSync(whichCmd, ['repomix'], { encoding: 'utf-8', shell: false });
      return result.status === 0 && result.stdout.trim().length > 0;
    },
    runRepomix(projectPath, outputPath) {
      const result = spawnSync(
        'repomix',
        ['--compress', '--output', outputPath, '--output-show-line-numbers', projectPath],
        { encoding: 'utf-8', shell: false, cwd: projectPath, timeout: 180_000 },
      );
      return {
        status: typeof result.status === 'number' ? result.status : -1,
        message: (result.stdout || '') + (result.stderr || ''),
      };
    },
  };
}


export async function runIngestion(ctx: IngestionContext, deps: IngestionDeps = defaultDeps()): Promise<IngestionResult> {
  const outputDir = ctx.outputDir ?? os.tmpdir();
  const outputPath = path.join(outputDir, `.onboarding-${ctx.slug}.xml`);

  if (deps.repomixAvailable()) {
    const repomixResult = await tryRepomix(ctx, outputPath, deps);
    if (repomixResult) return repomixResult;
    // fall through to fallback on repomix failure
  }

  return await fallbackIngestion(ctx);
}


async function tryRepomix(
  ctx: IngestionContext,
  outputPath: string,
  deps: IngestionDeps,
): Promise<IngestionResult | null> {
  try {
    const rawSize = await countRawSourceBytes(ctx.projectPath);
    const result = deps.runRepomix(ctx.projectPath, outputPath);
    if (result.status !== 0) return null;
    if (!(await fsExtra.pathExists(outputPath))) return null;

    const compressedSize = (await fsExtra.stat(outputPath)).size;
    const compressionRatio = rawSize > 0 ? Math.min(1, compressedSize / rawSize) : 1;

    return {
      method: 'repomix',
      output_path: outputPath,
      compression_ratio: compressionRatio,
      files_included: await countSourceFiles(ctx.projectPath),
      total_tokens_estimate: estimateTokens(compressedSize),
    };
  } catch {
    return null;
  }
}


interface RankedFile {
  relPath: string;
  size: number;
  mtime: number;
  importRefs: number;
  score: number;
}


async function fallbackIngestion(ctx: IngestionContext): Promise<IngestionResult> {
  const maxFiles = ctx.fallbackMaxFiles ?? 50;
  const outputDir = ctx.outputDir ?? os.tmpdir();
  const outputPath = path.join(outputDir, `.onboarding-${ctx.slug}.txt`);

  const files = await collectSourceFiles(ctx.projectPath);
  if (files.length === 0) {
    return {
      method: 'fallback',
      output_path: null,
      compression_ratio: 0,
      files_included: 0,
      total_tokens_estimate: 0,
    };
  }

  const ranked: RankedFile[] = [];
  const importIndex = await buildImportIndex(ctx.projectPath, files);
  const now = Date.now();
  let maxSize = 1;
  for (const relPath of files) {
    const absPath = path.join(ctx.projectPath, relPath);
    const stat = await fsExtra.stat(absPath);
    if (stat.size > maxSize) maxSize = stat.size;
    ranked.push({
      relPath,
      size: stat.size,
      mtime: stat.mtimeMs,
      importRefs: importIndex.get(baseNameWithoutExt(relPath)) ?? 0,
      score: 0,
    });
  }

  for (const file of ranked) {
    const sizeScore = file.size / maxSize;
    const ageDays = Math.max(1, (now - file.mtime) / (1000 * 60 * 60 * 24));
    const recencyScore = 1 / Math.log2(ageDays + 2);
    const importScore = Math.min(1, file.importRefs / 5);
    file.score = 0.4 * sizeScore + 0.3 * recencyScore + 0.3 * importScore;
  }

  ranked.sort((a, b) => b.score - a.score);
  const topN = ranked.slice(0, maxFiles);

  const blocks: string[] = [];
  for (const file of topN) {
    const absPath = path.join(ctx.projectPath, file.relPath);
    const content = await readContentSafe(absPath);
    if (content === null) continue;
    blocks.push(`=== ${file.relPath} (${file.size}B, refs=${file.importRefs}, score=${file.score.toFixed(3)}) ===\n${content}`);
  }

  await fsExtra.ensureDir(path.dirname(outputPath));
  await fsExtra.writeFile(outputPath, blocks.join('\n\n'), 'utf-8');

  const compressedSize = (await fsExtra.stat(outputPath)).size;
  const rawSize = await countRawSourceBytes(ctx.projectPath);
  const compressionRatio = rawSize > 0 ? Math.min(1, compressedSize / rawSize) : 1;

  return {
    method: 'fallback',
    output_path: outputPath,
    compression_ratio: compressionRatio,
    files_included: topN.length,
    total_tokens_estimate: estimateTokens(compressedSize),
  };
}


const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.next', '.turbo', 'target'];
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.cs', '.rb', '.php', '.java', '.kt', '.swift', '.ex', '.exs', '.ml', '.dart'];
const META_FILES = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json', 'pom.xml', 'mix.exs', 'pubspec.yaml', 'requirements.txt'];


async function collectSourceFiles(projectPath: string): Promise<string[]> {
  const patterns = SOURCE_EXTS.map((ext) => `**/*${ext}`).concat(META_FILES);
  const ignore = IGNORE_DIRS.flatMap((dir) => [`**/${dir}/**`, `${dir}/**`]);
  const hits = await glob(patterns, {
    cwd: projectPath,
    ignore,
    nodir: true,
    dot: false,
    posix: true,
  });
  return [...new Set(hits)];
}


async function countSourceFiles(projectPath: string): Promise<number> {
  return (await collectSourceFiles(projectPath)).length;
}


async function countRawSourceBytes(projectPath: string): Promise<number> {
  const files = await collectSourceFiles(projectPath);
  let total = 0;
  for (const rel of files) {
    try {
      total += (await fsExtra.stat(path.join(projectPath, rel))).size;
    } catch {
      // skip vanished files
    }
  }
  return total;
}


async function buildImportIndex(projectPath: string, files: string[]): Promise<Map<string, number>> {
  const index = new Map<string, number>();
  for (const rel of files) {
    const content = await readContentSafe(path.join(projectPath, rel));
    if (content === null) continue;
    const importTargets = extractImportTargets(content);
    for (const target of importTargets) {
      const base = baseNameWithoutExt(target);
      index.set(base, (index.get(base) ?? 0) + 1);
    }
  }
  return index;
}


function extractImportTargets(content: string): string[] {
  const targets = new Set<string>();
  const patterns = [
    /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /^from\s+([\w.]+)\s+import/gm,
    /^import\s+([\w.]+)/gm,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const target = match[1];
      if (target && !target.startsWith('http')) targets.add(target);
    }
  }
  return [...targets];
}


function baseNameWithoutExt(p: string): string {
  const base = path.basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(0, idx) : base;
}


async function readContentSafe(absPath: string): Promise<string | null> {
  try {
    const stat = await fsExtra.stat(absPath);
    if (stat.isDirectory()) return null;
    if (stat.size > 2 * 1024 * 1024) return null; // skip >2MB
    return await fsExtra.readFile(absPath, 'utf-8');
  } catch {
    return null;
  }
}


function estimateTokens(bytes: number): number {
  // heuristic: ~4 bytes per token для source code
  return Math.round(bytes / 4);
}
