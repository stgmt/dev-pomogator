#!/usr/bin/env npx tsx
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface SourceEntry {
  kind: 'rule' | 'skill' | 'index';
  path: string;
  hash: string;
  title: string;
  aliases: string[];
  tags: string[];
  status: 'ready' | 'ru:needs-alias';
}

interface CarlManifest {
  managedBy: string;
  schemaVersion: number;
  version?: string;
  generatedAt: string;
  projectRoot: string;
  runtime?: unknown;
  platforms?: unknown;
  managed?: unknown;
  languages: string[];
  sourceHashes: Record<string, string>;
  domains: Array<{
    id: string;
    kind: SourceEntry['kind'];
    sourcePath: string;
    title: string;
    rules: Array<{
      sourcePath: string;
      sourceHash: string;
      aliases: string[];
      tags: string[];
      status: SourceEntry['status'];
    }>;
  }>;
  languageStatus: {
    ru: {
      status: 'ready' | 'partial' | 'project-language-missing';
      generatedAliases: string[];
      sourceHashes: string[];
      readySources: number;
      needsAliasSources: string[];
      lastGeneratedAt: string;
    };
  };
  coverage: {
    totalSources: number;
    readyRuSources: number;
    needsAliasSources: number;
    markers: string[];
  };
}

const CYRILLIC_RE = /[Ѐ-ӿ]/u;
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}_-]{1,}/gu;
const DEFAULT_RU_ALIASES = ['че за ошибка', 'исследуй', 'до конца', 'спеки', 'правила', 'скилы'];
const APPROVED_INDEXES = ['.specs/.onboarding.json'];

