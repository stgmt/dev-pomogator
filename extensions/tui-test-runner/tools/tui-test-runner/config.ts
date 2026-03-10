/**
 * Framework auto-detection and TUI configuration
 * Detects test framework by presence of config files in project root
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestFramework } from './adapters/types.js';

export interface TuiTestRunnerConfig {
  framework: TestFramework;
  statusDir: string;
  logFile: string;
  pythonPath: string;
  enabled: boolean;
}

const FRAMEWORK_INDICATORS: Array<{ framework: TestFramework; files: string[] }> = [
  { framework: 'vitest', files: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'] },
  { framework: 'jest', files: ['jest.config.ts', 'jest.config.js', 'jest.config.cjs'] },
  { framework: 'pytest', files: ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'conftest.py'] },
  { framework: 'rust', files: ['Cargo.toml'] },
  { framework: 'go', files: ['go.mod'] },
  { framework: 'dotnet', files: [] }, // detected by .csproj glob
];

/** Detect test framework from project files */
export function detectFramework(projectDir: string): TestFramework {
  const envFramework = process.env.TUI_TEST_FRAMEWORK;
  if (envFramework && envFramework !== 'auto') {
    return envFramework as TestFramework;
  }

  for (const { framework, files } of FRAMEWORK_INDICATORS) {
    for (const file of files) {
      if (fs.existsSync(path.join(projectDir, file))) {
        // For pytest, verify pyproject.toml actually has pytest config
        if (framework === 'pytest' && file === 'pyproject.toml') {
          try {
            const content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
            if (!content.includes('[tool.pytest') && !content.includes('pytest')) continue;
          } catch { continue; }
        }
        return framework;
      }
    }
  }

  // Check for .csproj files (dotnet)
  try {
    const entries = fs.readdirSync(projectDir);
    if (entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln'))) {
      return 'dotnet';
    }
  } catch { /* ignore */ }

  return 'unknown';
}

/** Build full config from env and project detection */
export function getConfig(projectDir: string, sessionId: string): TuiTestRunnerConfig {
  const prefix = sessionId.substring(0, 8);
  const statusDir = path.join(projectDir, '.dev-pomogator', '.test-status');

  return {
    framework: detectFramework(projectDir),
    statusDir,
    logFile: path.join(statusDir, `test.${prefix}.log`),
    pythonPath: process.env.TUI_PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3'),
    enabled: process.env.TUI_TEST_RUNNER_ENABLED !== 'false',
  };
}
