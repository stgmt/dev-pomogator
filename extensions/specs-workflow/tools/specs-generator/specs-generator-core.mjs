import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_FORMATS = new Set(['json', 'text', 'human', 'task-table']);
const PHASE_ORDER = ['Discovery', 'Context', 'Requirements', 'Finalization'];

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLogTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateOnly(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeSlashes(filePath) {
  return filePath.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);

  while (current && fs.existsSync(current)) {
    const hasMarker = ['.git', 'package.json', '.root-artifacts.yaml']
      .some((marker) => fs.existsSync(path.join(current, marker)));

    if (hasMarker) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextAtomicSync(targetPath, content) {
  const tempPath = `${targetPath}.tmp`;
  ensureDirSync(path.dirname(targetPath));
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, targetPath);
}

function writeJsonAtomicSync(targetPath, value) {
  writeTextAtomicSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeReadLines(filePath) {
  const content = safeReadText(filePath);
  return content == null ? [] : content.split(/\r?\n/);
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

function listDirectoryEntries(dirPath, type) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => {
      if (type === 'file') {
        return entry.isFile();
      }
      if (type === 'directory') {
        return entry.isDirectory();
      }
      return true;
    });
}

function collectFilesRecursive(dirPath, matcher) {
  const results = [];

  if (!fs.existsSync(dirPath)) {
    return results;
  }

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (!matcher || matcher(fullPath, entry)) {
        results.push(fullPath);
      }
    }
  };

  walk(dirPath);
  return results;
}

function resolvePath(repoRoot, inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.join(repoRoot, inputPath);
}

/**
 * Validate that targetDir is a subdirectory inside .specs/ (not .specs/ itself, not repo root).
 * Prevents .progress.json from being created outside .specs/<feature>/.
 */
function assertSpecSubdir(targetDir, repoRoot) {
  const rel = path.relative(repoRoot, targetDir).replace(/\\/g, '/');
  // Must start with .specs/ and have a subdirectory component
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== '.specs') {
    throw new CliError(
      `Path must be inside .specs/<feature>/ directory, got: ${rel || '.'}. Example: -Path ".specs/my-feature"`,
      1,
    );
  }
}

function toTitleFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseArgs(argv, definitions) {
  const flagMap = new Map();
  const result = {};

  for (const definition of definitions) {
    flagMap.set(definition.flag, definition);
    if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
      result[definition.key] = definition.default;
    }
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const definition = flagMap.get(arg);

    if (!definition) {
      throw new CliError(`Unknown option: ${arg}`, 2);
    }

    if (definition.type === 'boolean') {
      result[definition.key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined) {
      throw new CliError(`Missing value for ${arg}`, 2);
    }

    result[definition.key] = value;
    index += 1;
  }

  for (const definition of definitions) {
    if (definition.required && (result[definition.key] === undefined || result[definition.key] === '')) {
      throw new CliError(`Missing required option: ${definition.flag}`, 2);
    }

    if (result[definition.key] !== undefined && definition.validate && !definition.validate(result[definition.key])) {
      throw new CliError(definition.errorMessage || `Invalid value for ${definition.flag}`, 2);
    }
  }

  return result;
}

function createLogger({ logsDir, logFile, verboseOutput }) {
  return (level, message) => {
    const logLine = `[${formatLogTimestamp()}] [${level}] ${message}`;

    try {
      ensureDirSync(logsDir);
      fs.appendFileSync(logFile, `${logLine}\n`, 'utf8');
    } catch {
      // Logging should never break the command flow.
    }

    if (verboseOutput) {
      process.stdout.write(`${logLine}\n`);
    }
  };
}

function createCommandContext(options) {
  const repoRoot = findRepoRoot(SCRIPT_DIR);
  const logsDir = path.join(SCRIPT_DIR, 'logs');
  const logFile = options.logFile || path.join(logsDir, `specs-generator-${formatDateOnly()}.log`);
  const log = createLogger({
    logsDir,
    logFile,
    verboseOutput: Boolean(options.verboseOutput),
  });

  return { repoRoot, logsDir, logFile, log };
}

