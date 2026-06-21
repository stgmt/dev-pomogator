/**
 * Step definitions for PLUGIN008: Spec Phase Gate Anti-Hallucination
 * Spec: .specs/spec-phase-gate/spec-phase-gate.feature
 * Migrated from: tests/e2e/phase-gate.test.ts
 *
 * Classification:
 *   runtime  — spawn phase-gate.ts or validate-specs.ts via real node process
 *   runtime  — in-process calls to fileToPhase, checkPhaseAllowed, readProgressState
 *   @manual  — PLUGIN008_11 hook registration in settings (install-time)
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { V4World } from '../hooks/before-after.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  fileToPhase,
  checkPhaseAllowed,
  readProgressState,
  type ProgressState,
  type PhaseState,
} from '../../tools/specs-validator/phase-constants.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_DIR = process.env.APP_DIR || process.cwd();
const ABS_PHASE_GATE = path.join(APP_DIR, 'tools/specs-validator/phase-gate.ts');
const ABS_VALIDATE_SPECS = path.join(APP_DIR, 'tools/specs-validator/validate-specs.ts');

// ---------------------------------------------------------------------------
// World interface
// ---------------------------------------------------------------------------

interface PhaseGateWorld extends V4World {
  lastPhaseGate: { exitCode: number; stdout: string; stderr: string } | null;
  lastValidateSpecs: { exitCode: number; stdout: string; stderr: string } | null;
  lastFileToPhase: string | null | undefined; // undefined = not called yet
  lastCheckPhaseAllowed: string | null; // null = allowed, string = deny reason
  lastReadProgressState: ProgressState | null; // null = read returned null
  specDirInTemp: string; // path inside this.tempDir/.specs/<slug>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgressState(phases_confirmed: string): ProgressState {
  // phases_confirmed: "none" | "Discovery" | "Discovery+Context" | "Discovery+Context+Requirements"
  const confirmed = phases_confirmed === 'none' ? [] : phases_confirmed.split('+');

  const phases: Record<string, PhaseState> = {};
  for (const phase of ['Discovery', 'Context', 'Requirements', 'Finalization']) {
    phases[phase] = {
      completedAt: confirmed.includes(phase) ? '2025-01-01T00:00:00Z' : null,
      stopConfirmed: confirmed.includes(phase),
      stopConfirmedAt: confirmed.includes(phase) ? '2025-01-01T00:00:00Z' : null,
    };
  }

  return {
    version: 3,
    featureSlug: 'my-spec',
    createdAt: '2025-01-01T00:00:00Z',
    currentPhase: 'Discovery',
    phases,
  };
}

function writeProgressJson(specDir: string, confirmed: string, corrupt?: boolean, empty?: boolean): void {
  fs.mkdirSync(specDir, { recursive: true });
  const progressPath = path.join(specDir, '.progress.json');
  if (corrupt) {
    fs.writeFileSync(progressPath, '{ this is not valid json }}}', 'utf-8');
  } else if (empty) {
    fs.writeFileSync(progressPath, '', 'utf-8');
  } else {
    const state = makeProgressState(confirmed);
    fs.writeFileSync(progressPath, JSON.stringify(state), 'utf-8');
  }
}

function runPhaseGate(
  world: PhaseGateWorld,
  toolName: string,
  filePath: string,
  env?: Record<string, string>,
): void {
  const hookInput = {
    tool_name: toolName,
    tool_input: { file_path: filePath },
  };
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', ABS_PHASE_GATE],
    {
      input: JSON.stringify(hookInput),
      encoding: 'utf-8',
      cwd: APP_DIR,
      env: { ...process.env, FORCE_COLOR: '0', ...env },
      timeout: 30000,
    },
  );
  world.lastPhaseGate = {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runValidateSpecs(
  world: PhaseGateWorld,
  specsRootDir: string,
  env?: Record<string, string>,
): void {
  // validate-specs reads specs from cwd or workspace_roots
  // We pass workspace_roots pointing to a temp dir that contains the spec
  const hookInput = {
    conversation_id: 'test-123',
    workspace_roots: [path.dirname(specsRootDir)], // parent of .specs/
    hook_event_name: 'UserPromptSubmit',
  };
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', ABS_VALIDATE_SPECS],
    {
      input: JSON.stringify(hookInput),
      encoding: 'utf-8',
      cwd: APP_DIR,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
      timeout: 30000,
    },
  );
  world.lastValidateSpecs = {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ---------------------------------------------------------------------------
// Given — phase gate spec setup
// ---------------------------------------------------------------------------

Given<PhaseGateWorld>(
  /^a spec dir "([^"]+)" with Discovery unconfirmed in the temp area$/,
  function (slug: string) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const specDir = path.join(specsRoot, slug);
    writeProgressJson(specDir, 'none');
    this.specDirInTemp = specDir;
  },
);

Given<PhaseGateWorld>(
  /^a spec dir "([^"]+)" with Discovery and Context confirmed in the temp area$/,
  function (slug: string) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const specDir = path.join(specsRoot, slug);
    writeProgressJson(specDir, 'Discovery+Context');
    this.specDirInTemp = specDir;
  },
);

Given<PhaseGateWorld>(
  /^a spec dir "([^"]+)" with no \.progress\.json in the temp area$/,
  function (slug: string) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const specDir = path.join(specsRoot, slug);
    fs.mkdirSync(specDir, { recursive: true });
    // No .progress.json written
    this.specDirInTemp = specDir;
  },
);

Given<PhaseGateWorld>(
  /^a spec dir "([^"]+)" with invalid JSON in \.progress\.json in the temp area$/,
  function (slug: string) {
    const specsRoot = path.join(this.tempDir, '.specs');
    const specDir = path.join(specsRoot, slug);
    writeProgressJson(specDir, 'none', true); // corrupt JSON
    this.specDirInTemp = specDir;
  },
);

// ---------------------------------------------------------------------------
// When — spawn phase-gate hook
// ---------------------------------------------------------------------------

When<PhaseGateWorld>(
  /^the phase-gate hook runs for Write to "([^"]+)"$/,
  function (rawPath: string) {
    // If path is inside .specs/, resolve it under tempDir so the hook
    // can find the .progress.json we wrote in Given
    let filePath = rawPath;
    if (rawPath.startsWith('.specs/')) {
      filePath = path.join(this.tempDir, rawPath);
    }
    runPhaseGate(this, 'Write', filePath);
  },
);

When<PhaseGateWorld>(
  /^the phase-gate hook runs for Edit to "([^"]+)"$/,
  function (rawPath: string) {
    let filePath = rawPath;
    if (rawPath.startsWith('.specs/')) {
      filePath = path.join(this.tempDir, rawPath);
    }
    runPhaseGate(this, 'Edit', filePath);
  },
);

// ---------------------------------------------------------------------------
// Then — phase gate exit code and output assertions
// (ALL prefixed with "phase-gate" to avoid collision with generic auto-capture steps)
// ---------------------------------------------------------------------------

Then<PhaseGateWorld>(
  /^the phase-gate hook should exit with code (\d+)$/,
  function (codeStr: string) {
    assert.ok(this.lastPhaseGate !== null, 'phase-gate hook must have been run');
    const expected = parseInt(codeStr, 10);
    assert.strictEqual(
      this.lastPhaseGate!.exitCode,
      expected,
      `Expected exit code ${expected}, got ${this.lastPhaseGate!.exitCode}. stderr: ${this.lastPhaseGate!.stderr}`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the phase-gate hook stdout should contain permissionDecision "([^"]+)"$/,
  function (decision: string) {
    assert.ok(this.lastPhaseGate !== null, 'phase-gate hook must have been run');
    const stdout = this.lastPhaseGate!.stdout.trim();
    assert.ok(stdout.length > 0, `Expected non-empty stdout, got empty. stderr: ${this.lastPhaseGate!.stderr}`);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`Expected valid JSON stdout, got: ${stdout}`);
    }
    const output = parsed['hookSpecificOutput'] as Record<string, unknown> | undefined;
    assert.ok(output, `Expected hookSpecificOutput in stdout JSON, got: ${stdout}`);
    assert.strictEqual(
      output['permissionDecision'],
      decision,
      `Expected permissionDecision "${decision}", got "${output['permissionDecision']}"`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the phase-gate hook stdout should be empty or "\{\}"$/,
  function () {
    assert.ok(this.lastPhaseGate !== null, 'phase-gate hook must have been run');
    const stdout = this.lastPhaseGate!.stdout.trim();
    // Allow empty or {}
    if (stdout && stdout !== '{}') {
      // If non-empty, must be parseable JSON and must NOT be a deny
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        throw new Error(`Expected empty or JSON stdout, got: ${stdout}`);
      }
      const output = parsed['hookSpecificOutput'] as Record<string, unknown> | undefined;
      if (output) {
        assert.notStrictEqual(
          output['permissionDecision'],
          'deny',
          `Expected no deny, got permissionDecision "deny"`,
        );
      }
    }
  },
);

Then<PhaseGateWorld>(
  /^the phase-gate hook deny reason should mention "([^"]+)" and "([^"]+)"$/,
  function (term1: string, term2: string) {
    assert.ok(this.lastPhaseGate !== null, 'phase-gate hook must have been run');
    const stdout = this.lastPhaseGate!.stdout.trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`Expected valid JSON stdout, got: ${stdout}`);
    }
    const output = parsed['hookSpecificOutput'] as Record<string, unknown> | undefined;
    const reason = String(output?.['permissionDecisionReason'] || '');
    assert.ok(
      reason.includes(term1),
      `Expected deny reason to mention "${term1}", got: ${reason}`,
    );
    assert.ok(
      reason.includes(term2),
      `Expected deny reason to mention "${term2}", got: ${reason}`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the phase-gate hook should write to stderr$/,
  function () {
    assert.ok(this.lastPhaseGate !== null, 'phase-gate hook must have been run');
    assert.ok(
      this.lastPhaseGate!.stderr.length > 0,
      `Expected non-empty stderr, got empty`,
    );
  },
);

// ---------------------------------------------------------------------------
// Given / When / Then — validate-specs (Layer 2)
// ---------------------------------------------------------------------------

When<PhaseGateWorld>(
  /^validate-specs runs as a UserPromptSubmit hook with that spec dir$/,
  function () {
    const specsRoot = path.join(this.tempDir, '.specs');
    runValidateSpecs(this, specsRoot);
  },
);

When<PhaseGateWorld>(
  /^validate-specs runs as a UserPromptSubmit hook with SPECS_VALIDATOR_VERBOSE=1$/,
  function () {
    const specsRoot = path.join(this.tempDir, '.specs');
    runValidateSpecs(this, specsRoot, { SPECS_VALIDATOR_VERBOSE: '1' });
  },
);

Then<PhaseGateWorld>(
  /^the validate-specs output should contain the specs-validator prefix$/,
  function () {
    assert.ok(this.lastValidateSpecs !== null, 'validate-specs must have been run');
    const combined = this.lastValidateSpecs!.stdout + this.lastValidateSpecs!.stderr;
    assert.ok(
      combined.includes('[specs-validator]'),
      `Expected output to contain "[specs-validator]", got: ${combined}`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the validate-specs output should mention unconfirmed STOP count$/,
  function () {
    assert.ok(this.lastValidateSpecs !== null, 'validate-specs must have been run');
    const combined = this.lastValidateSpecs!.stdout + this.lastValidateSpecs!.stderr;
    assert.ok(
      combined.includes('unconfirmed STOP') || combined.includes('[specs-validator]'),
      `Expected output to mention unconfirmed STOP count, got: ${combined}`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the validate-specs output should contain "([^"]+)"$/,
  function (expected: string) {
    assert.ok(this.lastValidateSpecs !== null, 'validate-specs must have been run');
    const combined = this.lastValidateSpecs!.stdout + this.lastValidateSpecs!.stderr;
    assert.ok(
      combined.includes(expected),
      `Expected validate-specs output to contain "${expected}", got: ${combined}`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the validate-specs output should not mention "([^"]+)"$/,
  function (text: string) {
    assert.ok(this.lastValidateSpecs !== null, 'validate-specs must have been run');
    const combined = this.lastValidateSpecs!.stdout + this.lastValidateSpecs!.stderr;
    assert.ok(
      !combined.includes(text),
      `Expected validate-specs output NOT to mention "${text}", but it did. Output: ${combined}`,
    );
  },
);

// ---------------------------------------------------------------------------
// When / Then — fileToPhase Scenario Outline (in-process)
// ---------------------------------------------------------------------------

When<PhaseGateWorld>(
  /^fileToPhase is called with "([^"]+)"$/,
  function (filename: string) {
    this.lastFileToPhase = fileToPhase(filename);
  },
);

Then<PhaseGateWorld>(
  /^the result should be null$/,
  function () {
    assert.strictEqual(
      this.lastFileToPhase,
      null,
      `Expected null, got "${this.lastFileToPhase}"`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the result should be "([^"]+)"$/,
  function (expected: string) {
    assert.strictEqual(
      this.lastFileToPhase,
      expected,
      `Expected "${expected}", got "${this.lastFileToPhase}"`,
    );
  },
);

// ---------------------------------------------------------------------------
// Given / When / Then — checkPhaseAllowed Scenario Outline (in-process)
// ---------------------------------------------------------------------------

interface CheckState {
  progress: ProgressState;
}

// Store built progress state in world for checkPhaseAllowed
declare module '../hooks/before-after.ts' {
  interface V4World {
    _checkState?: CheckState;
    _checkResult?: string | null;
  }
}

Given<PhaseGateWorld>(
  /^a progress state with phases: "([^"]+)"$/,
  function (phases_confirmed: string) {
    const progress = makeProgressState(phases_confirmed);
    (this as unknown as { _checkState: CheckState })._checkState = { progress };
  },
);

When<PhaseGateWorld>(
  /^checkPhaseAllowed is called for file "([^"]+)" in spec "([^"]+)"$/,
  function (filename: string, specName: string) {
    const state = (this as unknown as { _checkState?: CheckState })._checkState;
    assert.ok(state, 'Progress state must be set in Given');
    const result = checkPhaseAllowed(filename, state.progress, specName);
    this.lastCheckPhaseAllowed = result;
    (this as unknown as { _checkResult: string | null })._checkResult = result;
  },
);

Then<PhaseGateWorld>(
  /^the gate result should be "deny"$/,
  function () {
    const result = (this as unknown as { _checkResult?: string | null })._checkResult;
    assert.ok(
      typeof result === 'string' && result.length > 0,
      `Expected a deny reason string, got: ${JSON.stringify(result)}`,
    );
    // Must mention PHASE GATE
    assert.ok(
      result.includes('PHASE GATE'),
      `Expected deny reason to include "PHASE GATE", got: ${result}`,
    );
  },
);

Then<PhaseGateWorld>(
  /^the gate result should be "allow"$/,
  function () {
    const result = (this as unknown as { _checkResult?: string | null })._checkResult;
    assert.strictEqual(
      result,
      null,
      `Expected null (allow), got: ${JSON.stringify(result)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// Given / When / Then — readProgressState Scenario Outline (in-process)
// ---------------------------------------------------------------------------

interface ReadStateHolder {
  _readResult?: ProgressState | null;
}

Given<PhaseGateWorld>(
  /^a \.progress\.json file in tempDir with content "valid_utf8_bom"$/,
  function () {
    const state = makeProgressState('Discovery');
    const json = JSON.stringify(state);
    // Prepend UTF-8 BOM (0xEF 0xBB 0xBF)
    const bom = '﻿';
    fs.writeFileSync(path.join(this.tempDir, '.progress.json'), bom + json, 'utf-8');
  },
);

Given<PhaseGateWorld>(
  /^a \.progress\.json file in tempDir with content "valid_no_bom"$/,
  function () {
    const state = makeProgressState('none');
    fs.writeFileSync(path.join(this.tempDir, '.progress.json'), JSON.stringify(state), 'utf-8');
  },
);

Given<PhaseGateWorld>(
  /^a \.progress\.json file in tempDir with content "missing"$/,
  function () {
    // Do nothing — file is not written (missing)
  },
);

Given<PhaseGateWorld>(
  /^a \.progress\.json file in tempDir with content "invalid_json"$/,
  function () {
    fs.writeFileSync(path.join(this.tempDir, '.progress.json'), '{ this is not valid json }}}', 'utf-8');
  },
);

Given<PhaseGateWorld>(
  /^a \.progress\.json file in tempDir with content "empty"$/,
  function () {
    fs.writeFileSync(path.join(this.tempDir, '.progress.json'), '', 'utf-8');
  },
);

When<PhaseGateWorld>(
  /^readProgressState is called on that path$/,
  function () {
    const result = readProgressState(this.tempDir);
    (this as unknown as ReadStateHolder)._readResult = result;
  },
);

Then<PhaseGateWorld>(
  /^the read result should be "parsed"$/,
  function () {
    const result = (this as unknown as ReadStateHolder)._readResult;
    assert.ok(
      result !== null && typeof result === 'object',
      `Expected a parsed ProgressState object, got: ${JSON.stringify(result)}`,
    );
    // Must have featureSlug field
    assert.ok('featureSlug' in result, `Expected featureSlug in parsed result, got: ${JSON.stringify(result)}`);
  },
);

Then<PhaseGateWorld>(
  /^the read result should be "null"$/,
  function () {
    const result = (this as unknown as ReadStateHolder)._readResult;
    assert.strictEqual(
      result,
      null,
      `Expected null, got: ${JSON.stringify(result)}`,
    );
  },
);
