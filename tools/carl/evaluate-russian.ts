#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

interface Args {
  fixtureRoot: string;
  out?: string;
}

interface BenchRow {
  id: string;
  loadedDomains: string[];
  rawDomains: string;
  chars: number;
  estimatedTokens: number;
}

interface PromptCase {
  id: string;
  prompt: string;
  expectedDomains: string[];
  fixtureCase?: string;
  evidenceKind: 'real-sibling-fixture' | 'missing-real-output';
  intent: string;
}

interface CaseResult extends PromptCase {
  actualDomains: string[];
  actualLoadedDomains: string[];
  falsePositiveDomains: string[];
  falseNegativeDomains: string[];
  recommendations: string[];
  evidence: {
    fixtureCase?: string;
    source: string;
    rawLoadedDomains?: string;
    chars?: number;
    estimatedTokens?: number;
  };
}

interface ProvenanceManifest {
  captured_at?: string;
  source_root?: string;
  source_hashes?: Record<string, string>;
  bench?: { status?: number; stdoutBytes?: number; stderrBytes?: number };
}

const EXPECTED_HEADER = ['case', 'p50_ms', 'p95_ms', 'chars', 'est_tokens', 'threshold', 'domains'];
const PROMPT_CASES: PromptCase[] = [
  {
    id: 'neutral-continue',
    prompt: 'продолжай',
    intent: 'Neutral Russian continuation must stay on the small global context only.',
    expectedDomains: ['GLOBAL'],
    fixtureCase: 'neutral-continue',
    evidenceKind: 'real-sibling-fixture',
  },
  {
    id: 'ru-debug-root-cause',
    prompt: 'че за ошибка, исследуй до конца, не списывай на инфру',
    intent: 'Russian debugging/root-cause prompt must load reproduce and anti-infra-blame rules.',
    expectedDomains: ['GLOBAL', 'CORE__DONT_BLAME_INFRA_BEFORE_TRACING', 'CORE__REPRODUCE_NOT_THEORIZE'],
    fixtureCase: 'ru-debug-root-cause',
    evidenceKind: 'real-sibling-fixture',
  },
  {
    id: 'specs-workflow',
    prompt: 'сделай спеки по фиче и проверь feature-index',
    intent: 'Russian specs workflow prompt must load the project feature-index domain.',
    expectedDomains: ['GLOBAL', 'PROJECT__FEATURE_INDEX'],
    fixtureCase: 'feature-index',
    evidenceKind: 'real-sibling-fixture',
  },
  {
    id: 'changed-rule-skill',
    prompt: 'обнови правило и скилл, добавь русские алиасы и проверь хук',
    intent: 'Changed rule/skill prompt needs a dev-pomogator-owned fixture before readiness can be claimed.',
    expectedDomains: ['GLOBAL', 'PROJECT__FEATURE_INDEX'],
    evidenceKind: 'missing-real-output',
  },
  {
    id: 'render-legibility',
    prompt: 'текст не виден в remotion рендере, поправь читабельность',
    intent: 'Russian render-legibility prompt in the sibling repo must load render-specific domains.',
    expectedDomains: ['GLOBAL', 'REELS__LEGIBILITY_DESIGN_SYSTEM', 'REELS__REMOTION_REFERENCE'],
    fixtureCase: 'render-legibility',
    evidenceKind: 'real-sibling-fixture',
  },
  {
    id: 'deferred-codex-ru-debug',
    prompt: 'кодекс, че за ошибка, воспроизведи и не теоризируй',
    intent: 'Deferred Codex path still proves only output shape and Russian debug matching from sibling evidence.',
    expectedDomains: ['GLOBAL', 'CORE__REPRODUCE_NOT_THEORIZE'],
    fixtureCase: 'codex-ru-debug',
    evidenceKind: 'real-sibling-fixture',
  },
];