function emitResult(format, result, textRenderer) {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (typeof textRenderer === 'function') {
    process.stdout.write(`${textRenderer(result)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

function assertFormat(format) {
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new CliError(`Invalid value for -Format. Allowed: json, text, human, task-table`, 2);
  }
}

/**
 * Parse TASKS.md and build summary rows used by spec-status -Format task-table.
 * Supports both bullet (`- [ ] title`) and heading (`### 📋 \`task-id\``) formats.
 * Used by task-board-forms skill for idempotent Task Summary Table generation.
 */
function parseTasksForTable(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const rows = [];
  let currentPhase = '';
  let bulletCounter = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const phaseMatch = line.match(/^##\s+(Phase\s+[-\d]+\S*.*?)$/i);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }
    const bulletMatch = line.match(/^-\s+\[([ x])\]\s+(.+)$/);
    const headingMatch = line.match(/^###\s+📋\s+`([^`]+)`/);
    if (!bulletMatch && !headingMatch) continue;

    let id, title, status = 'TODO';
    if (bulletMatch) {
      bulletCounter++;
      title = bulletMatch[2].split('—')[0].trim();
      // derive ID from phase + counter
      const phaseTag = currentPhase.match(/Phase\s+(-?\d+)/i);
      id = phaseTag ? `T${phaseTag[1]}-${String(bulletCounter).padStart(2, '0')}` : `T${bulletCounter}`;
      if (bulletMatch[1] === 'x') status = 'DONE';
    } else {
      id = headingMatch[1];
      // find the blockquote description
      const nextLine = lines[i + 1] || '';
      title = nextLine.replace(/^>\s*/, '').trim() || id;
    }

    // Gather body for status/est/depends
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (/^##\s/.test(lines[j])) break;
      if (bulletMatch && /^-\s+\[[ x]\]/.test(lines[j]) && !/^\s/.test(lines[j])) break;
      if (headingMatch && /^###\s+📋/.test(lines[j])) break;
    }
    const body = lines.slice(i, j).join('\n');
    const statusMatch = body.match(/Status:\s*(TODO|IN_PROGRESS|DONE|BLOCKED)/);
    if (statusMatch) status = statusMatch[1];
    const estMatch = body.match(/Est:\s*(\d+\s*m)/i);
    const est = estMatch ? estMatch[1] : '—';
    const depsMatch = body.match(/(?:depends|_depends:)[\s*_]*([^_\n]+)/i);
    const depends = depsMatch ? depsMatch[1].replace(/\*/g, '').trim() : '—';

    rows.push({ id, title: title.slice(0, 80), status, depends, phase: currentPhase || '—', est });
  }
  return rows;
}

/**
 * Render the parsed tasks as a markdown table.
 */
function renderTaskTable(rows) {
  const header = '| ID | Title | Status | Depends | Phase | Est. |\n|----|-------|--------|---------|-------|------|';
  const body = rows
    .map(
      (r) => `| ${r.id} | ${r.title} | ${r.status} | ${r.depends} | ${r.phase} | ${r.est} |`,
    )
    .join('\n');
  return rows.length > 0 ? `${header}\n${body}` : header;
}

/**
 * Render spec-status result as human-readable progress block.
 * Used by AI to include in chat messages for user visibility.
 */
function renderHumanProgress(result) {
  const phaseOrder = ['Discovery', 'Context', 'Requirements', 'Finalization', 'Complete'];
  const phaseIdx = phaseOrder.indexOf(result.phase);
  const phaseNum = phaseIdx >= 0 ? Math.min(phaseIdx + 1, 4) : 1;
  const slug = result.path.replace(/^\.specs\//, '');

  const fileEntries = Object.entries(result.files || {});
  const totalFiles = fileEntries.length;
  const doneFiles = fileEntries.filter(([, f]) => f.status === 'complete').length;

  const checklist = fileEntries
    .map(([name, f]) => {
      const icon = f.status === 'complete' ? '✓' : '○';
      const short = name.replace(/\.md$/, '').replace(/\.feature$/, '⚡');
      return `${icon} ${short}`;
    })
    .join('  ');

  const pct = Math.round(result.progress_percent || 0);
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  const lines = [
    `📊 Spec Progress: ${slug}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Phase ${phaseNum}/4: ${result.phase}${result.sub_phase ? ` (${result.sub_phase})` : ''}`,
    `Files: ${checklist}`,
    `Progress: ${bar} ${pct}% (${doneFiles}/${totalFiles})`,
    `Next: ${result.next_action || 'N/A'}`,
  ];

  if (result.blockers && result.blockers.length > 0) {
    lines.push(`Blockers: ${result.blockers.join('; ')}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

function makeErrorResult(message) {
  return { error: message };
}

function ensureRepoRoot(context, format, messagePrefix = 'Repository root not found') {
  if (context.repoRoot) {
    return context.repoRoot;
  }

  throw new CliError(`${messagePrefix} from ${SCRIPT_DIR}`, format === 'json' ? 1 : 1);
}

function isJsonLikePlaceholder(value) {
  return /^\{[\s\S]*:[\s\S]*\}$/.test(value) || value === '{' || value === '}' || value === '{}';
}

function listPlaceholders(content, lines) {
  const placeholders = new Map();

  lines.forEach((line, lineIndex) => {
    const matches = line.match(/\{[^}]+\}/g) || [];
    for (const match of matches) {
      if (isJsonLikePlaceholder(match)) {
        continue;
      }

      const existing = placeholders.get(match);
      if (existing) {
        existing.count += 1;
      } else {
        placeholders.set(match, {
          name: match,
          line: lineIndex + 1,
          count: 1,
        });
      }
    }
  });

  return [...placeholders.values()];
}

function replaceLiteralAll(content, searchValue, replacementValue) {
  return content.split(searchValue).join(String(replacementValue));
}

function toAnchorSlug(header) {
  let slug = header.toLowerCase();
  slug = slug.replace(/[\*_`\[\]\(\)]/g, '');
  slug = slug.replace(/@feature\d+/g, '');
  slug = slug.replace(/[^\w\s-]/g, '');
  slug = slug.trim();
  slug = slug.replace(/\s+/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/-+$/g, '');
  return slug;
}

function countMatches(text, pattern, flags = 'g') {
  const regex = new RegExp(pattern.source || pattern, flags.includes('g') ? flags : `${flags}g`);
  return [...text.matchAll(regex)].length;
}

function readJsonIfExists(filePath) {
  const content = safeReadText(filePath);
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function createDefaultProgressState(targetDir, currentPhase) {
  // Schema v3 — spec-generator-v3 form-guards feature.
  // Form-guard hooks (user-story-form-guard etc.) activate only when version >= 3,
  // so new specs get strict validation while existing v1/v2 specs pass unblocked.
  return {
    version: 3,
    featureSlug: path.basename(targetDir),
    createdAt: new Date().toISOString(),
    currentPhase,
    phases: {
      Discovery: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
      Context: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
      Requirements: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
      Finalization: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
    },
  };
}

function testPhaseComplete(phaseFiles, filesMap) {
  for (const fileName of phaseFiles) {
    if (filesMap[fileName] && filesMap[fileName].status !== 'complete') {
      return false;
    }
  }
  return true;
}

function testPhaseFilesExist(phaseFiles, filesMap) {
  for (const fileName of phaseFiles) {
    if (filesMap[fileName] && filesMap[fileName].status !== 'not_created') {
      return true;
    }
  }
  return false;
}

function countSpecStatusPlaceholders(content) {
  let contentForCheck = content.replace(/```[\s\S]*?```/g, '');
  contentForCheck = contentForCheck.replace(/`[^`]+`/g, '');

  const matches = contentForCheck.match(/\{[^}]+\}/g) || [];
  let placeholderCount = 0;

  for (const match of matches) {
    if (isJsonLikePlaceholder(match)) {
      continue;
    }

    if (/^\{[a-z][a-z0-9_]*\}$/.test(match)) {
      continue;
    }

    placeholderCount += 1;
  }

  return placeholderCount;
}

function countOpenQuestions(content) {
  const lines = content.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*-\s*\[ \]\s*.+$/.test(lines[i])) {
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (/>\s*DEFERRED:/i.test(prevLine)) {
        continue;
      }
      count++;
    }
  }
  return count;
}

function getSpecStatusFileState(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: 'not_created', placeholders: 0, items: 0 };
  }

  const content = safeReadText(filePath) || '';
  if (!content || content.trim().length < 50) {
    return { status: 'empty', placeholders: 0, items: 0 };
  }

  const placeholderCount = countSpecStatusPlaceholders(content);
  let itemCount = countMatches(content, /## (FR|UC|AC|NFR)-?\d*:/);
  if (itemCount === 0) {
    itemCount = countMatches(content, /^## .+$/m, 'gm');
  }

  if (placeholderCount === 0) {
    if (filePath.endsWith('RESEARCH.md')) {
      const openQ = countOpenQuestions(content);
      if (openQ > 0) {
        return { status: 'partial', placeholders: 0, items: itemCount, openQuestions: openQ };
      }
    }
    return { status: 'complete', placeholders: 0, items: itemCount };
  }

  return { status: 'partial', placeholders: placeholderCount, items: itemCount };
}

function getSectionMatches(text, regex) {
  return [...text.matchAll(regex)];
}

function commandScaffoldSpec(argv) {
  const options = parseArgs(argv, [
    { flag: '-Name', key: 'name', type: 'string', required: true },
    { flag: '-Domain', key: 'domain', type: 'string', default: '' },
    { flag: '-Force', key: 'force', type: 'boolean', default: false },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  const { log } = context;

  if (!context.repoRoot) {
    const result = {
      success: false,
      error: 'Repo root not found. Run this script inside the repository.',
    };
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 1;
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(options.name)) {
    const result = {
      success: false,
      error: "Invalid name format. Use kebab-case (e.g., 'hook-worklog-checker')",
    };
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 2;
  }

  const repoRoot = context.repoRoot;
  const templatesDir = path.join(SCRIPT_DIR, 'templates');
  const specsDir = path.join(repoRoot, '.specs');
  const targetDir = path.join(specsDir, options.name);

  log('INFO', `Creating spec folder: ${targetDir}`);

  if (fs.existsSync(targetDir)) {
    if (options.force) {
      log('WARN', 'Folder exists, removing due to -Force flag');
      fs.rmSync(targetDir, { recursive: true, force: true });
    } else {
      const result = {
        success: false,
        error: `Folder already exists: ${targetDir}. Use -Force to overwrite.`,
      };
      emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
      return 1;
    }
  }

  try {
    ensureDirSync(targetDir);
    log('INFO', `Created directory: ${targetDir}`);
  } catch (error) {
    const result = {
      success: false,
      error: `Failed to create directory: ${error.message}`,
    };
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 1;
  }

  const templateMappings = [
    ['USER_STORIES.md.template', 'USER_STORIES.md'],
    ['USE_CASES.md.template', 'USE_CASES.md'],
    ['RESEARCH.md.template', 'RESEARCH.md'],
    ['REQUIREMENTS.md.template', 'REQUIREMENTS.md'],
    ['FR.md.template', 'FR.md'],
    ['NFR.md.template', 'NFR.md'],
    ['ACCEPTANCE_CRITERIA.md.template', 'ACCEPTANCE_CRITERIA.md'],
    ['DESIGN.md.template', 'DESIGN.md'],
    ['TASKS.md.template', 'TASKS.md'],
    ['FILE_CHANGES.md.template', 'FILE_CHANGES.md'],
    ['README.md.template', 'README.md'],
    ['CHANGELOG.md.template', 'CHANGELOG.md'],
    ['feature.template', `${options.name}.feature`],
    ['SCHEMA.md.template', `${options.name}_SCHEMA.md`],
    ['FIXTURES.md.template', 'FIXTURES.md'],
  ];

  const createdFiles = [];

  for (const [templateName, targetName] of templateMappings) {
    const templatePath = path.join(templatesDir, templateName);
    const targetPath = path.join(targetDir, targetName);

    if (!fs.existsSync(templatePath)) {
      log('WARN', `Template not found: ${templateName}`);
      continue;
    }

    let content = safeReadText(templatePath) ?? '';

    if (templateName === 'README.md.template') {
      content = content.replace(/\{Feature Name\}/g, toTitleFromSlug(options.name));
    }

    if (templateName === 'feature.template' && options.domain) {
      content = content.replace(/\{DOMAIN\}/g, options.domain);
    }

    fs.writeFileSync(targetPath, content, 'utf8');
    log('INFO', `Copying template: ${templateName} -> ${targetName}`);
    createdFiles.push(targetName);
  }

  const progressPath = path.join(targetDir, '.progress.json');
  try {
    writeJsonAtomicSync(progressPath, createDefaultProgressState(targetDir, 'Discovery'));
    log('INFO', 'Created .progress.json');
  } catch (error) {
    log('WARN', `Failed to create .progress.json: ${error.message}`);
    removeIfExists(`${progressPath}.tmp`);
  }

  log('INFO', `Created ${createdFiles.length} files in ${targetDir}`);

  const result = {
    success: true,
    path: `.specs/${options.name}`,
    created_files: createdFiles,
    next_step: 'Fill USER_STORIES.md first',
  };

  emitResult(options.format, result, (value) => `SUCCESS: Created spec folder at ${value.path}`);
  return 0;
}

function commandFillTemplate(argv) {
  const options = parseArgs(argv, [
    { flag: '-File', key: 'file', type: 'string', required: true },
    { flag: '-Values', key: 'values', type: 'string', default: '' },
    { flag: '-ListPlaceholders', key: 'listPlaceholders', type: 'boolean', default: false },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  if (!context.repoRoot) {
    throw new CliError(`Repository root not found from ${SCRIPT_DIR}`, 1);
  }

  const filePath = resolvePath(context.repoRoot, options.file);
  const { log } = context;

  if (!fs.existsSync(filePath)) {
    const result = makeErrorResult(`File not found: ${options.file}`);
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 1;
  }

  const content = safeReadText(filePath) ?? '';
  const lines = safeReadLines(filePath);

  log('INFO', `Processing: ${options.file}`);

  if (options.listPlaceholders) {
    const placeholders = listPlaceholders(content, lines);
    const result = {
      file: options.file,
      placeholders,
      total: placeholders.reduce((sum, placeholder) => sum + placeholder.count, 0),
    };
    emitResult(options.format, result, (value) => `Placeholders in ${value.file}: ${value.total}`);
    return 0;
  }

  if (!options.values) {
    const result = makeErrorResult('Either -Values or -ListPlaceholders is required');
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 2;
  }

  let valuesObject;
  try {
    valuesObject = JSON.parse(options.values);
  } catch (error) {
    const result = makeErrorResult(`Invalid JSON in -Values: ${error.message}`);
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 2;
  }

  log('INFO', `Filling: ${options.file}`);

  const placeholdersBefore = listPlaceholders(content, lines);
  const totalBefore = placeholdersBefore.reduce((sum, placeholder) => sum + placeholder.count, 0);

  let newContent = content;
  const filled = [];

  for (const key of Object.keys(valuesObject)) {
    const placeholder = `{${key}}`;
    const matchCount = newContent.includes(placeholder) ? newContent.split(placeholder).length - 1 : 0;
    if (matchCount > 0) {
      newContent = replaceLiteralAll(newContent, placeholder, valuesObject[key]);
      filled.push(placeholder);
      log('INFO', `Replacing ${placeholder} -> ${valuesObject[key]} (${matchCount} occurrences)`);
    }
  }

  fs.writeFileSync(filePath, newContent, 'utf8');

  const linesAfter = safeReadLines(filePath);
  const contentAfter = safeReadText(filePath) ?? '';
  const placeholdersAfter = listPlaceholders(contentAfter, linesAfter);
  const totalAfter = placeholdersAfter.reduce((sum, placeholder) => sum + placeholder.count, 0);
  const remaining = placeholdersAfter.map((placeholder) => placeholder.name);

  log('INFO', `Filled ${filled.length} placeholders, ${totalAfter} remaining`);

  const result = {
    file: options.file,
    placeholders_before: totalBefore,
    placeholders_after: totalAfter,
    filled,
    remaining,
  };

  emitResult(options.format, result, (value) => `Filled placeholders in ${value.file}`);
  return 0;
}

function commandValidateSpec(argv) {
  const options = parseArgs(argv, [
    { flag: '-Path', key: 'inputPath', type: 'string', required: true },
    { flag: '-ErrorsOnly', key: 'errorsOnly', type: 'boolean', default: false },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  if (!context.repoRoot) {
    throw new CliError(`Repository root not found from ${SCRIPT_DIR}`, 1);
  }

  const targetDir = resolvePath(context.repoRoot, options.inputPath);
  assertSpecSubdir(targetDir, context.repoRoot);
  const { log } = context;

  if (!fs.existsSync(targetDir)) {
    const result = {
      valid: false,
      path: options.inputPath,
      error: `Spec folder not found: ${options.inputPath}`,
    };
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 1;
  }

  const requiredFiles = [
    'USER_STORIES.md',
    'USE_CASES.md',
    'RESEARCH.md',
    'REQUIREMENTS.md',
    'FR.md',
    'NFR.md',
    'ACCEPTANCE_CRITERIA.md',
    'DESIGN.md',
    'TASKS.md',
    'FILE_CHANGES.md',
    'CHANGELOG.md',
    'README.md',
  ];

  const nfrSections = ['Performance', 'Security', 'Reliability', 'Usability'];
  const existingFiles = listDirectoryEntries(targetDir, 'file').map((entry) => entry.name);
  const totalFiles = existingFiles.length;
  const errors = [];
  const warnings = [];

  let validFiles = 0;
  let filesWithErrors = 0;
  let filesWithWarnings = 0;
  let totalPlaceholders = 0;

  log('INFO', `Validating: ${options.inputPath}`);
  log('INFO', 'Checking STRUCTURE rule...');

  for (const fileName of requiredFiles) {
    if (!existingFiles.includes(fileName)) {
      errors.push({
        file: fileName,
        line: 0,
        rule: 'STRUCTURE',
        message: `Required file missing: ${fileName}`,
      });
      log('ERROR', `Missing required file: ${fileName}`);
    }
  }

  const featureFiles = existingFiles.filter((fileName) => fileName.endsWith('.feature'));
  if (featureFiles.length === 0) {
    warnings.push({
      file: '*.feature',
      rule: 'STRUCTURE',
      message: 'No .feature file found',
    });
    log('WARN', 'No .feature file found');
  }

  for (const fileName of existingFiles) {
    const filePath = path.join(targetDir, fileName);
    const content = safeReadText(filePath);
    if (!content) {
      continue;
    }

    let fileHasErrors = false;
    let fileHasWarnings = false;

    const placeholderMatches = content.match(/\{[^}]+\}/g) || [];
    for (const placeholder of placeholderMatches) {
      if (isJsonLikePlaceholder(placeholder)) {
        continue;
      }

      warnings.push({
        file: fileName,
        rule: 'PLACEHOLDER',
        message: `Unfilled placeholder found: ${placeholder}`,
      });
      fileHasWarnings = true;
      totalPlaceholders += 1;
    }

    if (fileName === 'FR.md') {
      log('INFO', 'Checking FR_FORMAT rule...');
      if (!/## FR-(\d+):/i.test(content)) {
        errors.push({
          file: fileName,
          line: 0,
          rule: 'FR_FORMAT',
          message: 'No FR-N headers found. Expected format: ## FR-N: {Название}',
        });
        fileHasErrors = true;
        log('ERROR', `${fileName}: No FR-N headers found`);
      }
    }

    if (fileName === 'USE_CASES.md') {
      log('INFO', 'Checking UC_FORMAT rule...');
      if (!/## UC-(\d+):/i.test(content)) {
        errors.push({
          file: fileName,
          line: 0,
          rule: 'UC_FORMAT',
          message: 'No UC-N headers found. Expected format: ## UC-N: {Название}',
        });
        fileHasErrors = true;
        log('ERROR', `${fileName}: No UC-N headers found`);
      }
    }

    if (fileName === 'ACCEPTANCE_CRITERIA.md') {
      log('INFO', 'Checking EARS_FORMAT rule...');
      if (!/(WHEN|IF).+(THEN|AND).+SHALL/i.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'EARS_FORMAT',
          message: 'No EARS format found. Expected: WHEN/IF...THEN...SHALL',
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: No EARS format found`);
      }
    }

    if (fileName === 'NFR.md') {
      log('INFO', 'Checking NFR_SECTIONS rule...');
      for (const section of nfrSections) {
        const pattern = new RegExp(`##\\s+${escapeRegExp(section)}`, 'i');
        if (!pattern.test(content)) {
          warnings.push({
            file: fileName,
            rule: 'NFR_SECTIONS',
            message: `Missing NFR section: ${section}`,
          });
          fileHasWarnings = true;
          log('WARN', `${fileName}: Missing section: ${section}`);
        }
      }
    }

    if (fileName.endsWith('.feature')) {
      log('INFO', 'Checking FEATURE_NAMING rule...');
      if (!/Feature:\s+([A-Z]+\d+_.+)/.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'FEATURE_NAMING',
          message: 'Feature name should follow format: {DOMAIN}{NNN}_{Название}',
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: Feature naming format not followed`);
      }
    }

    if (fileName === 'RESEARCH.md') {
      log('INFO', 'Checking CONTEXT_SECTION rule...');
      if (!/## Project Context & Constraints/i.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'CONTEXT_SECTION',
          message: "Missing '## Project Context & Constraints' section. Run Phase 1.5 or add '> Skipped: {reason}'",
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: Missing Project Context & Constraints section`);
      } else if (!/### (Relevant Rules|Existing Patterns & Extensions|Architectural Constraints Summary)/i.test(content)
        && !/>\s*Skipped:/i.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'CONTEXT_SECTION',
          message: "Section 'Project Context & Constraints' exists but has no subsections and no skip reason",
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: Context section incomplete`);
      }
    }

    if (fileName === 'RESEARCH.md') {
      log('INFO', 'Checking OPEN_QUESTIONS rule...');
      const openQ = countOpenQuestions(content);
      if (openQ > 0) {
        warnings.push({
          file: fileName,
          rule: 'OPEN_QUESTIONS',
          message: `${openQ} unclosed open question(s) found (- [ ]). Close them (- [x]) or add '> DEFERRED: reason' on the line before.`,
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: ${openQ} unclosed open questions`);
      }
    }

    if (fileName === 'DESIGN.md') {
      log('INFO', 'Checking BDD_INFRA rule...');
      if (!/## BDD Test Infrastructure/i.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'BDD_INFRA',
          message: "Missing '## BDD Test Infrastructure' section. This section is mandatory - run Phase 2 Step 6 assessment.",
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: Missing BDD Test Infrastructure section`);
      } else if (!/\*\*Classification:\*\*\s*(TEST_DATA_ACTIVE|TEST_DATA_NONE)/i.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'BDD_INFRA',
          message: 'BDD Test Infrastructure section exists but has no Classification (TEST_DATA_ACTIVE or TEST_DATA_NONE). Agent must classify the feature.',
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: Missing Classification in BDD Test Infrastructure`);
      } else if (/TEST_DATA_ACTIVE/i.test(content)) {
        for (const subsection of ['Cleanup Strategy', 'hooks']) {
          const subsectionRegex = new RegExp(escapeRegExp(subsection), 'i');
          const notFoundRegex = new RegExp(`${escapeRegExp(subsection)}.*Не найдены`, 'i');
          if (!subsectionRegex.test(content) && !notFoundRegex.test(content)) {
            warnings.push({
              file: fileName,
              rule: 'BDD_INFRA',
              message: `TEST_DATA_ACTIVE but missing required subsection: ${subsection}`,
            });
            fileHasWarnings = true;
            log('WARN', `${fileName}: TEST_DATA_ACTIVE missing subsection: ${subsection}`);
          }
        }
      }
    }

    if (fileName === 'TASKS.md') {
      log('INFO', 'Checking TDD_TASK_ORDER rule...');
      if (!/## Phase 0.*\b(Red|BDD|Foundation|Feature)\b/i.test(content) && !/\.feature/i.test(content)) {
        warnings.push({
          file: fileName,
          rule: 'TDD_TASK_ORDER',
          message: "No 'Phase 0: BDD Foundation' or .feature task found. TDD requires test tasks BEFORE implementation.",
        });
        fileHasWarnings = true;
        log('WARN', `${fileName}: No BDD/feature task found in early phases`);
      }
    }

    if (fileHasErrors) {
      filesWithErrors += 1;
    } else if (fileHasWarnings) {
      filesWithWarnings += 1;
    } else {
      validFiles += 1;
    }
  }

  log('INFO', 'Checking CROSS_REF_LINKS rule...');

  const anchorIndex = {};
  const markdownFiles = existingFiles.filter((fileName) => fileName.endsWith('.md'));
  for (const markdownFile of markdownFiles) {
    const markdownLines = safeReadLines(path.join(targetDir, markdownFile));
    anchorIndex[markdownFile] = [];

    for (const line of markdownLines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) {
        continue;
      }

      const anchor = toAnchorSlug(match[2]);
      if (anchor) {
        anchorIndex[markdownFile].push(anchor);
      }
    }
  }

  const linkPattern = /\[([^\]]+)\]\(([^)#\s]+\.md)(?:#([^)]+))?\)/g;
  for (const markdownFile of markdownFiles) {
    const markdownLines = safeReadLines(path.join(targetDir, markdownFile));

    markdownLines.forEach((line, lineIndex) => {
      for (const match of line.matchAll(linkPattern)) {
        const linkText = match[1];
        const targetFile = match[2].replace(/^\.\//, '');
        const anchor = match[3] || '';

        if (!existingFiles.includes(targetFile)) {
          const anchorPart = anchor ? `#${anchor}` : '';
          warnings.push({
            file: markdownFile,
            line: lineIndex + 1,
            rule: 'CROSS_REF_LINKS',
            message: `Broken link: [${linkText}](${targetFile}${anchorPart}) - target file '${targetFile}' not found in spec folder`,
          });
          log('WARN', `${markdownFile} line ${lineIndex + 1}: target file '${targetFile}' not found`);
          continue;
        }

        if (anchor && Array.isArray(anchorIndex[targetFile]) && !anchorIndex[targetFile].includes(anchor)) {
          warnings.push({
            file: markdownFile,
            line: lineIndex + 1,
            rule: 'CROSS_REF_LINKS',
            message: `Broken link: [${linkText}](${targetFile}#${anchor}) - anchor '#${anchor}' not found in ${targetFile}`,
          });
          log('WARN', `${markdownFile} line ${lineIndex + 1}: anchor '#${anchor}' not found in ${targetFile}`);
        }
      }
    });
  }

  log('INFO', 'CROSS_REF_LINKS check complete');
  log('INFO', `Validation complete: ${errors.length} errors, ${warnings.length} warnings`);

  const isValid = errors.length === 0;
  const result = {
    valid: isValid,
    path: options.inputPath,
    errors,
    warnings: options.errorsOnly ? [] : warnings,
    summary: {
      total_files: totalFiles,
      valid_files: validFiles,
      files_with_errors: filesWithErrors,
      files_with_warnings: filesWithWarnings,
      unfilled_placeholders: totalPlaceholders,
    },
  };

  emitResult(options.format, result, (value) => `${value.valid ? 'VALID' : 'INVALID'}: ${value.path}`);
  return isValid ? 0 : 1;
}

function commandSpecStatus(argv) {
  const options = parseArgs(argv, [
    { flag: '-Path', key: 'inputPath', type: 'string', required: true },
    { flag: '-Brief', key: 'brief', type: 'boolean', default: false },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
    {
      flag: '-ConfirmStop',
      key: 'confirmStop',
      type: 'string',
      default: '',
      validate: (value) => value === '' || PHASE_ORDER.includes(value),
      errorMessage: 'Invalid value for -ConfirmStop. Allowed: Discovery, Context, Requirements, Finalization',
    },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  if (!context.repoRoot) {
    throw new CliError(`Repository root not found from ${SCRIPT_DIR}`, 1);
  }

  const targetDir = resolvePath(context.repoRoot, options.inputPath);
  assertSpecSubdir(targetDir, context.repoRoot);
  const { log } = context;

  if (!fs.existsSync(targetDir)) {
    const result = makeErrorResult(`Spec folder not found: ${options.inputPath}`);
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 1;
  }

  // task-table format: parse TASKS.md and emit markdown table (no progress logic).
  // Used by task-board-forms skill for idempotent Task Summary Table generation.
  if (options.format === 'task-table') {
    const tasksPath = path.join(targetDir, 'TASKS.md');
    if (!fs.existsSync(tasksPath)) {
      process.stderr.write(`ERROR: TASKS.md not found in ${options.inputPath}\n`);
      return 1;
    }
    const content = fs.readFileSync(tasksPath, 'utf-8');
    const rows = parseTasksForTable(content);
    process.stdout.write(renderTaskTable(rows) + '\n');
    return 0;
  }

  const phases = {
    Discovery: ['USER_STORIES.md', 'USE_CASES.md', 'RESEARCH.md'],
    Requirements: ['REQUIREMENTS.md', 'FR.md', 'NFR.md', 'ACCEPTANCE_CRITERIA.md', 'DESIGN.md', 'FILE_CHANGES.md'],
    Finalization: ['TASKS.md', 'README.md', 'CHANGELOG.md'],
  };

  const allFiles = [
    'USER_STORIES.md',
    'USE_CASES.md',
    'RESEARCH.md',
    'REQUIREMENTS.md',
    'FR.md',
    'NFR.md',
    'ACCEPTANCE_CRITERIA.md',
    'DESIGN.md',
    'TASKS.md',
    'FILE_CHANGES.md',
    'CHANGELOG.md',
    'README.md',
  ];

  log('INFO', `Analyzing: ${options.inputPath}`);

  const files = {};
  let completeWeight = 0;
  let totalWeight = 0;

  for (const fileName of allFiles) {
    const state = getSpecStatusFileState(path.join(targetDir, fileName));
    files[fileName] = state;
    totalWeight += 1;
    if (state.status === 'complete') {
      completeWeight += 1;
    } else if (state.status === 'partial') {
      completeWeight += 0.5;
    }
    log('INFO', `${fileName}: ${state.status} (${state.placeholders} placeholders)`);
  }

  const featureFiles = listDirectoryEntries(targetDir, 'file')
    .map((entry) => entry.name)
    .filter((fileName) => fileName.endsWith('.feature'));

  if (featureFiles.length > 0) {
    const firstFeature = featureFiles[0];
    const featureState = getSpecStatusFileState(path.join(targetDir, firstFeature));
    files[firstFeature] = featureState;
    totalWeight += 1;
    if (featureState.status === 'complete') {
      completeWeight += 1;
    } else if (featureState.status === 'partial') {
      completeWeight += 0.5;
    }
  }

  const progressPercent = totalWeight === 0 ? 0 : Math.round((completeWeight / totalWeight) * 100);

  let currentPhase = 'Discovery';
  let subPhase = null;
  let contextDone = false;
  let requirementsComplete = true;
  let discoveryComplete = testPhaseComplete(phases.Discovery, files);

  if (discoveryComplete) {
    const researchPath = path.join(targetDir, 'RESEARCH.md');
    if (fs.existsSync(researchPath)) {
      const researchContent = safeReadText(researchPath) ?? '';
      if (/## Project Context & Constraints/i.test(researchContent)) {
        const hasSubsections = /### (Relevant Rules|Existing Patterns|Architectural Constraints)/i.test(researchContent);
        const isSkipped = />\s*Skipped:/i.test(researchContent);
        if (hasSubsections || isSkipped) {
          contextDone = true;
        }
      }
    }

    if (!contextDone) {
      subPhase = 'Context Analysis pending';
    } else {
      currentPhase = 'Requirements';
      requirementsComplete = testPhaseComplete(phases.Requirements, files);
      if (requirementsComplete) {
        currentPhase = 'Finalization';
      }
    }
  }

  log('INFO', `Phase: ${currentPhase}, Progress: ${progressPercent}%`);

  const progressPath = path.join(targetDir, '.progress.json');
  let progressState = readJsonIfExists(progressPath);
  if (!progressState) {
    progressState = createDefaultProgressState(targetDir, currentPhase);
  }

  if (options.confirmStop) {
    const phaseState = progressState.phases[options.confirmStop];
    if (phaseState) {
      phaseState.stopConfirmed = true;
      phaseState.stopConfirmedAt = new Date().toISOString();
      log('INFO', `STOP confirmed for phase: ${options.confirmStop}`);
    } else {
      log('WARN', `Unknown phase for ConfirmStop: ${options.confirmStop}`);
    }
  }

  if (!discoveryComplete && progressState.phases.Discovery.stopConfirmed && testPhaseFilesExist(phases.Discovery, files)) {
    discoveryComplete = true;
    log('INFO', 'Discovery override: stopConfirmed=true');
  }

  if (discoveryComplete && !contextDone && progressState.phases.Context.stopConfirmed) {
    contextDone = true;
    log('INFO', 'Context override: stopConfirmed=true');
  }

  if (discoveryComplete && contextDone) {
    requirementsComplete = testPhaseComplete(phases.Requirements, files);
    if (!requirementsComplete
      && progressState.phases.Requirements.stopConfirmed
      && testPhaseFilesExist(phases.Requirements, files)) {
      requirementsComplete = true;
      log('INFO', 'Requirements override: stopConfirmed=true');
    }
  }

  let finalizationComplete = testPhaseComplete(phases.Finalization, files);
  if (!finalizationComplete
    && progressState.phases.Finalization.stopConfirmed
    && testPhaseFilesExist(phases.Finalization, files)) {
    finalizationComplete = true;
    log('INFO', 'Finalization override: stopConfirmed=true');
  }

  if (!discoveryComplete) {
    currentPhase = 'Discovery';
    subPhase = null;
  } else if (!contextDone) {
    currentPhase = 'Discovery';
    subPhase = 'Context Analysis pending';
  } else if (!requirementsComplete) {
    currentPhase = 'Requirements';
    subPhase = null;
  } else if (!finalizationComplete) {
    currentPhase = 'Finalization';
    subPhase = null;
  } else {
    currentPhase = 'Complete';
    subPhase = null;
  }

  progressState.currentPhase = currentPhase;

  if (discoveryComplete && !progressState.phases.Discovery.completedAt) {
    progressState.phases.Discovery.completedAt = new Date().toISOString();
  }
  if (contextDone && !progressState.phases.Context.completedAt) {
    progressState.phases.Context.completedAt = new Date().toISOString();
  }
  if (requirementsComplete
    && ['Finalization', 'Complete'].includes(currentPhase)
    && !progressState.phases.Requirements.completedAt) {
    progressState.phases.Requirements.completedAt = new Date().toISOString();
  }
  if (finalizationComplete
    && currentPhase === 'Complete'
    && !progressState.phases.Finalization.completedAt) {
    progressState.phases.Finalization.completedAt = new Date().toISOString();
  }

  try {
    writeJsonAtomicSync(progressPath, progressState);
    log('INFO', 'Updated .progress.json');
  } catch (error) {
    log('WARN', `Failed to write .progress.json: ${error.message}`);
    removeIfExists(`${progressPath}.tmp`);
  }

  let nextAction = '';
  const blockers = [];

  // Check for open questions in RESEARCH.md (reuse already-computed state from files map)
  const researchState = files['RESEARCH.md'];
  if (researchState && researchState.openQuestions > 0) {
    blockers.push(`RESEARCH.md has ${researchState.openQuestions} unclosed open question(s). Close them (- [x]) or mark as DEFERRED.`);
  }

  for (const fileName of allFiles) {
    const fileState = files[fileName];
    if (!fileState) {
      continue;
    }
    if (fileState.status === 'not_created') {
      nextAction = `Create ${fileName}`;
      break;
    }
    if (fileState.status === 'empty') {
      nextAction = `Fill ${fileName}`;
      break;
    }
    if (fileState.status === 'partial') {
      nextAction = `Complete ${fileName} - ${fileState.placeholders} placeholders remaining`;
      break;
    }
  }

  if (!nextAction) {
    if (currentPhase === 'Complete') {
      nextAction = 'Spec complete! All phases finalized.';
    } else if (subPhase === 'Context Analysis pending') {
      nextAction = "Run Phase 1.5: Add '## Project Context & Constraints' to RESEARCH.md";
    } else {
      nextAction = 'All files complete! Run validation.';
    }
  }

  const result = {
    path: options.inputPath,
    phase: currentPhase,
    sub_phase: subPhase,
    progress_percent: progressPercent,
    files,
    next_action: nextAction,
    blockers,
    progress_state: progressState,
  };

  if (options.format === 'human') {
    process.stdout.write(renderHumanProgress(result) + '\n');
  } else if (options.format === 'json' && options.brief) {
    emitResult(options.format, {
      path: options.inputPath,
      phase: currentPhase,
      sub_phase: subPhase,
      progress_percent: progressPercent,
      next_action: nextAction,
    });
  } else {
    emitResult(options.format, result, (value) => `Spec Status: ${value.path}`);
  }

  return 0;
}

function commandListSpecs(argv) {
  const options = parseArgs(argv, [
    { flag: '-Incomplete', key: 'incomplete', type: 'boolean', default: false },
    { flag: '-Filter', key: 'filter', type: 'string', default: '' },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  if (!context.repoRoot) {
    throw new CliError(`Repository root not found from ${SCRIPT_DIR}`, 1);
  }

  const { log } = context;
  const specsDir = path.join(context.repoRoot, '.specs');

  log('INFO', 'Scanning .specs/ directory');

  if (!fs.existsSync(specsDir)) {
    const result = {
      specs: [],
      summary: {
        total: 0,
        complete: 0,
        partial: 0,
        empty: 0,
      },
    };
    emitResult(options.format, result, () => 'No .specs/ directory found');
    return 0;
  }

  let specFolders = listDirectoryEntries(specsDir, 'directory')
    .filter((entry) => !/^(disabled|archive|\.)/.test(entry.name));

  if (options.filter) {
    const filterRegex = new RegExp(options.filter, 'i');
    specFolders = specFolders.filter((entry) => filterRegex.test(entry.name));
  }

  log('INFO', `Found ${specFolders.length} spec folders`);

  const expectedFiles = [
    'USER_STORIES.md',
    'USE_CASES.md',
    'RESEARCH.md',
    'REQUIREMENTS.md',
    'FR.md',
    'NFR.md',
    'ACCEPTANCE_CRITERIA.md',
    'DESIGN.md',
    'TASKS.md',
    'FILE_CHANGES.md',
    'README.md',
  ];

  const getSpecStatus = (specPath) => {
    const files = listDirectoryEntries(specPath, 'file');
    const filesCount = files.length;
    let completeCount = 0;
    let hasContent = false;

    for (const expectedFile of expectedFiles) {
      const filePath = path.join(specPath, expectedFile);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = safeReadText(filePath) ?? '';
      if (content && content.trim().length > 50) {
        hasContent = true;
        const placeholders = content.match(/\{[^}]+\}/g) || [];
        let hasPlaceholders = false;

        for (const placeholder of placeholders) {
          if (!isJsonLikePlaceholder(placeholder)) {
            hasPlaceholders = true;
            break;
          }
        }

        if (!hasPlaceholders) {
          completeCount += 1;
        } else {
          completeCount += 0.5;
        }
      }
    }

    const progress = Math.round((completeCount / expectedFiles.length) * 100);
    const status = progress >= 90 ? 'complete' : (hasContent ? 'partial' : 'empty');
    const lastModifiedFile = files
      .map((entry) => ({ name: entry.name, mtimeMs: fs.statSync(path.join(specPath, entry.name)).mtimeMs }))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

    return {
      files_count: filesCount,
      progress_percent: progress,
      status,
      last_modified: lastModifiedFile ? new Date(lastModifiedFile.mtimeMs).toISOString() : null,
    };
  };

  const specs = [];
  let completeCount = 0;
  let partialCount = 0;
  let emptyCount = 0;

  for (const folder of specFolders) {
    const status = getSpecStatus(path.join(specsDir, folder.name));
    log('INFO', `${folder.name}: ${status.status} (${status.progress_percent}%)`);

    const spec = {
      name: folder.name,
      path: `.specs/${folder.name}`,
      status: status.status,
      files_count: status.files_count,
      progress_percent: status.progress_percent,
      last_modified: status.last_modified,
    };

    if (status.status === 'complete') {
      completeCount += 1;
    } else if (status.status === 'partial') {
      partialCount += 1;
    } else if (status.status === 'empty') {
      emptyCount += 1;
    }

    if (options.incomplete && status.status === 'complete') {
      continue;
    }

    specs.push(spec);
  }

  const result = {
    specs,
    summary: {
      total: specFolders.length,
      complete: completeCount,
      partial: partialCount,
      empty: emptyCount,
    },
  };

  log('INFO', `Summary: ${completeCount} complete, ${partialCount} partial, ${emptyCount} empty`);
  emitResult(options.format, result, () => 'Specs in .specs/');
  return 0;
}

function commandAuditSpec(argv) {
  const options = parseArgs(argv, [
    { flag: '-Path', key: 'inputPath', type: 'string', required: true },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  if (!context.repoRoot) {
    throw new CliError(`Repository root not found from ${SCRIPT_DIR}`, 1);
  }

  const targetDir = resolvePath(context.repoRoot, options.inputPath);
  assertSpecSubdir(targetDir, context.repoRoot);
  const { log } = context;

  if (!fs.existsSync(targetDir)) {
    const result = {
      path: options.inputPath,
      error: `Spec folder not found: ${options.inputPath}`,
    };
    emitResult(options.format, result, (value) => `ERROR: ${value.error}`);
    return 0;
  }

  const getFileContent = (fileName) => safeReadText(path.join(targetDir, fileName));
  const getFileLines = (fileName) => safeReadLines(path.join(targetDir, fileName));
  const findings = [];

  log('INFO', `Auditing: ${options.inputPath}`);

  const frContent = getFileContent('FR.md');
  const acContent = getFileContent('ACCEPTANCE_CRITERIA.md');

  log('INFO', 'Running FR_AC_COVERAGE check...');
  if (frContent && acContent) {
    const frIds = [...frContent.matchAll(/## FR-(\d+):/g)].map((match) => `FR-${match[1]}`);
    const acRefs = [
      ...acContent.matchAll(/## AC-\d+\s*\(FR-(\d+)\)/g),
      ...acContent.matchAll(/## AC-\d+\s*\(FR-(\d+)\):/g),
    ].map((match) => `FR-${match[1]}`);
    const allAcRefs = [...new Set(acRefs)];

    for (const frId of frIds) {
      if (!allAcRefs.includes(frId)) {
        findings.push({
          check: 'FR_AC_COVERAGE',
          category: 'LOGIC_GAPS',
          severity: 'WARNING',
          message: `${frId} has no matching Acceptance Criteria`,
          details: `Add AC-N (${frId}) section to ACCEPTANCE_CRITERIA.md`,
        });
        log('WARN', `FR_AC_COVERAGE: ${frId} has no matching AC`);
      }
    }
  } else {
    if (!frContent) {
      log('WARN', 'FR_AC_COVERAGE: FR.md is empty or missing');
    }
    if (!acContent) {
      log('WARN', 'FR_AC_COVERAGE: ACCEPTANCE_CRITERIA.md is empty or missing');
    }
  }

  log('INFO', 'Running FR_BDD_COVERAGE check...');
  const featureFiles = listDirectoryEntries(targetDir, 'file')
    .map((entry) => entry.name)
    .filter((fileName) => fileName.endsWith('.feature'));
  const featureContent = featureFiles.length > 0 ? (getFileContent(featureFiles[0]) ?? '') : '';

  if (frContent || acContent) {
    const mdFeatureTags = [
      ...new Set([
        ...((frContent?.match(/@feature\d+/g)) || []),
        ...((acContent?.match(/@feature\d+/g)) || []),
      ]),
    ];

    if (mdFeatureTags.length > 0) {
      if (!featureContent) {
        findings.push({
          check: 'FR_BDD_COVERAGE',
          category: 'LOGIC_GAPS',
          severity: 'WARNING',
          message: `No .feature file found, but ${mdFeatureTags.length} @featureN tags exist in MD files`,
          details: `Create .feature file with BDD scenarios tagged with: ${mdFeatureTags.join(', ')}`,
        });
      } else {
        const bddTags = [...new Set(featureContent.match(/@feature\d+/g) || [])];

        for (const tag of mdFeatureTags) {
          if (!bddTags.includes(tag)) {
            findings.push({
              check: 'FR_BDD_COVERAGE',
              category: 'LOGIC_GAPS',
              severity: 'WARNING',
              message: `${tag} in FR/AC has no matching BDD scenario`,
              details: `Add # ${tag} comment before a Scenario in .feature file`,
            });
            log('WARN', `FR_BDD_COVERAGE: ${tag} not found in .feature`);
          }
        }

        for (const tag of bddTags) {
          if (!mdFeatureTags.includes(tag)) {
            findings.push({
              check: 'FR_BDD_COVERAGE',
              category: 'INCONSISTENCY',
              severity: 'WARNING',
              message: `${tag} in .feature has no matching FR/AC requirement`,
              details: `Add ${tag} to FR.md or ACCEPTANCE_CRITERIA.md header`,
            });
            log('WARN', `FR_BDD_COVERAGE: orphan ${tag} in .feature`);
          }
        }
      }
    }
  }

  log('INFO', 'Running REQUIREMENTS_TRACEABILITY check...');
  const requirementsContent = getFileContent('REQUIREMENTS.md');
  if (requirementsContent && frContent) {
    const frIds = [...frContent.matchAll(/## FR-(\d+):/g)].map((match) => `FR-${match[1]}`);

    for (const frId of frIds) {
      if (!requirementsContent.includes(frId)) {
        findings.push({
          check: 'REQUIREMENTS_TRACEABILITY',
          category: 'LOGIC_GAPS',
          severity: 'INFO',
          message: `${frId} not referenced in REQUIREMENTS.md`,
          details: `Add ${frId} to the traceability index in REQUIREMENTS.md`,
        });
        log('WARN', `REQUIREMENTS_TRACEABILITY: ${frId} not in REQUIREMENTS.md`);
      }
    }
  } else if (!requirementsContent) {
    log('WARN', 'REQUIREMENTS_TRACEABILITY: REQUIREMENTS.md is empty or missing');
  }

  log('INFO', 'Running TASKS_FR_REFS check...');
  const tasksContent = getFileContent('TASKS.md');
  if (tasksContent && frContent) {
    const frIds = [...frContent.matchAll(/## FR-(\d+):/g)].map((match) => `FR-${match[1]}`);
    const taskRefs = [...new Set((tasksContent.match(/FR-\d+/g) || []))];
    const unreferencedFrs = frIds.filter((frId) => !taskRefs.includes(frId));

    if (unreferencedFrs.length > 0) {
      findings.push({
        check: 'TASKS_FR_REFS',
        category: 'LOGIC_GAPS',
        severity: 'INFO',
        message: `${unreferencedFrs.length} FR(s) not referenced in TASKS.md: ${unreferencedFrs.join(', ')}`,
        details: `Add _Requirements: ${unreferencedFrs.join(', ')}_ to relevant tasks`,
      });
      log('WARN', `TASKS_FR_REFS: ${unreferencedFrs.length} FRs not referenced in TASKS.md`);
    }
  } else if (!tasksContent) {
    log('WARN', 'TASKS_FR_REFS: TASKS.md is empty or missing');
  }

  // =========================================================================
  // AC_TAG_SYNC: @featureN tags in FR-N must also be in matching AC-N
  // =========================================================================
  log('INFO', 'Running AC_TAG_SYNC check...');
  if (frContent && acContent) {
    const frSections = [...frContent.matchAll(/## FR-(\d+):.*$/gm)];
    for (const frMatch of frSections) {
      const frNum = frMatch[1];
      const frLine = frMatch[0];
      const frTags = [...new Set(frLine.match(/@feature\d+/g) || [])];
      if (frTags.length === 0) continue;
      // Find matching AC-N header(s)
      const acPattern = new RegExp(`## AC-${frNum}\\b[^\\n]*`, 'g');
      const acHeaders = [...acContent.matchAll(acPattern)].map((m) => m[0]);
      const acTagsJoined = acHeaders.join(' ');
      for (const tag of frTags) {
        if (!acTagsJoined.includes(tag)) {
          findings.push({
            check: 'AC_TAG_SYNC',
            category: 'INCONSISTENCY',
            severity: 'WARNING',
            message: `FR-${frNum} has ${tag} but AC-${frNum} header is missing it`,
            details: `Add ${tag} to AC-${frNum} header in ACCEPTANCE_CRITERIA.md`,
          });
          log('WARN', `AC_TAG_SYNC: FR-${frNum} ${tag} not in AC-${frNum}`);
        }
      }
    }
  }

  // =========================================================================
  // FEATURE_TAG_PROPAGATION: @featureN from .feature must exist in TASKS/US/UC
  // =========================================================================
  log('INFO', 'Running FEATURE_TAG_PROPAGATION check...');
  if (featureContent && tasksContent) {
    const bddTagsForPropagation = [...new Set(featureContent.match(/@feature\d+/g) || [])];
    const tasksTags = new Set(tasksContent.match(/@feature\d+/g) || []);
    const userStoriesContent = getFileContent('USER_STORIES.md');
    const useCasesContent = getFileContent('USE_CASES.md');
    for (const tag of bddTagsForPropagation) {
      if (!tasksTags.has(tag) && !tasksContent.includes(tag)) {
        findings.push({
          check: 'FEATURE_TAG_PROPAGATION',
          category: 'LOGIC_GAPS',
          severity: 'WARNING',
          message: `${tag} in .feature but not referenced in TASKS.md`,
          details: `Add ${tag} to the relevant phase/task in TASKS.md for traceability`,
        });
        log('WARN', `FEATURE_TAG_PROPAGATION: ${tag} not in TASKS.md`);
      }
      if (userStoriesContent && !userStoriesContent.includes(tag)) {
        findings.push({
          check: 'FEATURE_TAG_PROPAGATION',
          category: 'LOGIC_GAPS',
          severity: 'INFO',
          message: `${tag} in .feature but not in USER_STORIES.md`,
          details: `Add ${tag} to the relevant User Story in USER_STORIES.md`,
        });
      }
      if (useCasesContent && !useCasesContent.includes(tag)) {
        findings.push({
          check: 'FEATURE_TAG_PROPAGATION',
          category: 'LOGIC_GAPS',
          severity: 'INFO',
          message: `${tag} in .feature but not in USE_CASES.md`,
          details: `Add ${tag} to the relevant Use Case in USE_CASES.md`,
        });
      }
    }
  }

  log('INFO', 'Running OPEN_QUESTIONS check...');
  const researchContent = getFileContent('RESEARCH.md');
  if (researchContent) {
    const researchLines = getFileLines('RESEARCH.md');
    const unclosed = [];

    for (const line of researchLines) {
      const openMatch = line.match(/^\s*-\s*\[ \]\s*(.+)$/);
      if (openMatch) {
        unclosed.push(openMatch[1].trim());
      }
    }

    if (unclosed.length > 0) {
      findings.push({
        check: 'OPEN_QUESTIONS',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: `${unclosed.length} unclosed open question(s) in RESEARCH.md`,
        details: unclosed.map((item) => `- [ ] ${item}`).join('\n'),
      });
      log('WARN', `OPEN_QUESTIONS: ${unclosed.length} unclosed`);
    }
  } else {
    log('WARN', 'OPEN_QUESTIONS: RESEARCH.md is empty or missing');
  }

  log('INFO', 'Running TERM_CONSISTENCY check...');
  const termFiles = ['FR.md', 'DESIGN.md', 'TASKS.md', 'ACCEPTANCE_CRITERIA.md', 'USE_CASES.md'];
  const termMap = new Map();

  for (const fileName of termFiles) {
    const content = getFileContent(fileName);
    if (!content) {
      continue;
    }

    const identifiers = content.match(/\b([a-z][a-zA-Z]{3,}[A-Z][a-zA-Z]*|[A-Z][a-z]+[A-Z][a-zA-Z]*)\b/g) || [];
    for (const identifier of identifiers) {
      const normalized = identifier.toLowerCase();
      if (!termMap.has(normalized)) {
        termMap.set(normalized, {
          variants: [],
          files: {},
        });
      }

      const entry = termMap.get(normalized);
      if (!entry.variants.includes(identifier)) {
        entry.variants.push(identifier);
      }
      entry.files[fileName] ||= [];
      if (!entry.files[fileName].includes(identifier)) {
        entry.files[fileName].push(identifier);
      }
    }
  }

  const inconsistentTerms = [...termMap.values()]
    .filter((entry) => entry.variants.length > 1)
    .sort((left, right) => Object.keys(right.files).length - Object.keys(left.files).length)
    .slice(0, 10);

  for (const term of inconsistentTerms) {
    const variantsList = term.variants.join(', ');
    const filesList = Object.keys(term.files).sort().join(', ');
    findings.push({
      check: 'TERM_CONSISTENCY',
      category: 'INCONSISTENCY',
      severity: 'WARNING',
      message: `Term variants: ${variantsList}`,
      details: `Found in: ${filesList}. Standardize to one form.`,
    });
    log('WARN', `TERM_CONSISTENCY: variants [${variantsList}] in [${filesList}]`);
  }

  log('INFO', 'Running LINK_VALIDITY check...');
  if (requirementsContent && frContent) {
    const frIds = [...frContent.matchAll(/## FR-(\d+):/g)].map((match) => match[1]);
    for (const frNum of frIds) {
      const frId = `FR-${frNum}`;
      const linkPattern = new RegExp(`\\[${escapeRegExp(frId)}[^\\]]*\\]\\(FR\\.md#[^)]+\\)`);
      if (!linkPattern.test(requirementsContent) && new RegExp(`(?<!\\[)${escapeRegExp(frId)}(?!\\])`).test(requirementsContent)) {
        findings.push({
          check: 'LINK_VALIDITY',
          category: 'INCONSISTENCY',
          severity: 'ERROR',
          message: `${frId} in REQUIREMENTS.md is plain text, not a clickable link`,
          details: `Replace '${frId}' with '[${frId}](FR.md#fr-${frNum}-...)' for cross-reference navigation`,
        });
        log('WARN', `LINK_VALIDITY: ${frId} plain text in REQUIREMENTS.md`);
      }
    }
  }

  if (tasksContent && frContent) {
    const frIds = [...frContent.matchAll(/## FR-(\d+):/g)].map((match) => match[1]);
    for (const frNum of frIds) {
      const frId = `FR-${frNum}`;
      const linkPattern = new RegExp(`\\[${escapeRegExp(frId)}[^\\]]*\\]\\([^)]+\\)`);
      const plainPattern = new RegExp(`(?<!\\[)${escapeRegExp(frId)}(?![^\\[]*\\])`);
      if (plainPattern.test(tasksContent) && !linkPattern.test(tasksContent)) {
        findings.push({
          check: 'LINK_VALIDITY',
          category: 'INCONSISTENCY',
          severity: 'ERROR',
          message: `${frId} in TASKS.md is plain text, not a clickable link`,
          details: `Use '[${frId}](FR.md#fr-${frNum}-...)' format for requirement references`,
        });
        log('WARN', `LINK_VALIDITY: ${frId} plain text in TASKS.md`);
      }
    }
  }

  if (frContent && acContent) {
    const frNums = [...frContent.matchAll(/## FR-(\d+):/g)].map((match) => match[1]);
    for (const frNum of frNums) {
      const sectionMatch = frContent.match(new RegExp(`## FR-${frNum}:.*?(?=## FR-\\d+:|$)`, 's'));
      if (sectionMatch && !/\[AC-\d+[^\]]*\]\(ACCEPTANCE_CRITERIA\.md#[^)]+\)/.test(sectionMatch[0])) {
        findings.push({
          check: 'LINK_VALIDITY',
          category: 'INCONSISTENCY',
          severity: 'ERROR',
          message: `FR-${frNum} in FR.md has no clickable link to ACCEPTANCE_CRITERIA.md`,
          details: `Add '**AC:** [AC-N](ACCEPTANCE_CRITERIA.md#ac-N-fr-${frNum}-...)' to FR-${frNum} section`,
        });
        log('WARN', `LINK_VALIDITY: FR-${frNum} has no AC back-link`);
      }
    }
  }

  if (acContent && frContent) {
    const acHeaders = [...acContent.matchAll(/## AC-(\d+)\s*\(FR-(\d+)\)/g)];
    for (const match of acHeaders) {
      const [, acNum, frNum] = match;
      const sectionMatch = acContent.match(new RegExp(`## AC-${acNum}\\s*\\(FR-${frNum}\\).*?(?=## AC-\\d+|$)`, 's'));
      const frLinkPattern = new RegExp(`\\[FR-${frNum}[^\\]]*\\]\\(FR\\.md#[^)]+\\)`);
      if (sectionMatch && !frLinkPattern.test(sectionMatch[0])) {
        findings.push({
          check: 'LINK_VALIDITY',
          category: 'INCONSISTENCY',
          severity: 'ERROR',
          message: `AC-${acNum} (FR-${frNum}) has no clickable link back to FR.md`,
          details: `Add '**FR:** [FR-${frNum}](FR.md#fr-${frNum}-...)' to AC-${acNum} section`,
        });
        log('WARN', `LINK_VALIDITY: AC-${acNum} has no FR back-link`);
      }
    }
  }

  log('INFO', 'Running BDD_HOOKS_COVERAGE check...');
  const designContent = getFileContent('DESIGN.md');
  if (designContent && tasksContent && /TEST_DATA_ACTIVE/i.test(designContent)) {
    const newHooksMatch = designContent.match(/### Новые hooks([\s\S]*?)(?=###|$)/i);
    const phase0Match = tasksContent.match(/## Phase 0.*?(?=## Phase \d|## Phase [A-Z]|$)/is);

    if (newHooksMatch) {
      const hookPaths = [...newHooksMatch[1].matchAll(/\|\s*`([^`]+)`\s*\|/g)].map((match) => match[1]);
      for (const hookPath of hookPaths) {
        if (!hookPath || hookPath.startsWith('{')) {
          continue;
        }
        const hookPattern = new RegExp(escapeRegExp(hookPath));
        if (!phase0Match || !hookPattern.test(phase0Match[0])) {
          findings.push({
            check: 'BDD_HOOKS_COVERAGE',
            category: 'LOGIC_GAPS',
            severity: 'WARNING',
            message: `Hook '${hookPath}' from DESIGN.md 'Новые hooks' not found in TASKS.md Phase 0`,
            details: 'Each hook in DESIGN.md must have a corresponding task in TASKS.md Phase 0',
          });
          log('WARN', `BDD_HOOKS_COVERAGE: Hook '${hookPath}' missing from TASKS.md Phase 0`);
        }
      }
    }

    if (!/\*\*Classification:\*\*\s*TEST_DATA_ACTIVE/i.test(designContent)) {
      findings.push({
        check: 'BDD_HOOKS_COVERAGE',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: 'DESIGN.md mentions TEST_DATA_ACTIVE but has no formal **Classification:** field',
        details: "Add '**Classification:** TEST_DATA_ACTIVE' to BDD Test Infrastructure section",
      });
      log('WARN', 'BDD_HOOKS_COVERAGE: Missing formal Classification field');
    }
  }

  log('INFO', 'Running SCOPE_GATE_CANDIDATE check...');
  // Detects when spec FILE_CHANGES.md touches guard/policy files that would benefit
  // from /verify-generic-scope-fix skill during implementation.
  // Regex mirrors _shared/scope-gate-score-diff.ts isGuardFile() — keep in sync.
  {
    const fileChangesContent = getFileContent('FILE_CHANGES.md');
    if (fileChangesContent) {
      const GUARD_FILE_SUFFIX = /(Service|Validator|Gate|Guard|Policy|Rule|Predicate|Filter)\.(ts|tsx|cs|java|kt|py|rb|go)$/i;
      const GUARD_PATH = /\/(domain|policies|validation)\//i;
      const tableRowRegex = /\|\s*`?([^`|\s]+\.[a-z]{1,5})`?\s*\|/gi;
      const hits = new Set();
      let m;
      while ((m = tableRowRegex.exec(fileChangesContent)) !== null) {
        const p = m[1];
        if (GUARD_FILE_SUFFIX.test(p) || GUARD_PATH.test(p)) {
          hits.add(p);
        }
      }
      if (hits.size > 0) {
        const preview = [...hits].slice(0, 3).join(', ');
        const more = hits.size > 3 ? ` (+${hits.size - 3} more)` : '';
        findings.push({
          check: 'SCOPE_GATE_CANDIDATE',
          category: 'LOGIC_GAPS',
          severity: 'INFO',
          message: `Spec FILE_CHANGES.md touches guard/policy files: ${preview}${more}`,
          details: 'Implementation phase should run /verify-generic-scope-fix before each commit touching these files (see .claude/rules/scope-gate/when-to-verify.md). Add reference to TASKS.md Phase 0 if appropriate.',
        });
        log('INFO', `SCOPE_GATE_CANDIDATE: ${hits.size} guard files detected`);
      }
    }
  }

  log('INFO', 'Running PARTIAL_IMPL_DETECTION check...');
  if (frContent && tasksContent) {
    const partialMarkers = [
      'НЕ РЕАЛИЗОВАНО',
      'NOT IMPLEMENTED',
      'PARTIAL',
      'TODO: implement',
      'deferred',
      'будущее улучшение',
    ];

    const frLines = getFileLines('FR.md');
    const tasksLines = getFileLines('TASKS.md');
    const frWithMarkers = {};
    let currentFr = null;

    for (const line of frLines) {
      const headerMatch = line.match(/## (FR-\d+[a-z]?):/i);
      if (headerMatch) {
        currentFr = headerMatch[1];
      }

      if (!currentFr) {
        continue;
      }

      for (const marker of partialMarkers) {
        if (new RegExp(escapeRegExp(marker), 'i').test(line)) {
          frWithMarkers[currentFr] = marker;
          break;
        }
      }
    }

    for (const [frId, marker] of Object.entries(frWithMarkers)) {
      const frPattern = new RegExp(escapeRegExp(frId), 'i');
      for (const taskLine of tasksLines) {
        if (/^\s*-\s*\[x\]/i.test(taskLine) && frPattern.test(taskLine)) {
          findings.push({
            check: 'PARTIAL_IMPL_DETECTION',
            category: 'ERRORS',
            severity: 'ERROR',
            message: `PARTIAL_IMPL: ${frId} has partial implementation marker '${marker}' but task is marked complete [x]`,
            details: 'Either remove the marker from FR.md or uncheck the task in TASKS.md',
          });
          log('WARN', `PARTIAL_IMPL_DETECTION: ${frId} has marker '${marker}' but task is [x]`);
          break;
        }
      }
    }
  } else {
    if (!frContent) {
      log('WARN', 'PARTIAL_IMPL_DETECTION: FR.md is empty or missing');
    }
    if (!tasksContent) {
      log('WARN', 'PARTIAL_IMPL_DETECTION: TASKS.md is empty or missing');
    }
  }

  log('INFO', 'Running TASK_FR_ATOMICITY check...');
  if (tasksContent) {
    for (const taskLine of getFileLines('TASKS.md')) {
      if (/^\s*-\s*\[[ x]\]/i.test(taskLine)) {
        const frRefs = [...new Set(taskLine.match(/FR-\d+[a-z]?/gi) || [])];
        if (frRefs.length > 1) {
          findings.push({
            check: 'TASK_FR_ATOMICITY',
            category: 'LOGIC_GAPS',
            severity: 'WARNING',
            message: `TASK_ATOMICITY: Task covers multiple FRs: ${frRefs.join(', ')}`,
            details: `Task: ${taskLine.trim()}`,
          });
          log('WARN', `TASK_FR_ATOMICITY: Task covers ${frRefs.length} FRs: ${frRefs.join(', ')}`);
        }
      }
    }
  } else {
    log('WARN', 'TASK_FR_ATOMICITY: TASKS.md is empty or missing');
  }

  log('INFO', 'Running FR_SPLIT_CONSISTENCY check...');
  if (frContent) {
    const allFrIds = [...frContent.matchAll(/## FR-(\d+)([a-z])?:/gi)].map((match) => ({
      full: `FR-${match[1]}${match[2] || ''}`,
      num: Number(match[1]),
      suffix: match[2] || '',
    }));

    const splitFrNums = [...new Set(allFrIds.filter((item) => item.suffix).map((item) => item.num))];
    const allFrNums = [...new Set(allFrIds.map((item) => item.num))].sort((left, right) => left - right);

    for (const splitNum of splitFrNums) {
      const subVariants = allFrIds.filter((item) => item.num === splitNum && item.suffix).map((item) => item.suffix);

      for (const otherNum of allFrNums) {
        if (otherNum === splitNum) {
          continue;
        }

        const otherSubVariants = allFrIds.filter((item) => item.num === otherNum && item.suffix);
        if (Math.abs(otherNum - splitNum) === 1 && otherSubVariants.length === 0) {
          // Suppress for common patterns: language/platform adapters (≤4 sub-variants with single-letter suffixes)
          // or when one of the sub-variants is OUT OF SCOPE (intentional partial decomposition)
          const hasOosSuffix = subVariants.some((suffix) => {
            const subFrSection = frContent.match(new RegExp(`## FR-${splitNum}${suffix}:.*?(?=## FR-\\d|$)`, 'is'));
            return subFrSection && /^\s*>\s*OUT\s+OF\s+SCOPE/im.test(subFrSection[0]);
          });
          if (subVariants.length <= 4 && subVariants.every((s) => /^[a-d]$/.test(s)) || hasOosSuffix) {
            log('DEBUG', `FR_SPLIT_CONSISTENCY: FR-${splitNum} split suppressed (language adapters / OOS sub-variant)`);
          } else {
            const splitList = subVariants.map((suffix) => `FR-${splitNum}${suffix}`).join(', ');
            findings.push({
              check: 'FR_SPLIT_CONSISTENCY',
              category: 'INCONSISTENCY',
              severity: 'INFO',
              message: `FR_SPLIT_CONSISTENCY: FR-${splitNum} has sub-variant(s) (${splitList}) but adjacent FR-${otherNum} does not`,
              details: `Review whether FR-${otherNum} should also be split or if FR-${splitNum} sub-variants are justified`,
            });
            log('INFO', `FR_SPLIT_CONSISTENCY: FR-${splitNum} split, FR-${otherNum} not`);
          }
        }
      }
    }
  } else {
    log('WARN', 'FR_SPLIT_CONSISTENCY: FR.md is empty or missing');
  }

  log('INFO', 'Running BDD_SCENARIO_SCOPE check...');
  if (frContent && featureContent) {
    const domainTerms = ['batch', 'serial', 'IN', 'OUT', 'inbound', 'outbound', 'create', 'update', 'delete', 'rollback', 'cancel', 'approve', 'reject'];
    const frSections = [...frContent.matchAll(/## (FR-\d+[a-z]?):.*?(?=## FR-\d|$)/gis)];

    for (const section of frSections) {
      const frText = section[0];
      const frIdMatch = frText.match(/## (FR-\d+[a-z]?):/i);
      if (!frIdMatch) {
        continue;
      }

      const frId = frIdMatch[1];
      const frFeatureTags = [...new Set(frText.match(/@feature\d+/g) || [])];
      if (frFeatureTags.length === 0) {
        continue;
      }

      const frTerms = domainTerms.filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(frText));
      if (frTerms.length === 0) {
        continue;
      }

      for (const tag of frFeatureTags) {
        const tagNumMatch = tag.match(/\d+/);
        if (!tagNumMatch) {
          continue;
        }

        const scenarioMatches = [...featureContent.matchAll(new RegExp(`#\\s*@feature${tagNumMatch[0]}\\s*\\n\\s*Scenario[^:]*:.*?(?=#\\s*@feature\\d+|$)`, 'gis'))];
        if (scenarioMatches.length === 0) {
          continue;
        }

        const scenarioText = scenarioMatches.map((match) => match[0]).join(' ');
        const missingTerms = [];
        const presentTerms = [];

        for (const term of frTerms) {
          if (new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(scenarioText)) {
            presentTerms.push(term);
          } else {
            missingTerms.push(term);
          }
        }

        if (missingTerms.length > 0 && presentTerms.length > 0) {
          findings.push({
            check: 'BDD_SCENARIO_SCOPE',
            category: 'LOGIC_GAPS',
            severity: 'WARNING',
            message: `BDD_SCENARIO_SCOPE: ${frId} mentions '${missingTerms.join("', '")}' but ${tag} scenarios only cover '${presentTerms.join("', '")}'`,
            details: 'Add BDD scenarios to cover missing domain terms or verify they are out of scope',
          });
          log('WARN', `BDD_SCENARIO_SCOPE: ${frId} missing terms in ${tag} scenarios`);
        }
      }
    }
  } else {
    if (!frContent) {
      log('WARN', 'BDD_SCENARIO_SCOPE: FR.md is empty or missing');
    }
    if (!featureContent) {
      log('WARN', 'BDD_SCENARIO_SCOPE: No .feature file found');
    }
  }

  log('INFO', 'Running OUT_OF_SCOPE_PROPAGATION check...');
  if (frContent) {
    const frSections = [...frContent.matchAll(/## (FR-\d+[a-z]?):.*?(?=## FR-\d|$)/gis)];
    const oosFrEntries = [];

    for (const section of frSections) {
      const frId = section[1];
      // Match only blockquote format: "> OUT OF SCOPE" (not substring in regular text like "Ограничения v1: ... out of scope")
      if (/^\s*>\s*OUT\s+OF\s+SCOPE/im.test(section[0])) {
        // Extract @featureN tag from the FR header line (e.g., "## FR-3a: ... @feature3a")
        const featureTagMatch = section[0].match(/@feature(\w+)/);
        const featureTag = featureTagMatch ? featureTagMatch[1] : null;
        oosFrEntries.push({ frId, featureTag });
      }
    }
    // Back-compat alias
    const oosFrIds = oosFrEntries.map((e) => e.frId);

    if (oosFrIds.length > 0) {
      const oosUcContent = getFileContent('USE_CASES.md');
      const oosUserStoriesContent = getFileContent('USER_STORIES.md');
      const ucSections = oosUcContent ? oosUcContent.split(/(?=## UC-\d+)/i) : [];
      const acSplitSections = acContent ? acContent.split(/(?=## AC-\d+)/i) : [];
      const storyLines = oosUserStoriesContent ? oosUserStoriesContent.split(/\r?\n/) : [];

      for (const { frId, featureTag } of oosFrEntries) {
        // Use @featureTag from FR header if available, otherwise extract number from frId
        const frNumMatch = frId.match(/\d+/);
        const tagToSearch = featureTag || (frNumMatch ? frNumMatch[0] : null);
        if (!tagToSearch) {
          continue;
        }

        for (const ucSection of ucSections) {
          if (new RegExp(`\\b${escapeRegExp(frId)}\\b`, 'i').test(ucSection) && !/^\s*>\s*OUT\s+OF\s+SCOPE/im.test(ucSection)) {
            const ucIdMatch = ucSection.match(/## (UC-\d+)/i);
            findings.push({
              check: 'OUT_OF_SCOPE_PROPAGATION',
              category: 'LOGIC_GAPS',
              severity: 'WARNING',
              message: `${frId} is OUT OF SCOPE but ${ucIdMatch ? ucIdMatch[1] : 'a UC'} referencing it is not marked`,
              details: `Add '> OUT OF SCOPE — see ${frId}' to the related Use Case in USE_CASES.md`,
            });
            log('WARN', `OUT_OF_SCOPE_PROPAGATION: ${frId} OOS, related UC not marked`);
          }
        }

        for (const acSection of acSplitSections) {
          if (new RegExp(`\\(${escapeRegExp(frId)}\\)`, 'i').test(acSection) && !/^\s*>\s*OUT\s+OF\s+SCOPE/im.test(acSection)) {
            const acIdMatch = acSection.match(/## (AC-\d+)/i);
            findings.push({
              check: 'OUT_OF_SCOPE_PROPAGATION',
              category: 'LOGIC_GAPS',
              severity: 'WARNING',
              message: `${frId} is OUT OF SCOPE but ${acIdMatch ? acIdMatch[1] : 'an AC'} referencing it is not marked`,
              details: `Add '> OUT OF SCOPE — see ${frId}' to the related AC in ACCEPTANCE_CRITERIA.md`,
            });
            log('WARN', `OUT_OF_SCOPE_PROPAGATION: ${frId} OOS, related AC not marked`);
          }
        }

        for (const line of storyLines) {
          if (line.includes(`@feature${tagToSearch}`) && !/^\s*>\s*OUT\s+OF\s+SCOPE/im.test(line)) {
            findings.push({
              check: 'OUT_OF_SCOPE_PROPAGATION',
              category: 'LOGIC_GAPS',
              severity: 'WARNING',
              message: `${frId} is OUT OF SCOPE but User Story with @feature${tagToSearch} is not marked`,
              details: `Add '> OUT OF SCOPE' marker to the User Story tagged @feature${tagToSearch} in USER_STORIES.md`,
            });
            log('WARN', `OUT_OF_SCOPE_PROPAGATION: ${frId} OOS, User Story @feature${frNumMatch[0]} not marked`);
          }
        }
      }
    }
  }

  log('INFO', 'Running UNVERIFIED_CONFIG check...');
  if (designContent) {
    const ENV_VAR_WHITELIST = new Set([
      'SHALL', 'MUST', 'WHEN', 'THEN', 'NOTE', 'TODO', 'ACTIVE', 'NONE',
      'TRUE', 'FALSE', 'NULL', 'HTTP', 'HTTPS', 'UTF', 'DRAFT', 'EARS',
      'JSON', 'YAML', 'HTML', 'CRUD', 'TEST_DATA_ACTIVE', 'TEST_DATA_NONE',
      'LOGIC_GAPS', 'INCONSISTENCY', 'RUDIMENTS', 'FANTASIES', 'ERRORS',
      'WARNING', 'INFO', 'ERROR', 'WARN', 'DEBUG',
      'ОБЯЗАТЕЛЬНО', 'DESIGN', 'TASKS', 'REQUIREMENTS', 'ACCEPTANCE',
      'BDD', 'TDD', 'RED', 'GREEN', 'REFACTOR', 'PHASE',
      'POST', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD',
      'README', 'CHANGELOG', 'FILE_CHANGES', 'RESEARCH',
    ]);

    const designLines = designContent.split(/\r?\n/);
    const foundEnvVars = new Set();

    for (let i = 0; i < designLines.length; i++) {
      const envVarPattern = /\b([A-Z][A-Z0-9_]{3,})\b/g;
      let match;
      while ((match = envVarPattern.exec(designLines[i])) !== null) {
        const candidate = match[1];
        if (ENV_VAR_WHITELIST.has(candidate) || foundEnvVars.has(candidate)) {
          continue;
        }
        if (!/[_]/.test(candidate)) {
          continue;
        }

        const contextStart = Math.max(0, i - 5);
        const contextEnd = Math.min(designLines.length, i + 6);
        const context = designLines.slice(contextStart, contextEnd).join('\n');

        if (/\[VERIFIED|\[UNVERIFIED|https?:\/\/|Context7|official doc|documentation/i.test(context)) {
          continue;
        }

        foundEnvVars.add(candidate);
        findings.push({
          check: 'UNVERIFIED_CONFIG',
          category: 'FANTASIES',
          severity: 'INFO',
          message: `Env var '${candidate}' in DESIGN.md has no verification source`,
          details: `Add '[VERIFIED: source]' or '[UNVERIFIED]' marker near '${candidate}' in DESIGN.md`,
        });
        log('WARN', `UNVERIFIED_CONFIG: '${candidate}' has no verification marker`);
      }
    }
  }

  log('INFO', 'Running INFRA_TASKS_MISSING check...');
  if (designContent && tasksContent) {
    const INFRA_KEYWORDS = [
      'database', 'docker', 'compose', '\\.env', 'secrets', 'volume',
      'migration', 'redis', 'postgresql', 'mongodb', 'mysql',
      'kafka', 'rabbitmq', 'elasticsearch', 'nginx', 'ssl', 'certificate',
    ];

    const infraPattern = new RegExp(`\\b(${INFRA_KEYWORDS.join('|')})\\b`, 'gi');
    // Filter out table rows (|...|) and code blocks (```) before matching infra keywords
    let inCodeBlock = false;
    const designProseContent = designContent.split(/\r?\n/).filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) { inCodeBlock = !inCodeBlock; return false; }
      if (inCodeBlock) return false;
      if (trimmed.includes('|') && trimmed.startsWith('|')) return false; // table row
      return true;
    }).join('\n');
    const designInfraMatches = designProseContent.match(infraPattern);

    if (designInfraMatches && designInfraMatches.length > 0) {
      const hasInfraSection = /##\s.*(?:Infrastructure|Infra)/i.test(tasksContent);
      const tasksInfraMatches = tasksContent.match(infraPattern);
      const hasInfraInTasks = tasksInfraMatches && tasksInfraMatches.length >= 2;

      if (!hasInfraSection && !hasInfraInTasks) {
        const uniqueKeywords = [...new Set(designInfraMatches.map((k) => k.toLowerCase()))];
        findings.push({
          check: 'INFRA_TASKS_MISSING',
          category: 'LOGIC_GAPS',
          severity: 'WARNING',
          message: `DESIGN.md mentions infrastructure (${uniqueKeywords.join(', ')}) but TASKS.md has no infrastructure tasks`,
          details: 'Add Phase -1: Infrastructure Prerequisites to TASKS.md with database/docker/env/secrets setup tasks',
        });
        log('WARN', `INFRA_TASKS_MISSING: DESIGN.md has infra keywords, TASKS.md does not`);
      }
    }
  }

  log('INFO', 'Running CONFIG_DUPLICATION check...');
  if (designContent && tasksContent) {
    const filterLines = (text) => text.split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0
          && !trimmed.startsWith('## ')
          && !trimmed.startsWith('# ')
          && !trimmed.startsWith('- [ ]')
          && !trimmed.startsWith('- [x]')
          && !trimmed.startsWith('> ')
          && !trimmed.startsWith('|');
      });

    const designFilteredLines = filterLines(designContent);
    const tasksFilteredLines = filterLines(tasksContent);

    if (designFilteredLines.length >= 3 && tasksFilteredLines.length >= 3) {
      const tasksJoined = tasksFilteredLines.join('\n');
      const duplicatedBlocks = [];
      let i = 0;

      while (i <= designFilteredLines.length - 3) {
        const window = designFilteredLines.slice(i, i + 3).join('\n');
        if (tasksJoined.includes(window)) {
          let end = i + 3;
          while (end < designFilteredLines.length && tasksJoined.includes(designFilteredLines.slice(i, end + 1).join('\n'))) {
            end++;
          }
          duplicatedBlocks.push({
            startLine: designFilteredLines[i],
            lineCount: end - i,
          });
          i = end;
        } else {
          i++;
        }
      }

      for (const block of duplicatedBlocks) {
        findings.push({
          check: 'CONFIG_DUPLICATION',
          category: 'INCONSISTENCY',
          severity: 'INFO',
          message: `Duplicated config block (${block.lineCount} lines) between DESIGN.md and TASKS.md starting with: ${block.startLine.trim().slice(0, 60)}`,
          details: 'Reference the DESIGN.md section instead of copying config blocks. Use: _Config: see DESIGN.md section "..."_',
        });
        log('WARN', `CONFIG_DUPLICATION: ${block.lineCount}-line block duplicated`);
      }
    }
  }

  // =========================================================================
  // FILE_CHANGES_COMPLETENESS: files from TASKS.md must be in FILE_CHANGES.md
  // =========================================================================
  log('INFO', 'Running FILE_CHANGES_COMPLETENESS check...');
  const fileChangesContent = getFileContent('FILE_CHANGES.md');
  if (tasksContent && fileChangesContent) {
    // Extract paths from FILE_CHANGES.md table rows: | `path` | action | reason |
    const fcPaths = new Set();
    for (const m of fileChangesContent.matchAll(/\|\s*`([^`]+)`\s*\|/g)) {
      fcPaths.add(m[1].replace(/\/+$/, '')); // normalize trailing slash
    }

    // Extract file paths from TASKS.md **files:** lines: `path` *(action)*
    const taskFiles = [];
    for (const m of tasksContent.matchAll(/\*\*files:\*\*\s*(.+)/g)) {
      for (const pm of m[1].matchAll(/`([^`]+)`/g)) {
        const p = pm[1].replace(/\/+$/, '');
        if (p.includes('/') || p.includes('.')) taskFiles.push(p);
      }
    }

    const fcPathsArr = [...fcPaths];
    for (const tf of taskFiles) {
      // Check if path or its parent directory is listed
      const found = fcPaths.has(tf) || fcPathsArr.some((fp) => tf.startsWith(fp + '/'));
      if (!found) {
        findings.push({
          check: 'FILE_CHANGES_COMPLETENESS',
          category: 'LOGIC_GAPS',
          severity: 'WARNING',
          message: `File "${tf}" referenced in TASKS.md but missing from FILE_CHANGES.md`,
          details: `Add '| \`${tf}\` | edit/create | reason |' to FILE_CHANGES.md`,
        });
        log('WARN', `FILE_CHANGES_COMPLETENESS: ${tf} missing from FILE_CHANGES.md`);
      }
    }
  }

  // =========================================================================
  // FILE_CHANGES_VERIFY: action=edit files must exist, action=create must not
  // =========================================================================
  log('INFO', 'Running FILE_CHANGES_VERIFY check...');
  if (fileChangesContent) {
    const specParent = path.dirname(targetDir); // .specs/ parent = repo root
    const projectRoot = path.dirname(specParent);
    const fcRows = [...fileChangesContent.matchAll(/\|\s*`([^`]+)`\s*\|\s*`?(\w+)`?\s*\|/g)];
    for (const [, filePath, action] of fcRows) {
      if (!filePath || filePath === 'Path' || filePath === 'TBD') continue;
      // Skip wildcard patterns, home-relative paths, and placeholder paths
      if (filePath.includes('*') || filePath.startsWith('~') || filePath.includes('...')) continue;
      // Skip directory-only entries (ending with /)
      if (filePath.endsWith('/')) continue;
      const fullPath = path.join(projectRoot, filePath);
      const exists = fs.existsSync(fullPath);
      if (action === 'edit' && !exists) {
        findings.push({
          check: 'FILE_CHANGES_VERIFY',
          category: 'ERRORS',
          severity: 'ERROR',
          message: `FILE_CHANGES: "${filePath}" has action=edit but file does not exist`,
          details: `Verify the path exists or change action to 'create'`,
        });
        log('WARN', `FILE_CHANGES_VERIFY: ${filePath} action=edit but missing`);
      }
      // Note: action=create check disabled — spec may be written before implementation
    }
  }

  // =========================================================================
  // PHANTOM_CREATE_SOURCE: action=create "Move from X" — verify X exists
  // =========================================================================
  log('INFO', 'Running PHANTOM_CREATE_SOURCE check...');
  if (fileChangesContent) {
    const specParent2 = path.dirname(targetDir);
    const projectRoot2 = path.dirname(specParent2);
    // Parse full table rows: | path | action | reason |
    const fullRows = [...fileChangesContent.matchAll(/\|\s*`([^`]+)`\s*\|\s*`?(\w+)`?\s*\|\s*([^|]*)\|/g)];
    for (const [, , action, reason] of fullRows) {
      if (action !== 'create') continue;
      // Extract source path from reason: "Move from X" or "from X"
      const sourceMatch = reason.match(/(?:Move\s+)?from\s+(\S+)/i);
      if (!sourceMatch) continue;
      let sourcePath = sourceMatch[1].replace(/[`'"]/g, '').replace(/\/+$/, '');
      if (!sourcePath || sourcePath.includes('*') || sourcePath.includes('...')) continue;
      const sourceFullPath = path.join(projectRoot2, sourcePath);
      if (!fs.existsSync(sourceFullPath)) {
        findings.push({
          check: 'PHANTOM_CREATE_SOURCE',
          category: 'ERRORS',
          severity: 'WARNING',
          message: `FILE_CHANGES: source "${sourcePath}" does not exist (action=create)`,
          details: `Verify the source path exists or remove the migration entry`,
        });
        log('WARN', `PHANTOM_CREATE_SOURCE: ${sourcePath} not found`);
      }
    }
  }

  // =========================================================================
  // COUNT_CONSISTENCY: numeric claims must match actual counts
  // =========================================================================
  log('INFO', 'Running COUNT_CONSISTENCY check...');
  const readmeContent = getFileContent('README.md');
  if (frContent) {
    const actualFrCount = [...frContent.matchAll(/## FR-\d+:/g)].length;
    // Scan README and RESEARCH for "N FR" or "N functional" claims
    const textSources = [
      { name: 'README.md', content: readmeContent },
      { name: 'RESEARCH.md', content: researchContent },
    ];
    for (const { name, content } of textSources) {
      if (!content) continue;
      for (const m of content.matchAll(/(\d+)\s+FR\b/gi)) {
        const claimed = parseInt(m[1], 10);
        if (claimed > 0 && claimed !== actualFrCount && Math.abs(claimed - actualFrCount) > 2) {
          findings.push({
            check: 'COUNT_CONSISTENCY',
            category: 'INCONSISTENCY',
            severity: 'WARNING',
            message: `${name} claims "${m[0]}" but FR.md has ${actualFrCount} FR headings`,
            details: `Update the count in ${name} to match actual FR count (${actualFrCount})`,
          });
          log('WARN', `COUNT_CONSISTENCY: ${name} says ${claimed} FR, actual ${actualFrCount}`);
        }
      }
    }
  }

  // =========================================================================
  // PROSE_COUNT_SYNC: "N orphan/duplicate/phase/tool" claims vs actual counts
  // =========================================================================
  log('INFO', 'Running PROSE_COUNT_SYNC check...');
  {
    const proseSearchSources = [
      { name: 'README.md', content: readmeContent },
      { name: 'RESEARCH.md', content: researchContent },
    ];
    // Count actual phases in TASKS.md: "## Phase N" or "## Phase -N"
    const actualPhaseCount = tasksContent ? (tasksContent.match(/^## Phase\s+[-\d]+/gm) || []).length : 0;
    const prosePatterns = [
      { regex: /(\d+)\s+phase/gi, actual: actualPhaseCount, label: 'phases in TASKS.md' },
    ];
    for (const { name, content } of proseSearchSources) {
      if (!content) continue;
      for (const { regex, actual, label } of prosePatterns) {
        regex.lastIndex = 0;
        for (const m of content.matchAll(regex)) {
          const claimed = parseInt(m[1], 10);
          if (claimed > 0 && actual > 0 && claimed !== actual) {
            findings.push({
              check: 'PROSE_COUNT_SYNC',
              category: 'INCONSISTENCY',
              severity: 'WARNING',
              message: `${name} claims "${m[0]}" but actual count is ${actual} ${label}`,
              details: `Update "${m[0]}" in ${name} to ${actual}`,
            });
            log('WARN', `PROSE_COUNT_SYNC: ${name} ${m[0]} vs ${actual} ${label}`);
          }
        }
      }
    }
  }

  // =========================================================================
  // SCENARIO_COUNT_SYNC: "N scenarios" claims must match .feature Scenario count
  // =========================================================================
  log('INFO', 'Running SCENARIO_COUNT_SYNC check...');
  if (featureContent) {
    const actualScenarioCount = (featureContent.match(/^\s*Scenario:/gm) || []).length;
    const changelogContent = getFileContent('CHANGELOG.md');
    const countSources = [
      { name: 'README.md', content: readmeContent },
      { name: 'CHANGELOG.md', content: changelogContent },
    ];
    for (const { name, content } of countSources) {
      if (!content) continue;
      // Match both "N scenarios" and "scenarios | N" (table format)
      const scenarioPatterns = [
        ...content.matchAll(/(\d+)\s+(?:BDD\s+)?scenario/gi),
        ...content.matchAll(/(?:BDD\s+)?scenarios?\s*\|\s*(\d+)/gi),
      ];
      for (const m of scenarioPatterns) {
        const claimed = parseInt(m[1], 10);
        if (claimed > 0 && claimed !== actualScenarioCount) {
          findings.push({
            check: 'SCENARIO_COUNT_SYNC',
            category: 'INCONSISTENCY',
            severity: 'WARNING',
            message: `${name} claims "${m[0]}" but .feature has ${actualScenarioCount} Scenario: lines`,
            details: `Update the scenario count in ${name} to ${actualScenarioCount}`,
          });
          log('WARN', `SCENARIO_COUNT_SYNC: ${name} says ${claimed}, actual ${actualScenarioCount}`);
        }
      }
    }
  }

  // =========================================================================
  // FIXTURES_CONSISTENCY: TEST_DATA_ACTIVE requires filled FIXTURES.md
  // =========================================================================
  log('INFO', 'Running FIXTURES_CONSISTENCY check...');
  const designContent2 = designContent || getFileContent('DESIGN.md');
  if (designContent2 && /TEST_DATA_ACTIVE/i.test(designContent2)) {
    const fixturesContent = getFileContent('FIXTURES.md');
    if (!fixturesContent) {
      findings.push({
        check: 'FIXTURES_CONSISTENCY',
        category: 'LOGIC_GAPS',
        severity: 'WARNING',
        message: 'DESIGN.md has TEST_DATA_ACTIVE classification but FIXTURES.md is missing',
        details: 'Create FIXTURES.md with fixture inventory, lifecycle, and gap analysis per specs-management Step 6.5',
      });
      log('WARN', 'FIXTURES_CONSISTENCY: FIXTURES.md missing for TEST_DATA_ACTIVE');
    } else {
      // Check if FIXTURES.md is still a placeholder (contains unfilled template markers)
      const hasPlaceholders = /\{Название фикстуры\}|\{static\/factory/.test(fixturesContent);
      // Real content = F-N headings with actual names (not template placeholders)
      const hasRealFixtures = /### F-\d+:\s+[^{]/.test(fixturesContent);
      if (hasPlaceholders && !hasRealFixtures) {
        findings.push({
          check: 'FIXTURES_CONSISTENCY',
          category: 'LOGIC_GAPS',
          severity: 'WARNING',
          message: 'DESIGN.md has TEST_DATA_ACTIVE but FIXTURES.md contains only placeholder template',
          details: 'Fill FIXTURES.md with actual fixture definitions: inventory, lifecycle, dependencies, gap analysis',
        });
        log('WARN', 'FIXTURES_CONSISTENCY: FIXTURES.md is placeholder for TEST_DATA_ACTIVE');
      }
    }
  }

  const categoryCount = {
    ERRORS: 0,
    LOGIC_GAPS: 0,
    INCONSISTENCY: 0,
    RUDIMENTS: 0,
    FANTASIES: 0,
  };

  for (const finding of findings) {
    if (Object.prototype.hasOwnProperty.call(categoryCount, finding.category)) {
      categoryCount[finding.category] += 1;
    }
  }

  const aiChecksPending = [
    'ERRORS: Verify DESIGN.md component/method/file references exist in codebase',
    "ERRORS: Check items marked 'Need to add' or 'TODO' that may already exist",
    'ERRORS: Verify FILE_CHANGES.md - create targets do not already exist (pre-implementation only)',
    'INCONSISTENCY: Compare domain-specific naming across all spec files',
    'FANTASIES: Verify API assumptions in RESEARCH.md have sources/proof',
    'FANTASIES: Check for untested claims presented as confirmed facts',
    'RUDIMENTS: Identify scope creep (client-side concerns in server spec, or vice versa)',
    'RUDIMENTS: Check for open questions in RESEARCH.md that are answered elsewhere in spec',
    'INCONSISTENCY: TABLE_ROW_COUNT — verify section headers ("N dirs", "N files") match actual table row counts below them',
    'LOGIC_GAPS: AUDIT_REPORT_EXISTS — verify AUDIT_REPORT.md exists if spec completed Phase 3+ Audit',
  ];

  const result = {
    path: options.inputPath,
    timestamp: formatLocalTimestamp(),
    findings,
    summary: {
      total: findings.length,
      by_category: categoryCount,
    },
    ai_checks_pending: aiChecksPending,
  };

  log('INFO', `Audit complete: ${findings.length} findings`);
  emitResult(options.format, result, (value) => `Spec Audit (Automated): ${path.basename(value.path)}`);
  return 0;
}

function commandAnalyzeFeatures(argv) {
  const options = parseArgs(argv, [
    { flag: '-FeatureSlug', key: 'featureSlug', type: 'string', default: '' },
    { flag: '-DomainCode', key: 'domainCode', type: 'string', default: '' },
    { flag: '-Query', key: 'query', type: 'string', default: '' },
    { flag: '-VerboseOutput', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-Verbose', key: 'verboseOutput', type: 'boolean', default: false },
    { flag: '-LogFile', key: 'logFile', type: 'string', default: '' },
    { flag: '-Format', key: 'format', type: 'string', default: 'json' },
  ]);
  assertFormat(options.format);

  const context = createCommandContext(options);
  if (!context.repoRoot) {
    throw new CliError(`Repository root not found from ${SCRIPT_DIR}`, 1);
  }

  const { log, repoRoot } = context;
  log('INFO', 'Analyzing feature files...');

  const searchPaths = [
    path.join(repoRoot, 'tests', 'features'),
    path.join(repoRoot, '.specs'),
  ];

  const featureFiles = [];
  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) {
      continue;
    }

    const foundFiles = collectFilesRecursive(searchPath, (fullPath) => fullPath.endsWith('.feature'));
    for (const fullPath of foundFiles) {
      const relativePath = normalizeSlashes(path.relative(repoRoot, fullPath));
      let type = 'production';
      if (/^\.specs\//.test(relativePath)) {
        type = 'spec';
      }
      if (/fixtures\//.test(relativePath)) {
        type = 'fixture';
      }

      featureFiles.push({
        fullPath,
        relativePath,
        fileName: path.basename(fullPath),
        type,
      });
    }
  }

  log('INFO', `Found ${featureFiles.length} .feature files`);

  const analyzeFeatureFile = (fileInfo) => {
    const lines = safeReadLines(fileInfo.fullPath);
    if (lines.length === 0) {
      return null;
    }

    const result = {
      path: fileInfo.relativePath,
      relativePath: fileInfo.relativePath,
      fileName: fileInfo.fileName,
      type: fileInfo.type,
      domainCode: '',
      domainPrefix: '',
      domainNumber: 0,
      featureSlug: '',
      featureLine: '',
      description: '',
      hasBackground: false,
      background: [],
      scenarioCount: 0,
      scenarioOutlineCount: 0,
      scenarios: [],
      steps: { given: [], when: [], then: [] },
      allSteps: [],
      tags: [],
      featureTags: [],
      implementedAnnotations: [],
      hasSectionDividers: false,
      tables: [],
    };

    const domainMatch = fileInfo.fileName.match(/^([A-Z]+)(\d+)_(.+)\.feature$/);
    if (domainMatch) {
      result.domainPrefix = domainMatch[1];
      result.domainNumber = Number(domainMatch[2]);
      result.domainCode = `${domainMatch[1]}${domainMatch[2].padStart(3, '0')}`;
      result.featureSlug = domainMatch[3];
    } else {
      const slugMatch = fileInfo.fileName.match(/^(.+)\.feature$/);
      if (slugMatch) {
        result.featureSlug = slugMatch[1];
      }
    }

    let inBackground = false;
    let currentStepType = '';
    let lastStep = '';
    const scenarioNames = [];

    lines.forEach((line, index) => {
      const featureMatch = line.match(/^\s*Feature:\s*(.+)$/);
      if (featureMatch) {
        result.featureLine = featureMatch[1].trim();
      }

      if (/^\s+(As a|I want|So that)\s/.test(line)) {
        result.description += `${line.trim()}\n`;
      }

      if (/^\s*Background:/.test(line)) {
        inBackground = true;
        result.hasBackground = true;
        return;
      }

      const scenarioMatch = line.match(/^\s*(Scenario Outline|Scenario):\s*(.+)$/);
      if (scenarioMatch) {
        inBackground = false;
        const scenarioType = scenarioMatch[1];
        const scenarioName = scenarioMatch[2].trim();
        scenarioNames.push(scenarioName);
        if (scenarioType === 'Scenario Outline') {
          result.scenarioOutlineCount += 1;
        } else {
          result.scenarioCount += 1;
        }
        return;
      }

      const stepMatch = line.match(/^\s+(Given|When|Then|And|But)\s+(.+)$/);
      if (stepMatch) {
        const keyword = stepMatch[1];
        const stepText = stepMatch[2].trim();
        if (keyword !== 'And' && keyword !== 'But') {
          currentStepType = keyword.toLowerCase();
        }

        const fullStep = `${keyword} ${stepText}`;
        lastStep = fullStep;

        if (inBackground) {
          result.background.push(fullStep);
        }

        if (currentStepType && Object.prototype.hasOwnProperty.call(result.steps, currentStepType)) {
          result.steps[currentStepType].push(fullStep);
        }

        result.allSteps.push({
          keyword,
          type: currentStepType,
          text: stepText,
          full: fullStep,
          line: index + 1,
          inBackground,
        });
        return;
      }

      const tableMatch = line.match(/^\s*\|(.+)\|$/);
      if (tableMatch && lastStep) {
        const cells = tableMatch[1]
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean);
        let isHeader = cells.length > 0;
        for (const cell of cells) {
          if (/^\d+$/.test(cell) || /^"/.test(cell)) {
            isHeader = false;
            break;
          }
        }
        if (isHeader) {
          result.tables.push({
            step: lastStep,
            columns: cells,
            line: index + 1,
          });
          lastStep = '';
        }
        return;
      }

      if (/#\s*(@feature\d+)/.test(line)) {
        const tagMatches = line.match(/@feature\d+/g) || [];
        result.featureTags.push(...tagMatches);
      }

      const implementedMatch = line.match(/#\s*@implemented:\s*(.+)$/);
      if (implementedMatch) {
        result.implementedAnnotations.push(implementedMatch[1].trim());
      }

      const tagMatch = line.match(/^\s*@([a-z][-a-z]*)/);
      if (tagMatch) {
        result.tags.push(`@${tagMatch[1]}`);
      }

      if (/^\s*#\s*={5,}/.test(line)) {
        result.hasSectionDividers = true;
      }

      if (!/^\s*\|/.test(line) && !/^\s+(Given|When|Then|And|But)\s/.test(line)) {
        lastStep = '';
      }
    });

    result.scenarios = scenarioNames;
    result.description = result.description.trim();
    return result;
  };

  const analyzedFeatures = featureFiles
    .map((fileInfo) => analyzeFeatureFile(fileInfo))
    .filter(Boolean);

  log('INFO', `Analyzed ${analyzedFeatures.length} feature files`);

  const stepDict = {
    given: new Map(),
    when: new Map(),
    then: new Map(),
  };

  for (const feature of analyzedFeatures) {
    for (const stepType of ['given', 'when', 'then']) {
      for (const step of feature.steps[stepType]) {
        if (stepDict[stepType].has(step)) {
          const entry = stepDict[stepType].get(step);
          entry.count += 1;
          if (!entry.files.includes(feature.path)) {
            entry.files.push(feature.path);
          }
        } else {
          stepDict[stepType].set(step, {
            step,
            count: 1,
            files: [feature.path],
          });
        }
      }
    }
  }

  const stepDictSorted = {};
  for (const stepType of ['given', 'when', 'then']) {
    stepDictSorted[stepType] = [...stepDict[stepType].values()].sort((left, right) => right.count - left.count);
  }

  const backgroundPatterns = new Map();
  for (const feature of analyzedFeatures) {
    if (feature.hasBackground && feature.background.length > 0) {
      const key = feature.background.join(' | ');
      if (backgroundPatterns.has(key)) {
        const entry = backgroundPatterns.get(key);
        entry.count += 1;
        entry.files.push(feature.path);
      } else {
        backgroundPatterns.set(key, {
          steps: feature.background,
          count: 1,
          files: [feature.path],
        });
      }
    }
  }
  const backgroundPatternsSorted = [...backgroundPatterns.values()].sort((left, right) => right.count - left.count);

  const domainStats = {};
  let noDomainCount = 0;
  for (const feature of analyzedFeatures) {
    if (feature.domainPrefix) {
      domainStats[feature.domainPrefix] ||= {
        count: 0,
        maxNumber: 0,
        files: [],
        numbers: [],
      };
      domainStats[feature.domainPrefix].count += 1;
      domainStats[feature.domainPrefix].files.push(feature.path);
      domainStats[feature.domainPrefix].numbers.push(feature.domainNumber);
      domainStats[feature.domainPrefix].maxNumber = Math.max(domainStats[feature.domainPrefix].maxNumber, feature.domainNumber);
    } else {
      noDomainCount += 1;
    }
  }

  const nextDomainNumbers = {};
  for (const prefix of Object.keys(domainStats)) {
    const nextNumber = domainStats[prefix].maxNumber + 1;
    nextDomainNumbers[prefix] = `${prefix}${String(nextNumber).padStart(3, '0')}`;
  }

  const duplicateDomains = [];
  for (const prefix of Object.keys(domainStats)) {
    const grouped = {};
    for (const num of domainStats[prefix].numbers) {
      grouped[num] ||= 0;
      grouped[num] += 1;
    }

    for (const [num, count] of Object.entries(grouped)) {
      if (count > 1) {
        duplicateDomains.push({
          code: `${prefix}${Number(num)}`,
          count,
          files: analyzedFeatures
            .filter((feature) => feature.domainPrefix === prefix && feature.domainNumber === Number(num))
            .map((feature) => feature.path),
        });
      }
    }
  }

  const tablePatterns = new Map();
  for (const feature of analyzedFeatures) {
    for (const table of feature.tables) {
      const key = `${table.step} >> ${table.columns.join(' | ')}`;
      if (tablePatterns.has(key)) {
        const entry = tablePatterns.get(key);
        entry.count += 1;
        if (!entry.files.includes(feature.path)) {
          entry.files.push(feature.path);
        }
      } else {
        tablePatterns.set(key, {
          step: table.step,
          columns: table.columns,
          count: 1,
          files: [feature.path],
        });
      }
    }
  }
  const tablePatternsSorted = [...tablePatterns.values()].sort((left, right) => right.count - left.count);

  const setupStepGroups = new Map();
  const givenEntityPattern = /(Given|And)\s+(Zoho\s+\w+|a\s+\w+\s+\w+|the\s+\w+)\s+(exists|is\s+\w+|has\s+\w+)/i;
  for (const feature of analyzedFeatures) {
    for (const step of feature.allSteps) {
      if (step.type === 'given' && givenEntityPattern.test(step.full)) {
        if (setupStepGroups.has(step.full)) {
          const entry = setupStepGroups.get(step.full);
          entry.count += 1;
          if (!entry.files.includes(feature.path)) {
            entry.files.push(feature.path);
          }
        } else {
          setupStepGroups.set(step.full, {
            step: step.full,
            count: 1,
            files: [feature.path],
          });
        }
      }
    }
  }
  const setupStepsSorted = [...setupStepGroups.values()].sort((left, right) => right.count - left.count);

  const tablelessWhenSteps = new Map();
  for (const feature of analyzedFeatures) {
    const tableSteps = feature.tables.map((table) => table.step);
    for (const step of feature.allSteps) {
      if (step.type === 'when' && step.keyword === 'When' && !tableSteps.includes(step.full)) {
        if (tablelessWhenSteps.has(step.full)) {
          const entry = tablelessWhenSteps.get(step.full);
          entry.count += 1;
          if (!entry.files.includes(feature.path)) {
            entry.files.push(feature.path);
          }
        } else {
          tablelessWhenSteps.set(step.full, {
            step: step.full,
            count: 1,
            files: [feature.path],
          });
        }
      }
    }
  }
  const tablelessWhenSorted = [...tablelessWhenSteps.values()].sort((left, right) => right.count - left.count);

  const assertionGroups = {
    status: new Map(),
    error: new Map(),
    data: new Map(),
    contains: new Map(),
    other: new Map(),
  };

  const assertionPatterns = {};
  for (const feature of analyzedFeatures) {
    for (const step of feature.steps.then) {
      let group = 'other';
      if (/response\s+status\s+is|status\s+(is|should be)\s+\d/i.test(step)) {
        group = 'status';
      } else if (/contains?\s+error|error\s+(message|response)/i.test(step)) {
        group = 'error';
      } else if (/contains?\s+(serial|batch|auto-created|data|numbers)/i.test(step)) {
        group = 'contains';
      } else if (/should\s+(exist|contain|be|have|not)/i.test(step)) {
        group = 'data';
      }

      if (assertionGroups[group].has(step)) {
        const entry = assertionGroups[group].get(step);
        entry.count += 1;
        if (!entry.files.includes(feature.path)) {
          entry.files.push(feature.path);
        }
      } else {
        assertionGroups[group].set(step, {
          step,
          count: 1,
          files: [feature.path],
        });
      }
    }
  }

  for (const group of Object.keys(assertionGroups)) {
    assertionPatterns[group] = [...assertionGroups[group].values()].sort((left, right) => right.count - left.count);
  }

  let featureTagCount = 0;
  let featureTagFiles = 0;
  let implementedCount = 0;
  let implementedFiles = 0;
  let dividerFiles = 0;

  for (const feature of analyzedFeatures) {
    if (feature.featureTags.length > 0) {
      featureTagCount += feature.featureTags.length;
      featureTagFiles += 1;
    }
    if (feature.implementedAnnotations.length > 0) {
      implementedCount += feature.implementedAnnotations.length;
      implementedFiles += 1;
    }
    if (feature.hasSectionDividers) {
      dividerFiles += 1;
    }
  }

  let candidates = [];
  if (options.featureSlug || options.domainCode || options.query) {
    candidates = analyzedFeatures
      .map((feature) => {
        let score = 0;
        const reasons = [];

        if (options.domainCode && feature.domainPrefix === options.domainCode.toUpperCase()) {
          score += 3;
          reasons.push(`Domain code match: ${feature.domainCode}`);
        }

        if (options.featureSlug) {
          const featureSlug = options.featureSlug.toLowerCase();
          if (feature.featureSlug && feature.featureSlug.toLowerCase().includes(featureSlug)) {
            score += 2;
            reasons.push(`Slug match: ${feature.featureSlug}`);
          }
        }

        if (options.query) {
          const query = options.query.toLowerCase();
          if (feature.featureLine && feature.featureLine.toLowerCase().includes(query)) {
            score += 1;
            reasons.push(`Feature line match: ${feature.featureLine}`);
          }
        }

        if (score === 0) {
          return null;
        }

        return {
          path: feature.path,
          score,
          reasons,
          background: feature.background,
          scenarioCount: feature.scenarioCount + feature.scenarioOutlineCount,
          tables: feature.tables,
          featureLine: feature.featureLine,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score);
  }

  const result = {
    timestamp: formatLocalTimestamp(),
    totalFeatures: analyzedFeatures.length,
    searchPaths: searchPaths.map((searchPath) => normalizeSlashes(path.relative(repoRoot, searchPath))),
    distribution: {
      production: analyzedFeatures.filter((feature) => feature.type === 'production').length,
      spec: analyzedFeatures.filter((feature) => feature.type === 'spec').length,
      fixture: analyzedFeatures.filter((feature) => feature.type === 'fixture').length,
    },
    features: analyzedFeatures.map((feature) => ({
      path: feature.path,
      type: feature.type,
      domainCode: feature.domainCode,
      featureSlug: feature.featureSlug,
      featureLine: feature.featureLine,
      hasBackground: feature.hasBackground,
      background: feature.background,
      scenarioCount: feature.scenarioCount,
      scenarioOutlineCount: feature.scenarioOutlineCount,
      tableCount: feature.tables.length,
    })),
    stepDictionary: {
      given: stepDictSorted.given.slice(0, 20),
      when: stepDictSorted.when.slice(0, 20),
      then: stepDictSorted.then.slice(0, 20),
    },
    backgroundPatterns: backgroundPatternsSorted,
    namingPatterns: {
      domains: Object.keys(domainStats).map((prefix) => ({
        prefix,
        count: domainStats[prefix].count,
        maxNumber: domainStats[prefix].maxNumber,
        nextAvailable: nextDomainNumbers[prefix],
      })),
      noDomainCode: noDomainCount,
      duplicates: duplicateDomains,
    },
    tablePatterns: tablePatternsSorted.slice(0, 20),
    setupPatterns: {
      entitySetupSteps: setupStepsSorted.slice(0, 15),
      tablelessWhenSteps: tablelessWhenSorted.slice(0, 15),
    },
    assertionPatterns: {
      status: assertionPatterns.status.slice(0, 10),
      error: assertionPatterns.error.slice(0, 10),
      contains: assertionPatterns.contains.slice(0, 10),
      data: assertionPatterns.data.slice(0, 10),
      other: assertionPatterns.other.slice(0, 10),
    },
    tagPatterns: {
      featureTags: { total: featureTagCount, filesUsing: featureTagFiles },
      implementedAnnotations: { total: implementedCount, filesUsing: implementedFiles },
      sectionDividers: { filesUsing: dividerFiles },
    },
    candidates,
    recommendations: {
      suggestedBackground: backgroundPatternsSorted.length > 0 ? backgroundPatternsSorted[0].steps : [],
      nextDomainNumbers,
      duplicateDomainWarnings: duplicateDomains,
    },
  };

  log('INFO', `Analysis complete: ${analyzedFeatures.length} features`);
  emitResult(options.format, result, () => 'Feature Analysis Report');
  return 0;
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command) {
    throw new CliError('Usage: specs-generator-core.mjs <command> [options]', 2);
  }

  switch (command) {
    case 'scaffold-spec':
      return commandScaffoldSpec(argv);
    case 'fill-template':
      return commandFillTemplate(argv);
    case 'validate-spec':
      return commandValidateSpec(argv);
    case 'spec-status':
      return commandSpecStatus(argv);
    case 'list-specs':
      return commandListSpecs(argv);
    case 'audit-spec':
      return commandAuditSpec(argv);
    case 'analyze-features':
      return commandAnalyzeFeatures(argv);
    default:
      throw new CliError(`Unknown command: ${command}`, 2);
  }
}

try {
  const exitCode = main();
  process.exit(exitCode);
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(error.exitCode);
  }

  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
}
