import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';

/**
 * CORE018: Cursor Dead Code Cleanup
 *
 * Verifies that dead Cursor-specific code has been removed from
 * memory.ts and updater/index.ts, while shared functions remain intact.
 */

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');
const MEMORY_TS = path.join(SRC_DIR, 'installer', 'memory.ts');
const UPDATER_TS = path.join(SRC_DIR, 'updater', 'index.ts');

describe('CORE018: Cursor Dead Code Cleanup', () => {
  let memoryContent: string;
  let updaterContent: string;

  beforeAll(async () => {
    memoryContent = await fs.readFile(MEMORY_TS, 'utf-8');
    updaterContent = await fs.readFile(UPDATER_TS, 'utf-8');
  });

  // @feature1
  it('CORE018_01: memory.ts has no Cursor-specific exports', () => {
    expect(memoryContent).not.toContain('installCursorHooks');
    expect(memoryContent).not.toContain('areCursorHooksInstalled');
    expect(memoryContent).not.toContain('generateCursorHooksJson');
    expect(memoryContent).not.toContain('copyCursorSummarizeScript');
  });

  // @feature2
  it('CORE018_02: memory.ts has no CursorHooksJson interface', () => {
    expect(memoryContent).not.toContain('CursorHooksJson');
    expect(memoryContent).not.toContain('getWorkerServicePath');
    expect(memoryContent).not.toContain('getCursorSummarizeScriptPath');
  });

  // @feature3
  it('CORE018_03: updater/index.ts has no updateCursorHooksForProject', () => {
    expect(updaterContent).not.toContain('updateCursorHooksForProject');
  });

  // @feature4
  it('CORE018_04: updater/index.ts has no CursorHooksJson interface', () => {
    expect(updaterContent).not.toContain('CursorHooksJson');
  });

  // @feature5
  it('CORE018_05: ensureClaudeMem still exported from memory.ts', () => {
    expect(memoryContent).toContain('export async function ensureClaudeMem');
  });
});