function usage(): never {
  process.stderr.write([
    'Usage: node --import tsx tools/carl/evaluate-russian.ts --fixture-root <path> [--out <path>]',
    '',
    'Evaluates Russian CARL prompt coverage against real fixture-backed CARL output.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  let fixtureRoot = '';
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture-root') {
      fixtureRoot = argv[++i] ?? '';
    } else if (arg === '--out') {
      out = argv[++i] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usage();
    }
  }

  if (!fixtureRoot) usage();
  return { fixtureRoot: path.resolve(fixtureRoot), out: out ? path.resolve(out) : undefined };
}

function parseNumber(value: string, label: string, rowNumber: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} value on benchmark row ${rowNumber}: ${value}`);
  }
  return parsed;
}

function extractDomainIds(rawDomains: string): string[] {
  const out: string[] = [];
  for (const match of rawDomains.matchAll(/\[([^\]]+)\]/gu)) {
    out.push(match[1]);
  }
  return out;
}

function parseBenchRows(filePath: string): Map<string, BenchRow> {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const headerIndex = lines.findIndex((line) => line.startsWith('case\t'));
  if (headerIndex < 0) {
    throw new Error(`Benchmark TSV missing header row: ${filePath}`);
  }

  const actualHeader = lines[headerIndex].split('\t');
  if (actualHeader.join('\t') !== EXPECTED_HEADER.join('\t')) {
    throw new Error(`Unexpected benchmark TSV header: ${actualHeader.join(', ')}`);
  }

  const rows = new Map<string, BenchRow>();
  for (const [index, line] of lines.slice(headerIndex + 1).entries()) {
    const rowNumber = headerIndex + index + 2;
    const columns = line.split('\t');
    if (columns.length < EXPECTED_HEADER.length) {
      throw new Error(`Benchmark TSV row ${rowNumber} has ${columns.length} columns, expected ${EXPECTED_HEADER.length}`);
    }
    const rawDomains = columns.slice(6).join('\t');
    rows.set(columns[0], {
      id: columns[0],
      loadedDomains: extractDomainIds(rawDomains),
      rawDomains,
      chars: parseNumber(columns[3], 'chars', rowNumber),
      estimatedTokens: parseNumber(columns[4], 'est_tokens', rowNumber),
    });
  }
  return rows;
}

function readManifest(filePath: string): ProvenanceManifest {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }
  return parsed as ProvenanceManifest;
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function recommendationsFor(result: Omit<CaseResult, 'recommendations'>): string[] {
  const recommendations: string[] = [];
  if (result.evidenceKind === 'missing-real-output') {
    recommendations.push('capture real dev-pomogator CARL output for this Russian changed-rule/skill prompt before claiming runtime readiness');
    recommendations.push('add project-owned Russian aliases for "обнови правило", "скилл", "русские алиасы", and "проверь хук"');
  }
  if (result.falseNegativeDomains.length > 0) {
    recommendations.push(`expand alias coverage or Cyrillic normalization so expected domains load: ${result.falseNegativeDomains.join(', ')}`);
    recommendations.push('add a fixture-backed regression case for this prompt after the alias update is generated from project sources');
  }
  if (result.falsePositiveDomains.length > 0) {
    recommendations.push(`tighten domain ranking or context budget caps to avoid unrelated domains: ${result.falsePositiveDomains.join(', ')}`);
  }
  if (recommendations.length === 0) {
    recommendations.push('no optimization gap observed in the captured fixture; keep this case as a regression baseline');
  }
  return recommendations;
}

function evaluateCase(promptCase: PromptCase, rows: Map<string, BenchRow>, fixtureRoot: string): CaseResult {
  const row = promptCase.fixtureCase ? rows.get(promptCase.fixtureCase) : undefined;
  if (promptCase.fixtureCase && !row) {
    throw new Error(`Missing benchmark fixture row for prompt case ${promptCase.id}: ${promptCase.fixtureCase}`);
  }

  const actualDomains = row?.loadedDomains ?? [];
  const baseResult: Omit<CaseResult, 'recommendations'> = {
    ...promptCase,
    actualDomains,
    actualLoadedDomains: actualDomains,
    falsePositiveDomains: difference(actualDomains, promptCase.expectedDomains),
    falseNegativeDomains: difference(promptCase.expectedDomains, actualDomains),
    evidence: row
      ? {
          fixtureCase: promptCase.fixtureCase,
          source: path.relative(process.cwd(), path.join(fixtureRoot, 'bench.stdout.tsv')),
          rawLoadedDomains: row.rawDomains,
          chars: row.chars,
          estimatedTokens: row.estimatedTokens,
        }
      : {
          source: 'no real fixture-backed output exists for this prompt in the captured sibling artifact',
        },
  };

  return {
    ...baseResult,
    recommendations: recommendationsFor(baseResult),
  };
}

function writeOutput(outputPath: string | undefined, report: Record<string, unknown>): void {
  if (!outputPath) return;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, outputPath);
}

function buildReport(fixtureRoot: string): Record<string, unknown> {
  const benchPath = path.join(fixtureRoot, 'bench.stdout.tsv');
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  const ledgerPath = path.join(fixtureRoot, 'real-output', 'README.md');

  for (const filePath of [benchPath, manifestPath, ledgerPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing Russian CARL evaluation evidence: ${filePath}`);
    }
  }

  const rows = parseBenchRows(benchPath);
  const manifest = readManifest(manifestPath);
  const cases = PROMPT_CASES.map((promptCase) => evaluateCase(promptCase, rows, fixtureRoot));
  const falsePositiveCount = cases.reduce((sum, item) => sum + item.falsePositiveDomains.length, 0);
  const falseNegativeCount = cases.reduce((sum, item) => sum + item.falseNegativeDomains.length, 0);
  const missingRealOutputCount = cases.filter((item) => item.evidenceKind === 'missing-real-output').length;
  const casesWithGaps = cases.filter(
    (item) => item.falsePositiveDomains.length > 0 || item.falseNegativeDomains.length > 0 || item.evidenceKind === 'missing-real-output',
  ).length;

  return {
    status: casesWithGaps > 0 ? 'completed-with-gaps' : 'completed',
    mode: 'fixture-backed-sibling-real-output',
    provenance: {
      ledger: path.relative(process.cwd(), ledgerPath),
      manifest: path.relative(process.cwd(), manifestPath),
      bench: path.relative(process.cwd(), benchPath),
      capturedAt: manifest.captured_at,
      sourceRoot: manifest.source_root,
      sourceHashes: manifest.source_hashes ?? {},
      producerGroundTruth: {
        benchStatus: manifest.bench?.status,
        benchStdoutBytes: manifest.bench?.stdoutBytes,
      },
    },
    runtimeReadiness: {
      devPomogator: false,
      statement: 'fixture-backed sibling output is accepted for CARL output shape and Russian coverage gaps only; it is not dev-pomogator runtime readiness',
    },
    summary: {
      totalCases: cases.length,
      casesWithGaps,
      falsePositiveCount,
      falseNegativeCount,
      missingRealOutputCount,
    },
    cases,
    optimizationRecommendations: cases.flatMap((item) => item.recommendations.map((recommendation) => ({ case: item.id, recommendation }))),
    trustBoundary: 'Sibling fixture evidence must not be reported as dev-pomogator runtime readiness.',
  };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = buildReport(args.fixtureRoot);
    writeOutput(args.out, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
// Не запускать CLI, когда модуль инлайнен в бандл: там import.meta.url
// схлопывается в URL бандла и guard сработал бы при любом его запуске.
// Имя файла НЕ проверяем — мутационные копии запускаются под другими именами.
if (import.meta.url === invokedPath && !import.meta.url.endsWith('.bundle.mjs')) {
  main();
}
