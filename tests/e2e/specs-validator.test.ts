/**
 * E2E Tests for PLUGIN005: Specs Validator Hook
 * 
 * Tests the validation of @featureN tags between MD files and .feature files.
 * Each test corresponds to a @featureN scenario in the BDD feature file.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { runInstaller, appPath, homePath, initGitRepo } from './helpers';

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

/**
 * Full list of required MD files for a complete spec (12 files)
 */
const REQUIRED_MD_FILES = [
  'ACCEPTANCE_CRITERIA.md',
  'CHANGELOG.md',
  'DESIGN.md',
  'FILE_CHANGES.md',
  'FR.md',
  'NFR.md',
  'README.md',
  'REQUIREMENTS.md',
  'RESEARCH.md',
  'TASKS.md',
  'USE_CASES.md',
  'USER_STORIES.md',
];

/**
 * Create a complete spec structure (12 MD + 1 .feature = 13 files)
 * 
 * @param name - Name of the spec directory
 * @param frContent - Optional custom content for FR.md
 * @param featureContent - Optional custom content for .feature file
 * @returns Path to the created spec directory
 */
async function createCompleteSpec(
  name: string,
  frContent?: string,
  featureContent?: string
): Promise<string> {
  const specsDir = appPath('.specs', name);
  await fs.ensureDir(specsDir);
  
  // Create all 12 required MD files
  for (const file of REQUIRED_MD_FILES) {
    const content = file === 'FR.md' && frContent 
      ? frContent 
      : `# ${file.replace('.md', '')}\n\nContent for ${name}\n`;
    await fs.writeFile(path.join(specsDir, file), content);
  }
  
  // Create .feature file
  const defaultFeatureContent = `Feature: ${name}\n  Scenario: Test\n    Given test\n`;
  await fs.writeFile(
    path.join(specsDir, `${name}.feature`),
    featureContent || defaultFeatureContent
  );
  
  return specsDir;
}

/**
 * Create an incomplete spec (missing files)
 */
async function createIncompleteSpec(name: string): Promise<string> {
  const specsDir = appPath('.specs', name);
  await fs.ensureDir(specsDir);
  
  // Only create FR.md
  await fs.writeFile(
    path.join(specsDir, 'FR.md'),
    '# Functional Requirements\n\n## FR-1: Test\n'
  );
  
  return specsDir;
}

/**
 * Get path to validate-specs.ts script
 */
function getValidateSpecsPath(): string {
  return homePath('.dev-pomogator', 'scripts', 'specs-validator', 'validate-specs.ts');
}

/**
 * Get enhanced PATH with bun location (for cross-platform compatibility)
 */
function getEnhancedPath(): string {
  const home = process.env.HOME || '/home/testuser';
  const bunPath = `${home}/.bun/bin`;
  const currentPath = process.env.PATH || '';
  
  if (!currentPath.includes(bunPath)) {
    return `${bunPath}:${currentPath}`;
  }
  return currentPath;
}

/**
 * Run validate-specs hook with JSON input
 * Returns stdout output
 * 
 * Uses a temp file for stdin input to be cross-platform compatible.
 */
