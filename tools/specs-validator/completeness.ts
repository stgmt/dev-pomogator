/**
 * Spec Completeness Checker
 * 
 * Checks if a spec directory contains all 13 required files:
 * - 12 MD files
 * - 1 .feature file
 */

import fs from 'fs';
import path from 'path';

/**
 * List of required MD files for a complete spec
 */
export const REQUIRED_MD_FILES = [
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
] as const;

/**
 * Result of completeness check for a single spec
 */
export interface SpecCompleteness {
  /** Whether the spec has all 13 required files */
  isComplete: boolean;
  /** Absolute path to the spec directory */
  specPath: string;
  /** Name of the spec (directory name) */
  specName: string;
  /** List of missing MD files */
  missingFiles: string[];
  /** Path to the .feature file (null if not found) */
  featureFile: string | null;
}

/**
 * Check if a directory contains all required files for a complete spec
 * 
 * @param specDir - Absolute path to the spec directory
 * @returns Completeness check result
 */
export function checkCompleteness(specDir: string): SpecCompleteness {
  const specName = path.basename(specDir);
  const missingFiles: string[] = [];
  let featureFile: string | null = null;

  // Check for all required MD files
  for (const requiredFile of REQUIRED_MD_FILES) {
    const filePath = path.join(specDir, requiredFile);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(requiredFile);
    }
  }

  // Check for at least one .feature file
  try {
    const files = fs.readdirSync(specDir);
    const featureFiles = files.filter(f => f.endsWith('.feature'));
    if (featureFiles.length > 0) {
      featureFile = path.join(specDir, featureFiles[0]);
    }
  } catch {
    // Directory might not be readable
  }

  const isComplete = missingFiles.length === 0 && featureFile !== null;

  return {
    isComplete,
    specPath: specDir,
    specName,
    missingFiles,
    featureFile,
  };
}

/**
 * Find all complete specs in a .specs/ directory
 * 
 * @param specsRoot - Absolute path to the .specs/ directory
 * @returns Array of complete specs
 */
export function findCompleteSpecs(specsRoot: string): SpecCompleteness[] {
  const completeSpecs: SpecCompleteness[] = [];

  if (!fs.existsSync(specsRoot)) {
    return completeSpecs;
  }

  try {
    const entries = fs.readdirSync(specsRoot, { withFileTypes: true });
    
    for (const entry of entries) {
      // Only process direct subdirectories
      if (!entry.isDirectory()) {
        continue;
      }

      const specDir = path.join(specsRoot, entry.name);
      const result = checkCompleteness(specDir);

      if (result.isComplete) {
        completeSpecs.push(result);
      }
    }
  } catch {
    // specsRoot might not be readable
  }

  return completeSpecs;
}

/**
 * Check if a workspace has a .specs/ folder
 * 
 * @param workspaceRoots - Array of workspace root paths
 * @returns Path to .specs/ folder or null
 */
export function findSpecsFolder(workspaceRoots: string[]): string | null {
  for (const root of workspaceRoots) {
    const specsPath = path.join(root, '.specs');
    if (fs.existsSync(specsPath) && fs.statSync(specsPath).isDirectory()) {
      return specsPath;
    }
  }
  return null;
}
