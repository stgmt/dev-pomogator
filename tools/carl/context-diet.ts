#!/usr/bin/env npx tsx
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ContextDietEntry {
  sourcePath: string;
  libraryPath: string;
  sourceHash: string;
  stubBytes: number;
  libraryBytes: number;
  action: 'created-stub' | 'already-managed' | 'skipped-missing-library';
}

export interface ContextDietResult {
  ok: true;
  mode: 'lazy-managed' | 'additive';
  status: 'applied' | 'no-rules' | 'partial';
  rulesTotal: number;
  rulesManaged: number;
  bytesBefore: number;
  bytesAfter: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  libraryRoot: string;
  entries: ContextDietEntry[];
  warnings: string[];
}

const RULES_REL = path.join('.claude', 'rules');
const LIBRARY_REL = path.join('.carl', 'rules');
const REPORT_REL = path.join('.carl', 'context-diet.json');
const STUB_BEGIN = '<!-- dev-pomogator-carl-context-diet:managed-stub v1';
const STUB_END = '<!-- /dev-pomogator-carl-context-diet -->';

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function fromPosix(value: string): string {
  return value.split('/').join(path.sep);
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function walkMarkdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(abs);
      }
    }
  }
  return out.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

function titleFrom(content: string, sourcePath: string): string {
  return content.match(/^#\s+(.+)$/mu)?.[1]?.trim()
    ?? sourcePath.replace(/^.*\//u, '').replace(/\.md$/u, '');
}

export function isManagedContextDietStub(content: string): boolean {
  return content.includes(STUB_BEGIN) && content.includes(STUB_END);
}

export function libraryRelForRule(sourceRel: string): string {
  const normalized = toPosix(sourceRel);
  const prefix = '.claude/rules/';
  const withoutPrefix = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  return toPosix(path.join('.carl', 'rules', fromPosix(withoutPrefix)));
}

export function libraryPathForRule(projectRoot: string, sourceRel: string): string {
  return path.join(projectRoot, fromPosix(libraryRelForRule(sourceRel)));
}

export function readRuleContentForAdaptation(projectRoot: string, sourceAbs: string, sourceRel: string): string {
  const current = fs.readFileSync(sourceAbs, 'utf-8');
  if (!isManagedContextDietStub(current)) return current;

  const libraryPath = libraryPathForRule(projectRoot, sourceRel);
  if (fs.existsSync(libraryPath)) return fs.readFileSync(libraryPath, 'utf-8');
  return current;
}

function atomicWriteText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function atomicWriteJson(filePath: string, value: unknown): void {
  atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildStub(sourceRel: string, libraryRel: string, hash: string, title: string): string {
  return [
    `# ${title}`,
    `${STUB_BEGIN} source=${sourceRel} library=${libraryRel} sha256=${hash} -->`,
    STUB_END,
    `Lazy rule body: \`${libraryRel}\``,
    '',
  ].join('\n');
}

export function applyContextDiet(projectRootInput: string): ContextDietResult {
  const projectRoot = path.resolve(projectRootInput);
  const rulesRoot = path.join(projectRoot, RULES_REL);
  const ruleFiles = walkMarkdownFiles(rulesRoot);
  const entries: ContextDietEntry[] = [];
  const warnings: string[] = [];
  let bytesBefore = 0;
  let bytesAfter = 0;
  let rulesManaged = 0;

  for (const abs of ruleFiles) {
    const sourceRel = toPosix(path.relative(projectRoot, abs));
    const current = fs.readFileSync(abs, 'utf-8');

    const libraryRel = libraryRelForRule(sourceRel);
    const libraryPath = path.join(projectRoot, fromPosix(libraryRel));

    if (isManagedContextDietStub(current)) {
      if (!fs.existsSync(libraryPath)) {
        warnings.push(`${sourceRel}: managed stub exists but ${libraryRel} is missing`);
        bytesBefore += current.length;
        bytesAfter += current.length;
        entries.push({
          sourcePath: sourceRel,
          libraryPath: libraryRel,
          sourceHash: '',
          stubBytes: current.length,
          libraryBytes: 0,
          action: 'skipped-missing-library',
        });
        continue;
      }

      const libraryContent = fs.readFileSync(libraryPath, 'utf-8');
      bytesBefore += libraryContent.length;
      const hash = sha256(libraryContent);
      const stub = buildStub(sourceRel, libraryRel, hash, titleFrom(libraryContent, sourceRel));
      if (stub !== current) atomicWriteText(abs, stub);
      bytesAfter += stub.length;
      rulesManaged += 1;
      entries.push({
        sourcePath: sourceRel,
        libraryPath: libraryRel,
        sourceHash: hash,
        stubBytes: stub.length,
        libraryBytes: libraryContent.length,
        action: 'already-managed',
      });
      continue;
    }

    bytesBefore += current.length;
    const hash = sha256(current);
    atomicWriteText(libraryPath, current);
    const stub = buildStub(sourceRel, libraryRel, hash, titleFrom(current, sourceRel));
    atomicWriteText(abs, stub);
    bytesAfter += stub.length;
    rulesManaged += 1;
    entries.push({
      sourcePath: sourceRel,
      libraryPath: libraryRel,
      sourceHash: hash,
      stubBytes: stub.length,
      libraryBytes: current.length,
      action: 'created-stub',
    });
  }

  const status = ruleFiles.length === 0 ? 'no-rules' : warnings.length > 0 ? 'partial' : 'applied';
  const result: ContextDietResult = {
    ok: true,
    mode: ruleFiles.length === 0 ? 'additive' : 'lazy-managed',
    status,
    rulesTotal: ruleFiles.length,
    rulesManaged,
    bytesBefore,
    bytesAfter,
    estimatedTokensBefore: estimateTokens(bytesBefore),
    estimatedTokensAfter: estimateTokens(bytesAfter),
    libraryRoot: toPosix(path.relative(projectRoot, path.join(projectRoot, LIBRARY_REL))),
    entries,
    warnings,
  };

  atomicWriteJson(path.join(projectRoot, REPORT_REL), result);
  return result;
}

function usage(): never {
  process.stderr.write([
    'Usage: node --import tsx tools/carl/context-diet.ts --project <path> [--json]',
    '',
    'Moves .claude/rules/*.md bodies into .carl/rules and leaves short managed stubs in the auto-loaded path.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseArgs(argv: string[]): { project: string; json: boolean } {
  let project = '';
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      project = argv[++i] ?? '';
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usage();
    }
  }
  if (!project) usage();
  return { project: path.resolve(project), json };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = applyContextDiet(args.project);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`CARL context diet ${result.status}: ${result.rulesManaged}/${result.rulesTotal} rules, ~${result.estimatedTokensBefore} -> ~${result.estimatedTokensAfter} tokens in auto-loaded rules\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
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
