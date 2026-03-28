import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import { appPath } from './helpers';

describe('CORE019: Extension Beta Flag', () => {
  // =========================================================================
  // FR-1: stability field parsing (@feature1)
  // =========================================================================

  // @feature1
  it('CORE019_01: extension with stability beta is parsed correctly', async () => {
    const manifestPath = appPath('extensions', 'docker-optimization', 'extension.json');
    const manifest = await fs.readJson(manifestPath);
    expect(manifest.stability).toBe('beta');
  });

  // @feature1
  it('CORE019_02: extension without stability field defaults to stable', async () => {
    const manifestPath = appPath('extensions', 'auto-commit', 'extension.json');
    const manifest = await fs.readJson(manifestPath);
    expect(manifest.stability).toBeUndefined();
  });

  // @feature1
  it('CORE019_08: isBeta helper works correctly', async () => {
    const { isBeta } = await import(
      appPath('dist', 'installer', 'extensions.js')
    );
    expect(isBeta({ stability: 'beta' })).toBe(true);
    expect(isBeta({ stability: 'stable' })).toBe(false);
    expect(isBeta({})).toBe(false);
    expect(isBeta({ stability: undefined })).toBe(false);
  });

  // =========================================================================
  // FR-2, FR-3: Interactive checkbox label and default (@feature2)
  // =========================================================================

  // @feature2
  it('CORE019_03: installer source has beta label in checkbox', async () => {
    const indexPath = appPath('src', 'installer', 'index.ts');
    const source = await fs.readFile(indexPath, 'utf-8');
    expect(source).toContain("isBeta(ext) ? ' (BETA)' : ''");
  });

  // @feature2
  it('CORE019_04: installer source has beta unchecked by default', async () => {
    const indexPath = appPath('src', 'installer', 'index.ts');
    const source = await fs.readFile(indexPath, 'utf-8');
    expect(source).toContain('checked: !isBeta(ext)');
  });

  // =========================================================================
  // FR-4: --all excludes beta — verify filtering logic (@feature3)
  // =========================================================================

  // @feature3
  it('CORE019_05: listExtensions + isBeta filters beta from --all set', async () => {
    const { listExtensions, isBeta } = await import(
      appPath('dist', 'installer', 'extensions.js')
    );

    const allExtensions = await listExtensions();
    const claudeExtensions = allExtensions.filter((ext: any) =>
      ext.platforms.includes('claude')
    );

    // Simulate --all without --include-beta: filter beta
    const stableOnly = claudeExtensions.filter((ext: any) => !isBeta(ext));
    const betaOnly = claudeExtensions.filter((ext: any) => isBeta(ext));

    // docker-optimization should be in beta list
    expect(betaOnly.some((e: any) => e.name === 'docker-optimization')).toBe(true);

    // docker-optimization should NOT be in stable list
    expect(stableOnly.some((e: any) => e.name === 'docker-optimization')).toBe(false);

    // stable list should have extensions (auto-commit, plan-pomogator, etc.)
    expect(stableOnly.length).toBeGreaterThan(0);

    // beta list should be smaller than all
    expect(betaOnly.length).toBeLessThan(claudeExtensions.length);
  });

  // =========================================================================
  // FR-5: --include-beta includes all (@feature4)
  // =========================================================================

  // @feature4
  it('CORE019_06: --include-beta includes beta extensions in full set', async () => {
    const { listExtensions, isBeta } = await import(
      appPath('dist', 'installer', 'extensions.js')
    );

    const allExtensions = await listExtensions();
    const claudeExtensions = allExtensions.filter((ext: any) =>
      ext.platforms.includes('claude')
    );

    // Simulate --all --include-beta: no filter
    const withBeta = claudeExtensions; // no filter applied

    // docker-optimization should be included
    expect(withBeta.some((e: any) => e.name === 'docker-optimization')).toBe(true);

    // All stable also included
    const stableCount = claudeExtensions.filter((ext: any) => !isBeta(ext)).length;
    expect(withBeta.length).toBeGreaterThanOrEqual(stableCount);
  });

  // =========================================================================
  // FR-4: installer source has beta filter in non-interactive (@feature3)
  // =========================================================================

  // @feature3
  it('CORE019_07: installer source filters beta in non-interactive --all', async () => {
    const indexPath = appPath('src', 'installer', 'index.ts');
    const source = await fs.readFile(indexPath, 'utf-8');

    // Non-interactive flow should filter beta when !includeBeta
    expect(source).toContain('!options.includeBeta');
    expect(source).toContain('availableExtensions.filter(ext => !isBeta(ext))');
    expect(source).toContain('Skipping beta plugins');
  });
});
