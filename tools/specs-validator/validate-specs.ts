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
import { findSpecsFolder, findCompleteSpecs, type SpecCompleteness } from './completeness.ts';
import { parseMdFiles } from './parsers/md-parser.ts';
import { parseFeatureFile } from './parsers/feature-parser.ts';
import { matchTags, matchTestFeature } from './matcher.ts';
import { flushWarnings, generateReport, printWarnings } from './reporter.ts';
import { parseTestFile, findTestFile } from './parsers/test-parser.ts';
import { rotateLog } from './audit-logger.ts';
import { buildConformanceSummary, buildTaskCensusLine } from './conformance-summary.ts';
import {
  PHASE_FILES,
  PHASE_ORDER,
  STOP_LABELS,
  readProgressState,
  type PhaseState,
  type ProgressState,
} from './phase-constants.ts';

/**
 * Input from Cursor/Claude hook
 */
interface HookInput {
  conversation_id: string;
  workspace_roots: string[];
  prompt?: string;
  /** Claude Code UserPromptSubmit sends `cwd` instead of Cursor's `workspace_roots`. */
  cwd?: string;
  hook_event_name?: string;
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

// PhaseState, ProgressState, PHASE_FILES, PHASE_ORDER, STOP_LABELS
// imported from ./phase-constants

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
function validateSpec(spec: SpecCompleteness, workspaceRoot: string): void {
  // Parse MD files
  const mdTags = parseMdFiles(spec);

  // Parse .feature file
  const featureTags = spec.featureFile
    ? parseFeatureFile(spec.featureFile)
    : [];

  // Match tags
  const results = matchTags(mdTags, featureTags);

  // Test↔Feature alignment (find .test.ts by extension name convention)
  let alignmentResults;
  if (spec.featureFile) {
    const testsDir = path.join(workspaceRoot, 'tests', 'e2e');
    const testFile = findTestFile(testsDir, spec.specName);
    if (testFile) {
      const testCases = parseTestFile(testFile);
      if (testCases.length > 0) {
        alignmentResults = matchTestFeature(testCases, spec.featureFile);
      }
    }
  }

  // Generate report
  generateReport({
    specPath: spec.specPath,
    specName: spec.specName,
    results,
    alignmentResults,
  });

  // Print warnings
  printWarnings(results);
}

// readProgressState imported from ./phase-constants

/**
 * Check if the prompt mentions files from a phase that hasn't been confirmed yet.
 * Returns array of warning strings to print.
 */
function checkPhaseGate(
  specName: string,
  progress: ProgressState,
  prompt: string,
): string[] {
  const warnings: string[] = [];
  const currentPhaseIdx = PHASE_ORDER.indexOf(progress.currentPhase);
  if (currentPhaseIdx < 0) return warnings;

  // Check each phase after current
  for (let i = currentPhaseIdx + 1; i < PHASE_ORDER.length; i++) {
    const futurePhaseName = PHASE_ORDER[i];
    const futurePhaseFiles = PHASE_FILES[futurePhaseName] || [];

    const mentionedFiles = futurePhaseFiles.filter(f => prompt.includes(f));
    if (mentionedFiles.length === 0) continue;

    // Check if current phase stop is confirmed
    const currentPhaseName = PHASE_ORDER[currentPhaseIdx];
    const currentPhaseState = progress.phases[currentPhaseName as keyof typeof progress.phases];

    if (currentPhaseState && !currentPhaseState.stopConfirmed) {
      const stopLabel = STOP_LABELS[currentPhaseName] || `STOP for ${currentPhaseName}`;
      warnings.push(
        `[specs-validator] PHASE GATE WARNING for "${specName}": ` +
        `Attempting to work on ${futurePhaseName} files (${mentionedFiles.join(', ')}) ` +
        `but ${stopLabel} (${currentPhaseName}) has not been confirmed. ` +
        `Run: spec-status.ts -Path ".specs/${specName}" -ConfirmStop ${currentPhaseName}`
      );
    }
  }

  return warnings;
}

/**
 * Print phase status banner for specs with .progress.json.
 * Injects allowed/blocked file lists so Claude knows what's writable.
 */
function printPhaseStatus(specName: string, progress: ProgressState): void {
  const allFiles = Object.values(PHASE_FILES).flat();
  const allowed: string[] = [];
  const blocked: string[] = [];

  for (const [phase, files] of Object.entries(PHASE_FILES)) {
    if (files.length === 0) continue; // Context has no files
    const phaseIdx = PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number]);
    let isAllowed = true;
    for (let i = 0; i < phaseIdx; i++) {
      const prevPhase = PHASE_ORDER[i];
      if (prevPhase === 'Context') continue;
      const prevState = progress.phases[prevPhase];
      if (!prevState || !prevState.stopConfirmed) {
        isAllowed = false;
        break;
      }
    }
    if (isAllowed) {
      allowed.push(...files);
    } else {
      blocked.push(...files);
    }
  }

  // Find first unconfirmed STOP
  let unconfirmedStop = '';
  let unconfirmedPhase = '';
  for (const phase of PHASE_ORDER) {
    if (phase === 'Context') continue;
    const state = progress.phases[phase];
    if (!state || !state.stopConfirmed) {
      unconfirmedStop = STOP_LABELS[phase] || phase;
      unconfirmedPhase = phase;
      break;
    }
  }

  // Batch-24 honest-audit: per-spec 4-line dump was the SECOND-largest
  // hook prompt-spam source (after printWarnings). Aggregate into the
  // module-level UNCONFIRMED_STOPS list; printed once at flush time.
  if (unconfirmedStop) {
    UNCONFIRMED_STOPS.push({
      specName, currentPhase: progress.currentPhase,
      stopLabel: unconfirmedStop, unconfirmedPhase,
    });
  }
}

