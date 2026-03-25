/**
 * Unit tests for phase-gate hook logic.
 *
 * Tests the shared helpers in phase-constants.ts:
 *   - fileToPhase()      — maps spec filenames to workflow phases
 *   - checkPhaseAllowed() — enforces phase ordering via STOP confirmations
 *   - readProgressState() — reads .progress.json with BOM handling
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  fileToPhase,
  checkPhaseAllowed,
  readProgressState,
  type ProgressState,
} from '../../extensions/specs-workflow/tools/specs-validator/phase-constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid ProgressState for tests. Phases are empty by default. */
function makeProgress(
  phases: Record<string, { stopConfirmed: boolean }> = {},
): ProgressState {
  const full: Record<string, { completedAt: string | null; stopConfirmed: boolean; stopConfirmedAt: string | null }> = {};
  for (const [name, p] of Object.entries(phases)) {
    full[name] = {
      completedAt: p.stopConfirmed ? '2025-01-01T00:00:00Z' : null,
      stopConfirmed: p.stopConfirmed,
      stopConfirmedAt: p.stopConfirmed ? '2025-01-01T00:00:00Z' : null,
    };
  }
  return {
    version: 1,
    featureSlug: 'test-feature',
    createdAt: '2025-01-01T00:00:00Z',
    currentPhase: 'Discovery',
    phases: full,
  };
}

// ---------------------------------------------------------------------------
// fileToPhase()
// ---------------------------------------------------------------------------
describe('fileToPhase', () => {
  it('maps USER_STORIES.md to Discovery', () => {
    expect(fileToPhase('USER_STORIES.md')).toBe('Discovery');
  });

  it('maps USE_CASES.md to Discovery', () => {
    expect(fileToPhase('USE_CASES.md')).toBe('Discovery');
  });

  it('maps RESEARCH.md to Discovery', () => {
    expect(fileToPhase('RESEARCH.md')).toBe('Discovery');
  });

  it('maps FR.md to Requirements', () => {
    expect(fileToPhase('FR.md')).toBe('Requirements');
  });

  it('maps NFR.md to Requirements', () => {
    expect(fileToPhase('NFR.md')).toBe('Requirements');
  });

  it('maps ACCEPTANCE_CRITERIA.md to Requirements', () => {
    expect(fileToPhase('ACCEPTANCE_CRITERIA.md')).toBe('Requirements');
  });

  it('maps DESIGN.md to Requirements', () => {
    expect(fileToPhase('DESIGN.md')).toBe('Requirements');
  });

  it('maps FILE_CHANGES.md to Requirements', () => {
    expect(fileToPhase('FILE_CHANGES.md')).toBe('Requirements');
  });

  it('maps REQUIREMENTS.md to Requirements', () => {
    expect(fileToPhase('REQUIREMENTS.md')).toBe('Requirements');
  });

  it('maps TASKS.md to Finalization', () => {
    expect(fileToPhase('TASKS.md')).toBe('Finalization');
  });

  it('maps README.md to Finalization', () => {
    expect(fileToPhase('README.md')).toBe('Finalization');
  });

  it('maps CHANGELOG.md to Finalization', () => {
    expect(fileToPhase('CHANGELOG.md')).toBe('Finalization');
  });

  it('maps any .feature file to Requirements', () => {
    expect(fileToPhase('my-feature.feature')).toBe('Requirements');
    expect(fileToPhase('CORE001_something.feature')).toBe('Requirements');
  });

  it('returns null for SCHEMA.md (not phase-gated)', () => {
    expect(fileToPhase('SCHEMA.md')).toBeNull();
  });

  it('returns null for random.txt (unknown file)', () => {
    expect(fileToPhase('random.txt')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(fileToPhase('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkPhaseAllowed()
// ---------------------------------------------------------------------------
describe('checkPhaseAllowed', () => {
  it('denies FR.md when Discovery is not confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: false },
    });
    const result = checkPhaseAllowed('FR.md', progress, 'test-feature');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('PHASE GATE');
    expect(result).toContain('Discovery');
    expect(result).toContain('STOP #1');
  });

  it('allows FR.md when Discovery is confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: true },
    });
    const result = checkPhaseAllowed('FR.md', progress, 'test-feature');
    expect(result).toBeNull();
  });

  it('allows USER_STORIES.md with nothing confirmed (Discovery phase, no prior phases)', () => {
    const progress = makeProgress({});
    const result = checkPhaseAllowed('USER_STORIES.md', progress, 'test-feature');
    expect(result).toBeNull();
  });

  it('denies TASKS.md when Discovery is not confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: false },
      Requirements: { stopConfirmed: false },
    });
    const result = checkPhaseAllowed('TASKS.md', progress, 'test-feature');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Discovery');
    expect(result).toContain('STOP #1');
  });

  it('denies TASKS.md when Discovery confirmed but Requirements not confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: true },
      Requirements: { stopConfirmed: false },
    });
    const result = checkPhaseAllowed('TASKS.md', progress, 'test-feature');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Requirements');
    expect(result).toContain('STOP #2');
  });

  it('allows TASKS.md when Discovery and Requirements are confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: true },
      Requirements: { stopConfirmed: true },
    });
    const result = checkPhaseAllowed('TASKS.md', progress, 'test-feature');
    expect(result).toBeNull();
  });

  it('allows unknown files (not phase-gated)', () => {
    const progress = makeProgress({});
    const result = checkPhaseAllowed('SCHEMA.md', progress, 'test-feature');
    expect(result).toBeNull();
  });

  it('includes spec name in the deny message for ConfirmStop command', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: false },
    });
    const result = checkPhaseAllowed('FR.md', progress, 'my-cool-feature');
    expect(result).toContain('my-cool-feature');
    expect(result).toContain('ConfirmStop Discovery');
  });

  it('allows .feature file when Discovery is confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: true },
    });
    const result = checkPhaseAllowed('my-feature.feature', progress, 'test-feature');
    expect(result).toBeNull();
  });

  it('denies .feature file when Discovery is not confirmed', () => {
    const progress = makeProgress({
      Discovery: { stopConfirmed: false },
    });
    const result = checkPhaseAllowed('my-feature.feature', progress, 'test-feature');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('Discovery');
  });

  it('skips Context phase in gate check (Context has no own files)', () => {
    // Requirements phase requires Discovery confirmed, but NOT Context.
    // Context is skipped in the loop because it has no files of its own.
    const progress = makeProgress({
      Discovery: { stopConfirmed: true },
      // Context NOT confirmed — should still allow Requirements files
    });
    const result = checkPhaseAllowed('FR.md', progress, 'test-feature');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readProgressState()
// ---------------------------------------------------------------------------
describe('readProgressState', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gate-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    tmpDirs.length = 0;
  });

  it('parses .progress.json with UTF-8 BOM', () => {
    const dir = makeTmpDir();
    const data: ProgressState = {
      version: 1,
      featureSlug: 'bom-test',
      createdAt: '2025-01-01T00:00:00Z',
      currentPhase: 'Discovery',
      phases: {
        Discovery: {
          completedAt: null,
          stopConfirmed: false,
          stopConfirmedAt: null,
        },
      },
    };
    const bom = '\uFEFF';
    fs.writeFileSync(
      path.join(dir, '.progress.json'),
      bom + JSON.stringify(data, null, 2),
      'utf-8',
    );

    const result = readProgressState(dir);
    expect(result).not.toBeNull();
    expect(result!.featureSlug).toBe('bom-test');
    expect(result!.phases.Discovery.stopConfirmed).toBe(false);
  });

  it('parses .progress.json without BOM', () => {
    const dir = makeTmpDir();
    const data: ProgressState = {
      version: 1,
      featureSlug: 'no-bom',
      createdAt: '2025-01-01T00:00:00Z',
      currentPhase: 'Requirements',
      phases: {
        Discovery: {
          completedAt: '2025-01-01T00:00:00Z',
          stopConfirmed: true,
          stopConfirmedAt: '2025-01-01T00:00:00Z',
        },
      },
    };
    fs.writeFileSync(
      path.join(dir, '.progress.json'),
      JSON.stringify(data, null, 2),
      'utf-8',
    );

    const result = readProgressState(dir);
    expect(result).not.toBeNull();
    expect(result!.featureSlug).toBe('no-bom');
    expect(result!.currentPhase).toBe('Requirements');
  });

  it('returns null when .progress.json does not exist', () => {
    const dir = makeTmpDir();
    const result = readProgressState(dir);
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON content', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, '.progress.json'),
      '{ this is not valid json }}}',
      'utf-8',
    );
    const result = readProgressState(dir);
    expect(result).toBeNull();
  });

  it('returns null for empty file', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, '.progress.json'), '', 'utf-8');
    const result = readProgressState(dir);
    expect(result).toBeNull();
  });
});

