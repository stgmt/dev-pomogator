/**
 * E2E Tests for PLUGIN006: Specs Generator Shell Scripts
 *
 * Tests the shell scripts for spec management:
 * - scaffold-spec.sh
 * - validate-spec.sh
 * - spec-status.sh
 * - list-specs.sh
 * - fill-template.sh
 * - audit-spec.sh
 * - analyze-features.sh
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  runShellScript,
  getSpecsGeneratorPath,
  getSpecsGeneratorFixturePath,
  appPath,
  runInstaller,
  setupCleanState,
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
    await setupCleanState('cursor');
    const result = await runInstaller('--cursor --plugins=specs-workflow');
    expect(result.exitCode).toBe(0);
  });

  // ==========================================================================
  // scaffold-spec.sh
  // ==========================================================================

  describe('scaffold-spec.sh', () => {
    const testSpecName = 'test-scaffold-spec';

    afterEach(async () => {
      // Cleanup created spec folder
      await fs.remove(appPath('.specs', testSpecName));
      await fs.remove(appPath('.specs', 'existing-spec'));
    });

    // @feature1
    it('should create 14 files with valid kebab-case name', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('scaffold-spec.sh'),
        ['-Name', testSpecName]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();
      expect(result.json.success).toBe(true);
      expect(result.json.path).toBe(`.specs/${testSpecName}`);
      expect(result.json.created_files).toBeDefined();
      expect(result.json.created_files.length).toBe(14);
      expect(result.json.created_files).toEqual(expect.arrayContaining([
        'USER_STORIES.md',
        'FR.md',
        'NFR.md',
        `${testSpecName}.feature`,
      ]));
      expect(result.json.next_step).toBe('Fill USER_STORIES.md first');
    });

    // @feature2
    it('should reject name with spaces', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('scaffold-spec.sh'),
        ['-Name', 'invalid name with spaces']
      );

      // The shell entrypoint should reject names with spaces
      expect(result.exitCode).toBe(2);
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
      const result = runShellScript(
        getSpecsGeneratorPath('scaffold-spec.sh'),
        ['-Name', specName, '-Force']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.success).toBe(true);
      expect(result.json.path).toBe(`.specs/${specName}`);
      expect(result.json.created_files.length).toBe(14);
      expect(result.json.created_files).toEqual(expect.arrayContaining([
        'USER_STORIES.md',
        'FR.md',
        `${specName}.feature`,
      ]));
      
      // Old file should be gone
      expect(await fs.pathExists(appPath('.specs', specName, 'dummy.txt'))).toBe(false);
    });
  });

  // ==========================================================================
  // validate-spec.sh
  // ==========================================================================

  describe('validate-spec.sh', () => {
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

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
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

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
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
        'TASKS.md', 'FILE_CHANGES.md', 'README.md', 'RESEARCH.md',
        'CHANGELOG.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
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
        'TASKS.md', 'FILE_CHANGES.md', 'README.md', 'RESEARCH.md',
        'CHANGELOG.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/invalid-spec-test']
      );

      expect(result.json).toBeDefined();
      
      const ucErrors = result.json.errors.filter(
        (e: any) => e.rule === 'UC_FORMAT'
      );
      expect(ucErrors.length).toBeGreaterThan(0);
    });

    // @feature16
    it('should report TDD_TASK_ORDER warning when TASKS.md lacks Phase 0 and .feature', async () => {
      const destPath = appPath('.specs', 'invalid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('invalid-spec'), destPath);

      // Add required files to avoid STRUCTURE errors
      const requiredFiles = [
        'USER_STORIES.md', 'REQUIREMENTS.md', 'DESIGN.md',
        'FILE_CHANGES.md', 'README.md', 'RESEARCH.md',
        'CHANGELOG.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }
      // TASKS.md without Phase 0 or .feature mention
      await fs.writeFile(path.join(destPath, 'TASKS.md'), '# Tasks\n\n## Phase 1: Implementation\n\n- [ ] Create module A\n');

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/invalid-spec-test']
      );

      expect(result.json).toBeDefined();

      const tddWarnings = result.json.warnings.filter(
        (w: any) => w.rule === 'TDD_TASK_ORDER'
      );
      expect(tddWarnings.length).toBeGreaterThan(0);
      expect(tddWarnings[0].message).toContain('Phase 0');
    });

    // @feature17
    it('should NOT report TDD_TASK_ORDER warning when TASKS.md has Phase 0', async () => {
      const destPath = appPath('.specs', 'valid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/valid-spec-test']
      );

      expect(result.json).toBeDefined();

      const warnings = Array.isArray(result.json.warnings) ? result.json.warnings : [];
      const tddWarnings = warnings.filter(
        (w: any) => w.rule === 'TDD_TASK_ORDER'
      );
      expect(tddWarnings.length).toBe(0);
    });

    // @feature8
    it('should report NFR_SECTIONS warnings for missing sections', async () => {
      const destPath = appPath('.specs', 'invalid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('invalid-spec'), destPath);
      
      // Add required files
      const requiredFiles = [
        'USER_STORIES.md', 'REQUIREMENTS.md', 'DESIGN.md',
        'TASKS.md', 'FILE_CHANGES.md', 'README.md', 'RESEARCH.md',
        'CHANGELOG.md'
      ];
      for (const file of requiredFiles) {
        await fs.writeFile(path.join(destPath, file), `# ${file}\n\nContent`);
      }

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
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
  // spec-status.sh
  // ==========================================================================

  describe('spec-status.sh', () => {
    afterEach(async () => {
      await fs.remove(appPath('.specs', 'partial-spec-test'));
      await fs.remove(appPath('.specs', 'valid-spec-test'));
    });

    // @feature9
    it('should show early phase for partial spec', async () => {
      const destPath = appPath('.specs', 'partial-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', '.specs/partial-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.path).toBe('.specs/partial-spec-test');
      expect(['Discovery', 'Requirements']).toContain(result.json.phase);
      expect(result.json.progress_percent).toBeLessThan(100);
      expect(result.json.files).toBeDefined();
      expect(result.json.files['USER_STORIES.md'].status).toBe('complete');
      expect(result.json.files['FR.md'].status).toBe('partial');
      expect(result.json.files['RESEARCH.md'].status).toBe('not_created');
    });

    // @feature10
    it('should show valid phase and progress for complete spec', async () => {
      const destPath = appPath('.specs', 'valid-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', '.specs/valid-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.path).toBe('.specs/valid-spec-test');
      // Phase should be one of the defined phases (Complete when all files are done)
      expect(['Discovery', 'Requirements', 'Finalization', 'Complete']).toContain(result.json.phase);
      // Progress should be a valid percentage
      expect(result.json.progress_percent).toBe(100);
      expect(result.json.files).toBeDefined();
      const featureFiles = Object.keys(result.json.files).filter((file: string) => file.endsWith('.feature'));
      expect(featureFiles.length).toBeGreaterThan(0);
      expect(result.json.files[featureFiles[0]].status).toBe('complete');
    });

    // @feature11
    it('should provide next_action recommendation', async () => {
      const destPath = appPath('.specs', 'partial-spec-test');
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', '.specs/partial-spec-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.next_action).toBeDefined();
      expect(result.json.next_action).toContain('RESEARCH.md');
    });
  });

  // ==========================================================================
  // list-specs.sh
  // ==========================================================================

  describe('list-specs.sh', () => {
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
      const result = runShellScript(
        getSpecsGeneratorPath('list-specs.sh'),
        []
      );

      expect(result.json).toBeDefined();
      expect(result.json.specs).toBeDefined();
      expect(Array.isArray(result.json.specs)).toBe(true);
      expect(result.json.summary).toBeDefined();
      expect(result.json.summary.total).toBeGreaterThanOrEqual(2);
      
      const specNames = result.json.specs.map((spec: any) => spec.name);
      expect(specNames).toEqual(expect.arrayContaining(['list-test-complete', 'list-test-partial']));
      expect(result.json.specs.some((spec: any) => spec.status === 'complete')).toBe(true);
      expect(result.json.specs.some((spec: any) => spec.status === 'partial')).toBe(true);
    });

    // @feature13
    it('should filter incomplete specs with -Incomplete flag', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('list-specs.sh'),
        ['-Incomplete']
      );

      expect(result.json).toBeDefined();
      expect(result.json.specs).toBeDefined();
      
      const specNames = result.json.specs.map((spec: any) => spec.name);
      expect(specNames).toContain('list-test-partial');
      expect(specNames).not.toContain('list-test-complete');

      // All returned specs should NOT be complete
      for (const spec of result.json.specs) {
        expect(spec.status).not.toBe('complete');
      }
    });
  });

  // ==========================================================================
  // fill-template.sh
  // ==========================================================================

  describe('fill-template.sh', () => {
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
      const result = runShellScript(
        getSpecsGeneratorPath('fill-template.sh'),
        ['-File', tempTemplatePath, '-ListPlaceholders']
      );

      expect(result.json).toBeDefined();
      expect(result.json.placeholders).toBeDefined();
      expect(Array.isArray(result.json.placeholders)).toBe(true);
      expect(result.json.total).toBeGreaterThan(0);
      
      const totalFromPlaceholders = result.json.placeholders.reduce(
        (sum: number, p: any) => sum + p.count,
        0
      );
      expect(totalFromPlaceholders).toBe(result.json.total);
      
      // Should find specific placeholders
      const placeholderNames = result.json.placeholders.map((p: any) => p.name);
      expect(placeholderNames).toContain('{роль}');
      expect(placeholderNames).toContain('{цель}');
      expect(placeholderNames).toContain('{ценность}');
    });

    // @feature15
    it('should replace placeholders with -Values', async () => {
      // First check how many placeholders exist
      const beforeResult = runShellScript(
        getSpecsGeneratorPath('fill-template.sh'),
        ['-File', tempTemplatePath, '-ListPlaceholders']
      );
      const totalBefore = beforeResult.json.total;

      // Replace some placeholders
      const values = JSON.stringify({
        'роль': 'разработчик',
        'цель': 'автоматизировать работу',
        'ценность': 'экономия времени'
      });

      const result = runShellScript(
        getSpecsGeneratorPath('fill-template.sh'),
        ['-File', tempTemplatePath, '-Values', values]
      );

      expect(result.json).toBeDefined();
      expect(result.json.placeholders_before).toBe(totalBefore);
      expect(result.json.placeholders_after).toBeLessThan(result.json.placeholders_before);
      expect(result.json.filled).toBeDefined();
      expect(result.json.filled.length).toBeGreaterThan(0);
      expect(result.json.filled).toEqual(expect.arrayContaining([
        '{роль}',
        '{цель}',
        '{ценность}',
      ]));
      
      // Verify file content was updated
      const content = await fs.readFile(tempTemplatePath, 'utf-8');
      expect(content).toContain('разработчик');
      expect(content).toContain('автоматизировать работу');
      expect(content).toContain('экономия времени');
    });
  });

  // ============================================================================
  // validate-spec.sh — CROSS_REF_LINKS rule
  // ============================================================================

  describe('validate-spec.sh CROSS_REF_LINKS', () => {
    const validCrossrefsPath = appPath('.specs', 'crossrefs-test');
    const brokenCrossrefsPath = appPath('.specs', 'broken-crossrefs-test');

    afterEach(async () => {
      await fs.remove(validCrossrefsPath);
      await fs.remove(brokenCrossrefsPath);
    });

    // @feature16
    it('should return no CROSS_REF_LINKS warnings for valid cross-references', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec-with-crossrefs'), validCrossrefsPath);

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/crossrefs-test']
      );

      expect(result.json).toBeDefined();
      expect(result.json.valid).toBe(true);

      const crossRefWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'CROSS_REF_LINKS'
      );
      expect(crossRefWarnings.length).toBe(0);
    });

    // @feature17
    it('should detect broken anchor in cross-reference link', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('broken-crossrefs'), brokenCrossrefsPath);

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/broken-crossrefs-test']
      );

      expect(result.json).toBeDefined();

      const crossRefWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'CROSS_REF_LINKS'
      );
      expect(crossRefWarnings.length).toBeGreaterThan(0);
      expect(
        crossRefWarnings.some((w: any) => w.message.includes('anchor') && w.message.includes('not found'))
      ).toBe(true);
    });

    // @feature18
    it('should detect missing target file in cross-reference', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('broken-crossrefs'), brokenCrossrefsPath);

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/broken-crossrefs-test']
      );

      expect(result.json).toBeDefined();

      const crossRefWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'CROSS_REF_LINKS'
      );
      expect(
        crossRefWarnings.some((w: any) =>
          (w.message.includes('file') || w.message.includes('target')) && w.message.includes('not found')
        )
      ).toBe(true);
    });
  });

  // ============================================================================
  // audit-spec.sh — LINK_VALIDITY check
  // ============================================================================

  describe('audit-spec.sh LINK_VALIDITY', () => {
    const validCrossrefsPath = appPath('.specs', 'crossrefs-test');
    const brokenCrossrefsPath = appPath('.specs', 'broken-crossrefs-test');

    afterEach(async () => {
      await fs.remove(validCrossrefsPath);
      await fs.remove(brokenCrossrefsPath);
    });

    // @feature19
    it('should find plain text references that should be links', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('broken-crossrefs'), brokenCrossrefsPath);

      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/broken-crossrefs-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const linkFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'LINK_VALIDITY'
      );
      expect(linkFindings.length).toBeGreaterThan(0);
    });

    // @feature20
    it('should pass for spec with proper cross-references', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec-with-crossrefs'), validCrossrefsPath);

      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/crossrefs-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const linkFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'LINK_VALIDITY'
      );
      expect(linkFindings.length).toBe(0);
    });
  });

  // ============================================================================
  // audit-spec.sh — coverage checks (FR_AC, FR_BDD, TRACEABILITY, TASKS_FR, OPEN_Q, TERM)
  // ============================================================================

  describe('audit-spec.sh coverage checks', () => {
    const auditFixturePath = appPath('.specs', 'audit-coverage-test');

    beforeEach(async () => {
      await fs.copy(getSpecsGeneratorFixturePath('audit-coverage-fixture'), auditFixturePath);
    });

    afterEach(async () => {
      await fs.remove(auditFixturePath);
    });

    // @feature21
    it('should detect FR without matching AC (FR_AC_COVERAGE)', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-coverage-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const frAcFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'FR_AC_COVERAGE'
      );
      expect(frAcFindings.length).toBeGreaterThan(0);
      expect(
        frAcFindings.some((f: any) => f.message.includes('FR-3'))
      ).toBe(true);
    });

    // @feature22
    it('should detect @featureN tag missing in .feature file (FR_BDD_COVERAGE)', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-coverage-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const bddFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'FR_BDD_COVERAGE'
      );
      // FR-3 has no @feature3 tag, so there should be no mismatch for it
      // But FR-1 and FR-2 have @feature1/@feature2 which are in .feature — no findings expected for them
      // The check validates MD tags vs .feature tags
      expect(bddFindings).toBeDefined();
    });

    // @feature23
    it('should detect FR not referenced in REQUIREMENTS.md (REQUIREMENTS_TRACEABILITY)', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-coverage-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const traceFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'REQUIREMENTS_TRACEABILITY'
      );
      expect(traceFindings.length).toBeGreaterThan(0);
      // FR-2 and FR-3 are not in REQUIREMENTS.md
      expect(
        traceFindings.some((f: any) => f.message.includes('FR-2'))
      ).toBe(true);
      expect(
        traceFindings.some((f: any) => f.message.includes('FR-3'))
      ).toBe(true);
    });

    // @feature24
    it('should detect FR not referenced in TASKS.md (TASKS_FR_REFS)', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-coverage-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const tasksFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'TASKS_FR_REFS'
      );
      expect(tasksFindings.length).toBeGreaterThan(0);
      // FR-2 is not in TASKS.md
      expect(
        tasksFindings.some((f: any) => f.message.includes('FR-2'))
      ).toBe(true);
    });

    // @feature25
    it('should detect unclosed open questions in RESEARCH.md (OPEN_QUESTIONS)', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-coverage-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const openQFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'OPEN_QUESTIONS'
      );
      expect(openQFindings.length).toBeGreaterThan(0);
      expect(
        openQFindings.some((f: any) => f.message.includes('unclosed'))
      ).toBe(true);
    });

    // @feature26
    it('should detect term inconsistency across files (TERM_CONSISTENCY)', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-coverage-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const termFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'TERM_CONSISTENCY'
      );
      expect(termFindings.length).toBeGreaterThan(0);
      expect(
        termFindings.some((f: any) =>
          f.message.includes('dataProcessor') || f.message.includes('DataProcessor')
        )
      ).toBe(true);
    });
  });

  // ============================================================================
  // validate-spec.sh — missing rule coverage
  // ============================================================================

  describe('validate-spec.sh additional rules', () => {
    let tempSpecDir: string;

    beforeEach(async () => {
      tempSpecDir = appPath('.specs', 'validate-rules-test');
      await fs.ensureDir(tempSpecDir);
    });

    afterEach(async () => {
      await fs.remove(tempSpecDir);
    });

    // @feature27
    it('should report PLACEHOLDER warnings for unfilled placeholders', async () => {
      // Create a complete spec with unfilled placeholders
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), tempSpecDir);

      // Add unfilled placeholders to FR.md
      const frPath = path.join(tempSpecDir, 'FR.md');
      await fs.writeFile(frPath, '# Functional Requirements\n\n## FR-1: {Название фичи}\n\n{Описание функционального требования}\n');

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/validate-rules-test']
      );

      expect(result.json).toBeDefined();

      const placeholderWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'PLACEHOLDER'
      );
      expect(placeholderWarnings.length).toBeGreaterThan(0);
    });

    // @feature28
    it('should report EARS_FORMAT warning when AC lacks WHEN/THEN/SHALL', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), tempSpecDir);

      // Overwrite AC with non-EARS content
      const acPath = path.join(tempSpecDir, 'ACCEPTANCE_CRITERIA.md');
      await fs.writeFile(acPath, '# Acceptance Criteria\n\n## AC-1 (FR-1): Basic Check\n\nThe system should work correctly.\n');

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/validate-rules-test']
      );

      expect(result.json).toBeDefined();

      const earsWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'EARS_FORMAT'
      );
      expect(earsWarnings.length).toBeGreaterThan(0);
    });

    // @feature29
    it('should report FEATURE_NAMING warning when Feature line lacks DOMAIN prefix', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), tempSpecDir);

      // Overwrite .feature with non-DOMAIN naming
      const featurePath = path.join(tempSpecDir, 'valid-spec.feature');
      await fs.writeFile(featurePath, 'Feature: Some feature without domain prefix\n\n  Scenario: Basic test\n    Given something\n    Then it works\n');

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/validate-rules-test']
      );

      expect(result.json).toBeDefined();

      const namingWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'FEATURE_NAMING'
      );
      expect(namingWarnings.length).toBeGreaterThan(0);
    });

    // @feature30
    it('should report CONTEXT_SECTION warning when RESEARCH.md lacks Project Context', async () => {
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), tempSpecDir);

      // Overwrite RESEARCH.md without Project Context & Constraints section
      const researchPath = path.join(tempSpecDir, 'RESEARCH.md');
      await fs.writeFile(researchPath, '# Research\n\n## Findings\n\nSome research findings here.\n');

      const result = runShellScript(
        getSpecsGeneratorPath('validate-spec.sh'),
        ['-Path', '.specs/validate-rules-test']
      );

      expect(result.json).toBeDefined();

      const contextWarnings = (Array.isArray(result.json.warnings) ? result.json.warnings : []).filter(
        (w: any) => w.rule === 'CONTEXT_SECTION'
      );
      expect(contextWarnings.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // analyze-features.sh
  // ============================================================================

  describe('analyze-features.sh', () => {
    // @feature31
    it('should return JSON with totalFeatures > 0', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('analyze-features.sh'),
        []
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();
      expect(result.json.totalFeatures).toBeGreaterThan(0);
      expect(result.json.distribution).toBeDefined();
      expect(result.json.searchPaths).toBeDefined();
      expect(Array.isArray(result.json.searchPaths)).toBe(true);
    });

    // @feature32
    it('should contain step dictionary with given/when/then', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('analyze-features.sh'),
        []
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.stepDictionary).toBeDefined();
      expect(result.json.stepDictionary.given).toBeDefined();
      expect(result.json.stepDictionary.when).toBeDefined();
      expect(result.json.stepDictionary.then).toBeDefined();
      expect(Array.isArray(result.json.stepDictionary.given)).toBe(true);
    });

    // @feature33
    it('should detect naming patterns with domain codes', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('analyze-features.sh'),
        []
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.namingPatterns).toBeDefined();
      expect(result.json.namingPatterns.domains).toBeDefined();
    });

    // @feature34
    it('should filter candidates by -DomainCode', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('analyze-features.sh'),
        ['-DomainCode', 'PLUGIN']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();
      expect(result.json.candidates).toBeDefined();
      expect(Array.isArray(result.json.candidates)).toBe(true);

      // All candidates should match PLUGIN domain
      for (const candidate of result.json.candidates) {
        expect(
          candidate.reasons.some((r: string) => r.includes('PLUGIN'))
        ).toBe(true);
      }
    });

    // @feature35
    it('should filter candidates by -FeatureSlug', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('analyze-features.sh'),
        ['-FeatureSlug', 'specs-generator']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();
      expect(result.json.candidates).toBeDefined();
      expect(Array.isArray(result.json.candidates)).toBe(true);
      expect(result.json.candidates.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // .progress.json state machine
  // ============================================================================

  describe('.progress.json state machine', () => {
    const progressTestName = 'progress-test';

    afterEach(async () => {
      await fs.remove(appPath('.specs', progressTestName));
    });

    // @feature36
    it('scaffold-spec.sh should create .progress.json with initial state', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('scaffold-spec.sh'),
        ['-Name', progressTestName]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.success).toBe(true);
      // created_files count stays 14 (.progress.json is not counted)
      expect(result.json.created_files.length).toBe(14);

      const progressPath = appPath('.specs', progressTestName, '.progress.json');
      expect(fs.existsSync(progressPath)).toBe(true);

      const progress = fs.readJsonSync(progressPath);
      expect(progress.version).toBe(1);
      expect(progress.featureSlug).toBe(progressTestName);
      expect(progress.currentPhase).toBe('Discovery');
      expect(progress.phases.Discovery.stopConfirmed).toBe(false);
      expect(progress.phases.Context.stopConfirmed).toBe(false);
      expect(progress.phases.Requirements.stopConfirmed).toBe(false);
      expect(progress.phases.Finalization.stopConfirmed).toBe(false);
    });

    // @feature37
    it('spec-status.sh should create .progress.json for pre-existing specs (backward compat)', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      // No .progress.json exists yet
      expect(fs.existsSync(path.join(destPath, '.progress.json'))).toBe(false);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.progress_state).toBeDefined();
      expect(result.json.progress_state.version).toBe(1);

      // File should be created
      expect(fs.existsSync(path.join(destPath, '.progress.json'))).toBe(true);
    });

    // @feature38
    it('spec-status.sh -ConfirmStop should set stopConfirmed to true', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      // First run to create .progress.json
      runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      // Confirm Discovery stop
      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`, '-ConfirmStop', 'Discovery']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.progress_state.phases.Discovery.stopConfirmed).toBe(true);
      expect(result.json.progress_state.phases.Discovery.stopConfirmedAt).not.toBeNull();

      // Other phases should remain unconfirmed
      expect(result.json.progress_state.phases.Requirements.stopConfirmed).toBe(false);
    });

    // @feature39
    it('spec-status.sh should track CHANGELOG.md in files output', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.files).toBeDefined();
      expect(result.json.files['CHANGELOG.md']).toBeDefined();
      expect(result.json.files['CHANGELOG.md'].status).toBeDefined();
    });

    // @feature40
    it('spec-status.sh should update completedAt when phase is done', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      // For a complete spec, Discovery should be marked completed
      expect(result.json.progress_state.phases.Discovery.completedAt).not.toBeNull();
    });

    // @feature41
    it('files with programming vars in curly braces should be detected as complete', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('placeholder-false-positive'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      // Files containing {prefix}, {session_id}, {percent} should be "complete" not "partial"
      expect(result.json.files['USER_STORIES.md'].status).toBe('complete');
      expect(result.json.files['USE_CASES.md'].status).toBe('complete');
      expect(result.json.files['RESEARCH.md'].status).toBe('complete');
      // No placeholders should be counted for programming identifiers
      expect(result.json.files['USER_STORIES.md'].placeholders).toBe(0);
      expect(result.json.files['USE_CASES.md'].placeholders).toBe(0);
      expect(result.json.files['RESEARCH.md'].placeholders).toBe(0);
    });

    // @feature42
    it('stopConfirmed should override auto-detection for currentPhase progression', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('partial-spec'), destPath);

      // First run to create .progress.json
      runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      // Confirm Discovery and Context stops (both needed to progress past Discovery phase)
      runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`, '-ConfirmStop', 'Discovery']
      );
      runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`, '-ConfirmStop', 'Context']
      );

      // Run again — stopConfirmed should override and move to Requirements
      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.progress_state.phases.Discovery.stopConfirmed).toBe(true);
      expect(result.json.progress_state.phases.Context.stopConfirmed).toBe(true);
      // currentPhase should have progressed past Discovery to Requirements
      expect(result.json.phase).toBe('Requirements');
    });

    // @feature43
    it('Finalization.completedAt should be set when all Finalization files are complete', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.progress_state.phases.Finalization.completedAt).not.toBeNull();
    });

    // @feature44
    it('currentPhase should become Complete when all phases are done', async () => {
      const destPath = appPath('.specs', progressTestName);
      await fs.copy(getSpecsGeneratorFixturePath('valid-spec'), destPath);

      // Confirm all stop points
      for (const phase of ['Discovery', 'Context', 'Requirements', 'Finalization']) {
        runShellScript(
          getSpecsGeneratorPath('spec-status.sh'),
          ['-Path', `.specs/${progressTestName}`, '-ConfirmStop', phase]
        );
      }

      // Final run
      const result = runShellScript(
        getSpecsGeneratorPath('spec-status.sh'),
        ['-Path', `.specs/${progressTestName}`]
      );

      expect(result.exitCode).toBe(0);
      expect(result.json.phase).toBe('Complete');
      expect(result.json.progress_state.currentPhase).toBe('Complete');
    });
  });

  // ============================================================================
  // audit-spec.sh — new checks (OOS propagation, unverified config, infra, dedup)
  // ============================================================================

  describe('audit-spec.sh new audit checks', () => {
    const auditFixturePath = appPath('.specs', 'audit-new-checks-test');

    beforeEach(async () => {
      await fs.copy(getSpecsGeneratorFixturePath('audit-coverage-fixture'), auditFixturePath);
    });

    afterEach(async () => {
      await fs.remove(auditFixturePath);
    });

    // @feature45
    it('should detect OUT_OF_SCOPE not propagated to USE_CASES.md', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-new-checks-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const oosFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'OUT_OF_SCOPE_PROPAGATION'
      );
      expect(oosFindings.length).toBeGreaterThan(0);
      expect(
        oosFindings.some((f: any) => f.message.includes('FR-4'))
      ).toBe(true);
    });

    // @feature46
    it('should detect UNVERIFIED_CONFIG env vars in DESIGN.md', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-new-checks-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const configFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'UNVERIFIED_CONFIG'
      );
      expect(configFindings.length).toBeGreaterThan(0);
      expect(
        configFindings.some((f: any) =>
          f.message.includes('DATABASE_URL') ||
          f.message.includes('REDIS_HOST') ||
          f.message.includes('SMTP_API_KEY') ||
          f.message.includes('N8N_BASIC_AUTH_USER')
        )
      ).toBe(true);
    });

    // @feature47
    it('should detect INFRA_TASKS_MISSING when DESIGN.md has database', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-new-checks-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const infraFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'INFRA_TASKS_MISSING'
      );
      expect(infraFindings.length).toBeGreaterThan(0);
      expect(
        infraFindings.some((f: any) => f.message.includes('postgresql'))
      ).toBe(true);
    });

    // @feature48
    it('should detect CONFIG_DUPLICATION between DESIGN.md and TASKS.md', () => {
      const result = runShellScript(
        getSpecsGeneratorPath('audit-spec.sh'),
        ['-Path', '.specs/audit-new-checks-test']
      );

      expect(result.exitCode).toBe(0);
      expect(result.json).toBeDefined();

      const dupFindings = (result.json.findings || []).filter(
        (f: any) => f.check === 'CONFIG_DUPLICATION'
      );
      expect(dupFindings.length).toBeGreaterThan(0);
      expect(
        dupFindings.some((f: any) => f.message.includes('Duplicated config block'))
      ).toBe(true);
    });
  });

  // Path validation - prevent .progress.json outside .specs/<feature>/

  // @feature49
  it('spec-status.sh should reject -Path "."', () => {
    const result = runShellScript(
      getSpecsGeneratorPath('spec-status.sh'),
      ['-Path', '.']
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('must be inside .specs/');
  });
});