const UNCONFIRMED_STOPS: Array<{
  specName: string; currentPhase: string;
  stopLabel: string; unconfirmedPhase: string;
}> = [];

/** Flush aggregated phase-status into ONE summary line. Verbose env restores full dump. */
function flushPhaseStatus(): void {
  if (UNCONFIRMED_STOPS.length === 0) return;
  const verbose = process.env.SPECS_VALIDATOR_VERBOSE === '1';
  if (!verbose) {
    console.log(
      `[specs-validator] ${UNCONFIRMED_STOPS.length} specs with unconfirmed STOP ` +
      `(SPECS_VALIDATOR_VERBOSE=1 for per-spec breakdown)`,
    );
    UNCONFIRMED_STOPS.length = 0;
    return;
  }
  for (const e of UNCONFIRMED_STOPS) {
    console.log(`[specs-validator] SPEC: ${e.specName} | Phase: ${e.currentPhase} | ${e.stopLabel} not confirmed`);
    console.log(`  Confirm: spec-status.ts -Path ".specs/${e.specName}" -ConfirmStop ${e.unconfirmedPhase}`);
  }
  UNCONFIRMED_STOPS.length = 0;
}

/**
 * Find all spec directories (complete and incomplete)
 */
function findAllSpecDirs(specsRoot: string): string[] {
  try {
    const entries = fs.readdirSync(specsRoot, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => path.join(specsRoot, e.name));
  } catch {
    return [];
  }
}

/**
 * Main entry point
 */
/**
 * FR-20 threshold-only conformance summary (B3): one line ONLY when
 * unresolved DENY events exist since the author's last /spec-status ack —
 * silent otherwise (zero-noise default; the v3 every-prompt 24h aggregate is
 * superseded — its full view lives behind /spec-status, the B4 surface).
 * Sources + ack-state logic live in ./conformance-summary.ts (path-injectable,
 * contract-tested in __tests__/conformance-summary.test.ts).
 * Also calls rotateLog() once per session for retention cleanup.
 *
 * @see .specs/spec-generator-v4/FR.md FR-20, NFR.md NFR-Performance-6
 */
function renderFormGuardsSummary(): void {
  try {
    rotateLog();
    const line = buildConformanceSummary();
    if (line) console.log(line);
    // P21-4: surface unfinished tasks from the cached census (graph-only, written
    // by spec-conformance-push). Reads a tiny JSON — never builds the graph here.
    const census = buildTaskCensusLine();
    if (census) console.log(census);
  } catch {
    // fail-silent — audit log is non-critical
  }
}

async function main(): Promise<void> {
  try {
    // 1. Read hook input from stdin
    const input = await readStdin();
    if (!input) {
      return; // No input, exit silently
    }

    // 1.5 Form-guards summary runs independently of .specs/ discovery
    // — so that it fires even on projects without any .specs/ folder
    // but with form-guards events recorded globally. Must run BEFORE the
    // empty-roots early-return below; otherwise the Claude Code UserPromptSubmit
    // payload (which carries `cwd`, not Cursor's `workspace_roots`) would skip it
    // entirely and FR-13's "on every prompt" summary would never fire in practice.
    renderFormGuardsSummary();

    // Accept both the Cursor shape (`workspace_roots`) and the Claude Code shape
    // (`cwd`). Falling back to `cwd` lets spec discovery work under Claude Code too.
    const workspaceRoots =
      input.workspace_roots && input.workspace_roots.length > 0
        ? input.workspace_roots
        : input.cwd
          ? [input.cwd]
          : [];
    if (workspaceRoots.length === 0) {
      return; // No workspace roots (and no cwd) — nothing further to discover
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

    // 4. Find complete specs (13 files) and validate @featureN coverage
    const completeSpecs = findCompleteSpecs(specsRoot);
    for (const spec of completeSpecs) {
      validateSpec(spec, workspaceRoot);
    }

    // 5. Phase status injection + gate check for ALL specs with .progress.json
    const allSpecDirs = findAllSpecDirs(specsRoot);
    for (const specDir of allSpecDirs) {
      const specName = path.basename(specDir);
      const progress = readProgressState(specDir);
      if (!progress) continue; // no .progress.json = old spec, skip

      // Inject phase status banner (Layer 2)
      printPhaseStatus(specName, progress);

      // Phase gate warning (advisory, Layer 2 — hard gate is in phase-gate.ts PreToolUse)
      if (input.prompt) {
        const phaseWarnings = checkPhaseGate(specName, progress, input.prompt);
        for (const w of phaseWarnings) {
          console.log(w);
        }
      }
    }
    // Batch-24: flush aggregated phase-status + warnings into single summary lines.
    flushWarnings();
    flushPhaseStatus();

  } catch (err) {
    // Log error but don't block the prompt
    logError(`Validation error: ${err}`);
  }
}

// Run main
main().catch((err) => {
  logError(`Fatal error: ${err}`);
});
