// TODO(v4.x): implement step bodies for CORE005_01..05 — currently stubs.
// Pattern follows tests/e2e/skill-listing-budget.test.ts beforeEach/afterEach
// (temp-HOME tempDir via mkdtemp + settings.json under .claude/).
// Recreated as stub 2026-06-01 to restore BDD 1:1 mapping per
// extension-test-quality rule (each Scenario in CORE005_settings-protection.feature
// must have a paired it()).
//
// Reference: .specs/skill-listing-budget/DESIGN.md cites this file as the
// "EXISTING evidence pattern" for settings.json beforeEach/afterEach temp-HOME.
// File was missing — this stub restores the 1:1 mapping; bodies must be
// filled when CORE005 atomic-write protection is integration-tested.

import { describe, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * CORE005: Settings.json Atomic Write Protection
 *
 * 1:1 with tests/features/core/CORE005_settings-protection.feature
 * Scenarios (5):
 *   CORE005_01 — Atomic write creates backup before overwriting       (@feature1)
 *   CORE005_02 — Recovery from corrupted settings.json                 (@feature2)
 *   CORE005_03 — Both primary and backup corrupted                     (@feature3)
 *   CORE005_04 — User hooks preserved during re-install                (@feature4)
 *   CORE005_05 — No .tmp files left after successful write             (@feature5)
 *
 * All it() are currently it.skip(): the spec covers integration-first
 * end-to-end behaviour via the installer + temp-HOME pattern, but step
 * bodies are deferred. Once implemented, each scenario must call
 * runInstaller() (or equivalent) against the temp HOME, then assert on
 * .claude/settings.json + .bak + .tmp file contents.
 */
describe('CORE005: settings-protection', () => {
  let tempHome: string;
  let settingsPath: string;
  let settingsBakPath: string;
  let settingsTmpPath: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-protection-'));
    settingsPath = path.join(tempHome, '.claude', 'settings.json');
    settingsBakPath = path.join(tempHome, '.claude', 'settings.json.bak');
    settingsTmpPath = path.join(tempHome, '.claude', 'settings.json.tmp');

    // Isolate HOME for the installer / hook code paths that read it.
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    try {
      await fs.remove(tempHome);
    } catch {
      // cleanup best-effort
    }
  });

  // @feature1
  it.skip('CORE005_01: Atomic write creates backup before overwriting', async () => {
    // TODO(v4.x): run installer → assert settings.json.bak exists with valid JSON,
    // settings.json contains all managed hooks. Uses tempHome via HOME env.
    void settingsPath;
    void settingsBakPath;
  });

  // @feature2
  it.skip('CORE005_02: Recovery from corrupted settings.json', async () => {
    // TODO(v4.x): write corrupted settings.json + valid .bak → run installer →
    // assert settings recovered from .bak + warning logged.
    void settingsPath;
    void settingsBakPath;
  });

  // @feature3
  it.skip('CORE005_03: Both primary and backup corrupted', async () => {
    // TODO(v4.x): write corrupted settings.json, no .bak → run installer →
    // assert empty settings used as fallback + warning logged.
    void settingsPath;
    void settingsBakPath;
  });

  // @feature4
  it.skip('CORE005_04: User hooks preserved during re-install', async () => {
    // TODO(v4.x): write settings.json with user-added hooks → re-run installer →
    // assert user hooks still present, managed hooks updated.
    void settingsPath;
  });

  // @feature5
  it.skip('CORE005_05: No .tmp files left after successful write', async () => {
    // TODO(v4.x): run installer → assert settings.json.tmp does NOT exist,
    // settings.json is valid JSON.
    void settingsPath;
    void settingsTmpPath;
  });
});
