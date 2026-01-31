/**
 * E2E Tests for PLUGIN006: Specs Generator PowerShell Scripts
 *
 * Tests the PowerShell scripts for spec management:
 * - scaffold-spec.ps1
 * - validate-spec.ps1
 * - spec-status.ps1
 * - list-specs.ps1
 * - fill-template.ps1
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  runPowerShell,
  getSpecsGeneratorPath,
  getSpecsGeneratorFixturePath,
  appPath,
  initGitRepo,
} from './helpers';

// ============================================================================
// Test Configuration
// ============================================================================

const SCRIPTS_DIR = 'extensions/specs-workflow/tools/specs-generator';

// ============================================================================
// Test Suite
// ============================================================================

describe('PLUGIN006: Specs Generator Scripts', () => {
  beforeAll(async () => {
    await initGitRepo();
  });

  // ==========================================================================
  // scaffold-spec.ps1
  // ==========================================================================

  describe('scaffold-spec.ps1', () => {
    const testSpecName = 'test-scaffold-spec';

    afterEach(async () => {
      // Cleanup created spec folder
      await fs.remove(appPath('.specs', testSpecName));
      await fs.remove(appPath('.specs', 'existing-spec'));
    });

    // @feature1
    it('should create 13 files with valid kebab-case name', () => {
      const result = runPowerShell(
        getSpecsGeneratorPath('scaffold-spec.ps1'),
        ['-Name', testSpecName]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();
      expect(result.json.success).toBe(true);
      expect(result.json.created_files).toBeDefined();
      expect(result.json.created_files.length).toBe(13);
      expect(result.json.next_step).toContain('USER_STORIES');
    });

    // @feature2
    it('should reject name with spaces', () => {
      const result = runPowerShell(
        getSpecsGeneratorPath('scaffold-spec.ps1'),
        ['-Name', 'invalid name with spaces']
      );

      // PowerShell should reject names with spaces
      expect(result.json).toBeDefined();
      expect(result.json.success).toBe(false);
      expect(result.json.error).toContain('kebab-case');
    });

    // @feature3
    it('should overwrite existing spec with -Force flag', async () => {
      const specName = 'existing-spec';
      
      // Create existing folder
      await fs.ensureDir(appPath('.specs', specName));
      await fs.writeFile(appPath('.specs', specName, 'dummy.txt'), 'test');

      // Run with -Force
      const result = runPowerShell(
        getSpecsGeneratorPath('scaffold-spec.ps1'),
        ['-Name', specName, '-Force']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.success).toBe(true);
      expect(result.json.created_files.length).toBe(13);
      
      // Old file should be gone
      expect(await fs.pathExists(appPath('.specs', specName, 'dummy.txt'))).toBe(false);
    });
  });

  // ==========================================================================
  // validate-spec.ps1
  // ==========================================================================

  describe('validate-spec.ps1', () => {
    let tempSpecDir: string;

    beforeEach(async () => {
      // Copy fixtures to .specs/ for testing
      tempSpecDir = appPath('.specs', 'temp-validate-test');
      await fs.ensureDir(appPath('.specs'));
    });

    afterEach(async () => {
      // Cleanup
      await fs.remove(tempSpecDir);
      await fs.remove(appPath('.specs', 'valid-spec-test'));
      await fs.remove(appPath('.specs', 'invalid-spec-test'));
    });

    // @feature4
    it('should return valid=true for complete spec', async () => {
      const destPath = appPath('.specs', 'valid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runPowerShell(
        getSpecsGeneratorPath('validate-spec.ps1'),
        ['-Path', '.specs/valid-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.valid).toBe(true);
      expect(result.json.errors.length).toBe(0);
    });

    // @feature5
    it('should report STRUCTURE errors for missing files', async () => {
      const destPath = appPath('.specs', 'invalid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('invalid-spec'), destPath);

      const result = runPowerShell(
        getSpecsGeneratorPath('validate-spec.ps1'),
        ['-Path', '.specs/invalid-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.valid).toBe(false);
      
      const structureErrors = result.json.errors.filter(
        (e: any) => e.rule === 'STRUCTURE'
      );
      expect(structureErrors.length).toBeGreaterThan(0);
    });

    // @feature6
    it('should report FR_FORMAT errors for invalid FR.md', async () => {
      const destPath = appPath('.specs', 'invalid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('invalid-spec'), destPath);
      
      // Add remaining required files to avoid STRUCTURE errors
      const requiredFiles = [
        'USER_STORIES.md', 'REQUIREMENTS.md', 'DESIGN.md',
        'TASKS.md', 'FILE_CHANGES.md', 'README.md', 'RESEARCH.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }

      const result = runPowerShell(
        getSpecsGeneratorPath('validate-spec.ps1'),
        ['-Path', '.specs/invalid-spec-test']
      );

      expect(result.json).toBeDefined();
      
      const frErrors = result.json.errors.filter(
        (e: any) => e.rule === 'FR_FORMAT'
      );
      expect(frErrors.length).toBeGreaterThan(0);
    });

    // @feature7
    it('should report UC_FORMAT errors for invalid USE_CASES.md', async () => {
      const destPath = appPath('.specs', 'invalid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('invalid-spec'), destPath);
      
      // Add required files
      const requiredFiles = [
        'USER_STORIES.md', 'REQUIREMENTS.md', 'DESIGN.md',
        'TASKS.md', 'FILE_CHANGES.md', 'README.md', 'RESEARCH.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }

      const result = runPowerShell(
        getSpecsGeneratorPath('validate-spec.ps1'),
        ['-Path', '.specs/invalid-spec-test']
      );

      expect(result.json).toBeDefined();
      
      const ucErrors = result.json.errors.filter(
        (e: any) => e.rule === 'UC_FORMAT'
      );
      expect(ucErrors.length).toBeGreaterThan(0);
    });

    // @feature8
    it('should report NFR_SECTIONS warnings for missing sections', async () => {
      const destPath = appPath('.specs', 'invalid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('invalid-spec'), destPath);
      
      // Add required files
      const requiredFiles = [
        'USER_STORIES.md', 'REQUIREMENTS.md', 'DESIGN.md',
        'TASKS.md', 'FILE_CHANGES.md', 'README.md', 'RESEARCH.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }

      const result = runPowerShell(
        getSpecsGeneratorPath('validate-spec.ps1'),
        ['-Path', '.specs/invalid-spec-test']
      );

      expect(result.json).toBeDefined();
      
      const nfrWarnings = result.json.warnings.filter(
        (w: any) => w.rule === 'NFR_SECTIONS'
      );
      expect(nfrWarnings.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // spec-status.ps1
  // ==========================================================================

  describe('spec-status.ps1', () => {
    afterEach(async () => {
      await fs.remove(appPath('.specs', 'partial-spec-test'));
      await fs.remove(appPath('.specs', 'valid-spec-test'));
    });

    // @feature9
    it('should show early phase for partial spec', async () => {
      const destPath = appPath('.specs', 'partial-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      const result = runPowerShell(
        getSpecsGeneratorPath('spec-status.ps1'),
        ['-Path', '.specs/partial-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(['Discovery', 'Requirements']).toContain(result.json.phase);
      expect(result.json.progress_percent).toBeLessThan(100);
    });

    // @feature10
    it('should show valid phase and progress for complete spec', async () => {
      const destPath = appPath('.specs', 'valid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runPowerShell(
        getSpecsGeneratorPath('spec-status.ps1'),
        ['-Path', '.specs/valid-spec-test']
      );

      expect(result.json).toBeDefined();
      // Phase should be one of the defined phases
      expect(['Discovery', 'Requirements', 'Finalization']).toContain(result.json.phase);
      // Progress should be a valid percentage
      expect(result.json.progress_percent).toBeGreaterThanOrEqual(0);
      expect(result.json.progress_percent).toBeLessThanOrEqual(100);
    });

    // @feature11
    it('should provide next_action recommendation', async () => {
      const destPath = appPath('.specs', 'partial-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      const result = runPowerShell(
        getSpecsGeneratorPath('spec-status.ps1'),
        ['-Path', '.specs/partial-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.next_action).toBeDefined();
      expect(result.json.next_action.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // list-specs.ps1
  // ==========================================================================

  describe('list-specs.ps1', () => {
    beforeEach(async () => {
      // Create test specs
      await fs.ensureDir(appPath('.specs', 'list-test-complete'));
      await fs.ensureDir(appPath('.specs', 'list-test-partial'));
      
      // Copy fixtures
      await fs.copy(
        getSpecsGeneratorFixturePath('valid-spec'),
        appPath('.specs', 'list-test-complete')
      );
      await fs.copy(
        getSpecsGeneratorFixturePath('partial-spec'),
        appPath('.specs', 'list-test-partial')
      );
    });

    afterEach(async () => {
      await fs.remove(appPath('.specs', 'list-test-complete'));
      await fs.remove(appPath('.specs', 'list-test-partial'));
    });

    // @feature12
    it('should list all specs with summary', () => {
      const result = runPowerShell(
        getSpecsGeneratorPath('list-specs.ps1'),
        []
      );

      expect(result.json).toBeDefined();
      expect(result.json.specs).toBeDefined();
      expect(Array.isArray(result.json.specs)).toBe(true);
      expect(result.json.summary).toBeDefined();
      expect(result.json.summary.total).toBeGreaterThanOrEqual(2);
    });

    // @feature13
    it('should filter incomplete specs with -Incomplete flag', () => {
      const result = runPowerShell(
        getSpecsGeneratorPath('list-specs.ps1'),
        ['-Incomplete']
      );

      expect(result.json).toBeDefined();
      expect(result.json.specs).toBeDefined();
      
      // All returned specs should NOT be complete
      for (const spec of result.json.specs) {
        expect(spec.status).not.toBe('complete');
      }
    });
  });

  // ==========================================================================
  // fill-template.ps1
  // ==========================================================================

  describe('fill-template.ps1', () => {
    let tempTemplatePath: string;

    beforeEach(async () => {
      // Copy template fixture to temp location
      tempTemplatePath = appPath('tests', 'fixtures', 'specs-generator', 'temp-template.md');
      await fs.copy(
        getSpecsGeneratorFixturePath('template-file.md'),
        tempTemplatePath
      );
    });

    afterEach(async () => {
      // Cleanup
      await fs.remove(tempTemplatePath);
    });

    // @feature14
    it('should list placeholders with -ListPlaceholders', () => {
      const result = runPowerShell(
        getSpecsGeneratorPath('fill-template.ps1'),
        ['-File', tempTemplatePath, '-ListPlaceholders']
      );

      expect(result.json).toBeDefined();
      expect(result.json.placeholders).toBeDefined();
      expect(Array.isArray(result.json.placeholders)).toBe(true);
      expect(result.json.total).toBeGreaterThan(0);
      
      // Should find specific placeholders
      const placeholderNames = result.json.placeholders.map((p: any) => p.name);
      expect(placeholderNames).toContain('{роль}');
      expect(placeholderNames).toContain('{цель}');
      expect(placeholderNames).toContain('{ценность}');
    });

    // @feature15
    it('should replace placeholders with -Values', async () => {
      // First check how many placeholders exist
      const beforeResult = runPowerShell(
        getSpecsGeneratorPath('fill-template.ps1'),
        ['-File', tempTemplatePath, '-ListPlaceholders']
      );
      const totalBefore = beforeResult.json.total;

      // Replace some placeholders
      const values = JSON.stringify({
        'роль': 'разработчик',
        'цель': 'автоматизировать работу',
        'ценность': 'экономия времени'
      });

      const result = runPowerShell(
        getSpecsGeneratorPath('fill-template.ps1'),
        ['-File', tempTemplatePath, '-Values', values]
      );

      expect(result.json).toBeDefined();
      expect(result.json.placeholders_before).toBe(totalBefore);
      expect(result.json.placeholders_after).toBeLessThan(result.json.placeholders_before);
      expect(result.json.filled).toBeDefined();
      expect(result.json.filled.length).toBeGreaterThan(0);
      
      // Verify file content was updated
      const content = await fs.readFile(tempTemplatePath, 'utf-8');
      expect(content).toContain('разработчик');
      expect(content).toContain('автоматизировать работу');
      expect(content).toContain('экономия времени');
    });
  });
});
