import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import crossSpawn from 'cross-spawn';
import { appPath, runTsx } from './helpers';

const POSTINSTALL_SCRIPT = 'tools/context-menu/postinstall.ts';

// The launch-script execution tests run the real .ps1 under pwsh. They are written for the
// Linux/Docker suite (no wt.exe → graceful-failure path); on Windows the script would launch a
// real Windows Terminal session, so we skip there. Requires pwsh (present in Dockerfile.test.base).
const isWindows = process.platform === 'win32';
function pwshAvailable(): boolean {
  try {
    const r = crossSpawn.sync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { timeout: 10000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
const skipPwsh = isWindows || !pwshAvailable();

// Import real module once (uses import guard — no side effects)
let postinstall: typeof import('../../tools/context-menu/postinstall');
beforeAll(async () => {
  postinstall = await import('../../tools/context-menu/postinstall');
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

  // @feature2 — copyLaunchScript installs the script to the global path the NSS references
  it('CTXMENU001_07: copyLaunchScript copies bundled script to target path (integration)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ctxmenu-copy-'));
    try {
      const src = path.join(tmp, 'src', 'launch-claude-tui.ps1');
      const dest = path.join(tmp, 'home', '.dev-pomogator', 'scripts', 'launch-claude-tui.ps1');
      fs.ensureDirSync(path.dirname(src));
      fs.writeFileSync(src, '# sentinel launch script content\n', 'utf-8');

      const ok = postinstall.copyLaunchScript(src, dest);

      expect(ok).toBe(true);
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, 'utf-8')).toBe(fs.readFileSync(src, 'utf-8'));
    } finally {
      fs.removeSync(tmp);
    }
  });

  // @feature2 — missing source must not silently create an empty target
  it('CTXMENU001_08: copyLaunchScript returns false when source is missing (integration)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ctxmenu-missing-'));
    try {
      const src = path.join(tmp, 'does-not-exist.ps1');
      const dest = path.join(tmp, 'home', '.dev-pomogator', 'scripts', 'launch-claude-tui.ps1');

      const ok = postinstall.copyLaunchScript(src, dest);

      expect(ok).toBe(false);
      expect(fs.existsSync(dest)).toBe(false);
    } finally {
      fs.removeSync(tmp);
    }
  });

  // @feature3 — every launch is logged so a failed right-click leaves a trace (real pwsh execution)
  it.skipIf(skipPwsh)('CTXMENU001_09: launch script logs every invocation (integration)', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ctxmenu-home-'));
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ctxmenu-proj-'));
    try {
      const scriptPath = appPath('scripts/launch-claude-tui.ps1');
      crossSpawn.sync(
        'pwsh',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ProjectDir', tmpProject],
        {
          encoding: 'utf-8',
          timeout: 30000,
          env: { ...process.env, HOME: tmpHome, CONTEXT_MENU_NONINTERACTIVE: '1' },
        },
      );

      const logFile = path.join(tmpHome, '.dev-pomogator', 'logs', 'context-menu-launch.log');
      expect(fs.existsSync(logFile)).toBe(true);
      const logContent = fs.readFileSync(logFile, 'utf-8');
      expect(logContent).toContain('launch-claude-tui.ps1 invoked');
      expect(logContent).toContain(`ProjectDir=`);
    } finally {
      fs.removeSync(tmpHome);
      fs.removeSync(tmpProject);
    }
  });

  // @feature3 — without wt.exe the script must fail gracefully (non-zero, no hang) and log the error
  it.skipIf(skipPwsh)('CTXMENU001_10: launch script fails gracefully and logs ERROR when wt.exe absent (integration)', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ctxmenu-home-'));
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-ctxmenu-proj-'));
    try {
      const scriptPath = appPath('scripts/launch-claude-tui.ps1');
      const result = crossSpawn.sync(
        'pwsh',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ProjectDir', tmpProject],
        {
          encoding: 'utf-8',
          timeout: 30000,
          env: { ...process.env, HOME: tmpHome, CONTEXT_MENU_NONINTERACTIVE: '1' },
        },
      );

      // status === 1 (our catch's `exit 1`); null would mean it hung and was killed at timeout.
      expect(result.status).toBe(1);
      const logFile = path.join(tmpHome, '.dev-pomogator', 'logs', 'context-menu-launch.log');
      expect(fs.existsSync(logFile)).toBe(true);
      expect(fs.readFileSync(logFile, 'utf-8')).toContain('ERROR:');
    } finally {
      fs.removeSync(tmpHome);
      fs.removeSync(tmpProject);
    }
  });

  // @feature2 — the launch script the NSS references must actually ship in the plugin tree
  it('CTXMENU001_11: bundledLaunchScriptPath resolves to a real file in the plugin tree', () => {
    const src = postinstall.bundledLaunchScriptPath();
    expect(fs.existsSync(src), `bundled launch script missing at ${src}`).toBe(true);
    expect(src.replace(/\\/g, '/')).toMatch(/scripts\/launch-claude-tui\.ps1$/);
  });

  // @feature2 — drift guard: the NSS entry path and copyLaunchScript's target must be the SAME file,
  // else the menu points one place and the install writes another (the original G1 bug class).
  it('CTXMENU001_12: generated NSS references the global path copyLaunchScript writes to', () => {
    const nss = postinstall.generateNss().replace(/\\/g, '/');
    const home = os.homedir().replace(/\\/g, '/');
    const expected = `${home}/.dev-pomogator/scripts/launch-claude-tui.ps1`;
    expect(nss).toContain(expected);
  });
});
