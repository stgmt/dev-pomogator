#!/usr/bin/env node
/**
 * classify-tests.ts — heuristic scanner that suggests Unit / Integration / E2E classification
 * for test files based on dependency patterns and content signals.
 *
 * Implements FR-13 (test classification policy) per v0.5.2.
 *
 * Per SKILL.md §3 Test classification policy: Stryker по умолчанию runs только Unit tests.
 * AI scans existing untagged test suite via this script, gets per-file suggested Category Trait,
 * then user/AI applies markers via Edit (NOT auto-applied — manual review required per anti-gaming).
 *
 * Usage:
 *   npx tsx classify-tests.ts <test-dir> [--format=json|markdown] [--language=auto|csharp|python|typescript]
 *
 * Output (default JSON to stdout):
 *   [
 *     {
 *       "file": "Tests/Domain/PricingCalculatorTests.cs",
 *       "suggested": "Unit",
 *       "confidence": "high",
 *       "evidence": ["No HttpClient/DbContext/ConnectionString imports", "No Process.Start usage"],
 *       "current_marker": null,
 *       "language": "csharp"
 *     }
 *   ]
 *
 * Exit codes:
 *   0 — scan completed (zero or more test files found)
 *   2 — invalid args / target dir missing
 *
 * NOT auto-applied — output is **suggestion**. Per Meta ACH-style anti-gaming guidance:
 * reviewer SHALL spot-check classification before applying [Trait("Category", "Unit")] markers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

type Language = 'csharp' | 'python' | 'typescript' | 'go';
type Category = 'Unit' | 'Integration' | 'E2E';
type Confidence = 'high' | 'medium' | 'low';

interface Classification {
  file: string;
  suggested: Category;
  confidence: Confidence;
  evidence: string[];
  current_marker: string | null;
  language: Language;
}

interface ParsedArgs {
  testDir: string;
  format: 'json' | 'markdown';
  language: 'auto' | Language;
  apply: boolean;
  dryRun: boolean;
  confidenceThreshold: Confidence;
}

interface ApplyResult {
  file: string;
  action: 'applied' | 'skipped' | 'would-apply';
  reason: string;
  category?: Category;
  diff?: string;
}

// E2E signals — definitive: hits live infra
const E2E_PATTERNS: Record<Language, RegExp[]> = {
  csharp: [
    /\bDocker\b|\bTestcontainers\b/i,
    /\bHttpClient\(\)/, // raw new HttpClient
    /WebApplicationFactory/,
    /\bDrivers\.|\bPlaywright\b|\bSelenium\b/,
    /\bProcess\.Start/,
    /\bIDbConnection\b|\bNpgsql|\bSqlConnection/i,
    /BaseAddress\s*=.*localhost.*\d{4}/,
  ],
  python: [
    /\bdocker\b|\btestcontainers\b/i,
    /\brequests\.(get|post|put|delete)/,
    /\baiohttp\.(get|post)/,
    /\bplaywright\b|\bselenium\b/i,
    /\bsubprocess\.(run|Popen)/,
    /\bpsycopg2|\bSQLAlchemy/i,
    /BASE_URL.*localhost.*\d{4}/,
  ],
  typescript: [
    /\bDocker\b|\btestcontainers\b/i,
    /\bfetch\s*\(\s*['"]https?:/,
    /\baxios\.(get|post|put|delete)/,
    /\bplaywright\b|\bcypress\b|\bpuppeteer\b/i,
    /\bspawnSync\b|\bchild_process/,
    /\bPostgres|\bMongoClient/i,
    /baseURL.*localhost:\d{4}/,
  ],
  go: [
    /\btestcontainers/i,
    /\bhttp\.Client\{/,
    /\bdocker\b/i,
    /\bexec\.Command/,
    /\bsql\.Open/,
    /\bplaywright/i,
  ],
};

// Integration signals — uses dependencies via interfaces / in-memory replacements / mocks
const INTEGRATION_PATTERNS: Record<Language, RegExp[]> = {
  csharp: [
    /\bUseInMemoryDatabase\b/,
    /\bIServiceCollection\b/,
    /\bMoq\b|\bMock<|\bFakeItEasy\b|\bNSubstitute\b/,
    /\bIFixture\b|\bAutoFixture\b/,
    /\bIClassFixture<|\bICollectionFixture</,
    /\bHttpClientFactory\b|\bIHttpClientFactory\b/,
  ],
  python: [
    /\bunittest\.mock\b|\bMagicMock\b|\bMock\(\)/,
    /\bpytest\.fixture/,
    /\bresponses\b|\brequests_mock\b/,
    /\bSQLAlchemy\b.*memory|\bsqlite.*memory/i,
    /\bDependencyOverrides|\bdependency_overrides/,
  ],
  typescript: [
    /\bvi\.mock\b|\bjest\.mock\b/,
    /\bnock\(/,
    /\bMockedFunction\b/,
    /\bInMemoryDatabase\b|\bsqlite.*memory/i,
    /\bbeforeEach\s*\(.*setup|\binject\b/,
  ],
  go: [
    /\bgomock\b|\btestify\.Mock/,
    /\bhttptest\.NewServer/,
    /\bsqlmock/,
    /\bfake\w+\b/,
  ],
};

// Unit signals — pure logic, type-system enforces correctness
const UNIT_SIGNALS_NEGATIVE: Record<Language, RegExp[]> = {
  csharp: [
    /\bHttpClient\b/,
    /\bDbContext\b/,
    /\bConnectionString\b/,
    /\bProcess\.\w+/,
    /\bIDbConnection\b/,
    /\bWebApplicationFactory\b/,
  ],
  python: [
    /\bsubprocess\b/,
    /\brequests\b(?!_mock)/,
    /\baiohttp\b/,
    /\bpsycopg2\b/,
    /\bSQLAlchemy.*(?!memory)/i,
  ],
  typescript: [
    /\bspawnSync\b/,
    /\bchild_process/,
    /\bfetch\s*\(\s*['"]https?:/,
    /\baxios\b(?!.*mock)/i,
    /\bPostgres|MongoClient/i,
  ],
  go: [
    /\bnet\/http\b(?!test)/,
    /\bos\/exec/,
    /\bdatabase\/sql/,
  ],
};

const TEST_FILE_PATTERNS: Record<Language, RegExp> = {
  csharp: /\.(test|tests|specs|steps)\.cs$|Tests\.cs$|Test\.cs$|Steps\.cs$|_test\.cs$/i,
  python: /test_.*\.py$|.*_test\.py$/,
  typescript: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  go: /_test\.go$/,
};

const EXISTING_TRAIT_PATTERNS: Record<Language, RegExp[]> = {
  csharp: [/\[Trait\s*\(\s*["']Category["']\s*,\s*["'](\w+)["']/],
  python: [/@pytest\.mark\.(\w+)/, /pytestmark\s*=\s*pytest\.mark\.(\w+)/],
  typescript: [/describe\.skipIf|\/\/\s*@category\s+(\w+)/],
  go: [/\/\/\s*\+build\s+(unit|integration|e2e)/],
};

function detectLanguage(filePath: string): Language | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.cs') return 'csharp';
  if (ext === '.py') return 'python';
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') return 'typescript';
  if (ext === '.go') return 'go';
  return null;
}

function isTestFile(filePath: string, language: Language): boolean {
  return TEST_FILE_PATTERNS[language].test(filePath);
}

function findExistingMarker(content: string, language: Language): string | null {
  for (const pattern of EXISTING_TRAIT_PATTERNS[language]) {
    const match = content.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function classifyFile(filePath: string, content: string, language: Language): Classification {
  const evidence: string[] = [];

  // Count signals
  const e2eHits = E2E_PATTERNS[language].filter((p) => p.test(content));
  const integrationHits = INTEGRATION_PATTERNS[language].filter((p) => p.test(content));
  const unitNegativeHits = UNIT_SIGNALS_NEGATIVE[language].filter((p) => p.test(content));

  let suggested: Category;
  let confidence: Confidence;

  if (e2eHits.length >= 2) {
    suggested = 'E2E';
    confidence = 'high';
    evidence.push(`${e2eHits.length} E2E signals (live infra: Docker / HTTP / Process / live DB)`);
    evidence.push(`Sample pattern matched: ${e2eHits[0].source.slice(0, 80)}`);
  } else if (e2eHits.length === 1) {
    suggested = 'E2E';
    confidence = 'medium';
    evidence.push(`1 E2E signal — review for false positive`);
    evidence.push(`Matched: ${e2eHits[0].source.slice(0, 80)}`);
  } else if (integrationHits.length >= 1 && unitNegativeHits.length === 0) {
    suggested = 'Integration';
    confidence = integrationHits.length >= 2 ? 'high' : 'medium';
    evidence.push(`${integrationHits.length} Integration signals (mocks / fixtures / in-memory DB)`);
    evidence.push(`Sample: ${integrationHits[0].source.slice(0, 80)}`);
  } else if (unitNegativeHits.length === 0 && integrationHits.length === 0) {
    suggested = 'Unit';
    confidence = 'high';
    evidence.push('No HttpClient / DbContext / Process / live network signals');
    evidence.push('No mock or fixture infrastructure detected');
    evidence.push('Pure logic test — type system enforces correctness');
  } else {
    // Mixed signals — conservative classify as Integration
    suggested = 'Integration';
    confidence = 'low';
    evidence.push(`Mixed signals: ${unitNegativeHits.length} unit-negative + ${integrationHits.length} integration`);
    evidence.push('Conservative Integration classification — manual review recommended');
  }

  return {
    file: filePath,
    suggested,
    confidence,
    evidence,
    current_marker: findExistingMarker(content, language),
    language,
  };
}

function walkDir(dir: string, results: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'obj' || entry.name === 'StrykerOutput' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    testDir: '',
    format: 'json',
    language: 'auto',
    apply: false,
    dryRun: false,
    confidenceThreshold: 'high',
  };
  for (const a of argv) {
    if (a.startsWith('--format=')) {
      const v = a.slice('--format='.length);
      if (v !== 'json' && v !== 'markdown') {
        throw new Error(`Invalid --format: ${v}. Must be json or markdown.`);
      }
      args.format = v;
    } else if (a.startsWith('--language=')) {
      const v = a.slice('--language='.length);
      if (v !== 'auto' && v !== 'csharp' && v !== 'python' && v !== 'typescript' && v !== 'go') {
        throw new Error(`Invalid --language: ${v}.`);
      }
      args.language = v;
    } else if (a === '--apply') {
      args.apply = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a.startsWith('--confidence=')) {
      const v = a.slice('--confidence='.length);
      if (v !== 'high' && v !== 'medium' && v !== 'low') {
        throw new Error(`Invalid --confidence: ${v}. Must be high|medium|low.`);
      }
      args.confidenceThreshold = v;
    } else if (!a.startsWith('--') && !args.testDir) {
      args.testDir = a;
    }
  }
  if (!args.testDir) {
    throw new Error('Usage: classify-tests.ts <test-dir> [--format=json|markdown] [--language=auto|csharp|python|typescript|go] [--apply [--dry-run] [--confidence=high|medium|low]]');
  }
  return args;
}

function meetsConfidence(actual: Confidence, threshold: Confidence): boolean {
  const order: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
  return order[actual] >= order[threshold];
}

// strong-tests:skip pure string manipulation: inject Trait above first class declaration; cardinality preserved (1 file in, 1 file out)
function injectCSharpTrait(content: string, category: Category): string {
  // Find first public/internal/private class declaration; insert Trait attribute above it
  const classMatch = content.match(/^([ \t]*)(?:public\s+|internal\s+|private\s+|protected\s+)*(?:abstract\s+|sealed\s+|static\s+)*class\s+\w+/m);
  if (!classMatch || classMatch.index === undefined) {
    throw new Error('No class declaration found — cannot inject Trait');
  }
  const indent = classMatch[1];
  const insertion = `${indent}[Trait("Category", "${category}")]\n`;
  return content.slice(0, classMatch.index) + insertion + content.slice(classMatch.index);
}

// strong-tests:skip pure injection: inject pytestmark at module-level after imports
function injectPythonMarker(content: string, category: Category): string {
  const lower = category.toLowerCase();
  // Insert AFTER imports block + initial docstring; before first def/class
  const lines = content.split('\n');
  let insertIdx = 0;
  let inDocstring = false;
  let inImportBlock = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && (line.startsWith('"""') || line.startsWith("'''"))) {
      inDocstring = !line.endsWith('"""') || line === '"""';
      continue;
    }
    if (inDocstring) {
      if (line.endsWith('"""') || line.endsWith("'''")) inDocstring = false;
      continue;
    }
    if (line.startsWith('import ') || line.startsWith('from ')) {
      insertIdx = i + 1;
      continue;
    }
    if (line === '' && inImportBlock) {
      insertIdx = i + 1;
      continue;
    }
    inImportBlock = false;
    break;
  }
  lines.splice(insertIdx, 0, `pytestmark = pytest.mark.${lower}`, '');
  // Ensure pytest import present
  const result = lines.join('\n');
  if (!result.match(/^import\s+pytest|^from\s+pytest/m)) {
    return 'import pytest\n' + result;
  }
  return result;
}

function applyClassification(classification: Classification, dryRun: boolean): ApplyResult {
  const { file, suggested, language, current_marker } = classification;
  if (current_marker !== null) {
    return { file, action: 'skipped', reason: `existing marker '${current_marker}' — no overwrite` };
  }
  let updatedContent: string;
  const originalContent = fs.readFileSync(file, 'utf-8');
  try {
    if (language === 'csharp') {
      updatedContent = injectCSharpTrait(originalContent, suggested);
    } else if (language === 'python') {
      updatedContent = injectPythonMarker(originalContent, suggested);
    } else {
      return { file, action: 'skipped', reason: `--apply not implemented for ${language} (v0.6.1 roadmap)` };
    }
  } catch (e) {
    return { file, action: 'skipped', reason: `injection failed: ${(e as Error).message}` };
  }
  if (originalContent === updatedContent) {
    return { file, action: 'skipped', reason: 'injection produced no change (unexpected)' };
  }
  // Generate compact diff snippet (first 5 added lines for review)
  const addedLines = updatedContent.split('\n').slice(0, 10).filter((l, i) => l !== originalContent.split('\n')[i]).slice(0, 3);
  const diff = addedLines.length > 0 ? `+ ${addedLines.join('\n+ ')}` : '';
  if (dryRun) {
    return { file, action: 'would-apply', reason: `would inject Category=${suggested} marker`, category: suggested, diff };
  }
  fs.writeFileSync(file, updatedContent, 'utf-8');
  return { file, action: 'applied', reason: `injected Category=${suggested} marker`, category: suggested, diff };
}

function emitMarkdown(classifications: Classification[]): string {
  if (classifications.length === 0) return '_No test files found._';
  const byCategory: Record<Category, Classification[]> = { Unit: [], Integration: [], E2E: [] };
  for (const c of classifications) byCategory[c.suggested].push(c);

  let out = `# Test Classification Report\n\n`;
  out += `Total test files: ${classifications.length} | Unit: ${byCategory.Unit.length} | Integration: ${byCategory.Integration.length} | E2E: ${byCategory.E2E.length}\n\n`;
  out += `**Action**: Apply suggested \`[Trait("Category", "<X>")]\` (C#) / \`@pytest.mark.<x>\` (Python) markers per file AFTER manual review. Stryker.NET по умолчанию runs только Unit tests (--test-case-filter "Category=Unit").\n\n`;

  for (const cat of ['Unit', 'Integration', 'E2E'] as Category[]) {
    if (byCategory[cat].length === 0) continue;
    out += `## ${cat} (${byCategory[cat].length})\n\n`;
    out += `| File | Confidence | Existing Marker | Evidence |\n|---|---|---|---|\n`;
    for (const c of byCategory[cat]) {
      const marker = c.current_marker ?? '_none_';
      const evidence = c.evidence.join('; ').replace(/\|/g, '\\|').slice(0, 120);
      out += `| \`${c.file}\` | ${c.confidence} | ${marker} | ${evidence} |\n`;
    }
    out += `\n`;
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.testDir)) {
    process.stderr.write(`Directory not found: ${args.testDir}\n`);
    process.exit(2);
  }

  const allFiles: string[] = [];
  walkDir(path.resolve(args.testDir), allFiles);

  const classifications: Classification[] = [];
  for (const filePath of allFiles) {
    const lang = args.language === 'auto' ? detectLanguage(filePath) : args.language;
    if (!lang) continue;
    if (!isTestFile(filePath, lang)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const classification = classifyFile(filePath, content, lang);
      classifications.push(classification);
    } catch (e) {
      process.stderr.write(`Failed to read ${filePath}: ${(e as Error).message}\n`);
    }
  }

  if (args.apply) {
    const applyResults: ApplyResult[] = [];
    let appliedCount = 0;
    let skippedCount = 0;
    let belowThreshold = 0;
    for (const c of classifications) {
      if (!meetsConfidence(c.confidence, args.confidenceThreshold)) {
        belowThreshold++;
        applyResults.push({
          file: c.file,
          action: 'skipped',
          reason: `confidence ${c.confidence} below threshold ${args.confidenceThreshold}`,
        });
        continue;
      }
      const result = applyClassification(c, args.dryRun);
      applyResults.push(result);
      if (result.action === 'applied' || result.action === 'would-apply') appliedCount++;
      else skippedCount++;
    }
    const summary = {
      mode: args.dryRun ? 'dry-run' : 'apply',
      confidenceThreshold: args.confidenceThreshold,
      total: classifications.length,
      applied: args.dryRun ? 0 : appliedCount,
      wouldApply: args.dryRun ? appliedCount : 0,
      skipped: skippedCount,
      belowThreshold,
      results: applyResults,
    };
    process.stdout.write(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  if (args.format === 'markdown') {
    process.stdout.write(emitMarkdown(classifications));
  } else {
    process.stdout.write(JSON.stringify(classifications, null, 2));
  }
  process.exit(0);
}

main();
