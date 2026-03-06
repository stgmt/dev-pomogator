import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Import the module under test
const msysModule = await import('../../src/utils/msys.js');
const { isMsysMangledPath, detectMsysEnvironment, getMsysSafeEnv, detectMangledArtifacts } = msysModule;

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'msys-test-'));
});

afterAll(async () => {
  if (tempDir) {
    await fs.remove(tempDir);
  }
});

describe('MSYS Path Mangling Detection', () => {
  describe('isMsysMangledPath', () => {
    it('detects MSYS-mangled paths with forward slashes', () => {
      expect(isMsysMangledPath('C:/Program Files/Git/home/vscode/.claude')).toBe(true);
    });

    it('detects MSYS-mangled paths with backslashes', () => {
      expect(isMsysMangledPath('C:\\Program Files\\Git\\home\\vscode\\.claude')).toBe(true);
    });

    it('detects lowercase drive letter', () => {
      expect(isMsysMangledPath('c:/Program Files/Git/usr/bin')).toBe(true);
    });

    it('rejects normal Windows paths', () => {
      expect(isMsysMangledPath('C:/Users/user/.claude')).toBe(false);
    });

    it('rejects Unix paths', () => {
      expect(isMsysMangledPath('/home/vscode/.claude')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isMsysMangledPath('')).toBe(false);
    });
  });

  describe('getMsysSafeEnv', () => {
    it('returns env with MSYS vars on win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        const env = getMsysSafeEnv({ HOME: '/home/test' } as unknown as NodeJS.ProcessEnv);
        expect(env.MSYS_NO_PATHCONV).toBe('1');
        expect(env.MSYS2_ARG_CONV_EXCL).toBe('*');
        expect(env.HOME).toBe('/home/test');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('returns env unchanged on linux', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        const env = getMsysSafeEnv({ HOME: '/home/test' } as unknown as NodeJS.ProcessEnv);
        expect(env.MSYS_NO_PATHCONV).toBeUndefined();
        expect(env.MSYS2_ARG_CONV_EXCL).toBeUndefined();
        expect(env.HOME).toBe('/home/test');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('uses process.env as default base', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        const env = getMsysSafeEnv();
        expect(env.MSYS_NO_PATHCONV).toBe('1');
        // Should contain PATH from process.env
        expect(env.PATH || env.Path).toBeDefined();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });

  describe('detectMangledArtifacts', () => {
    it('detects C: directory with Program Files/Git structure', async () => {
      const fakeProject = path.join(tempDir, 'project-with-artifact');
      await fs.ensureDir(path.join(fakeProject, 'C:', 'Program Files', 'Git', 'home', 'vscode'));
      await fs.ensureDir(path.join(fakeProject, 'src')); // normal dir

      const artifacts = await detectMangledArtifacts(fakeProject);
      expect(artifacts).toEqual(['C:']);
    });

    it('ignores C: directory without Program Files/Git', async () => {
      const fakeProject = path.join(tempDir, 'project-with-fake-c');
      await fs.ensureDir(path.join(fakeProject, 'C:', 'something-else'));

      const artifacts = await detectMangledArtifacts(fakeProject);
      expect(artifacts).toEqual([]);
    });

    it('returns empty for clean project', async () => {
      const cleanProject = path.join(tempDir, 'clean-project');
      await fs.ensureDir(path.join(cleanProject, 'src'));
      await fs.ensureDir(path.join(cleanProject, '.claude'));

      const artifacts = await detectMangledArtifacts(cleanProject);
      expect(artifacts).toEqual([]);
    });

    it('returns empty for non-existent directory', async () => {
      const artifacts = await detectMangledArtifacts(path.join(tempDir, 'no-such-dir'));
      expect(artifacts).toEqual([]);
    });
  });
});
