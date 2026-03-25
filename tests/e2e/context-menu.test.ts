import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import { appPath, runTsx } from './helpers';

const POSTINSTALL_SCRIPT = 'extensions/context-menu/tools/context-menu/postinstall.ts';

// Import real module once (uses import guard — no side effects)
let postinstall: typeof import('../../extensions/context-menu/tools/context-menu/postinstall');
beforeAll(async () => {
  postinstall = await import('../../extensions/context-menu/tools/context-menu/postinstall');
});

describe('CTXMENU001: Context Menu Setup', () => {
  // @feature1
  it('CTXMENU001_01: postinstall generates valid NSS content', () => {
    const nss = postinstall.generateNss();
    expect(nss).toContain('Claude Code (YOLO + TUI)');
    expect(nss).toContain('Claude Code (YOLO)');
    expect(nss).toContain('Claude Code');
    expect(nss).toContain('launch-claude-tui.ps1');
  });

  // @feature1
  it('CTXMENU001_02: postinstall skips on non-Windows', () => {
    // Run the real postinstall.ts in Docker (Linux) — should skip
    const result = runTsx(POSTINSTALL_SCRIPT);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipped');
  });

  // @feature1
  it('CTXMENU001_03: NSS uses global scripts path', () => {
    const nss = postinstall.generateNss();
    expect(nss).toContain('.dev-pomogator');
    expect(nss).toContain('launch-claude-tui.ps1');
    // Should NOT contain any project-specific path
    expect(nss).not.toContain('D:\\repos\\my-project\\scripts');
    expect(nss).not.toContain('D:\\repos\\dev-pomogator\\scripts');
  });

  // @feature1
  it('CTXMENU001_04: launch script uses compact split ratio', async () => {
    const scriptPath = appPath('scripts/launch-claude-tui.ps1');
    expect(await fs.pathExists(scriptPath)).toBe(true);
    const content = await fs.readFile(scriptPath, 'utf-8');
    expect(content).toContain('-s 0.07');
    expect(content).not.toContain('-s 0.3');
  });

  // @feature1
  it('CTXMENU001_05: YOLO+TUI entry precedes plain YOLO in NSS', () => {
    const nss = postinstall.generateNss();
    const tuiIndex = nss.indexOf('YOLO + TUI');
    const yoloIndex = nss.indexOf("title='Claude Code (YOLO)'");
    expect(tuiIndex).toBeGreaterThan(-1);
    expect(yoloIndex).toBeGreaterThan(-1);
    expect(tuiIndex).toBeLessThan(yoloIndex);
  });

  // @feature1 — Integration
  it('CTXMENU001_06: postinstall.ts exits 0 and produces output via real execution (integration)', () => {
    const result = runTsx(POSTINSTALL_SCRIPT);
    expect(result.status).toBe(0);
    // In Docker (Linux) → "Skipped"; on Windows → NSS content or install attempt
    const output = (result.stdout + result.stderr).toLowerCase();
    expect(output.length).toBeGreaterThan(0);
  });
});