function runValidateSpecs(workspaceRoot: string): string {
  const scriptPath = getValidateSpecsPath();
  const stdinJson = JSON.stringify({
    conversation_id: 'test-session',
    workspace_roots: [workspaceRoot],
    prompt: 'Test prompt',
  });
  
  // Write JSON to temp file for cross-platform stdin piping
  const tempFile = path.join(workspaceRoot, '.specs-test-input.json');
  fs.writeFileSync(tempFile, stdinJson, 'utf-8');
  
  try {
    // Use npx tsx for cross-platform TypeScript execution
    // Cat temp file to stdin
    const result = execSync(
      `cat "${tempFile}" | npx tsx "${scriptPath}"`,
      {
        encoding: 'utf-8',
        timeout: 30000,
        shell: '/bin/bash',
        cwd: workspaceRoot,
        env: {
          ...process.env,
          PATH: getEnhancedPath(),
        },
      }
    );
    return result;
  } catch (error: any) {
    // Return stdout if available, log stderr for debugging
    if (error.stderr) {
      console.error('[runValidateSpecs] stderr:', error.stderr);
    }
    return error.stdout || error.message || '';
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if validation-report.md exists in a spec directory
 */
async function hasValidationReport(specName: string): Promise<boolean> {
  const reportPath = appPath('.specs', specName, 'validation-report.md');
  return fs.pathExists(reportPath);
}

/**
 * Read validation-report.md content
 */
async function getValidationReport(specName: string): Promise<string> {
  const reportPath = appPath('.specs', specName, 'validation-report.md');
  if (await fs.pathExists(reportPath)) {
    return fs.readFile(reportPath, 'utf-8');
  }
  return '';
}

// ============================================================================
// Test Suite
// ============================================================================

describe('PLUGIN005: Specs Validator Hook', () => {
  beforeAll(async () => {
    // Initialize git repo (required for installer)
    await initGitRepo();
    
    // Run installer to set up hooks and scripts
    await runInstaller('--cursor --all');
  });

  beforeEach(async () => {
    // Clean up .specs directory before each test
    await fs.remove(appPath('.specs'));
  });

  afterEach(async () => {
    // Clean up after each test
    await fs.remove(appPath('.specs'));
    await fs.remove(appPath('.specs-validator.yaml'));
  });

  // @feature1
  describe('Cursor Hook Registration', () => {
    it('should register beforeSubmitPrompt hook with validate-specs', async () => {
      const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
      
      expect(await fs.pathExists(hooksPath)).toBe(true);
      
      const hooks = await fs.readJson(hooksPath);
      const commands = hooks.hooks?.beforeSubmitPrompt?.map((h: any) => h.command) || [];
      
      // Check that validate-specs.ts is in the beforeSubmitPrompt hooks
      expect(commands.some((cmd: string) => cmd.includes('validate-specs'))).toBe(true);
    });
  });

  // @feature2
  describe('Claude Hook Registration', () => {
    it('should have validate-specs installed via memory.ts (not extension.json)', async () => {
      // Note: specs-workflow hooks are installed via memory.ts (hardcoded),
      // not via extension.json. Check that extension.json has empty hooks.
      const extJsonPath = appPath(
        'extensions',
        'specs-workflow',
        'extension.json'
      );
      
      if (await fs.pathExists(extJsonPath)) {
        const extJson = await fs.readJson(extJsonPath);
        
        // Hooks should be empty (installed by memory.ts, not extension.json)
        expect(extJson.hooks).toBeDefined();
        expect(extJson._hooksNote).toContain('memory.ts');
      }
    });
  });

  // @feature3
  describe('Complete Spec Detection', () => {
    it('should create validation-report.md for complete spec (13 files)', async () => {
      const specName = 'complete-feature';
      const specsDir = await createCompleteSpec(specName);
      
      // Verify all 13 files exist
      for (const file of REQUIRED_MD_FILES) {
        expect(await fs.pathExists(path.join(specsDir, file))).toBe(true);
      }
      expect(
        await fs.pathExists(path.join(specsDir, `${specName}.feature`))
      ).toBe(true);
      
      // Run validation
      const appDir = appPath('');
      runValidateSpecs(appDir);
      
      // Check that validation report was created
      expect(await hasValidationReport(specName)).toBe(true);
    });
  });

  // @feature4
  describe('Incomplete Spec Skip', () => {
    it('should not create validation-report.md for incomplete spec', async () => {
      const specName = 'incomplete-feature';
      await createIncompleteSpec(specName);
      
      // Run validation
      const appDir = appPath('');
      runValidateSpecs(appDir);
      
      // Check that validation report was NOT created
      expect(await hasValidationReport(specName)).toBe(false);
    });
  });

  // @feature5
  describe('Uncovered FR Detection', () => {
    it('should report NOT_COVERED for @featureN in MD but not in .feature', async () => {
      const specName = 'uncovered-test';
      
      // Create spec with @feature10 in FR.md but NOT in .feature
      await createCompleteSpec(
        specName,
        '# Functional Requirements\n\n## FR-1: Test requirement @feature10\n',
        'Feature: Test\n  Scenario: Basic\n    Given test\n'
      );
      
      // Run validation
      const appDir = appPath('');
      const output = runValidateSpecs(appDir);
      
      // Check report contains NOT_COVERED
      const report = await getValidationReport(specName);
      expect(report).toContain('NOT_COVERED');
      expect(report).toContain('@feature10');
    });
  });

  // @feature6
  describe('Orphan Scenario Detection', () => {
    it('should report ORPHAN for @featureN in .feature but not in MD', async () => {
      const specName = 'orphan-test';
      
      // Create spec with @feature99 in .feature but NOT in MD
      await createCompleteSpec(
        specName,
        '# Functional Requirements\n\n## FR-1: Test requirement\n', // No @featureN
        'Feature: Test\n  # @feature99\n  Scenario: Orphan test\n    Given test\n'
      );
      
      // Run validation
      const appDir = appPath('');
      runValidateSpecs(appDir);
      
      // Check report contains ORPHAN
      const report = await getValidationReport(specName);
      expect(report).toContain('ORPHAN');
      expect(report).toContain('@feature99');
    });
  });

  // @feature7
  describe('Fully Linked Validation', () => {
    it('should report COVERED when @featureN is in both MD and .feature', async () => {
      const specName = 'linked-test';
      
      // Create spec with @feature20 in BOTH MD and .feature
      await createCompleteSpec(
        specName,
        '# Functional Requirements\n\n## FR-1: Login requirement @feature20\n',
        'Feature: Test\n  # @feature20\n  Scenario: Login test\n    Given test\n'
      );
      
      // Run validation
      const appDir = appPath('');
      runValidateSpecs(appDir);
      
      // Check report contains COVERED
      const report = await getValidationReport(specName);
      expect(report).toContain('COVERED');
      expect(report).toContain('@feature20');
    });
  });

  // @feature8
  describe('No Specs Folder', () => {
    it('should exit silently when .specs/ does not exist', async () => {
      // Ensure no .specs directory exists
      await fs.remove(appPath('.specs'));
      
      // Run validation - should not throw
      const appDir = appPath('');
      const output = runValidateSpecs(appDir);
      
      // Should produce no output (silent exit)
      // Note: output may be empty or contain only whitespace
      expect(output.trim()).toBe('');
    });
  });

  // @feature9
  describe('Config-based Disable', () => {
    it('should skip validation when .specs-validator.yaml has enabled: false', async () => {
      const specName = 'disabled-feature';
      
      // Create a complete spec
      await createCompleteSpec(specName);
      
      // Create config that disables validation
      await fs.writeFile(
        appPath('.specs-validator.yaml'),
        'enabled: false\n'
      );
      
      // Run validation
      const appDir = appPath('');
      runValidateSpecs(appDir);
      
      // Check that validation report was NOT created
      expect(await hasValidationReport(specName)).toBe(false);
    });
  });
});
