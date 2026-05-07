/**
 * BDD Framework Detector
 *
 * Detects which BDD framework is installed (or missing) in target test projects.
 * Returns language + framework + install command + bootstrap recipe hints.
 *
 * Reuses language detection logic from steps-validator/detector.ts (via glob patterns).
 * This module adds a deeper layer: grep package files for actual framework markers
 * and produce a complete bootstrap recipe (Phase 0 task content).
 *
 * @see .specs/create-specs-bdd-enforcement/DESIGN.md
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

export type Language = 'csharp' | 'typescript' | 'python';

export type Framework =
  | 'Reqnroll'
  | 'SpecFlow'
  | 'Cucumber.js'
  | 'Playwright BDD'
  | 'Behave'
  | 'pytest-bdd';

export interface DetectionResult {
  language: Language | null;
  framework: Framework | null;
  installCommand: string | null;
  hookFileHints: string[];
  configFileHint: string | null;
  fixturesFolderHint: string | null;
  evidence: string[];
  suggestedFrameworks: Framework[];
}

/**
 * Bootstrap recipes per framework: paths, install commands, stub file templates.
 * Used to auto-generate Phase 0 bootstrap block in TASKS.md.
 */
const RECIPES: Record<Framework, {
  language: Language;
  installCommand: string;
  hookFileHints: string[];
  configFileHint: string;
  fixturesFolderHint: string;
}> = {
  Reqnroll: {
    language: 'csharp',
    installCommand: 'dotnet add package Reqnroll && dotnet add package Reqnroll.xUnit',
    hookFileHints: ['Hooks/BeforeAllHook.cs', 'Hooks/AfterAllHook.cs', 'Hooks/ScenarioHooks.cs'],
    configFileHint: 'reqnroll.json',
    fixturesFolderHint: 'TestData/',
  },
  SpecFlow: {
    language: 'csharp',
    installCommand: 'dotnet add package SpecFlow && dotnet add package SpecFlow.xUnit',
    hookFileHints: ['Hooks/BeforeAllHook.cs', 'Hooks/AfterAllHook.cs', 'Hooks/ScenarioHooks.cs'],
    configFileHint: 'specflow.json',
    fixturesFolderHint: 'TestData/',
  },
  'Cucumber.js': {
    language: 'typescript',
    installCommand: 'npm install --save-dev @cucumber/cucumber',
    hookFileHints: ['features/support/hooks.ts', 'features/support/world.ts'],
    configFileHint: 'cucumber.js',
    fixturesFolderHint: 'features/fixtures/',
  },
  'Playwright BDD': {
    language: 'typescript',
    installCommand: 'npm install --save-dev playwright-bdd @playwright/test',
    hookFileHints: ['features/support/fixtures.ts'],
    configFileHint: 'playwright.config.ts',
    fixturesFolderHint: 'features/fixtures/',
  },
  // Python frameworks: pytest-bdd first (preferred primary for modern projects;
  // integrates with pytest ecosystem — fixtures, conftest, plugins). Behave
  // second (simpler but standalone — use when pytest is not available).
  'pytest-bdd': {
    language: 'python',
    installCommand: 'pip install pytest-bdd',
    hookFileHints: ['tests/conftest.py'],
    configFileHint: 'pytest.ini',
    fixturesFolderHint: 'tests/fixtures/',
  },
  Behave: {
    language: 'python',
    installCommand: 'pip install behave',
    hookFileHints: ['features/environment.py'],
    configFileHint: 'behave.ini',
    fixturesFolderHint: 'features/fixtures/',
  },
};

/**
 * Grep-based framework detection markers (package manifest lookups).
 */
interface Marker {
  framework: Framework;
  globPattern: string;
  needle: RegExp;
}

const MARKERS: Marker[] = [
  // C# — .csproj lookups
  { framework: 'Reqnroll', globPattern: '**/*.csproj', needle: /<PackageReference\s+Include="Reqnroll[^"]*"/i },
  { framework: 'SpecFlow', globPattern: '**/*.csproj', needle: /<PackageReference\s+Include="SpecFlow[^"]*"/i },
  // TypeScript — package.json lookups
  { framework: 'Cucumber.js', globPattern: '**/package.json', needle: /"@cucumber\/cucumber"\s*:/ },
  { framework: 'Playwright BDD', globPattern: '**/package.json', needle: /"playwright-bdd"\s*:/ },
  // Python — requirements.txt + pyproject.toml
  { framework: 'Behave', globPattern: '**/requirements*.txt', needle: /^behave\b/m },
  { framework: 'Behave', globPattern: '**/pyproject.toml', needle: /\bbehave\b/ },
  { framework: 'pytest-bdd', globPattern: '**/requirements*.txt', needle: /^pytest-bdd\b/m },
  { framework: 'pytest-bdd', globPattern: '**/pyproject.toml', needle: /\bpytest-bdd\b/ },
];

const IGNORE_PATTERNS = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/bin/**', '**/obj/**', '**/.git/**'];

/**
 * Detect language of target project based on presence of common project files.
 */