// =========================================================================
// Integration — phase-gate.ts via real process execution
// =========================================================================
import { runTsx, appPath } from './helpers';

describe('Integration: phase-gate.ts', () => {
  const PHASE_GATE_SCRIPT = 'extensions/specs-workflow/tools/specs-validator/phase-gate.ts';

  function runPhaseGate(stdin: Record<string, unknown>) {
    return runTsx(PHASE_GATE_SCRIPT, { input: stdin });
  }

  it('blocks spec file edit before Discovery confirmed (integration)', () => {
    const specDir = path.join(appPath(), '.specs', 'test-integration');
    fs.mkdirSync(specDir, { recursive: true });
    // Empty progress — no phases confirmed
    fs.writeFileSync(path.join(specDir, '.progress.json'), JSON.stringify({
      version: 1, featureSlug: 'test-integration', createdAt: '2025-01-01T00:00:00Z',
      currentPhase: 'Discovery', phases: {},
    }));

    try {
      const result = runPhaseGate({
        tool_name: 'Write',
        tool_input: { file_path: `${appPath()}/.specs/test-integration/FR.md`, content: '# FR' },
      });
      expect(result.status).toBe(0);
      // FR.md is Phase 2 (Requirements) — should block without Discovery confirmation
      const output = result.stdout.trim();
      if (output) {
        const parsed = JSON.parse(output);
        expect(parsed.decision).toBe('block');
      }
    } finally {
      fs.rmSync(specDir, { recursive: true, force: true });
    }
  });

  it('approves non-spec file edit (integration)', () => {
    const result = runPhaseGate({
      tool_name: 'Write',
      tool_input: { file_path: `${appPath()}/src/app.ts`, content: 'code' },
    });
    expect(result.status).toBe(0);
    const output = result.stdout.trim();
    // Non-spec file → approve (empty or {})
    if (output) {
      const parsed = JSON.parse(output);
      expect(parsed.decision).not.toBe('block');
    }
  });

  it('approves when no .specs directory exists (integration)', () => {
    const result = runPhaseGate({
      tool_name: 'Read',
      tool_input: { file_path: `${appPath()}/README.md` },
    });
    expect(result.status).toBe(0);
  });
});
