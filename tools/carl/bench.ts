#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

interface Args {
  project: string;
  fixtureRoot?: string;
  output?: string;
}

interface BenchRow {
  case: string;
  p50Ms: number;
  p95Ms: number;
  chars: number;
  estimatedTokens: number;
  sourceLimit: string;
  domains: string;
}

interface ProvenanceManifest {
  captured_at?: string;
  source_root?: string;
  commands?: Record<string, unknown>;
  source_hashes?: Record<string, string>;
  bench?: { status?: number; stdoutBytes?: number; stderrBytes?: number };
}

function usage(): never {
  process.stderr.write([
    'Usage: node --import tsx tools/carl/bench.ts --project <path> [--fixture-root <path>] [--output <path>]',
    '',
    'Evaluates the CARL recall benchmark gate from real captured CARL evidence.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  let project = '';
  let fixtureRoot: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      project = argv[++i] ?? '';
    } else if (arg === '--fixture-root') {
      fixtureRoot = argv[++i] ?? '';
    } else if (arg === '--output') {
      output = argv[++i] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usage();
    }
  }

  if (!project) usage();
  return {
    project: path.resolve(project),
    fixtureRoot: fixtureRoot ? path.resolve(fixtureRoot) : undefined,
    output: output ? path.resolve(output) : undefined,
  };
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

function parseMetric(value: string, label: string, rowNumber: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} value on benchmark row ${rowNumber}: ${value}`);
  }
  return parsed;
}

function parseBenchTsv(filePath: string): { metadata: Record<string, string>; rows: BenchRow[] } {
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const metadata: Record<string, string> = {};
  const rows: BenchRow[] = [];
  const headerIndex = lines.findIndex((line) => line.startsWith('case\t'));
  if (headerIndex < 0) {
    throw new Error(`Benchmark TSV missing header row: ${filePath}`);
  }

  for (const line of lines.slice(0, headerIndex)) {
    const eq = line.indexOf('=');
    if (eq > 0) metadata[line.slice(0, eq)] = line.slice(eq + 1);
  }

  const expectedHeader = ['case', 'p50_ms', 'p95_ms', 'chars', 'est_tokens', 'threshold', 'domains'];
  const actualHeader = lines[headerIndex].split('\t');
  if (actualHeader.join('\t') !== expectedHeader.join('\t')) {
    throw new Error(`Unexpected benchmark TSV header: ${actualHeader.join(', ')}`);
  }

  for (const [index, line] of lines.slice(headerIndex + 1).entries()) {
    const rowNumber = headerIndex + index + 2;
    const columns = line.split('\t');
    if (columns.length < expectedHeader.length) {
      throw new Error(`Benchmark TSV row ${rowNumber} has ${columns.length} columns, expected ${expectedHeader.length}`);
    }
    rows.push({
      case: columns[0],
      p50Ms: parseMetric(columns[1], 'p50_ms', rowNumber),
      p95Ms: parseMetric(columns[2], 'p95_ms', rowNumber),
      chars: parseMetric(columns[3], 'chars', rowNumber),
      estimatedTokens: parseMetric(columns[4], 'est_tokens', rowNumber),
      sourceLimit: columns[5],
      domains: columns.slice(6).join('\t'),
    });
  }

  return { metadata, rows };
}

function blockedReport(projectRoot: string): Record<string, unknown> {
  return {
    status: 'blocked',
    mode: 'draft',
    reason: 'no real CARL artifact supplied; benchmark gate remains blocked and no numeric pass threshold is invented',
    projectRoot,
    thresholdState: 'draft-no-real-artifact',
    baseline: null,
    regressionGate: {
      enabled: false,
      reason: 'baseline requires a captured real CARL recall artifact or real CARL runtime output',
    },
  };
}

function fixtureReport(projectRoot: string, fixtureRoot: string): Record<string, unknown> {
  const manifestPath = path.join(fixtureRoot, 'manifest.json');
  const benchPath = path.join(fixtureRoot, 'bench.stdout.tsv');
  const ledgerPath = path.join(fixtureRoot, 'real-output', 'README.md');

  for (const filePath of [manifestPath, benchPath, ledgerPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing real CARL benchmark fixture: ${filePath}`);
    }
  }

  const manifest = readJsonObject(manifestPath) as ProvenanceManifest;
  const { metadata, rows } = parseBenchTsv(benchPath);
  const sourceHashes = manifest.source_hashes ?? {};

  if (Object.keys(sourceHashes).length === 0) {
    throw new Error('Real CARL benchmark fixture manifest must include source_hashes');
  }
  if (rows.length === 0) {
    throw new Error('Real CARL benchmark fixture must include at least one benchmark row');
  }

  return {
    status: 'baseline-recorded',
    mode: 'fixture-backed-real-artifact',
    projectRoot,
    provenance: {
      ledger: path.relative(process.cwd(), ledgerPath),
      manifest: path.relative(process.cwd(), manifestPath),
      bench: path.relative(process.cwd(), benchPath),
      capturedAt: manifest.captured_at,
      sourceRoot: manifest.source_root,
      commands: manifest.commands,
      sourceHashes,
      producerGroundTruth: {
        benchStatus: manifest.bench?.status,
        benchStdoutBytes: manifest.bench?.stdoutBytes,
        oldBulkAutoloadChars: metadata.old_bulk_autoload_chars,
        iterations: metadata.iterations,
      },
    },
    thresholdState: 'fixture-source-limits-recorded-not-promoted-to-global-pass-threshold',
    baseline: {
      metrics: rows.map((row) => ({
        case: row.case,
        p50_ms: row.p50Ms,
        p95_ms: row.p95Ms,
        chars: row.chars,
        estimatedTokens: row.estimatedTokens,
        sourceLimit: row.sourceLimit,
        loadedDomains: row.domains,
      })),
    },
    regressionGate: {
      enabled: true,
      comparison: 'future regression checks compare p50_ms, p95_ms, chars, estimatedTokens, and loadedDomains against this baseline artifact',
      thresholdPolicy: 'use captured source limits as fixture evidence only until a dev-pomogator-owned threshold is approved',
    },
  };
}

function writeOutput(outputPath: string | undefined, report: Record<string, unknown>): void {
  if (!outputPath) return;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, outputPath);
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) {
      throw new Error(`Project directory does not exist: ${args.project}`);
    }

    const report = args.fixtureRoot ? fixtureReport(args.project, args.fixtureRoot) : blockedReport(args.project);
    writeOutput(args.output, report);
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