function usage(): never {
  process.stderr.write([
    'Usage: node --import tsx tools/carl/adapt-rules.ts --project <path> [--out <path>] [--json]',
    '',
    'Scans .claude/rules/**/*.md and .claude/skills/*/SKILL.md, then writes .carl/carl.json.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseArgs(argv: string[]): { project: string; out?: string; json: boolean } {
  let project = '';
  let out: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      project = argv[++i] ?? '';
    } else if (arg === '--out') {
      out = argv[++i] ?? '';
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
  return { project: path.resolve(project), out: out ? path.resolve(out) : undefined, json };
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function stableDomainId(kind: SourceEntry['kind'], relPath: string): string {
  const normalized = relPath
    .replace(/\/SKILL\.md$/u, '')
    .replace(/\.md$/u, '')
    .replace(/\.json$/u, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toUpperCase();
  return `${kind.toUpperCase()}__${normalized || 'ROOT'}`;
}

function walkFiles(root: string, predicate: (file: string) => boolean): string[] {
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
      } else if (entry.isFile() && predicate(abs)) {
        out.push(abs);
      }
    }
  }
  return out.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}

function collectSourceFiles(projectRoot: string): Array<{ kind: SourceEntry['kind']; abs: string; rel: string }> {
  const rulesRoot = path.join(projectRoot, '.claude', 'rules');
  const skillsRoot = path.join(projectRoot, '.claude', 'skills');

  const ruleFiles = walkFiles(rulesRoot, file => file.endsWith('.md')).map(abs => ({
    kind: 'rule' as const,
    abs,
    rel: toPosix(path.relative(projectRoot, abs)),
  }));

  const skillFiles = walkFiles(skillsRoot, file => path.basename(file) === 'SKILL.md').map(abs => ({
    kind: 'skill' as const,
    abs,
    rel: toPosix(path.relative(projectRoot, abs)),
  }));

  const indexFiles = APPROVED_INDEXES.map(rel => ({ kind: 'index' as const, abs: path.join(projectRoot, rel), rel }))
    .filter(item => fs.existsSync(item.abs));

  return [...ruleFiles, ...skillFiles, ...indexFiles];
}

function extractTitle(content: string, relPath: string): string {
  const heading = content.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  if (heading) return heading;
  return relPath.replace(/^.*\//u, '').replace(/\.md$/u, '').replace(/\.json$/u, '');
}

function normalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/[«»“”"'`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function extractQuotedRussian(content: string): string[] {
  const aliases = new Set<string>();
  const quoteRe = /["'«“]([^"'»”]{2,80}[Ѐ-ӿ][^"'»”]{0,80})["'»”]/gu;
  let match: RegExpExecArray | null;
  while ((match = quoteRe.exec(content)) !== null) {
    const alias = normalizeAlias(match[1]);
    if (alias.length >= 3 && alias.length <= 80) aliases.add(alias);
  }
  return [...aliases];
}

function extractRussianPhrases(content: string): string[] {
  const aliases = new Set<string>();
  for (const quoted of extractQuotedRussian(content)) aliases.add(quoted);

  const lines = content.split(/\r?\n/u);
  for (const line of lines) {
    if (!CYRILLIC_RE.test(line)) continue;
    const cleaned = normalizeAlias(line.replace(/^[#>*\-\s]+/u, ''));
    if (!cleaned) continue;

    for (const phrase of DEFAULT_RU_ALIASES) {
      if (cleaned.includes(phrase)) aliases.add(phrase);
    }

    const words = [...cleaned.matchAll(WORD_RE)].map(m => m[0]).filter(w => CYRILLIC_RE.test(w));
    for (const word of words) {
      if (word.length >= 4 && word.length <= 32) aliases.add(word);
    }

    if (cleaned.length >= 4 && cleaned.length <= 64) aliases.add(cleaned);
  }

  return [...aliases].sort((a, b) => a.localeCompare(b, 'ru'));
}

function classifyTags(entry: { kind: SourceEntry['kind']; rel: string; title: string; aliases: string[] }): string[] {
  const tags = new Set<string>([entry.kind]);
  const haystack = `${entry.rel} ${entry.title} ${entry.aliases.join(' ')}`.toLowerCase();
  if (/spec|спек|requirements|требован|scenario|сценар/u.test(haystack)) tags.add('specs');
  if (/test|bdd|cucumber|тест/u.test(haystack)) tags.add('tests');
  if (/doctor|repair|health|здоров|чин|ремонт/u.test(haystack)) tags.add('doctor');
  if (/debug|ошиб|root|cause|инфра|исслед/u.test(haystack)) tags.add('debug');
  if (/codex/u.test(haystack)) tags.add('codex');
  return [...tags].sort();
}

function buildEntries(projectRoot: string): SourceEntry[] {
  return collectSourceFiles(projectRoot).map(source => {
    const content = fs.readFileSync(source.abs, 'utf-8');
    const title = extractTitle(content, source.rel);
    const aliases = extractRussianPhrases(`${title}\n${content}`);
    const status: SourceEntry['status'] = aliases.length > 0 ? 'ready' : 'ru:needs-alias';
    const base = {
      kind: source.kind,
      path: source.rel,
      hash: sha256(content),
      title,
      aliases,
      status,
    };
    return { ...base, tags: classifyTags(base) };
  });
}

function mergeWithExisting(manifestPath: string, next: CarlManifest): CarlManifest {
  if (!fs.existsSync(manifestPath)) return next;
  try {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
    const user = existing.user;
    const userConfig = existing.userConfig;
    const version = typeof existing.version === 'string' ? existing.version : undefined;
    const runtime = existing.runtime;
    const platforms = existing.platforms;
    const managed = existing.managed;
    const existingLanguages = Array.isArray(existing.languages)
      ? existing.languages.filter((item): item is string => typeof item === 'string')
      : [];
    const languages = [...new Set([...next.languages, ...existingLanguages])];

    return {
      ...next,
      ...(version !== undefined ? { version } : {}),
      ...(runtime !== undefined ? { runtime } : {}),
      ...(platforms !== undefined ? { platforms } : {}),
      ...(managed !== undefined ? { managed } : {}),
      ...(user !== undefined ? { user } : {}),
      ...(userConfig !== undefined ? { userConfig } : {}),
      languages,
    } as CarlManifest;
  } catch {
    return next;
  }
}

function buildManifest(projectRoot: string, entries: SourceEntry[]): CarlManifest {
  const sourceHashes = Object.fromEntries(entries.map(entry => [entry.path, entry.hash]));
  const generatedAliases = [...new Set(entries.flatMap(entry => entry.aliases))].sort((a, b) => a.localeCompare(b, 'ru'));
  const needsAliasSources = entries.filter(entry => entry.status === 'ru:needs-alias').map(entry => entry.path);
  const readySources = entries.length - needsAliasSources.length;
  const status = entries.length === 0
    ? 'project-language-missing'
    : needsAliasSources.length > 0
      ? 'partial'
      : 'ready';
  const generatedAt = new Date().toISOString();

  return {
    managedBy: 'dev-pomogator',
    schemaVersion: 1,
    generatedAt,
    projectRoot,
    languages: generatedAliases.length > 0 ? ['ru', 'en'] : ['en'],
    sourceHashes,
    domains: entries.map(entry => ({
      id: stableDomainId(entry.kind, entry.path),
      kind: entry.kind,
      sourcePath: entry.path,
      title: entry.title,
      rules: [
        {
          sourcePath: entry.path,
          sourceHash: entry.hash,
          aliases: entry.aliases,
          tags: entry.tags,
          status: entry.status,
        },
      ],
    })),
    languageStatus: {
      ru: {
        status,
        generatedAliases,
        sourceHashes: entries.map(entry => entry.hash),
        readySources,
        needsAliasSources,
        lastGeneratedAt: generatedAt,
      },
    },
    coverage: {
      totalSources: entries.length,
      readyRuSources: readySources,
      needsAliasSources: needsAliasSources.length,
      markers: needsAliasSources.length > 0 ? ['ru:needs-alias'] : [],
    },
  };
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) {
    process.stderr.write(`Project directory does not exist: ${args.project}\n`);
    process.exit(1);
  }

  const entries = buildEntries(args.project);
  const manifestPath = args.out ?? path.join(args.project, '.carl', 'carl.json');
  const manifest = mergeWithExisting(manifestPath, buildManifest(args.project, entries));
  atomicWriteJson(manifestPath, manifest);

  const summary = {
    ok: true,
    manifest: manifestPath,
    totalSources: manifest.coverage.totalSources,
    readyRuSources: manifest.coverage.readyRuSources,
    needsAliasSources: manifest.languageStatus.ru.needsAliasSources,
    generatedAliases: manifest.languageStatus.ru.generatedAliases,
    languageStatus: manifest.languageStatus.ru.status,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`CARL adaptation OK: ${summary.totalSources} sources, ${summary.readyRuSources} ru-ready, ${summary.needsAliasSources.length} ru:needs-alias -> ${manifestPath}\n`);
  }
}

main();
