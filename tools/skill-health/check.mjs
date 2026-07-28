#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const REQUIRED_FIELDS = ['name', 'description', 'allowed-tools'];
const VALID_MIRROR_MODES = new Set(['exact', 'adapted', 'canonical-only', 'legacy']);
const ACTIVE_TOOL_PATTERNS = new Map([
  ['Skill', /\bSkill\s*\(\s*["'`]/g],
  ['Agent', /\bAgent\s*\(\s*\{/g],
  ['AskUserQuestion', /\bAskUserQuestion\s*\(/g],
  ['WebFetch', /\bWebFetch\s*\(/g],
  ['WebSearch', /\bWebSearch\s*\(/g],
]);
const MCP_CALL_PATTERN = /\b(mcp__[a-z0-9_-]+__[a-z0-9_-]+)\s*\(/gi;

function parseArgs(argv) {
  const args = { root: process.cwd(), mode: 'report', format: 'text' };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--root') args.root = path.resolve(argv[++i]);
    else if (value === '--strict') args.mode = 'strict';
    else if (value === '--report') args.mode = 'report';
    else if (value === '--json') args.format = 'json';
    else if (value === '--self-test') args.selfTest = true;
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  return args;
}

function posix(value) {
  return value.split(path.sep).join('/');
}

function lineOf(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function finding(code, file, line, message, severity = 'error') {
  return { code, file: posix(file), line, severity, message };
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== '\\') {
      quote = quote === char ? null : (quote ?? char);
    }
    if (char === '#' && quote === null && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(content, relativePath) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  if (lines[0] !== '---') {
    findings.push(finding('FRONTMATTER_MISSING', relativePath, 1, 'SKILL.md must start with ---'));
    return { values: {}, findings, body: content, bodyStart: 1 };
  }
  const end = lines.indexOf('---', 1);
  if (end < 0) {
    findings.push(finding('FRONTMATTER_UNTERMINATED', relativePath, 1, 'frontmatter has no closing ---'));
    return { values: {}, findings, body: '', bodyStart: lines.length + 1 };
  }

  const values = {};
  const seen = new Map();
  let i = 1;
  while (i < end) {
    const raw = lines[i];
    if (!raw.trim() || raw.trimStart().startsWith('#')) { i += 1; continue; }
    const match = raw.match(/^([A-Za-z][A-Za-z0-9-]*):(?:\s*(.*))?$/);
    if (!match) {
      findings.push(finding('FRONTMATTER_YAML_INVALID', relativePath, i + 1, `unsupported or malformed YAML: ${raw.trim()}`));
      i += 1;
      continue;
    }
    const key = match[1];
    let value = stripComment(match[2] ?? '').trim();
    if (seen.has(key)) {
      findings.push(finding('FRONTMATTER_DUPLICATE_FIELD', relativePath, i + 1, `duplicate field: ${key}`));
    }
    seen.set(key, i + 1);

    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      const chunks = [];
      const folded = value.startsWith('>');
      i += 1;
      while (i < end && (/^\s+/.test(lines[i]) || !lines[i].trim())) {
        chunks.push(lines[i].replace(/^\s{2}/, ''));
        i += 1;
      }
      value = folded ? chunks.join(' ').replace(/\s+/g, ' ').trim() : chunks.join('\n').trim();
      values[key] = value;
      continue;
    }

    if (value === '') {
      const list = [];
      i += 1;
      while (i < end) {
        const item = lines[i].match(/^\s+-\s+(.+)$/);
        if (!item) break;
        list.push(unquote(stripComment(item[1])));
        i += 1;
      }
      values[key] = list;
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      values[key] = value.slice(1, -1).split(',').map((item) => unquote(item)).filter(Boolean);
      i += 1;
      continue;
    }

    if (!value.startsWith('"') && !value.startsWith("'") && /:\s/.test(value)) {
      findings.push(finding('FRONTMATTER_YAML_INVALID', relativePath, i + 1, `plain scalar contains an unquoted colon: ${key}`));
    }
    values[key] = unquote(value);
    i += 1;
  }

  for (const field of REQUIRED_FIELDS) {
    const value = values[field];
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) findings.push(finding(`FRONTMATTER_${field.toUpperCase().replace('-', '_')}_MISSING`, relativePath, 1, `required field is missing or empty: ${field}`));
  }

  const name = values.name;
  if (typeof name === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    findings.push(finding('FRONTMATTER_NAME_INVALID', relativePath, seen.get('name') ?? 1, 'name must be lowercase kebab-case'));
  }

  return { values, findings, body: lines.slice(end + 1).join('\n'), bodyStart: end + 2 };
}

function declaredTools(value) {
  const raw = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
  return new Set(raw.map((entry) => String(entry).trim()).filter(Boolean).map((entry) => entry.match(/^([A-Za-z][A-Za-z0-9_]*)/)?.[1] ?? entry));
}

function maskNonActiveRegions(text) {
  let masked = text.replace(/```[\s\S]*?```/g, (chunk) => chunk.replace(/[^\n]/g, ' '));
  masked = masked.replace(/`[^`\n]+`/g, (chunk) => chunk.replace(/[^\n]/g, ' '));
  masked = masked.split(/\r?\n/).map((line) => {
    if (/^\s*>/.test(line)) return ' '.repeat(line.length);
    if (/\b(?:never|do not|don't|dont|without|forbid|forbidden|avoid|not)\b/i.test(line)) return ' '.repeat(line.length);
    return line;
  }).join('\n');
  return masked;
}

function activeToolFindings(parsed, relativePath) {
  const findings = [];
  const declared = declaredTools(parsed.values['allowed-tools']);
  if (declared.has('*')) return findings;
  const active = maskNonActiveRegions(parsed.body);
  for (const [tool, pattern] of ACTIVE_TOOL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(active);
    if (match && !declared.has(tool)) {
      findings.push(finding('ALLOWED_TOOLS_MISSING', relativePath, parsed.bodyStart + lineOf(active, match.index) - 1, `active ${tool}(...) call is not declared in allowed-tools`));
    }
  }
  MCP_CALL_PATTERN.lastIndex = 0;
  for (const match of active.matchAll(MCP_CALL_PATTERN)) {
    const tool = match[1];
    if (!declared.has(tool)) {
      findings.push(finding('ALLOWED_TOOLS_MISSING', relativePath, parsed.bodyStart + lineOf(active, match.index) - 1, `active ${tool}(...) call is not declared in allowed-tools`));
    }
  }
  return findings;
}

function localReferenceFindings(root, filePath, content) {
  const relativePath = path.relative(root, filePath);
  const findings = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of content.matchAll(pattern)) {
    const label = match[1];
    const target = match[2].split('#')[0].trim();
    const exampleLike = /(?:^|\b)(?:example|text|label|broken|correct|other\.md|file\.md|fr\.md)(?:\b|$)/i.test(`${label} ${target}`);
    if (!target || exampleLike || target.includes('|') || target.includes('(?:') || /^(?:[a-z]+:|#)/i.test(target) || /[<{*}]/.test(target)) continue;
    const resolved = path.resolve(path.dirname(filePath), target);
    const inside = resolved === root || resolved.startsWith(root + path.sep);
    if (!inside) {
      findings.push(finding('REFERENCE_ESCAPES_ROOT', relativePath, lineOf(content, match.index), `reference escapes plugin root: ${target}`));
    } else if (!fs.existsSync(resolved)) {
      findings.push(finding('LOCAL_REFERENCE_MISSING', relativePath, lineOf(content, match.index), `local reference does not exist: ${target}`));
    }
  }
  return findings;
}

function collectSkills(root) {
  const skillsDir = path.join(root, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, 'SKILL.md'))
    .filter((file) => fs.existsSync(file))
    .sort();
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mirrorFindings(root, contract) {
  const findings = [];
  for (const entry of contract.entries ?? []) {
    if (!VALID_MIRROR_MODES.has(entry.mode)) {
      findings.push(finding('MIRROR_MODE_INVALID', 'tools/skill-health/mirror-contract.json', 1, `invalid mirror mode for ${entry.canonical}: ${entry.mode}`));
      continue;
    }
    const canonical = path.resolve(root, entry.canonical);
    const mirror = entry.mirror ? path.resolve(root, entry.mirror) : null;
    if (entry.mode === 'canonical-only' || entry.mode === 'legacy') continue;
    if (!fs.existsSync(canonical) || !mirror || !fs.existsSync(mirror)) {
      if (!entry.optional) findings.push(finding('MIRROR_TARGET_MISSING', entry.canonical, 1, `required ${entry.mode} mirror is missing`));
      continue;
    }
    const canonicalText = fs.readFileSync(canonical, 'utf8').replace(/\r\n/g, '\n');
    let expected = canonicalText;
    if (entry.mode === 'adapted') {
      for (const transform of entry.transforms ?? []) {
        expected = expected.split(transform.from).join(transform.to);
      }
    }
    const actual = fs.readFileSync(mirror, 'utf8').replace(/\r\n/g, '\n');
    if (expected !== actual) findings.push(finding('MIRROR_DRIFT', path.relative(root, mirror), 1, `mirror differs from ${entry.canonical} under ${entry.mode} policy`));
  }
  return findings;
}

function applyBaseline(findings, baseline, fingerprints) {
  const entries = baseline.entries ?? [];
  return findings.map((item) => {
    const fingerprint = fingerprints.get(item.file) ?? null;
    const matched = entries.some((entry) => entry.path === item.file && entry.code === item.code && entry.fingerprint === fingerprint);
    return { ...item, fingerprint, baselined: matched };
  });
}

function run(root) {
  const findings = [];
  const fingerprints = new Map();
  const skills = collectSkills(root);
  for (const filePath of skills) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = posix(path.relative(root, filePath));
    fingerprints.set(relativePath, hash(content));
    const parsed = parseFrontmatter(content, relativePath);
    findings.push(...parsed.findings, ...activeToolFindings(parsed, relativePath), ...localReferenceFindings(root, filePath, content));
  }
  const checkerDir = path.join(root, 'tools', 'skill-health');
  const mirrorContract = loadJson(path.join(checkerDir, 'mirror-contract.json'), { entries: [] });
  findings.push(...mirrorFindings(root, mirrorContract));
  const baseline = loadJson(path.join(checkerDir, 'baseline.json'), { entries: [] });
  const enriched = applyBaseline(findings, baseline, fingerprints).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return { version: 1, root: posix(root), skillsScanned: skills.length, findings: enriched, blocking: enriched.filter((item) => item.severity === 'error' && !item.baselined).length };
}

function formatText(result) {
  const lines = [`skill-health: ${result.skillsScanned} skills, ${result.findings.length} finding(s), ${result.blocking} blocking`];
  for (const item of result.findings) {
    lines.push(`${item.baselined ? 'BASELINED' : item.severity.toUpperCase()} ${item.code} ${item.file}:${item.line} ${item.message}`);
  }
  return lines.join('\n') + '\n';
}

function runSelfTest() {
  const cases = [];
  const sample = (description, body, allowed = 'Read') => `---\nname: fixture\ndescription: |\n  ${description}\nallowed-tools: ${allowed}\n---\n${body}\n`;
  const check = (name, condition) => {
    cases.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(`self-test failed: ${name}`);
  };

  const malformed = parseFrontmatter('---\nname: broken\ndescription: bad: colon\nallowed-tools: Read\n---\n', 'fixture/SKILL.md');
  check('malformed YAML is rejected', malformed.findings.some((item) => item.code === 'FRONTMATTER_YAML_INVALID'));

  const active = parseFrontmatter(sample('active call', 'Skill("proxy-up")'), 'fixture/SKILL.md');
  check('active undeclared Skill call blocks', activeToolFindings(active, 'fixture/SKILL.md').some((item) => item.code === 'ALLOWED_TOOLS_MISSING'));

  const negated = parseFrontmatter(sample('negative prose', 'Never call `Write`; do not invoke Skill("proxy-up").'), 'fixture/SKILL.md');
  check('negated prose does not block', activeToolFindings(negated, 'fixture/SKILL.md').length === 0);

  const example = parseFrontmatter(sample('generic example', '```ts\nSkill("proxy-up")\n```'), 'fixture/SKILL.md');
  check('generic fenced example does not block', activeToolFindings(example, 'fixture/SKILL.md').length === 0);

  return { version: 1, selfTest: true, cases };
}

try {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write('usage: node tools/skill-health/check.mjs [--root PATH] [--report|--strict] [--json] [--self-test]\n');
    process.exit(0);
  }
  if (args.selfTest) {
    const result = runSelfTest();
    process.stdout.write(args.format === 'json' ? JSON.stringify(result, null, 2) + '\n' : `skill-health self-test: ${result.cases.length} passed\n`);
    process.exit(0);
  }
  const result = run(args.root);
  process.stdout.write(args.format === 'json' ? JSON.stringify(result, null, 2) + '\n' : formatText(result));
  if (args.mode === 'strict' && result.blocking > 0) process.exit(1);
} catch (error) {
  process.stderr.write(`skill-health fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
