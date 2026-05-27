/**
 * Phase 0 Step 5: Scratch findings (FR-14, AC-14).
 *
 * Для репо с >500 файлов subagents appends findings в `.specs/.onboarding-scratch.md`
 * каждые 2-3 прочитанных файла — external memory, защищает от переполнения context window.
 * После Step 7 scratch archive-ится в `.specs/.onboarding-history/scratch-{ISO-timestamp}.md`
 * с retention 5 архивов.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-14, AC.md#ac-14}.
 */

import * as path from 'node:path';
import * as fsExtra from 'fs-extra';
import { glob } from 'glob';


const SCRATCH_REL = path.join('.specs', '.onboarding-scratch.md');
const HISTORY_DIR_REL = path.join('.specs', '.onboarding-history');
export const SCRATCH_THRESHOLD = 500;
export const SCRATCH_RETENTION = 5;


export interface FileCountResult {
  total: number;
  requiresScratch: boolean;
}


export async function countRepoFiles(projectPath: string, threshold: number = SCRATCH_THRESHOLD): Promise<FileCountResult> {
  const files = await glob('**/*', {
    cwd: projectPath,
    nodir: true,
    dot: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.venv/**', '**/__pycache__/**', '**/.next/**', '**/.turbo/**', '**/target/**'],
  });
  return { total: files.length, requiresScratch: files.length > threshold };
}


export class ScratchAppender {
  readonly scratchPath: string;
  private initialized = false;

  constructor(projectPath: string) {
    this.scratchPath = path.join(projectPath, SCRATCH_REL);
  }

  async append(source: string, findings: string | string[]): Promise<void> {
    await this.ensureHeader();
    const timestamp = new Date().toISOString();
    const lines = Array.isArray(findings) ? findings : [findings];
    const block = [`### ${timestamp} — ${source}`, ...lines.map((line) => `- ${line}`), ''].join('\n');
    await fsExtra.appendFile(this.scratchPath, `${block}\n`, 'utf-8');
  }

  async exists(): Promise<boolean> {
    return await fsExtra.pathExists(this.scratchPath);
  }

  private async ensureHeader(): Promise<void> {
    if (this.initialized) return;
    if (!(await fsExtra.pathExists(this.scratchPath))) {
      await fsExtra.ensureDir(path.dirname(this.scratchPath));
      const header = [
        '# Phase 0 Onboarding Scratch',
        '',
        '_Generated during Phase 0 recon for large repos (>500 files). Archived after finalize.  ',
        '_DO NOT EDIT manually — archived and pruned by dev-pomogator._',
        '',
      ].join('\n');
      await fsExtra.writeFile(this.scratchPath, `${header}\n`, 'utf-8');
    }
    this.initialized = true;
  }
}


export async function archiveScratch(projectPath: string, timestamp: string = new Date().toISOString()): Promise<string | null> {
  const scratchPath = path.join(projectPath, SCRATCH_REL);
  if (!(await fsExtra.pathExists(scratchPath))) return null;
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const historyDir = path.join(projectPath, HISTORY_DIR_REL);
  await fsExtra.ensureDir(historyDir);
  const archivePath = path.join(historyDir, `scratch-${safeTimestamp}.md`);
  await fsExtra.move(scratchPath, archivePath, { overwrite: false });
  await pruneScratchArchives(projectPath);
  return archivePath;
}


export async function pruneScratchArchives(projectPath: string, keep: number = SCRATCH_RETENTION): Promise<void> {
  const historyDir = path.join(projectPath, HISTORY_DIR_REL);
  if (!(await fsExtra.pathExists(historyDir))) return;
  const entries = await fsExtra.readdir(historyDir);
  const scratchFiles: Array<{ name: string; fullPath: string; mtime: number }> = [];
  for (const entry of entries) {
    if (!entry.startsWith('scratch-') || !entry.endsWith('.md')) continue;
    const fullPath = path.join(historyDir, entry);
    const stat = await fsExtra.stat(fullPath);
    if (stat.isFile()) scratchFiles.push({ name: entry, fullPath, mtime: stat.mtimeMs });
  }
  if (scratchFiles.length <= keep) return;
  scratchFiles.sort((a, b) => b.mtime - a.mtime);
  const toDelete = scratchFiles.slice(keep);
  for (const file of toDelete) {
    await fsExtra.remove(file.fullPath);
  }
}


export async function readScratch(projectPath: string): Promise<string | null> {
  const scratchPath = path.join(projectPath, SCRATCH_REL);
  if (!(await fsExtra.pathExists(scratchPath))) return null;
  return await fsExtra.readFile(scratchPath, 'utf-8');
}
