#!/usr/bin/env npx tsx
/**
 * Specs Validator Hook
 * 
 * Entry point for Cursor (beforeSubmitPrompt) and Claude (UserPromptSubmit) hooks.
 * Validates that @featureN tags in MD files are covered by BDD scenarios.
 * 
 * Usage:
 *   npx tsx validate-specs.ts
 * 
 * Input (stdin): JSON with conversation_id, workspace_roots, prompt
 * Output (stdout): Warnings for NOT_COVERED and ORPHAN tags
 * Side effect: Creates validation-report.md in each complete spec
 */

import fs from 'fs';
import path from 'path';
import { findSpecsFolder, findCompleteSpecs, type SpecCompleteness } from './completeness';
import { parseMdFiles } from './parsers/md-parser';
import { parseFeatureFile } from './parsers/feature-parser';
import { matchTags } from './matcher';
import { generateReport, printWarnings } from './reporter';

/**
 * Input from Cursor/Claude hook
 */
interface HookInput {
  conversation_id: string;
  workspace_roots: string[];
  prompt?: string;
}

/**
 * Config from .specs-validator.yaml
 */
interface ValidatorConfig {
  enabled: boolean;
  severity?: 'warn' | 'error';
  ignore?: string[];
  extra_feature_dirs?: string[];
}

/**
 * Get home directory (cross-platform)
 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

/**
 * Get log directory path
 */
function getLogDir(): string {
  return path.join(getHomeDir(), '.dev-pomogator', 'logs');
}

/**
 * Log error to file
 */
function logError(message: string): void {
  const logDir = getLogDir();
  const logFile = path.join(logDir, 'specs-validator.log');
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch {
    // Silently fail - don't break the prompt
  }
}

/**
 * Read and parse JSON from stdin
 */
async function readStdin(): Promise<HookInput | null> {
  let inputData = '';
  
  // Check if stdin has data
  if (process.stdin.isTTY) {
    return null;
  }

  try {
    for await (const chunk of process.stdin) {
      inputData += chunk.toString();
    }
    
    if (!inputData.trim()) {
      return null;
    }
    
    return JSON.parse(inputData) as HookInput;
  } catch (err) {
    logError(`Failed to parse stdin: ${err}`);
    return null;
  }
}

/**
 * Check if validation is disabled by config
 */
function isDisabledByConfig(workspaceRoot: string): boolean {
  const configPath = path.join(workspaceRoot, '.specs-validator.yaml');
  
  if (!fs.existsSync(configPath)) {
    return false; // Default: enabled
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // Simple YAML parsing for enabled: false
    const enabledMatch = content.match(/^enabled:\s*(false|no|0)/mi);
    if (enabledMatch) {
      return true;
    }
  } catch {
    // Config file error - continue with validation
  }

  return false;
}

/**
 * Validate a single complete spec
 */
function validateSpec(spec: SpecCompleteness): void {
  // Parse MD files
  const mdTags = parseMdFiles(spec);
  
  // Parse .feature file
  const featureTags = spec.featureFile 
    ? parseFeatureFile(spec.featureFile)
    : [];
  
  // Match tags
  const results = matchTags(mdTags, featureTags);
  
  // Generate report
  generateReport({
    specPath: spec.specPath,
    specName: spec.specName,
    results,
  });
  
  // Print warnings
  printWarnings(results);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // 1. Read hook input from stdin
    const input = await readStdin();
    if (!input) {
      return; // No input, exit silently
    }

    const workspaceRoots = input.workspace_roots || [];
    if (workspaceRoots.length === 0) {
      return; // No workspace roots
    }

    // 2. Find .specs/ folder
    const specsRoot = findSpecsFolder(workspaceRoots);
    if (!specsRoot) {
      return; // No .specs/ folder, exit silently
    }

    // 3. Check if disabled by config
    const workspaceRoot = workspaceRoots[0];
    if (isDisabledByConfig(workspaceRoot)) {
      return; // Disabled, exit silently
    }

    // 4. Find complete specs (13 files)
    const completeSpecs = findCompleteSpecs(specsRoot);
    if (completeSpecs.length === 0) {
      return; // No complete specs, exit silently
    }

    // 5. Validate each complete spec
    for (const spec of completeSpecs) {
      validateSpec(spec);
    }

  } catch (err) {
    // Log error but don't block the prompt
    logError(`Validation error: ${err}`);
  }
}

// Run main
main().catch((err) => {
  logError(`Fatal error: ${err}`);
});