function detectLanguage(projectPath: string): Language | null {
  try {
    const entries = fs.readdirSync(projectPath);
    const csproj = entries.some((e) => e.endsWith('.csproj') || e.endsWith('.sln'));
    if (csproj) return 'csharp';
    const pkgJson = entries.includes('package.json');
    if (pkgJson) return 'typescript';
    const pyFiles = entries.some((e) => e === 'requirements.txt' || e === 'pyproject.toml' || e === 'setup.py');
    if (pyFiles) return 'python';
  } catch {
    // Fall through
  }
  // Fallback: shallow glob
  try {
    const csprojFiles = globSync('**/*.csproj', projectPath);
    if (csprojFiles.length > 0) return 'csharp';
    const pkgJsonFiles = globSync('**/package.json', projectPath);
    if (pkgJsonFiles.length > 0) return 'typescript';
    const pyReqs = globSync('**/requirements*.txt', projectPath);
    if (pyReqs.length > 0) return 'python';
    const pyProj = globSync('**/pyproject.toml', projectPath);
    if (pyProj.length > 0) return 'python';
  } catch {
    // Ignore
  }
  return null;
}

function globSync(pattern: string, cwd: string): string[] {
  try {
    return glob.sync(pattern, { cwd, ignore: IGNORE_PATTERNS, nodir: true }) as unknown as string[];
  } catch {
    return [];
  }
}

/**
 * Detect BDD framework in target project.
 *
 * @param projectPath Absolute path to project/solution/repo root
 * @param testProjectHints Optional hints (paths to narrow search); if empty, detector searches fully
 * @returns DetectionResult — never throws (fail-open)
 */
export function detectTargetFramework(projectPath: string, testProjectHints: string[] = []): DetectionResult {
  const evidence: string[] = [];
  const language = detectLanguage(projectPath);

  if (!language) {
    evidence.push('Language detection failed — no .csproj/package.json/requirements.txt/pyproject.toml found');
    return emptyResult(null, evidence);
  }

  evidence.push(`Language detected: ${language}`);

  // Narrow search by hints if provided; else search whole project
  const searchRoots = testProjectHints.length > 0
    ? testProjectHints.map((h) => path.isAbsolute(h) ? h : path.join(projectPath, h))
    : [projectPath];

  for (const marker of MARKERS) {
    const recipe = RECIPES[marker.framework];
    if (recipe.language !== language) continue;

    for (const root of searchRoots) {
      const matches = globSync(marker.globPattern, root);
      for (const file of matches) {
        const full = path.join(root, file);
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const match = content.match(marker.needle);
          if (match) {
            const line = content.substring(0, match.index ?? 0).split('\n').length;
            evidence.push(`${marker.framework} detected in ${path.relative(projectPath, full)}:${line} (match: ${match[0].substring(0, 80)})`);
            return {
              language,
              framework: marker.framework,
              installCommand: recipe.installCommand,
              hookFileHints: recipe.hookFileHints,
              configFileHint: recipe.configFileHint,
              fixturesFolderHint: recipe.fixturesFolderHint,
              evidence,
              suggestedFrameworks: [],
            };
          }
        } catch {
          // Skip unreadable file
        }
      }
    }
  }

  // Framework missing — build suggestedFrameworks by language
  const suggestedFrameworks = (Object.entries(RECIPES) as [Framework, typeof RECIPES[Framework]][])
    .filter(([, r]) => r.language === language)
    .map(([fw]) => fw);

  evidence.push(`No BDD framework detected in ${language} project — remediation target (Phase 0 install required)`);

  // Default suggestion: first of suggestedFrameworks (Reqnroll > SpecFlow for C#; Cucumber.js > Playwright BDD for TS; pytest-bdd > Behave for Python)
  const primary = suggestedFrameworks[0];
  const primaryRecipe = primary ? RECIPES[primary] : null;

  return {
    language,
    framework: null,
    installCommand: primaryRecipe?.installCommand ?? null,
    hookFileHints: primaryRecipe?.hookFileHints ?? [],
    configFileHint: primaryRecipe?.configFileHint ?? null,
    fixturesFolderHint: primaryRecipe?.fixturesFolderHint ?? null,
    evidence,
    suggestedFrameworks,
  };
}

function emptyResult(language: Language | null, evidence: string[]): DetectionResult {
  return {
    language,
    framework: null,
    installCommand: null,
    hookFileHints: [],
    configFileHint: null,
    fixturesFolderHint: null,
    evidence,
    suggestedFrameworks: [],
  };
}

/**
 * CLI entry point for standalone testing:
 * npx tsx bdd-framework-detector.ts <projectPath> [testProjectHints...]
 */
const isDirectRun = process.argv[1]?.endsWith('bdd-framework-detector.ts') ||
                    process.argv[1]?.endsWith('bdd-framework-detector.js');
if (isDirectRun) {
  const [, , projectPath, ...hints] = process.argv;
  if (!projectPath) {
    console.error('Usage: bdd-framework-detector.ts <projectPath> [testProjectHints...]');
    process.exit(1);
  }
  const result = detectTargetFramework(path.resolve(projectPath), hints);
  console.log(JSON.stringify(result, null, 2));
}
