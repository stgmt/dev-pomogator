/**
 * Shared marker file utilities for extension hook scripts.
 * Eliminates duplication of marker read/write, cooldown, and hash across extensions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface MarkerData {
  hash: string;
  timestamp: string;
  count: number;
}

export function markerPath(repoRoot: string, markerDir: string, markerFilename: string): string {
  return path.join(repoRoot, markerDir, markerFilename);
}

export function readMarker(filePath: string): MarkerData | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as MarkerData;
    if (data && typeof data.hash === 'string' && typeof data.timestamp === 'string') {
      return data;
    }
    return null;
  } catch {
    return null; // corrupted or missing → treat as fresh
  }
}

export function writeMarkerAtomic(filePath: string, data: MarkerData): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function isWithinCooldown(timestamp: string, cooldownMinutes: number): boolean {
  const markerTime = new Date(timestamp).getTime();
  if (isNaN(markerTime)) return false;
  const elapsed = (Date.now() - markerTime) / 60_000;
  return elapsed < cooldownMinutes;
}

export function hashFileList(files: string[]): string {
  return createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 16);
}
