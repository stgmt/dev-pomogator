/**
 * Tests for resolveLspMode (FR-7 / SPECGEN004_16) — the supply-chain record
 * read drives which Markdown LSP backend the MCP server initialises.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolveLspMode } from '../lsp-mode.ts';
import { writeLog } from '../install-log.ts';

describe('resolveLspMode', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `lsp-mode-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('falls back to JS LSP when no install log exists', () => {
    expect(resolveLspMode(root)).toBe('js-fallback');
  });

  it('falls back to JS LSP when Marksman is recorded unavailable', () => {
    writeLog(root, { available: false, reason: 'offline' });
    expect(resolveLspMode(root)).toBe('js-fallback');
  });

  it('selects Marksman only when the log records an available binary', () => {
    writeLog(root, { available: true, binary_path: path.join(root, '.dev-pomogator/bin/marksman') });
    expect(resolveLspMode(root)).toBe('marksman');
  });
});
