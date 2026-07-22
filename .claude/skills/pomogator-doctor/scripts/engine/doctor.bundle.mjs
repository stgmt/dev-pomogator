var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tools/carl/context-diet.ts
import * as crypto from "node:crypto";
import * as fs5 from "node:fs";
import * as path4 from "node:path";
import { pathToFileURL } from "node:url";
function toPosix(value) {
  return value.split(path4.sep).join("/");
}
function fromPosix(value) {
  return value.split("/").join(path4.sep);
}
function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}
function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}
function walkMarkdownFiles(root) {
  if (!fs5.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs5.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path4.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(abs);
      }
    }
  }
  return out.sort((a, b) => toPosix(a).localeCompare(toPosix(b)));
}
function titleFrom(content, sourcePath) {
  return content.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? sourcePath.replace(/^.*\//u, "").replace(/\.md$/u, "");
}
function isManagedContextDietStub(content) {
  return content.includes(STUB_BEGIN) && content.includes(STUB_END);
}
function libraryRelForRule(sourceRel) {
  const normalized = toPosix(sourceRel);
  const prefix = ".claude/rules/";
  const withoutPrefix = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  return toPosix(path4.join(".carl", "rules", fromPosix(withoutPrefix)));
}
function libraryPathForRule(projectRoot, sourceRel) {
  return path4.join(projectRoot, fromPosix(libraryRelForRule(sourceRel)));
}
function readRuleContentForAdaptation(projectRoot, sourceAbs, sourceRel) {
  const current = fs5.readFileSync(sourceAbs, "utf-8");
  if (!isManagedContextDietStub(current)) return current;
  const libraryPath = libraryPathForRule(projectRoot, sourceRel);
  if (fs5.existsSync(libraryPath)) return fs5.readFileSync(libraryPath, "utf-8");
  return current;
}
function atomicWriteText(filePath, content) {
  fs5.mkdirSync(path4.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs5.writeFileSync(tempPath, content, "utf-8");
  fs5.renameSync(tempPath, filePath);
}
function atomicWriteJson(filePath, value) {
  atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}
`);
}
function buildStub(sourceRel, libraryRel, hash, title) {
  return [
    `# ${title}`,
    `${STUB_BEGIN} source=${sourceRel} library=${libraryRel} sha256=${hash} -->`,
    STUB_END,
    `Lazy rule body: \`${libraryRel}\``,
    ""
  ].join("\n");
}
function applyContextDiet(projectRootInput) {
  const projectRoot = path4.resolve(projectRootInput);
  const rulesRoot = path4.join(projectRoot, RULES_REL);
  const ruleFiles = walkMarkdownFiles(rulesRoot);
  const entries = [];
  const warnings = [];
  let bytesBefore = 0;
  let bytesAfter = 0;
  let rulesManaged = 0;
  for (const abs of ruleFiles) {
    const sourceRel = toPosix(path4.relative(projectRoot, abs));
    const current = fs5.readFileSync(abs, "utf-8");
    const libraryRel = libraryRelForRule(sourceRel);
    const libraryPath = path4.join(projectRoot, fromPosix(libraryRel));
    if (isManagedContextDietStub(current)) {
      if (!fs5.existsSync(libraryPath)) {
        warnings.push(`${sourceRel}: managed stub exists but ${libraryRel} is missing`);
        bytesBefore += current.length;
        bytesAfter += current.length;
        entries.push({
          sourcePath: sourceRel,
          libraryPath: libraryRel,
          sourceHash: "",
          stubBytes: current.length,
          libraryBytes: 0,
          action: "skipped-missing-library"
        });
        continue;
      }
      const libraryContent = fs5.readFileSync(libraryPath, "utf-8");
      bytesBefore += libraryContent.length;
      const hash2 = sha256(libraryContent);
      const stub2 = buildStub(sourceRel, libraryRel, hash2, titleFrom(libraryContent, sourceRel));
      if (stub2 !== current) atomicWriteText(abs, stub2);
      bytesAfter += stub2.length;
      rulesManaged += 1;
      entries.push({
        sourcePath: sourceRel,
        libraryPath: libraryRel,
        sourceHash: hash2,
        stubBytes: stub2.length,
        libraryBytes: libraryContent.length,
        action: "already-managed"
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
      action: "created-stub"
    });
  }
  const status = ruleFiles.length === 0 ? "no-rules" : warnings.length > 0 ? "partial" : "applied";
  const result2 = {
    ok: true,
    mode: ruleFiles.length === 0 ? "additive" : "lazy-managed",
    status,
    rulesTotal: ruleFiles.length,
    rulesManaged,
    bytesBefore,
    bytesAfter,
    estimatedTokensBefore: estimateTokens(bytesBefore),
    estimatedTokensAfter: estimateTokens(bytesAfter),
    libraryRoot: toPosix(path4.relative(projectRoot, path4.join(projectRoot, LIBRARY_REL))),
    entries,
    warnings
  };
  atomicWriteJson(path4.join(projectRoot, REPORT_REL), result2);
  return result2;
}
function usage() {
  process.stderr.write([
    "Usage: node --import tsx tools/carl/context-diet.ts --project <path> [--json]",
    "",
    "Moves .claude/rules/*.md bodies into .carl/rules and leaves short managed stubs in the auto-loaded path."
  ].join("\n") + "\n");
  process.exit(2);
}
function parseArgs(argv) {
  let project = "";
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      project = argv[++i] ?? "";
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}
`);
      usage();
    }
  }
  if (!project) usage();
  return { project: path4.resolve(project), json };
}
function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result2 = applyContextDiet(args.project);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result2, null, 2)}
`);
    } else {
      process.stdout.write(`CARL context diet ${result2.status}: ${result2.rulesManaged}/${result2.rulesTotal} rules, ~${result2.estimatedTokensBefore} -> ~${result2.estimatedTokensAfter} tokens in auto-loaded rules
`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exit(1);
  }
}
var RULES_REL, LIBRARY_REL, REPORT_REL, STUB_BEGIN, STUB_END, invokedPath;
var init_context_diet = __esm({
  "tools/carl/context-diet.ts"() {
    "use strict";
    RULES_REL = path4.join(".claude", "rules");
    LIBRARY_REL = path4.join(".carl", "rules");
    REPORT_REL = path4.join(".carl", "context-diet.json");
    STUB_BEGIN = "<!-- dev-pomogator-carl-context-diet:managed-stub v1";
    STUB_END = "<!-- /dev-pomogator-carl-context-diet -->";
    invokedPath = process.argv[1] ? pathToFileURL(path4.resolve(process.argv[1])).href : "";
    if (import.meta.url === invokedPath) {
      main();
    }
  }
});

// tools/carl/adapt-rules.ts
import * as crypto2 from "node:crypto";
import * as fs6 from "node:fs";
import * as path5 from "node:path";
import { pathToFileURL as pathToFileURL2 } from "node:url";
function usage2() {
  process.stderr.write([
    "Usage: node --import tsx tools/carl/adapt-rules.ts --project <path> [--out <path>] [--json]",
    "",
    "Scans .claude/rules/**/*.md and .claude/skills/*/SKILL.md, then writes .carl/carl.json."
  ].join("\n") + "\n");
  process.exit(2);
}
function parseArgs2(argv) {
  let project = "";
  let out;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      project = argv[++i] ?? "";
    } else if (arg === "--out") {
      out = argv[++i] ?? "";
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage2();
    } else {
      process.stderr.write(`Unknown argument: ${arg}
`);
      usage2();
    }
  }
  if (!project) usage2();
  return { project: path5.resolve(project), out: out ? path5.resolve(out) : void 0, json };
}
function toPosix2(p) {
  return p.split(path5.sep).join("/");
}
function sha2562(content) {
  return crypto2.createHash("sha256").update(content).digest("hex");
}
function stableDomainId(kind, relPath) {
  const normalized = relPath.replace(/\/SKILL\.md$/u, "").replace(/\.md$/u, "").replace(/\.json$/u, "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/gu, "").toUpperCase();
  return `${kind.toUpperCase()}__${normalized || "ROOT"}`;
}
function walkFiles(root, predicate) {
  if (!fs6.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs6.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path5.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && predicate(abs)) {
        out.push(abs);
      }
    }
  }
  return out.sort((a, b) => toPosix2(a).localeCompare(toPosix2(b)));
}
function collectSourceFiles(projectRoot) {
  const rulesRoot = path5.join(projectRoot, ".claude", "rules");
  const skillsRoot = path5.join(projectRoot, ".claude", "skills");
  const ruleFiles = walkFiles(rulesRoot, (file) => file.endsWith(".md")).map((abs) => ({
    kind: "rule",
    abs,
    rel: toPosix2(path5.relative(projectRoot, abs))
  }));
  const skillFiles = walkFiles(skillsRoot, (file) => path5.basename(file) === "SKILL.md").map((abs) => ({
    kind: "skill",
    abs,
    rel: toPosix2(path5.relative(projectRoot, abs))
  }));
  const indexFiles = APPROVED_INDEXES.map((rel) => ({ kind: "index", abs: path5.join(projectRoot, rel), rel })).filter((item) => fs6.existsSync(item.abs));
  return [...ruleFiles, ...skillFiles, ...indexFiles];
}
function extractTitle(content, relPath) {
  const heading = content.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  if (heading) return heading;
  return relPath.replace(/^.*\//u, "").replace(/\.md$/u, "").replace(/\.json$/u, "");
}
function normalizeAlias(value) {
  return value.toLowerCase().replace(/[«»“”"'`]/gu, "").replace(/\s+/gu, " ").trim();
}
function extractQuotedRussian(content) {
  const aliases = /* @__PURE__ */ new Set();
  const quoteRe = /["'«“]([^"'»”]{2,80}[Ѐ-ӿ][^"'»”]{0,80})["'»”]/gu;
  let match;
  while ((match = quoteRe.exec(content)) !== null) {
    const alias = normalizeAlias(match[1]);
    if (alias.length >= 3 && alias.length <= 80) aliases.add(alias);
  }
  return [...aliases];
}
function stripFencedCode(content) {
  return content.replace(/```[\s\S]*?```/gu, "\n");
}
function isTemplateOrCodeLine(cleaned) {
  return cleaned.includes("**files:**") || cleaned.includes("**deps:**") || cleaned.includes("**refs:**") || cleaned.includes("**changes:**") || cleaned.startsWith("|") || cleaned.includes("\u2192") || /[`{}()[\]<>]/u.test(cleaned) || /^[-–—]\s*(это|взять|существование)\b/u.test(cleaned) || /^\/\//u.test(cleaned);
}
function isSafeQuotedAlias(alias) {
  if (alias.length > 48) return false;
  if (isTemplateOrCodeLine(alias)) return false;
  return /^(че за ошибка|исследуй|до конца|спеки|правила|скилы|[\p{L}\p{N}_ -]{3,48})$/u.test(alias);
}
function extractRussianPhrases(content) {
  const aliases = /* @__PURE__ */ new Set();
  const searchable = stripFencedCode(content);
  for (const quoted of extractQuotedRussian(searchable)) {
    if (isSafeQuotedAlias(quoted)) aliases.add(quoted);
  }
  const lines = searchable.split(/\r?\n/u);
  for (const line of lines) {
    if (!CYRILLIC_RE.test(line)) continue;
    const cleaned = normalizeAlias(line.replace(/^[#>*\-\s]+/u, ""));
    if (!cleaned || isTemplateOrCodeLine(cleaned)) continue;
    for (const phrase of DEFAULT_RU_ALIASES) {
      if (cleaned.includes(phrase)) aliases.add(phrase);
    }
    const triggerMatch = cleaned.match(/\b(?:trigger|триггер):\s*(.+)$/iu);
    if (triggerMatch) {
      const triggerAlias = normalizeAlias(triggerMatch[1] ?? "");
      if (triggerAlias && isSafeQuotedAlias(triggerAlias)) aliases.add(triggerAlias);
    }
  }
  return [...aliases].sort((a, b) => a.localeCompare(b, "ru"));
}
function classifyTags(entry) {
  const tags = /* @__PURE__ */ new Set([entry.kind]);
  const haystack = `${entry.rel} ${entry.title} ${entry.aliases.join(" ")}`.toLowerCase();
  if (/spec|спек|requirements|требован|scenario|сценар/u.test(haystack)) tags.add("specs");
  if (/test|bdd|cucumber|тест/u.test(haystack)) tags.add("tests");
  if (/doctor|repair|health|здоров|чин|ремонт/u.test(haystack)) tags.add("doctor");
  if (/debug|ошиб|root|cause|инфра|исслед/u.test(haystack)) tags.add("debug");
  if (/codex/u.test(haystack)) tags.add("codex");
  return [...tags].sort();
}
function buildEntries(projectRoot) {
  return collectSourceFiles(projectRoot).map((source) => {
    const content = source.kind === "rule" ? readRuleContentForAdaptation(projectRoot, source.abs, source.rel) : fs6.readFileSync(source.abs, "utf-8");
    const title = extractTitle(content, source.rel);
    const aliases = extractRussianPhrases(`${title}
${content}`);
    const status = aliases.length > 0 ? "ready" : "ru:needs-alias";
    const base = {
      kind: source.kind,
      path: source.rel,
      hash: sha2562(content),
      title,
      aliases,
      status
    };
    return { ...base, tags: classifyTags(base) };
  });
}
function mergeWithExisting(manifestPath3, next) {
  if (!fs6.existsSync(manifestPath3)) return next;
  try {
    const existing = JSON.parse(fs6.readFileSync(manifestPath3, "utf-8"));
    const user = existing.user;
    const userConfig = existing.userConfig;
    const version = typeof existing.version === "string" ? existing.version : void 0;
    const runtime = existing.runtime;
    const platforms = existing.platforms;
    const managed = existing.managed;
    const contextDiet = existing.contextDiet;
    const existingLanguages = Array.isArray(existing.languages) ? existing.languages.filter((item) => typeof item === "string") : [];
    const languages = [.../* @__PURE__ */ new Set([...next.languages, ...existingLanguages])];
    return {
      ...next,
      ...version !== void 0 ? { version } : {},
      ...runtime !== void 0 ? { runtime } : {},
      ...platforms !== void 0 ? { platforms } : {},
      ...managed !== void 0 ? { managed } : {},
      ...contextDiet !== void 0 ? { contextDiet } : {},
      ...user !== void 0 ? { user } : {},
      ...userConfig !== void 0 ? { userConfig } : {},
      languages
    };
  } catch {
    return next;
  }
}
function buildManifest(projectRoot, entries) {
  const sourceHashes = Object.fromEntries(entries.map((entry) => [entry.path, entry.hash]));
  const generatedAliases = [...new Set(entries.flatMap((entry) => entry.aliases))].sort((a, b) => a.localeCompare(b, "ru"));
  const needsAliasSources = entries.filter((entry) => entry.status === "ru:needs-alias").map((entry) => entry.path);
  const readySources = entries.length - needsAliasSources.length;
  const status = entries.length === 0 ? "project-language-missing" : needsAliasSources.length > 0 ? "partial" : "ready";
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    managedBy: "dev-pomogator",
    schemaVersion: 1,
    generatedAt,
    projectRoot,
    languages: generatedAliases.length > 0 ? ["ru", "en"] : ["en"],
    sourceHashes,
    domains: entries.map((entry) => ({
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
          status: entry.status
        }
      ]
    })),
    languageStatus: {
      ru: {
        status,
        generatedAliases,
        sourceHashes: entries.map((entry) => entry.hash),
        readySources,
        needsAliasSources,
        lastGeneratedAt: generatedAt
      }
    },
    coverage: {
      totalSources: entries.length,
      readyRuSources: readySources,
      needsAliasSources: needsAliasSources.length,
      markers: needsAliasSources.length > 0 ? ["ru:needs-alias"] : []
    }
  };
}
function atomicWriteJson2(filePath, value) {
  fs6.mkdirSync(path5.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs6.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}
`, "utf-8");
  fs6.renameSync(tempPath, filePath);
}
function adaptProject(args) {
  const project = path5.resolve(args.project);
  if (!fs6.existsSync(project) || !fs6.statSync(project).isDirectory()) {
    throw new Error(`Project directory does not exist: ${project}`);
  }
  const entries = buildEntries(project);
  const outputPath = args.out ?? path5.join(project, ".carl", "carl.json");
  const manifest = mergeWithExisting(outputPath, buildManifest(project, entries));
  atomicWriteJson2(outputPath, manifest);
  return {
    ok: true,
    manifest: outputPath,
    totalSources: manifest.coverage.totalSources,
    readyRuSources: manifest.coverage.readyRuSources,
    needsAliasSources: manifest.languageStatus.ru.needsAliasSources,
    generatedAliases: manifest.languageStatus.ru.generatedAliases,
    languageStatus: manifest.languageStatus.ru.status
  };
}
function main2() {
  try {
    const args = parseArgs2(process.argv.slice(2));
    const summary = adaptProject(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}
`);
    } else {
      process.stdout.write(`CARL adaptation OK: ${summary.totalSources} sources, ${summary.readyRuSources} ru-ready, ${summary.needsAliasSources.length} ru:needs-alias -> ${summary.manifest}
`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exit(1);
  }
}
var CYRILLIC_RE, DEFAULT_RU_ALIASES, APPROVED_INDEXES, invokedPath2;
var init_adapt_rules = __esm({
  "tools/carl/adapt-rules.ts"() {
    "use strict";
    init_context_diet();
    CYRILLIC_RE = /[Ѐ-ӿ]/u;
    DEFAULT_RU_ALIASES = ["\u0447\u0435 \u0437\u0430 \u043E\u0448\u0438\u0431\u043A\u0430", "\u0438\u0441\u0441\u043B\u0435\u0434\u0443\u0439", "\u0434\u043E \u043A\u043E\u043D\u0446\u0430", "\u0441\u043F\u0435\u043A\u0438", "\u043F\u0440\u0430\u0432\u0438\u043B\u0430", "\u0441\u043A\u0438\u043B\u044B"];
    APPROVED_INDEXES = [".specs/.onboarding.json"];
    invokedPath2 = process.argv[1] ? pathToFileURL2(path5.resolve(process.argv[1])).href : "";
    if (import.meta.url === invokedPath2) {
      main2();
    }
  }
});

// tools/carl/manifest.ts
import * as fs7 from "node:fs";
import * as os2 from "node:os";
import * as path6 from "node:path";
import { fileURLToPath, pathToFileURL as pathToFileURL3 } from "node:url";
function usage3() {
  process.stderr.write([
    "Usage: node --import tsx tools/carl/manifest.ts --project <path> [--health] [--platform claude-code|codex] [--report <path>]",
    "",
    "Reads or reports managed dev-pomogator CARL manifest state."
  ].join("\n") + "\n");
  process.exit(2);
}
function parseArgs3(argv) {
  let project = "";
  let health = false;
  let platform = "claude-code";
  let report;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      project = argv[++i] ?? "";
    } else if (arg === "--health") {
      health = true;
    } else if (arg === "--platform") {
      platform = argv[++i] ?? "";
    } else if (arg === "--report") {
      report = argv[++i] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      usage3();
    } else {
      process.stderr.write(`Unknown argument: ${arg}
`);
      usage3();
    }
  }
  if (!project) usage3();
  return { project: path6.resolve(project), health, platform, report: report ? path6.resolve(report) : void 0 };
}
function manifestPath(projectRoot) {
  return path6.join(projectRoot, MANIFEST_REL);
}
function buildDefaultManifest(now = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    managedBy: "dev-pomogator",
    schemaVersion: 1,
    version: "2.0.3",
    generatedAt: now,
    runtime: {
      command: REQUIRED_RUNTIME_FRAGMENT,
      status: "unverified"
    },
    platforms: {
      claudeCode: { status: "installed", reason: "managed Claude Code CARL project artifacts created" },
      codex: {
        status: "deferred",
        reason: "Codex CARL waits for context-menu launcher and deterministic hook dispatcher prerequisites"
      }
    },
    languages: ["en"],
    languageStatus: {
      ru: {
        status: "project-language-missing",
        generatedAliases: [],
        sourceHashes: [],
        needsAliasSources: [],
        lastGeneratedAt: now
      }
    },
    managed: {
      settingsKey: "devPomogatorCarl",
      hookCommand: "node --import tsx tools/carl/runner.ts"
    },
    sourceHashes: {}
  };
}
function readManifest(projectRoot) {
  const filePath = manifestPath(projectRoot);
  if (!fs7.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs7.readFileSync(filePath, "utf-8"));
  return parsed;
}
function atomicWriteJson3(filePath, value) {
  fs7.mkdirSync(path6.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs7.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}
`, "utf-8");
  fs7.renameSync(tempPath, filePath);
}
function runtimeDiagnostic(manifest, repoRoot) {
  if (!manifest) {
    return { status: "degraded", diagnostic: "project-missing", runtimeConsumer: "missing runtime consumer manifest" };
  }
  const command = manifest.runtime?.command ?? "";
  const knownMissing = command.length === 0 || /missing|definitely-missing/u.test(command);
  const runnerMissing = command.includes(REQUIRED_RUNTIME_FRAGMENT) && !fs7.existsSync(path6.join(repoRoot, REQUIRED_RUNTIME_FRAGMENT));
  if (knownMissing || runnerMissing) {
    return { status: "degraded", diagnostic: "missing-runtime", runtimeConsumer: "runtime consumer missing" };
  }
  if (manifest.runtime.status !== "verified") {
    return { status: "degraded", diagnostic: "runtime-unverified", runtimeConsumer: "runtime consumer unverified" };
  }
  return { status: "ready", diagnostic: "ready", runtimeConsumer: "runtime consumer verified" };
}
function readJsonObject(filePath) {
  if (!fs7.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs7.readFileSync(filePath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}
function stringifyUnknown(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}
function hasVersionAwareCarlCapability(record) {
  const capability = record.capability;
  const capabilities = record.capabilities;
  const hasCapability = capability === "carl" || Array.isArray(capabilities) && capabilities.includes("carl");
  const hasVersionGate = typeof record.minCodexVersion === "string" || typeof record.codexVersion === "string" || typeof record.versionAware === "boolean";
  return hasCapability && hasVersionGate;
}
function hasDeterministicCarlCodexHookEntry(filePath) {
  const parsed = readJsonObject(filePath);
  if (!parsed) return false;
  const stack = [parsed];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item;
    if (CODEX_CARL_COMMAND_RE.test(stringifyUnknown(record.command)) && hasVersionAwareCarlCapability(record)) {
      return true;
    }
    stack.push(...Object.values(record));
  }
  return false;
}
function evaluateCodexPrerequisites(projectRoot, repoRoot) {
  const missing = [];
  const bundledLauncher = path6.join(repoRoot, CODEX_LAUNCHER_REL);
  const hasBundledLauncher = fs7.existsSync(bundledLauncher);
  const hasInstalledLauncher = fs7.existsSync(GLOBAL_CODEX_LAUNCHER);
  if (!hasBundledLauncher && !hasInstalledLauncher) {
    missing.push(`context-menu Codex launcher (${CODEX_LAUNCHER_REL} or ${GLOBAL_CODEX_LAUNCHER})`);
  }
  if (!fs7.existsSync(path6.join(repoRoot, CODEX_PLUGIN_MANIFEST_REL))) {
    missing.push(`Codex plugin manifest (${CODEX_PLUGIN_MANIFEST_REL})`);
  }
  const projectHooks = path6.join(projectRoot, CODEX_PROJECT_HOOKS_REL);
  const pluginHooks = path6.join(repoRoot, CODEX_PLUGIN_HOOKS_REL);
  if (!hasDeterministicCarlCodexHookEntry(projectHooks) && !hasDeterministicCarlCodexHookEntry(pluginHooks)) {
    missing.push(`deterministic version-aware Codex CARL hook dispatcher (${CODEX_PROJECT_HOOKS_REL} or ${CODEX_PLUGIN_HOOKS_REL})`);
  }
  if (missing.length > 0) {
    return {
      status: "deferred",
      diagnostic: "codex-deferred-prerequisite",
      reason: `unsupported until prerequisites exist: ${missing.join("; ")}`
    };
  }
  return {
    status: "installed",
    diagnostic: "codex-ready",
    reason: "Codex CARL prerequisites detected: context-menu launcher, Codex plugin manifest, and deterministic CARL hook dispatcher"
  };
}
function codexPlatformState(projectRoot, repoRoot = REPO_ROOT) {
  const codex = evaluateCodexPrerequisites(projectRoot, repoRoot);
  return { status: codex.status, reason: codex.reason };
}
function evaluateHealth(projectRoot, platform, repoRoot = REPO_ROOT) {
  const manifest = readManifest(projectRoot);
  const runtime = runtimeDiagnostic(manifest, repoRoot);
  const baseManifest = manifest ?? buildDefaultManifest();
  if (platform === "codex") {
    const codex = evaluateCodexPrerequisites(projectRoot, repoRoot);
    return {
      status: codex.status === "installed" && runtime.status === "ready" ? "ready" : "degraded",
      diagnostic: codex.diagnostic,
      runtimeConsumer: runtime.runtimeConsumer,
      platform,
      language: baseManifest.languageStatus,
      platforms: {
        ...baseManifest.platforms,
        claudeCode: { status: runtime.status === "ready" ? "installed" : "degraded", reason: runtime.diagnostic },
        codex: { status: codex.status, reason: codex.reason }
      }
    };
  }
  return {
    status: runtime.status,
    diagnostic: runtime.diagnostic,
    runtimeConsumer: runtime.runtimeConsumer,
    platform,
    language: baseManifest.languageStatus,
    platforms: baseManifest.platforms
  };
}
function relEvidence(repoRoot, relPath) {
  return { path: relPath, exists: fs7.existsSync(path6.join(repoRoot, relPath)) };
}
function fileContains(repoRoot, relPath, fragments) {
  const filePath = path6.join(repoRoot, relPath);
  if (!fs7.existsSync(filePath)) return false;
  const content = fs7.readFileSync(filePath, "utf-8");
  return fragments.every((fragment) => content.includes(fragment));
}
function hasClaudeCarlHookRegistration(repoRoot) {
  const hooks = readJsonObject(path6.join(repoRoot, ".claude-plugin", "hooks.json"));
  if (!hooks) return false;
  const stack = [hooks];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item;
    if (/tools[\\/]carl[\\/]runner\.ts/u.test(stringifyUnknown(record.command))) return true;
    stack.push(...Object.values(record));
  }
  return false;
}
function marker(ok) {
  return ok ? "VERIFIED" : "UNVERIFIED";
}
function buildReviewReport(projectRoot) {
  const health = evaluateHealth(projectRoot, "claude-code");
  const codex = evaluateHealth(projectRoot, "codex");
  const manifest = readManifest(projectRoot);
  const runner = relEvidence(REPO_ROOT, REQUIRED_RUNTIME_FRAGMENT);
  const installSource = relEvidence(REPO_ROOT, path6.join("tools", "carl", "install.ts"));
  const benchSource = relEvidence(REPO_ROOT, path6.join("tools", "carl", "bench.ts"));
  const doctorSource = relEvidence(REPO_ROOT, path6.join(".claude", "skills", "pomogator-doctor", "scripts", "engine", "checks", "carl.ts"));
  const hooksManifest = relEvidence(REPO_ROOT, path6.join(".claude-plugin", "hooks.json"));
  const hookRegistered = hasClaudeCarlHookRegistration(REPO_ROOT);
  const warningVerified = fileContains(REPO_ROOT, REQUIRED_RUNTIME_FRAGMENT, [REQUIRED_WARNING, "failOpen", "hookSpecificOutput"]);
  const userPreservationVerified = fileContains(REPO_ROOT, path6.join("tools", "carl", "install.ts"), [
    "hasConflictingUserManagedKey",
    "user-conflict",
    "...settings",
    "atomicWriteJson"
  ]);
  const doctorVerified = doctorSource.exists && fileContains(REPO_ROOT, doctorSource.path, ["checkCarlProject", "repairCarl", REQUIRED_WARNING]);
  const benchmarkVerified = benchSource.exists && fileContains(REPO_ROOT, benchSource.path, ["fixture-backed-real-artifact", "draft-no-real-artifact"]);
  const runtimeConsumerExecuted = health.status === "ready" && manifest?.runtime?.status === "verified";
  const fakeGreenBlocked = !runtimeConsumerExecuted;
  return {
    status: fakeGreenBlocked ? "fake-green-blocked" : "ready",
    evidence: "CARL review report aggregates local implementation evidence and keeps external/runtime claims explicitly marked.",
    fakeGreenGate: {
      blocksDone: fakeGreenBlocked,
      reason: fakeGreenBlocked ? "Files and hook registration are present, but the project CARL runtime consumer has not been verified/exercised for this project." : "Managed hook consumer is verified for this project.",
      runtimeConsumerExecuted,
      hookRegistered,
      runnerSourceExists: runner.exists,
      diagnostic: health.diagnostic
    },
    sections: {
      install: {
        marker: marker(installSource.exists && hookRegistered),
        evidence: [installSource, hooksManifest],
        note: "managed installer exists and plugin hook registration points at the CARL runner"
      },
      runtime: {
        marker: marker(runtimeConsumerExecuted),
        evidence: [runner, { path: manifestPath(projectRoot), exists: Boolean(manifest) }],
        runtimeConsumer: health.runtimeConsumer,
        diagnostic: health.diagnostic,
        hookRegistered
      },
      warning: {
        marker: marker(warningVerified),
        evidence: [runner],
        requiredWarning: REQUIRED_WARNING,
        note: "runner contains fail-open warning injection for UserPromptSubmit additionalContext"
      },
      doctor: {
        marker: marker(doctorVerified),
        evidence: [doctorSource],
        note: "pomogator-doctor CARL check can report and repair managed CARL project artifacts"
      },
      user: {
        marker: marker(userPreservationVerified),
        evidence: [installSource],
        note: "installer preserves user-owned settings and refuses conflicting managed keys"
      },
      Codex: {
        marker: "VERIFIED",
        evidence: [relEvidence(REPO_ROOT, CODEX_LAUNCHER_REL), relEvidence(REPO_ROOT, CODEX_PLUGIN_MANIFEST_REL), relEvidence(REPO_ROOT, CODEX_PLUGIN_HOOKS_REL)],
        diagnostic: codex.diagnostic,
        note: codex.platforms.codex.reason
      },
      benchmark: {
        marker: marker(benchmarkVerified),
        evidence: [benchSource, relEvidence(REPO_ROOT, path6.join("tests", "fixtures", "carl", "real-output", "README.md"))],
        note: "benchmark refuses invented thresholds and records fixture-backed real-artifact baselines"
      }
    },
    externalClaims: [
      {
        claim: "Codex CARL runtime execution after the context-menu launcher and dispatcher are available",
        marker: codex.platforms.codex.status === "installed" ? "VERIFIED" : "ASSUMED",
        evidence: codex.platforms.codex.reason
      },
      {
        claim: "dev-pomogator Russian CARL runtime readiness",
        marker: manifest?.languageStatus?.ru?.status === "ready" ? "VERIFIED" : "UNVERIFIED",
        evidence: manifest?.languageStatus?.ru ?? "No project manifest with ready Russian language status is present."
      },
      {
        claim: "Runtime consumer proof for this project",
        marker: runtimeConsumerExecuted ? "VERIFIED" : "UNVERIFIED",
        evidence: health.runtimeConsumer
      }
    ]
  };
}
function main3() {
  const args = parseArgs3(process.argv.slice(2));
  if (!fs7.existsSync(args.project) || !fs7.statSync(args.project).isDirectory()) {
    process.stderr.write(`Project directory does not exist: ${args.project}
`);
    process.exit(1);
  }
  if (args.report) {
    const report = buildReviewReport(args.project);
    atomicWriteJson3(args.report, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
    return;
  }
  const health = evaluateHealth(args.project, args.platform);
  process.stdout.write(`${JSON.stringify(health, null, 2)}
`);
  if (args.health && health.status !== "ready") {
    return;
  }
}
var MODULE_DIR, REPO_ROOT, MANIFEST_REL, REQUIRED_RUNTIME_FRAGMENT, CODEX_LAUNCHER_REL, GLOBAL_CODEX_LAUNCHER, CODEX_PLUGIN_MANIFEST_REL, CODEX_PLUGIN_HOOKS_REL, CODEX_PROJECT_HOOKS_REL, CODEX_CARL_COMMAND_RE, REQUIRED_WARNING, invokedPath3;
var init_manifest = __esm({
  "tools/carl/manifest.ts"() {
    "use strict";
    MODULE_DIR = path6.dirname(fileURLToPath(import.meta.url));
    REPO_ROOT = path6.resolve(MODULE_DIR, "..", "..");
    MANIFEST_REL = path6.join(".carl", "carl.json");
    REQUIRED_RUNTIME_FRAGMENT = "tools/carl/runner.ts";
    CODEX_LAUNCHER_REL = path6.join("scripts", "launch-Codex-tui.ps1");
    GLOBAL_CODEX_LAUNCHER = path6.join(os2.homedir(), ".dev-pomogator", "scripts", "launch-Codex-tui.ps1");
    CODEX_PLUGIN_MANIFEST_REL = path6.join(".codex-plugin", "plugin.json");
    CODEX_PLUGIN_HOOKS_REL = path6.join(".codex-plugin", "hooks.json");
    CODEX_PROJECT_HOOKS_REL = path6.join(".codex", "hooks.json");
    CODEX_CARL_COMMAND_RE = /carl[\\/](?:runner|codex|hook)|tools[\\/]carl/iu;
    REQUIRED_WARNING = "CARL did not run; tell the user CARL guidance/recall was unavailable.";
    invokedPath3 = process.argv[1] ? pathToFileURL3(path6.resolve(process.argv[1])).href : "";
    if (import.meta.url === invokedPath3) {
      main3();
    }
  }
});

// tools/carl/install.ts
var install_exports = {};
__export(install_exports, {
  install: () => install
});
import * as fs8 from "node:fs";
import * as path7 from "node:path";
import { pathToFileURL as pathToFileURL4 } from "node:url";
function usage4() {
  process.stderr.write([
    "Usage: node --import tsx tools/carl/install.ts --project <path> [--platform claude-code|codex] [--repair]",
    "",
    "Creates or repairs dev-pomogator managed CARL project artifacts without overwriting user-owned settings."
  ].join("\n") + "\n");
  process.exit(2);
}
function parseArgs4(argv) {
  let project = "";
  let platform = "claude-code";
  let repair = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      project = argv[++i] ?? "";
    } else if (arg === "--platform") {
      const value = argv[++i] ?? "";
      if (value !== "claude-code" && value !== "codex") usage4();
      platform = value;
    } else if (arg === "--repair") {
      repair = true;
    } else if (arg === "--help" || arg === "-h") {
      usage4();
    } else {
      process.stderr.write(`Unknown argument: ${arg}
`);
      usage4();
    }
  }
  if (!project) usage4();
  return { project: path7.resolve(project), platform, repair };
}
function readJsonObject2(filePath) {
  if (!fs8.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs8.readFileSync(filePath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return {};
  }
  return {};
}
function hasConflictingUserManagedKey(settings) {
  const existing = settings[MANAGED_SETTINGS_KEY];
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return false;
  const owner = existing.managedBy;
  return owner !== void 0 && owner !== MANAGED_OWNER;
}
function managedSettingsValue() {
  return {
    managedBy: MANAGED_OWNER,
    managed: true,
    component: "carl",
    hookEvent: "UserPromptSubmit",
    command: MANAGED_HOOK_COMMAND
  };
}
function writeSettings(projectRoot) {
  const settingsPath = path7.join(projectRoot, ".claude", "settings.json");
  const settings = readJsonObject2(settingsPath);
  if (hasConflictingUserManagedKey(settings)) return "user-conflict";
  const nextSettings = {
    ...settings,
    [MANAGED_SETTINGS_KEY]: managedSettingsValue()
  };
  atomicWriteJson3(settingsPath, nextSettings);
  return "updated";
}
function mergeManifest(existing, platform, projectRoot) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const base = buildDefaultManifest(now);
  const existingRu = existing?.languageStatus?.ru;
  const ruStatus = existingRu?.status === "ready" || existingRu?.status === "partial" || existingRu?.status === "project-language-stale" ? existingRu.status : "project-language-missing";
  return {
    ...base,
    ...existing?.sourceHashes ? { sourceHashes: existing.sourceHashes } : {},
    generatedAt: now,
    runtime: {
      command: existing?.runtime?.command && !/missing|definitely-missing/u.test(existing.runtime.command) ? existing.runtime.command : base.runtime.command,
      status: existing?.runtime?.status === "verified" ? "verified" : "unverified"
    },
    platforms: {
      claudeCode: {
        status: platform === "claude-code" ? "installed" : "degraded",
        reason: platform === "claude-code" ? "managed Claude Code CARL install refreshed by dev-pomogator" : "Claude Code CARL not selected during this install run"
      },
      codex: codexPlatformState(projectRoot)
    },
    languages: existing?.languages?.includes("ru") || ruStatus === "ready" || ruStatus === "partial" ? ["ru", "en"] : ["en"],
    languageStatus: {
      ru: {
        status: ruStatus,
        generatedAliases: existingRu?.generatedAliases ?? [],
        sourceHashes: existingRu?.sourceHashes ?? [],
        needsAliasSources: existingRu?.needsAliasSources ?? [],
        lastGeneratedAt: existingRu?.lastGeneratedAt ?? now
      }
    },
    ...existing?.contextDiet ? { contextDiet: existing.contextDiet } : {},
    managed: {
      settingsKey: MANAGED_SETTINGS_KEY,
      hookCommand: MANAGED_HOOK_COMMAND
    }
  };
}
function install(args) {
  if (!fs8.existsSync(args.project) || !fs8.statSync(args.project).isDirectory()) {
    throw new Error(`Project directory does not exist: ${args.project}`);
  }
  fs8.mkdirSync(path7.join(args.project, ".carl"), { recursive: true });
  fs8.mkdirSync(path7.join(args.project, ".claude"), { recursive: true });
  const settingsResult = writeSettings(args.project);
  if (settingsResult === "user-conflict") {
    return {
      ok: false,
      status: "user-conflict",
      managedBy: MANAGED_OWNER,
      message: "user-conflict: user-owned devPomogatorCarl key is not managed by dev-pomogator; refusing overwrite"
    };
  }
  const existing = readManifest(args.project);
  const manifest = mergeManifest(existing, args.platform, args.project);
  atomicWriteJson3(manifestPath(args.project), manifest);
  let contextDiet = null;
  try {
    contextDiet = applyContextDiet(args.project);
  } catch {
    contextDiet = null;
  }
  let adaptation = null;
  try {
    adaptation = adaptProject({ project: args.project });
  } catch {
    adaptation = null;
  }
  const postAdaptManifest = readManifest(args.project) ?? manifest;
  if (contextDiet) {
    atomicWriteJson3(manifestPath(args.project), {
      ...postAdaptManifest,
      contextDiet: {
        mode: contextDiet.mode,
        status: contextDiet.status,
        estimatedTokensBefore: contextDiet.estimatedTokensBefore,
        estimatedTokensAfter: contextDiet.estimatedTokensAfter,
        rulesManaged: contextDiet.rulesManaged,
        rulesTotal: contextDiet.rulesTotal
      }
    });
  }
  const refreshedManifest = readManifest(args.project) ?? manifest;
  return {
    ok: true,
    status: args.repair ? "repaired" : "installed",
    managedBy: MANAGED_OWNER,
    manifest: manifestPath(args.project),
    platform: args.platform,
    languageStatus: refreshedManifest.languageStatus,
    runtime: refreshedManifest.runtime,
    settings: settingsResult,
    contextDiet,
    adaptation
  };
}
function main4() {
  try {
    const args = parseArgs4(process.argv.slice(2));
    const result2 = install(args);
    process.stdout.write(`${JSON.stringify(result2, null, 2)}
`);
    if (result2.status === "user-conflict") process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}
`);
    process.exit(1);
  }
}
var MANAGED_OWNER, MANAGED_SETTINGS_KEY, MANAGED_HOOK_COMMAND, invokedPath4;
var init_install = __esm({
  "tools/carl/install.ts"() {
    "use strict";
    init_adapt_rules();
    init_context_diet();
    init_manifest();
    MANAGED_OWNER = "dev-pomogator";
    MANAGED_SETTINGS_KEY = "devPomogatorCarl";
    MANAGED_HOOK_COMMAND = "node --import tsx tools/carl/runner.ts";
    invokedPath4 = process.argv[1] ? pathToFileURL4(path7.resolve(process.argv[1])).href : "";
    if (import.meta.url === invokedPath4) {
      main4();
    }
  }
});

// tools/context-menu/postinstall.ts
var postinstall_exports = {};
__export(postinstall_exports, {
  NILESOFT_WINGET_ARGS: () => NILESOFT_WINGET_ARGS,
  bundledCodexLaunchScriptPath: () => bundledCodexLaunchScriptPath,
  bundledLaunchScriptPath: () => bundledLaunchScriptPath,
  codexExecutableCandidates: () => codexExecutableCandidates,
  codexIconFileCandidates: () => codexIconFileCandidates,
  copyCodexLaunchScript: () => copyCodexLaunchScript,
  copyLaunchScript: () => copyLaunchScript,
  findInstalledCodexExecutable: () => findInstalledCodexExecutable,
  findInstalledCodexIconFile: () => findInstalledCodexIconFile,
  generateCodexNss: () => generateCodexNss,
  generateFallbackCodexIcon: () => generateFallbackCodexIcon,
  generateNss: () => generateNss,
  generateShellImports: () => generateShellImports,
  installPlanForMode: () => installPlanForMode,
  isWindows: () => isWindows,
  parseInstallMode: () => parseInstallMode
});
import { execFileSync, execSync } from "node:child_process";
import * as fs12 from "node:fs";
import * as os3 from "node:os";
import * as path11 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
function log(message) {
  console.log(`  ${PREFIX} ${message}`);
}
function toWindowsPath(value) {
  return value.replace(/\//g, "\\");
}
function isWindows() {
  return process.platform === "win32";
}
function isNilesoftInstalled() {
  return fs12.existsSync(SHELL_NSS);
}
function installNilesoft() {
  log("Installing Nilesoft Shell via winget...");
  try {
    execFileSync("winget", [...NILESOFT_WINGET_ARGS], { stdio: "inherit", timeout: 12e4 });
    return fs12.existsSync(SHELL_NSS);
  } catch {
    log(`winget install failed. Install manually: winget ${NILESOFT_WINGET_ARGS.join(" ")}`);
    return false;
  }
}
function generateNss() {
  const launchScript = toWindowsPath(GLOBAL_CLAUDE_LAUNCH_SCRIPT);
  return `// Claude Code context menu entry (auto-generated by dev-pomogator)
// Reload: Ctrl+Right-click desktop -> Shell -> Reload

// Single entry by design: admin + --dangerously-skip-permissions + TUI.
// Routes through launch-claude-tui.ps1 so launch logging and workspace trust
// auto-grant happen before invoking Claude Code.
item(type='dir|back' admin=true title='Claude Code (YOLO + TUI)' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "${launchScript}" -Yolo -ProjectDir "@sel.dir"')
`;
}
function generateCodexNss() {
  const launchScript = toWindowsPath(GLOBAL_CODEX_LAUNCH_SCRIPT);
  return `// Codex context menu entry (auto-generated by dev-pomogator)
// Reload: Ctrl+Right-click desktop -> Shell -> Reload

// Single entry by design: admin + Codex full-access flags, no TUI for the
// first supported Codex iteration.
// Routes through launch-Codex-tui.ps1 so launch logging and Codex project trust
// are handled before invoking codex.
item(type='dir|back' admin=true title='Codex (YOLO)' image='@app.dir\\imports\\codex-icon.ico' cmd='powershell.exe' args='-ExecutionPolicy Bypass -File "${launchScript}" -Yolo -NoTui -ProjectDir "@sel.dir"')
`;
}
function parseInstallMode(argv = process.argv.slice(2)) {
  return argv.includes("--codex-only") ? "codex-only" : "all";
}
function installPlanForMode(mode = "all") {
  if (mode === "codex-only") {
    return {
      mode,
      copyClaude: false,
      copyCodex: true,
      writeClaudeNss: false,
      writeCodexNss: true,
      writeCodexIcon: true,
      importLines: [CODEX_IMPORT_LINE],
      nssFiles: ["Codex.nss"],
      launchScripts: ["launch-Codex-tui.ps1"],
      iconFiles: ["codex-icon.ico"]
    };
  }
  return {
    mode,
    copyClaude: true,
    copyCodex: true,
    writeClaudeNss: true,
    writeCodexNss: true,
    writeCodexIcon: true,
    importLines: [CLAUDE_IMPORT_LINE, CODEX_IMPORT_LINE],
    nssFiles: ["claude-code.nss", "Codex.nss"],
    launchScripts: ["launch-claude-tui.ps1", "launch-Codex-tui.ps1"],
    iconFiles: ["codex-icon.ico"]
  };
}
function generateShellImports(existingContent = "", mode = "all") {
  const plan = installPlanForMode(mode);
  let content = existingContent.trimEnd();
  for (const line of plan.importLines) {
    if (!content.includes(line)) {
      content = content ? `${content}
${line}` : line;
    }
  }
  return `${content}
`;
}
function bundledLaunchScriptPath() {
  return path11.join(MODULE_DIR2, "..", "..", "scripts", "launch-claude-tui.ps1");
}
function bundledCodexLaunchScriptPath() {
  return path11.join(MODULE_DIR2, "..", "..", "scripts", "launch-Codex-tui.ps1");
}
function copyLaunchScript(src, dest) {
  const source = src ?? bundledLaunchScriptPath();
  const target = dest ?? GLOBAL_CLAUDE_LAUNCH_SCRIPT;
  return copyScript(source, target, "Claude");
}
function copyCodexLaunchScript(src, dest) {
  const source = src ?? bundledCodexLaunchScriptPath();
  const target = dest ?? GLOBAL_CODEX_LAUNCH_SCRIPT;
  return copyScript(source, target, "Codex");
}
function copyScript(source, target, label) {
  if (!fs12.existsSync(source)) {
    log(`${label} launch script not found at ${source}`);
    return false;
  }
  try {
    fs12.mkdirSync(path11.dirname(target), { recursive: true });
    fs12.copyFileSync(source, target);
    log(`${label} launch script copied to ${target}`);
    return true;
  } catch (e) {
    log(`Could not copy ${label} launch script to ${target}: ${e.message}`);
    return false;
  }
}
function elevatedCopy(src, dest) {
  try {
    const srcEscaped = toWindowsPath(src);
    const destEscaped = toWindowsPath(dest);
    execSync(
      `powershell.exe -NoProfile -Command "Start-Process cmd -ArgumentList '/c copy /Y \\"${srcEscaped}\\" \\"${destEscaped}\\"' -Verb RunAs -Wait"`,
      { stdio: "inherit", timeout: 3e4 }
    );
    return true;
  } catch {
    return false;
  }
}
function ensureImportLines(mode) {
  try {
    const content = fs12.readFileSync(SHELL_NSS, "utf-8");
    const updated = generateShellImports(content, mode);
    if (updated === content) return false;
    const tempFile = path11.join(process.cwd(), "temp-shell.nss");
    fs12.writeFileSync(tempFile, updated, "utf-8");
    if (elevatedCopy(tempFile, SHELL_NSS)) {
      log(`Added ${installPlanForMode(mode).nssFiles.join(" and ")} imports to shell.nss`);
    } else {
      log(`Could not update shell.nss; add manually:
${installPlanForMode(mode).importLines.join("\n")}`);
    }
    try {
      fs12.unlinkSync(tempFile);
    } catch {
    }
    return true;
  } catch {
    log("Could not read shell.nss");
    return false;
  }
}
function writeNssFile(target, content, label) {
  let existingContent = "";
  try {
    existingContent = fs12.readFileSync(target, "utf-8");
  } catch {
  }
  if (existingContent === content) return false;
  const tempFile = path11.join(process.cwd(), `temp-${path11.basename(target)}`);
  fs12.writeFileSync(tempFile, content, "utf-8");
  if (elevatedCopy(tempFile, target)) {
    log(`Created ${label}`);
  } else {
    log(`Elevated copy failed for ${label}; run as admin or copy manually`);
    log(`  Source: ${tempFile}`);
    log(`  Target: ${target}`);
    return false;
  }
  try {
    fs12.unlinkSync(tempFile);
  } catch {
  }
  return true;
}
function generateFallbackCodexIcon() {
  const size = 32;
  const pixelBytes = size * size * 4;
  const maskBytes = size * 4;
  const dibBytes = 40 + pixelBytes + maskBytes;
  const icon = Buffer.alloc(6 + 16 + dibBytes);
  let offset = 0;
  icon.writeUInt16LE(0, offset);
  offset += 2;
  icon.writeUInt16LE(1, offset);
  offset += 2;
  icon.writeUInt16LE(1, offset);
  offset += 2;
  icon.writeUInt8(size, offset++);
  icon.writeUInt8(size, offset++);
  icon.writeUInt8(0, offset++);
  icon.writeUInt8(0, offset++);
  icon.writeUInt16LE(1, offset);
  offset += 2;
  icon.writeUInt16LE(32, offset);
  offset += 2;
  icon.writeUInt32LE(dibBytes, offset);
  offset += 4;
  icon.writeUInt32LE(6 + 16, offset);
  offset += 4;
  icon.writeUInt32LE(40, offset);
  offset += 4;
  icon.writeInt32LE(size, offset);
  offset += 4;
  icon.writeInt32LE(size * 2, offset);
  offset += 4;
  icon.writeUInt16LE(1, offset);
  offset += 2;
  icon.writeUInt16LE(32, offset);
  offset += 2;
  icon.writeUInt32LE(0, offset);
  offset += 4;
  icon.writeUInt32LE(pixelBytes, offset);
  offset += 4;
  icon.writeInt32LE(0, offset);
  offset += 4;
  icon.writeInt32LE(0, offset);
  offset += 4;
  icon.writeUInt32LE(0, offset);
  offset += 4;
  icon.writeUInt32LE(0, offset);
  offset += 4;
  const cx = 15.5;
  const cy = 15.5;
  const pixelOffset = 6 + 16 + 40;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const roundedSquare = Math.max(Math.abs(dx), Math.abs(dy)) <= 14;
      const cStroke = distance >= 8 && distance <= 12 && Math.abs(angle) > 0.62;
      const core = distance < 6;
      const sparkle = x >= 21 && x <= 23 && y >= 8 && y <= 10 || x === 22 && y >= 6 && y <= 12 || y === 9 && x >= 19 && x <= 25;
      const row = size - 1 - y;
      const i = pixelOffset + (row * size + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = roundedSquare ? 255 : 0;
      if (roundedSquare) {
        r = 15;
        g = 20;
        b = 28;
      }
      if (core) {
        r = 8;
        g = 13;
        b = 20;
      }
      if (cStroke) {
        r = 43;
        g = 214;
        b = 170;
      }
      if (sparkle) {
        r = 245;
        g = 249;
        b = 255;
        a = 255;
      }
      icon[i] = b;
      icon[i + 1] = g;
      icon[i + 2] = r;
      icon[i + 3] = a;
    }
  }
  return icon;
}
function uniquePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const result2 = [];
  for (const candidate of paths) {
    const normalized = path11.normalize(candidate);
    const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (!seen.has(key)) {
      seen.add(key);
      result2.push(normalized);
    }
  }
  return result2;
}
function codexExecutableCandidates(env2 = process.env) {
  const candidates = [];
  if (env2.LOCALAPPDATA) {
    candidates.push(path11.join(env2.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "bin", "codex.exe"));
  }
  const pathEntries = (env2.PATH ?? "").split(path11.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    candidates.push(path11.join(entry, process.platform === "win32" ? "codex.exe" : "codex"));
  }
  return uniquePaths(candidates);
}
function codexIconFileCandidates(env2 = process.env) {
  const candidates = [];
  if (env2.LOCALAPPDATA) {
    candidates.push(path11.join(env2.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "resources", "icon.ico"));
    candidates.push(path11.join(env2.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "app", "resources", "icon.ico"));
  }
  const windowsApps = env2.ProgramFiles ? path11.join(env2.ProgramFiles, "WindowsApps") : "";
  if (windowsApps) {
    try {
      for (const entry of fs12.readdirSync(windowsApps, { withFileTypes: true })) {
        if (entry.isDirectory() && /^OpenAI\.Codex_/i.test(entry.name)) {
          candidates.push(path11.join(windowsApps, entry.name, "app", "resources", "icon.ico"));
          candidates.push(path11.join(windowsApps, entry.name, "app", "resources", "codex-tray.ico"));
        }
      }
    } catch {
    }
  }
  return uniquePaths(candidates);
}
function dynamicCodexIconFileCandidates(env2 = process.env) {
  const candidates = codexIconFileCandidates(env2);
  const appxLocation = codexAppxInstallLocation();
  if (appxLocation) {
    candidates.push(path11.join(appxLocation, "app", "resources", "icon.ico"));
    candidates.push(path11.join(appxLocation, "app", "resources", "codex-tray.ico"));
  }
  return uniquePaths(candidates);
}
function dynamicCodexExecutableCandidates(env2 = process.env) {
  const candidates = codexExecutableCandidates(env2);
  if (env2.LOCALAPPDATA) {
    const localCodexBin = path11.join(env2.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    try {
      for (const entry of fs12.readdirSync(localCodexBin, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path11.join(localCodexBin, entry.name, "codex.exe"));
        }
      }
    } catch {
    }
  }
  const windowsApps = env2.ProgramFiles ? path11.join(env2.ProgramFiles, "WindowsApps") : "";
  if (windowsApps) {
    try {
      for (const entry of fs12.readdirSync(windowsApps, { withFileTypes: true })) {
        if (entry.isDirectory() && /^OpenAI\.Codex_/i.test(entry.name)) {
          candidates.push(path11.join(windowsApps, entry.name, "app", "Codex.exe"));
          candidates.push(path11.join(windowsApps, entry.name, "app", "resources", "codex.exe"));
        }
      }
    } catch {
    }
  }
  return uniquePaths(candidates);
}
function isUsableIco(filePath) {
  try {
    const bytes = fs12.readFileSync(filePath);
    if (bytes.length < 22) return false;
    return bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1 && bytes.readUInt16LE(4) >= 1 && bytes.readUInt32LE(14) > 0 && bytes.readUInt32LE(18) < bytes.length;
  } catch {
    return false;
  }
}
function findInstalledCodexIconFile(env2 = process.env) {
  return dynamicCodexIconFileCandidates(env2).find((candidate) => isUsableIco(candidate)) ?? null;
}
function findInstalledCodexExecutable(env2 = process.env) {
  return dynamicCodexExecutableCandidates(env2).find((candidate) => fs12.existsSync(candidate)) ?? null;
}
function codexAppxInstallLocation() {
  if (process.platform !== "win32") return null;
  try {
    const stdout = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "(Get-AppxPackage OpenAI.Codex | Select-Object -First 1 -ExpandProperty InstallLocation)"],
      { encoding: "utf8", stdio: "pipe", timeout: 1e4 }
    ).trim();
    return stdout || null;
  } catch {
    return null;
  }
}
function extractAssociatedIcon(exePath, targetPath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Drawing",
    "$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:CODEX_EXE)",
    "if ($null -eq $icon) { throw 'No associated icon found' }",
    "$stream = [System.IO.File]::Create($env:CODEX_ICON_OUT)",
    "try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose() }"
  ].join("; ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      env: { ...process.env, CODEX_EXE: exePath, CODEX_ICON_OUT: targetPath },
      stdio: "pipe",
      timeout: 15e3
    });
    return fs12.existsSync(targetPath) && fs12.statSync(targetPath).size > 100;
  } catch {
    return false;
  }
}
function ensureCodexIcon() {
  const tempFile = path11.join(process.cwd(), "temp-codex-icon.ico");
  const officialIcon = findInstalledCodexIconFile();
  const officialExe = officialIcon ? null : findInstalledCodexExecutable();
  let source = "generated fallback icon";
  if (officialIcon) {
    fs12.copyFileSync(officialIcon, tempFile);
    source = `installed OpenAI Codex resource icon (${officialIcon})`;
  } else if (officialExe && extractAssociatedIcon(officialExe, tempFile) && isUsableIco(tempFile)) {
    source = `installed OpenAI Codex executable icon (${officialExe})`;
  } else if (isUsableIco(CODEX_ICON)) {
    return false;
  } else {
    fs12.writeFileSync(tempFile, generateFallbackCodexIcon());
  }
  if (fs12.existsSync(CODEX_ICON)) {
    const existing = fs12.readFileSync(CODEX_ICON);
    const next = fs12.readFileSync(tempFile);
    if (existing.equals(next)) {
      try {
        fs12.unlinkSync(tempFile);
      } catch {
      }
      return false;
    }
  }
  if (elevatedCopy(tempFile, CODEX_ICON)) {
    log(`Created codex-icon.ico from ${source}`);
  } else {
    log("Elevated copy failed for codex-icon.ico; run as admin or copy manually");
    log(`  Source: ${tempFile}`);
    log(`  Target: ${CODEX_ICON}`);
    return false;
  }
  try {
    fs12.unlinkSync(tempFile);
  } catch {
  }
  return true;
}
function reloadNilesoft() {
  const shellExe = path11.join(NILESOFT_DIR, "shell.exe");
  try {
    execSync(`"${shellExe}" -restart`, { stdio: "pipe", timeout: 1e4 });
    log("Nilesoft Shell reloaded");
  } catch {
    try {
      execSync(
        `powershell.exe -NoProfile -Command "Start-Process '${shellExe}' -ArgumentList '-restart' -Verb RunAs -Wait"`,
        { stdio: "pipe", timeout: 1e4 }
      );
      log("Nilesoft Shell reloaded elevated");
    } catch {
      log("Reload failed; will ensure Explorer is running");
    }
  }
  ensureExplorerRunning();
}
function ensureExplorerRunning() {
  try {
    execSync(
      'powershell.exe -NoProfile -Command "if (-not (Get-Process explorer -EA SilentlyContinue)) { Start-Process explorer.exe }"',
      { encoding: "utf-8", stdio: "pipe", timeout: 5e3 }
    );
  } catch {
  }
}
function main6() {
  const mode = parseInstallMode();
  const plan = installPlanForMode(mode);
  if (!isWindows()) {
    log("Skipped (not Windows)");
    return;
  }
  if (!isNilesoftInstalled()) {
    if (!installNilesoft()) {
      log("Nilesoft Shell not available; context menu not configured");
      return;
    }
  }
  const claudeScriptReady = plan.copyClaude ? copyLaunchScript() : true;
  const codexScriptReady = plan.copyCodex ? copyCodexLaunchScript() : true;
  if (!claudeScriptReady || !codexScriptReady) {
    log("Launch scripts are incomplete; NSS files and shell imports were not changed");
    return;
  }
  const claudeChanged = plan.writeClaudeNss ? writeNssFile(CLAUDE_NSS, generateNss(), "claude-code.nss") : false;
  const codexChanged = plan.writeCodexNss ? writeNssFile(CODEX_NSS, generateCodexNss(), "Codex.nss") : false;
  const codexIconChanged = plan.writeCodexIcon ? ensureCodexIcon() : false;
  const importsChanged = ensureImportLines(mode);
  if (claudeChanged || codexChanged || codexIconChanged || importsChanged) {
    reloadNilesoft();
    log("Context menu configured and reloaded");
  } else {
    log("Context menu already up to date");
  }
}
var PREFIX, NILESOFT_WINGET_ARGS, NILESOFT_DIR, SHELL_NSS, IMPORTS_DIR, CLAUDE_NSS, CODEX_NSS, CODEX_ICON, CLAUDE_IMPORT_LINE, CODEX_IMPORT_LINE, MODULE_DIR2, GLOBAL_SCRIPTS_DIR, GLOBAL_CLAUDE_LAUNCH_SCRIPT, GLOBAL_CODEX_LAUNCH_SCRIPT, __filename;
var init_postinstall = __esm({
  "tools/context-menu/postinstall.ts"() {
    "use strict";
    PREFIX = "[context-menu]";
    NILESOFT_WINGET_ARGS = [
      "install",
      "--exact",
      "--id",
      "Nilesoft.Shell",
      "--source",
      "winget",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity"
    ];
    NILESOFT_DIR = "C:\\Program Files\\Nilesoft Shell";
    SHELL_NSS = path11.join(NILESOFT_DIR, "shell.nss");
    IMPORTS_DIR = path11.join(NILESOFT_DIR, "imports");
    CLAUDE_NSS = path11.join(IMPORTS_DIR, "claude-code.nss");
    CODEX_NSS = path11.join(IMPORTS_DIR, "Codex.nss");
    CODEX_ICON = path11.join(IMPORTS_DIR, "codex-icon.ico");
    CLAUDE_IMPORT_LINE = "import 'imports/claude-code.nss'";
    CODEX_IMPORT_LINE = "import 'imports/Codex.nss'";
    MODULE_DIR2 = path11.dirname(fileURLToPath3(import.meta.url));
    GLOBAL_SCRIPTS_DIR = path11.join(os3.homedir(), ".dev-pomogator", "scripts");
    GLOBAL_CLAUDE_LAUNCH_SCRIPT = path11.join(GLOBAL_SCRIPTS_DIR, "launch-claude-tui.ps1");
    GLOBAL_CODEX_LAUNCH_SCRIPT = path11.join(GLOBAL_SCRIPTS_DIR, "launch-Codex-tui.ps1");
    __filename = fileURLToPath3(import.meta.url);
    if (path11.basename(process.argv[1] ?? "") === "postinstall.ts" && process.argv[1] === __filename) {
      main6();
    }
  }
});

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build5 = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build5}`, options);
    };
    module.exports = coerce;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result2 = [...rangeMap.values()];
        cache.set(memoKey, result2);
        return result2;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result2 = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result2 && remainingComparators.length) {
        result2 = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result2;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports, module) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports, module) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// .claude/skills/pomogator-doctor/scripts/engine/index.ts
import fs31 from "node:fs";
import os8 from "node:os";
import path31 from "node:path";
import { pathToFileURL as pathToFileURL6 } from "node:url";

// .claude/skills/pomogator-doctor/scripts/engine/checks/_helpers.ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";

// .claude/skills/pomogator-doctor/scripts/engine/constants.ts
var DOCTOR_TIMEOUTS = {
  GLOBAL_MS: 15e3,
  PROBE_MS: 3e3,
  SPAWN_MS: 5e3,
  HOOK_MS: 1e4
};
var DOCTOR_POOLS = {
  FS: 8,
  MCP: 4
};
var DOCTOR_SCHEMA_VERSION = "1.0.0";

// .claude/skills/pomogator-doctor/scripts/engine/checks/_helpers.ts
function buildResult(meta, severity, message, extra = {}) {
  return {
    id: meta.id,
    fr: meta.fr,
    name: meta.name,
    group: meta.group,
    reinstallable: meta.reinstallable,
    severity,
    message,
    durationMs: 0,
    ...extra
  };
}
function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function checkBinaryVersion(bin, args = ["--version"], pattern) {
  const result2 = spawnSync(bin, args, {
    encoding: "utf-8",
    timeout: DOCTOR_TIMEOUTS.SPAWN_MS
  });
  const combined = ((result2.stdout ?? "") + (result2.stderr ?? "")).trim();
  if (result2.status === 0 && (!pattern || pattern.test(combined))) {
    return { ok: true, output: combined };
  }
  return {
    ok: false,
    output: combined,
    error: result2.error?.message
  };
}
function parseDotenvContent(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}
function readDotenvFile(envPath) {
  try {
    return parseDotenvContent(fs.readFileSync(envPath, "utf-8"));
  } catch {
    return {};
  }
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/bun.ts
var META = {
  id: "C9",
  fr: "FR-7",
  name: "Bun binary",
  group: "needs-external",
  reinstallable: false
};
function requiresBun(ctx) {
  return ctx.installedExtensions.some(
    (ext) => (ext.dependencies?.binaries ?? []).includes("bun")
  );
}
var bunCheck = {
  ...META,
  pool: "fs",
  gate(ctx) {
    return requiresBun(ctx) ? { relevant: true } : {
      relevant: false,
      reason: "no installed extension declares bun in dependencies.binaries"
    };
  },
  async run() {
    const { ok, output } = checkBinaryVersion("bun", ["--version"], /\d+\.\d+\.\d+/);
    if (ok) return buildResult(META, "ok", `bun v${output}`);
    const hint = process.platform === "win32" ? "Install Bun: `irm bun.sh/install.ps1 | iex` (PowerShell)" : "Install Bun: `curl -fsSL bun.sh/install | bash`";
    return buildResult(META, "critical", "bun not found in PATH", { hint });
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/claude-bin-priority.ts
import fs2 from "node:fs";
import os from "node:os";
import path from "node:path";
var META2 = {
  id: "C30",
  fr: "FR-35",
  name: "Legacy npm Claude install",
  group: "self-sufficient",
  reinstallable: false
};
var NPM_GLOBAL_RELATIVE = [".npm-global", "claude.cmd"];
var NPM_GLOBAL_SHIM_RELATIVE = [".npm-global", "claude"];
var NPM_GLOBAL_PKG_RELATIVE = [
  ".npm-global",
  "node_modules",
  "@anthropic-ai",
  "claude-code"
];
function joinHome(home, parts) {
  return path.join(home, ...parts);
}
var claudeBinPriorityCheck = {
  ...META2,
  pool: "fs",
  gate() {
    return process.platform === "win32" ? { relevant: true } : {
      relevant: false,
      reason: "check targets Windows %USERPROFILE%\\.npm-global layout"
    };
  },
  async run() {
    const home = os.homedir();
    const cmd = joinHome(home, NPM_GLOBAL_RELATIVE);
    const shim = joinHome(home, NPM_GLOBAL_SHIM_RELATIVE);
    const pkg = joinHome(home, NPM_GLOBAL_PKG_RELATIVE);
    const stale = [];
    if (fs2.existsSync(cmd)) stale.push(cmd);
    if (fs2.existsSync(shim)) stale.push(shim);
    if (fs2.existsSync(pkg)) stale.push(pkg);
    if (stale.length === 0) {
      return buildResult(META2, "ok", "no legacy npm Claude install found");
    }
    const cleanupCmd = `Remove-Item -Recurse -Force ` + stale.map((p) => `'${p}'`).join(", ");
    return buildResult(
      META2,
      "warning",
      `Legacy npm install of @anthropic-ai/claude-code found (${stale.length} artifact(s)). npm distribution is deprecated; native installer at ~/.local/bin/claude.exe is recommended. Stale shims may shadow the native binary depending on PATH order.`,
      {
        hint: `Remove the legacy install: ${cleanupCmd}. Native installer (recommended): irm https://claude.ai/install.ps1 | iex`,
        details: { staleArtifacts: stale }
      }
    );
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-plugin.ts
import fs3 from "node:fs";
import path2 from "node:path";
var META3 = {
  id: "C-CMEM",
  fr: "FR-6",
  name: "claude-mem plugin installed",
  group: "needs-external",
  reinstallable: false
};
var INSTALL_HINT = "claude-mem (persistent memory) is not installed. The dev-pomogator SessionStart bootstrap installs it automatically on the next session (opt-out: DEV_POMOGATOR_CLAUDE_MEM=off). To install now: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem`, or `npx claude-mem install`.";
function isClaudeMemInstalled(homeDir) {
  try {
    const manifest = path2.join(homeDir, ".claude", "plugins", "installed_plugins.json");
    const data = JSON.parse(fs3.readFileSync(manifest, "utf-8"));
    const plugins = data.plugins ?? {};
    for (const key of Object.keys(plugins)) {
      if (key.startsWith("claude-mem@") && Array.isArray(plugins[key]) && plugins[key].length > 0) {
        return true;
      }
    }
  } catch {
  }
  try {
    const memDir = path2.join(homeDir, ".claude-mem");
    return fs3.existsSync(path2.join(memDir, ".worker.pid")) || fs3.existsSync(path2.join(memDir, "claude-mem.db"));
  } catch {
    return false;
  }
}
var claudeMemPluginCheck = {
  ...META3,
  pool: "fs",
  async run(ctx) {
    return isClaudeMemInstalled(ctx.homeDir) ? buildResult(META3, "ok", "claude-mem plugin is installed") : buildResult(META3, "warning", "claude-mem plugin not installed", { hint: INSTALL_HINT });
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/claude-mem-worker.ts
import fs4 from "node:fs";
import path3 from "node:path";
var META4 = {
  id: "C-CMEM-W",
  fr: "FR-6",
  name: "claude-mem worker health",
  group: "needs-external",
  reinstallable: false
};
var DEFAULT_PORT = 37777;
var PROBE_TIMEOUT_MS = 800;
var WEDGE_CRITICAL_FAILURES = 30;
function readWorkerPort(homeDir) {
  try {
    const raw = fs4.readFileSync(path3.join(homeDir, ".claude-mem", "settings.json"), "utf-8");
    const p = parseInt(String(JSON.parse(raw).CLAUDE_MEM_WORKER_PORT), 10);
    return Number.isFinite(p) && p > 0 ? { port: p, configuration: "configured" } : { port: DEFAULT_PORT, configuration: "malformed" };
  } catch (error) {
    return { port: DEFAULT_PORT, configuration: error.code === "ENOENT" ? "missing" : "malformed" };
  }
}
function readConsecutiveFailures(homeDir) {
  try {
    const raw = fs4.readFileSync(path3.join(homeDir, ".claude-mem", "state", "hook-failures.json"), "utf-8");
    const n = Number(JSON.parse(raw).consecutiveFailures);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
var HEAL_HINT = "Auto-heals on the next session: the claude-mem-reaper SessionStart hook frees the wedged port (no reboot). Start a new Claude session to heal now. Opt out with DEV_POMOGATOR_CLAUDE_MEM_REAP=off.";
var claudeMemWorkerCheck = {
  ...META4,
  pool: "mcp",
  // shares the throttled network pool (does an HTTP probe)
  gate(ctx) {
    return isClaudeMemInstalled(ctx.homeDir) ? { relevant: true } : { relevant: false, reason: "claude-mem not installed" };
  },
  async run(ctx) {
    const { port, configuration } = readWorkerPort(ctx.homeDir);
    const failures = readConsecutiveFailures(ctx.homeDir);
    if (configuration === "malformed") {
      return buildResult(META4, "warning", `worker configuration is malformed; cannot resolve port (default :${port})`, {
        hint: "Repair ~/.claude-mem/settings.json and restart the worker.",
        details: { port, configuration, consecutiveFailures: failures }
      });
    }
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    ctx.signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
      if (res.ok) {
        return failures > 0 ? buildResult(META4, "warning", `worker up on :${port} but ${failures} recent hook failure(s) recorded`, {
          hint: "Transient \u2014 the counter resets once hooks reach the worker again.",
          details: { port, configuration, consecutiveFailures: failures }
        }) : buildResult(META4, "ok", `worker healthy on :${port}`, { details: { port, configuration } });
      }
      return buildResult(META4, "warning", `worker on :${port} responded ${res.status} (not healthy)`, {
        hint: HEAL_HINT,
        details: { port, configuration, status: res.status, consecutiveFailures: failures }
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      const sev = failures >= WEDGE_CRITICAL_FAILURES ? "critical" : "warning";
      const wedged = timedOut;
      const msg = wedged ? `worker wedged on :${port} (port bound but no HTTP response; ${failures} consecutive hook failures)` : `worker not reachable on :${port} (${failures} consecutive hook failures)`;
      return buildResult(META4, sev, msg, { hint: HEAL_HINT, details: { port, configuration, consecutiveFailures: failures, wedged } });
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
    }
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts
import fs9 from "node:fs";
import path8 from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL as pathToFileURL5 } from "node:url";
var META5 = {
  id: "C-CARL",
  fr: "CARL-FR-5",
  name: "CARL managed project artifacts",
  group: "self-sufficient",
  reinstallable: true
};
var CURRENT_VERSION = "2.0.3";
var MANIFEST_REL2 = path8.join(".carl", "carl.json");
var REQUIRED_WARNING2 = "CARL did not run; tell the user CARL guidance/recall was unavailable.";
function readJsonObject3(filePath) {
  try {
    const parsed = JSON.parse(fs9.readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function manifestPath2(projectRoot) {
  return path8.join(projectRoot, MANIFEST_REL2);
}
function loadManifest(projectRoot) {
  return readJsonObject3(manifestPath2(projectRoot));
}
function runtimeMissing(manifest, pluginRoot) {
  const command = manifest?.runtime?.command ?? "";
  if (!command || /missing|definitely-missing/u.test(command)) return true;
  if (command.includes("tools/carl/runner.ts")) {
    return !fs9.existsSync(path8.join(pluginRoot, "tools", "carl", "runner.ts"));
  }
  return false;
}
function collectIssues(manifest, projectRoot, pluginRoot) {
  const issues = [];
  if (!manifest) {
    issues.push("manifest missing");
    return issues;
  }
  if (manifest.managedBy !== "dev-pomogator") issues.push("owner marker missing");
  if (manifest.version !== CURRENT_VERSION) issues.push(`stale version marker (${manifest.version ?? "missing"})`);
  if (runtimeMissing(manifest, pluginRoot)) issues.push("runtime consumer missing");
  const ruStatus = manifest.languageStatus?.ru?.status;
  if (!ruStatus) issues.push("Russian language status missing");
  if (!fs9.existsSync(path8.dirname(manifestPath2(projectRoot)))) issues.push(".carl directory missing");
  return issues;
}
async function repairCarl(projectRoot) {
  try {
    const mod = await Promise.resolve().then(() => (init_install(), install_exports));
    const result2 = mod.install({ project: projectRoot, platform: "claude-code", repair: true });
    return { ok: Boolean(result2.ok), status: result2 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
async function checkCarlProject(options) {
  const before = loadManifest(options.projectRoot);
  const beforeIssues = collectIssues(before, options.projectRoot, options.pluginRoot);
  if (beforeIssues.length === 0) {
    return buildResult(META5, "ok", "CARL managed artifacts are current", {
      details: { manifest: manifestPath2(options.projectRoot), requiredWarning: REQUIRED_WARNING2 }
    });
  }
  if (!options.repair) {
    return buildResult(META5, "critical", `CARL managed artifacts need repair: ${beforeIssues.join("; ")}`, {
      hint: "Run /pomogator-doctor with CARL repair enabled or reinstall dev-pomogator",
      reinstallHint: "Run `/plugin install dev-pomogator@stgmt --force`, then run /pomogator-doctor again",
      details: { manifest: manifestPath2(options.projectRoot), issues: beforeIssues }
    });
  }
  if (!fs9.existsSync(path8.join(options.pluginRoot, "tools", "carl", "install.ts"))) {
    return buildResult(META5, "critical", `CARL repair unavailable: ${beforeIssues.join("; ")}`, {
      hint: "Reinstall dev-pomogator so tools/carl/install.ts is available",
      reinstallHint: "Run `/plugin install dev-pomogator@stgmt --force`, then run /pomogator-doctor again",
      details: { manifest: manifestPath2(options.projectRoot), issues: beforeIssues }
    });
  }
  const repair = await repairCarl(options.projectRoot);
  const after = loadManifest(options.projectRoot);
  const afterIssues = collectIssues(after, options.projectRoot, options.pluginRoot);
  if (repair.ok && afterIssues.length === 0) {
    return buildResult(META5, "ok", `CARL repaired stale managed artifacts: ${beforeIssues.join("; ")}`, {
      details: { manifest: manifestPath2(options.projectRoot), repaired: true, beforeIssues }
    });
  }
  return buildResult(META5, "critical", `CARL managed artifacts need repair: ${afterIssues.join("; ") || beforeIssues.join("; ")}`, {
    hint: repair.error ?? "Run /pomogator-doctor after reinstalling dev-pomogator",
    reinstallHint: "Run `/plugin install dev-pomogator@stgmt --force`, then run /pomogator-doctor again",
    details: { manifest: manifestPath2(options.projectRoot), beforeIssues, afterIssues, repair: repair.status ?? repair.error }
  });
}
function pluginRootFrom(ctx) {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT ? path8.resolve(process.env.CLAUDE_PLUGIN_ROOT) : "";
  if (envRoot && fs9.existsSync(path8.join(envRoot, "tools", "carl", "runner.ts"))) return envRoot;
  return path8.resolve(path8.dirname(fileURLToPath2(import.meta.url)), "..", "..", "..", "..", "..", "..");
}
var carlCheck = {
  ...META5,
  pool: "fs",
  gate(ctx) {
    const hasManifest = fs9.existsSync(manifestPath2(ctx.projectRoot));
    const hasCarlSource = fs9.existsSync(path8.join(pluginRootFrom(ctx), "tools", "carl", "runner.ts"));
    if (!hasManifest && !hasCarlSource) {
      return { relevant: false, reason: "CARL integration not present in this project" };
    }
    return { relevant: true };
  },
  async run(ctx) {
    return checkCarlProject({ projectRoot: ctx.projectRoot, pluginRoot: pluginRootFrom(ctx), repair: ctx.fix });
  }
};
function usage5() {
  process.stderr.write("Usage: node --import tsx .claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts --project <path> [--repair]\n");
  process.exit(2);
}
function parseArgs5(argv) {
  let project = "";
  let repair = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project") {
      project = argv[++i] ?? "";
    } else if (arg === "--repair") {
      repair = true;
    } else if (arg === "--help" || arg === "-h") {
      usage5();
    } else {
      process.stderr.write(`Unknown argument: ${arg}
`);
      usage5();
    }
  }
  if (!project) usage5();
  return { project: path8.resolve(project), repair };
}
async function main5() {
  const args = parseArgs5(process.argv.slice(2));
  const result2 = await checkCarlProject({ projectRoot: args.project, pluginRoot: pluginRootFrom(), repair: args.repair });
  process.stdout.write(`${JSON.stringify(result2, null, 2)}
`);
  if (result2.severity === "critical") process.exit(1);
}
var invokedPath5 = process.argv[1] ? pathToFileURL5(path8.resolve(process.argv[1])).href : "";
if (path8.basename(process.argv[1] ?? "") === "carl.ts" && import.meta.url === invokedPath5) {
  main5().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exit(1);
  });
}

// tools/context-mode-health/check.ts
import fs11 from "node:fs";
import path10 from "node:path";

// tools/context-mode-setup/state.ts
import fs10 from "node:fs";
import path9 from "node:path";
var CONTEXT_MODE_PLUGIN_ID = "context-mode@context-mode";
var CONTEXT_MODE_SERVER_NAME = "context-mode";
function claudePluginsRegistryPath(homeRoot) {
  return path9.join(homeRoot, ".claude", "plugins", "installed_plugins.json");
}
function claudeGlobalSettingsPath(homeRoot) {
  return path9.join(homeRoot, ".claude.json");
}
function readJsonObject4(filePath) {
  try {
    const raw = fs10.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { state: "malformed", error: "JSON root must be an object" };
    }
    return { state: "ok", value: parsed };
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT") return { state: "missing" };
    return { state: "malformed", error: err instanceof Error ? err.message : String(err) };
  }
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function inspectPluginRegistry(homeRoot) {
  const registryPath = claudePluginsRegistryPath(homeRoot);
  const json = readJsonObject4(registryPath);
  if (json.state === "missing") {
    return { state: "missing", path: registryPath, evidence: ["installed_plugins.json missing"] };
  }
  if (json.state === "malformed" || !json.value) {
    return {
      state: "malformed",
      path: registryPath,
      evidence: ["installed_plugins.json malformed"],
      error: json.error
    };
  }
  const enabledPlugins = asObject(json.value.enabledPlugins);
  const plugins = asObject(json.value.plugins);
  const enabled = enabledPlugins?.[CONTEXT_MODE_PLUGIN_ID] === true;
  const pluginKeys = Object.keys(plugins ?? {});
  const hasPluginEvidence = Object.prototype.hasOwnProperty.call(enabledPlugins ?? {}, CONTEXT_MODE_PLUGIN_ID) || pluginKeys.some((key) => key === CONTEXT_MODE_PLUGIN_ID || key.startsWith("context-mode@"));
  if (enabled) {
    return {
      state: "registered",
      path: registryPath,
      evidence: [`enabledPlugins["${CONTEXT_MODE_PLUGIN_ID}"] true`]
    };
  }
  if (hasPluginEvidence) {
    return {
      state: "poisoned",
      path: registryPath,
      evidence: [`context-mode plugin evidence exists but ${CONTEXT_MODE_PLUGIN_ID} is not enabled`]
    };
  }
  return { state: "missing", path: registryPath, evidence: ["context-mode plugin evidence missing"] };
}
function inspectMcpOnlyConfig(homeRoot) {
  const settingsPath = claudeGlobalSettingsPath(homeRoot);
  const json = readJsonObject4(settingsPath);
  if (json.state === "missing") return { active: false, path: settingsPath, evidence: ["global settings missing"] };
  if (json.state === "malformed" || !json.value) {
    return {
      active: false,
      path: settingsPath,
      evidence: ["global settings malformed"],
      error: json.error
    };
  }
  const mcpServers = asObject(json.value.mcpServers);
  const active = asObject(mcpServers?.[CONTEXT_MODE_SERVER_NAME]) !== null;
  return {
    active,
    path: settingsPath,
    evidence: active ? [`mcpServers.${CONTEXT_MODE_SERVER_NAME} present`] : [`mcpServers.${CONTEXT_MODE_SERVER_NAME} missing`]
  };
}

// tools/context-mode-health/handshake.ts
function classifyHandshake(result2) {
  if (!result2 || result2.skipped) return "skipped";
  return result2.ok === true ? "ok" : "failed";
}

// tools/context-mode-health/check.ts
function readManifestCommand(manifestPath3, pluginRoot) {
  const candidates = [
    manifestPath3,
    pluginRoot ? path10.join(pluginRoot, ".codex-plugin", "mcp.json") : void 0,
    pluginRoot ? path10.join(pluginRoot, ".claude-plugin", "mcp.json") : void 0
  ].filter((candidate) => Boolean(candidate));
  for (const candidate of candidates) {
    const json = readJsonObject4(candidate);
    if (json.state !== "ok" || !json.value) continue;
    const servers = json.value.mcpServers;
    const server = servers?.["context-mode"];
    if (server && typeof server.command === "string") {
      const args = Array.isArray(server.args) ? server.args.filter((arg) => typeof arg === "string") : [];
      return [server.command, ...args].join(" ");
    }
  }
  return null;
}
function readProcessState(snapshotPath) {
  if (!snapshotPath || !fs11.existsSync(snapshotPath)) return "unknown";
  const json = readJsonObject4(snapshotPath);
  if (json.state !== "ok" || !json.value) return "unknown";
  const servers = json.value.mcpServers;
  const contextMode = servers?.["context-mode"];
  if (contextMode?.alive === true) return "alive";
  if (contextMode?.alive === false) return "dead";
  if (json.value.alive === true) return "alive";
  if (json.value.alive === false) return "dead";
  return "unknown";
}
function renderRecoveryGuidance(status) {
  if (status === "MCP_DEAD_IN_SESSION") {
    return [
      "run the idempotent context-mode heal step",
      "reconnect context-mode through /mcp",
      "verify ctx tools are available with a handshake/tool listing",
      "restart the full Claude Code session only as the last resort"
    ];
  }
  if (status === "CONFIG_POISONED") {
    return ["repair installed_plugins.json or reinstall context-mode", 'verify enabledPlugins["context-mode@context-mode"] is true'];
  }
  if (status === "INSTALL_MISSING") {
    return ["/plugin marketplace add mksglu/context-mode", "/plugin install context-mode@context-mode", "/reload-plugins"];
  }
  return ["no context-mode remediation required"];
}
function runContextModeDoctor(options) {
  try {
    const registry = inspectPluginRegistry(options.homeRoot);
    const mcpOnly = inspectMcpOnlyConfig(options.homeRoot);
    const registration = registry.state === "registered" ? "present" : registry.state === "poisoned" ? "poisoned" : registry.state === "malformed" ? "malformed" : "missing";
    const processState = readProcessState(options.processSnapshotPath);
    const handshake = classifyHandshake(options.handshakeResult);
    const hookSafety = options.hookSafety ?? "unknown";
    let status;
    if (registration === "malformed" || registration === "poisoned") status = "CONFIG_POISONED";
    else if (registration === "missing" && mcpOnly.active) status = "MCP_ONLY_CONFIGURED";
    else if (registration === "missing") status = "INSTALL_MISSING";
    else if (processState === "dead") status = "MCP_DEAD_IN_SESSION";
    else if (handshake === "failed") status = "HANDSHAKE_FAILED";
    else if (hookSafety === "unsafe") status = "HOOK_UNSAFE";
    else status = "OK";
    return {
      status,
      registration,
      manifestCommand: readManifestCommand(options.manifestPath, options.pluginRoot),
      process: processState,
      handshake,
      hookSafety,
      remediation: renderRecoveryGuidance(status),
      evidence: [...registry.evidence, ...mcpOnly.evidence]
    };
  } catch (err) {
    return {
      status: "ERROR_FAIL_OPEN",
      registration: "missing",
      manifestCommand: null,
      process: "unknown",
      handshake: "skipped",
      hookSafety: "unknown",
      remediation: ["context-mode doctor failed open; inspect configuration manually"],
      evidence: [err instanceof Error ? err.message : String(err)]
    };
  }
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/context-mode.ts
var META6 = {
  id: "C-CMODE",
  fr: "CTXMODE-FR-4",
  name: "context-mode plugin health",
  group: "needs-external",
  reinstallable: false
};
var SEVERITY_BY_STATUS = {
  OK: "ok",
  MCP_ONLY_CONFIGURED: "ok",
  INSTALL_MISSING: "warning",
  CONFIG_POISONED: "warning",
  MCP_DEAD_IN_SESSION: "warning",
  HANDSHAKE_FAILED: "warning",
  HOOK_UNSAFE: "warning",
  ERROR_FAIL_OPEN: "warning"
};
var MESSAGE_BY_STATUS = {
  OK: "context-mode plugin is registered and no runtime issue was detected",
  MCP_ONLY_CONFIGURED: "context-mode MCP-only configuration is present",
  INSTALL_MISSING: "context-mode plugin is not installed",
  CONFIG_POISONED: "context-mode plugin registry is present but inconsistent",
  MCP_DEAD_IN_SESSION: "context-mode MCP appears dead in the current session",
  HANDSHAKE_FAILED: "context-mode MCP handshake failed",
  HOOK_UNSAFE: "context-mode hook safety check reported an unsafe state",
  ERROR_FAIL_OPEN: "context-mode health check failed open"
};
function statusHint(status, remediation) {
  const base = remediation.join(" -> ");
  if (process.platform === "win32") {
    return `${base}. Windows note: use pwsh -NoProfile for PowerShell commands; ctx shell snippets run under bash.`;
  }
  return base;
}
var contextModeCheck = {
  ...META6,
  pool: "mcp",
  async run(ctx) {
    const report = runContextModeDoctor({
      homeRoot: ctx.homeDir,
      pluginRoot: ctx.projectRoot,
      processSnapshotPath: process.env.DEV_POMOGATOR_CONTEXT_MODE_PROCESS_SNAPSHOT,
      handshakeResult: process.env.DEV_POMOGATOR_CONTEXT_MODE_HANDSHAKE === "ok" ? { ok: true } : process.env.DEV_POMOGATOR_CONTEXT_MODE_HANDSHAKE === "failed" ? { ok: false } : { skipped: true },
      hookSafety: process.env.DEV_POMOGATOR_CONTEXT_MODE_HOOK_UNSAFE === "1" ? "unsafe" : "unknown"
    });
    return buildResult(META6, SEVERITY_BY_STATUS[report.status], MESSAGE_BY_STATUS[report.status], {
      hint: statusHint(report.status, report.remediation),
      details: {
        status: report.status,
        registration: report.registration,
        process: report.process,
        handshake: report.handshake,
        hookSafety: report.hookSafety,
        manifestCommand: report.manifestCommand,
        evidence: report.evidence,
        remediation: report.remediation
      }
    });
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/context-menu.ts
import fs13 from "node:fs";
import os4 from "node:os";
import path12 from "node:path";
var META7 = {
  id: "C-CTXM",
  fr: "FR-CTXM",
  name: "Context menu install drift (Windows)",
  group: "self-sufficient",
  reinstallable: true
};
var CLAUDE_NSS2 = "C:\\Program Files\\Nilesoft Shell\\imports\\claude-code.nss";
var CODEX_NSS2 = "C:\\Program Files\\Nilesoft Shell\\imports\\Codex.nss";
var contextMenuCheck = {
  ...META7,
  pool: "fs",
  gate() {
    if (process.platform !== "win32") {
      return { relevant: false, reason: "context menu is a Windows-only (Nilesoft Shell) feature" };
    }
    if (!fileExists(CLAUDE_NSS2) && !fileExists(CODEX_NSS2)) {
      return { relevant: false, reason: "context menu never set up (run /context-menu to opt in) \u2014 nothing to drift-check" };
    }
    return { relevant: true };
  },
  async run(ctx) {
    const home = ctx.homeDir || os4.homedir();
    const installedClaudeLaunchScript = path12.join(home, ".dev-pomogator", "scripts", "launch-claude-tui.ps1");
    const installedCodexLaunchScript = path12.join(home, ".dev-pomogator", "scripts", "launch-Codex-tui.ps1");
    const fixHint = `Apply NOW: node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/context-menu/postinstall.ts" (re-copies the launch script + regenerates the NSS + reloads Nilesoft Shell \u2014 same steps /context-menu runs).`;
    let mod;
    try {
      mod = await Promise.resolve().then(() => (init_postinstall(), postinstall_exports));
    } catch (e) {
      return buildResult(META7, "warning", `could not load postinstall.ts to compare: ${e.message}`, {
        hint: fixHint
      });
    }
    const drift = [];
    function compareInstalledFile(label, bundledPath, installedPath) {
      const bundled = fs13.readFileSync(bundledPath, "utf-8");
      const installed = fileExists(installedPath) ? fs13.readFileSync(installedPath, "utf-8") : null;
      if (installed === null) {
        drift.push(`${label} not installed at all`);
      } else if (installed !== bundled) {
        drift.push(`${label} is stale (plugin source changed since last /context-menu run)`);
      }
    }
    try {
      compareInstalledFile("launch-claude-tui.ps1", mod.bundledLaunchScriptPath(), installedClaudeLaunchScript);
    } catch (e) {
      drift.push(`could not compare Claude launch script: ${e.message}`);
    }
    try {
      compareInstalledFile("launch-Codex-tui.ps1", mod.bundledCodexLaunchScriptPath(), installedCodexLaunchScript);
    } catch (e) {
      drift.push(`could not compare Codex launch script: ${e.message}`);
    }
    try {
      const currentNss = mod.generateNss();
      const installedNss = fileExists(CLAUDE_NSS2) ? fs13.readFileSync(CLAUDE_NSS2, "utf-8") : null;
      if (installedNss === null) {
        drift.push("claude-code.nss menu is not installed");
      } else if (installedNss !== currentNss) {
        drift.push("claude-code.nss menu is stale (does not match what generateNss() would produce now)");
      }
    } catch (e) {
      drift.push(`could not compare Claude NSS content: ${e.message}`);
    }
    try {
      const currentNss = mod.generateCodexNss();
      const installedNss = fileExists(CODEX_NSS2) ? fs13.readFileSync(CODEX_NSS2, "utf-8") : null;
      if (installedNss === null) {
        drift.push("Codex.nss menu is not installed");
      } else if (installedNss !== currentNss) {
        drift.push("Codex.nss menu is stale (does not match what generateCodexNss() would produce now)");
      }
    } catch (e) {
      drift.push(`could not compare Codex NSS content: ${e.message}`);
    }
    if (drift.length === 0) {
      return buildResult(META7, "ok", "installed context-menu Claude and Codex launch scripts + NSS files match the current plugin source");
    }
    return buildResult(
      META7,
      "warning",
      `right-click Claude/Codex menu is running stale code: ${drift.join("; ")}`,
      { hint: fixHint, details: { fixAction: "context-menu-postinstall", drift } }
    );
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/docker.ts
function requiresDocker(ctx) {
  return ctx.installedExtensions.some((ext) => ext.dependencies?.docker === true);
}
var dockerCheck = {
  id: "C16",
  fr: "FR-14",
  name: "Docker + devcontainer CLI",
  group: "needs-external",
  reinstallable: false,
  pool: "fs",
  gate(ctx) {
    return requiresDocker(ctx) ? { relevant: true } : {
      relevant: false,
      reason: "no installed extension declares docker:true"
    };
  },
  async run() {
    void DOCTOR_TIMEOUTS;
    const [docker, devcontainer] = await Promise.all([
      Promise.resolve(checkBinaryVersion("docker")),
      Promise.resolve(checkBinaryVersion("devcontainer"))
    ]);
    return [
      {
        id: "C16a",
        fr: "FR-14",
        name: "Docker CLI",
        group: "needs-external",
        severity: docker.ok ? "ok" : "critical",
        reinstallable: false,
        message: docker.ok ? docker.output : "docker not found in PATH",
        hint: docker.ok ? void 0 : "Install Docker Desktop (https://www.docker.com/products/docker-desktop)",
        durationMs: 0
      },
      {
        id: "C16b",
        fr: "FR-14",
        name: "devcontainer CLI",
        group: "needs-external",
        severity: devcontainer.ok ? "ok" : "critical",
        reinstallable: false,
        message: devcontainer.ok ? devcontainer.output : "devcontainer not found in PATH",
        hint: devcontainer.ok ? void 0 : "npm install -g @devcontainers/cli",
        durationMs: 0
      }
    ];
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/env-example.ts
import fs14 from "node:fs";
import path13 from "node:path";
var envExampleCheck = {
  id: "C8",
  fr: "FR-6",
  name: ".env.example presence",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const hasRequired = ctx.installedExtensions.some(
      (ext) => (ext.envRequirements ?? []).some((r) => r.required)
    );
    if (!hasRequired) {
      return {
        id: "C8",
        fr: "FR-6",
        name: ".env.example presence",
        group: "self-sufficient",
        severity: "ok",
        reinstallable: true,
        message: "no required envRequirements \u2192 .env.example not needed",
        durationMs: 0
      };
    }
    const envExamplePath = path13.join(ctx.projectRoot, ".env.example");
    try {
      fs14.accessSync(envExamplePath, fs14.constants.F_OK);
      return {
        id: "C8",
        fr: "FR-6",
        name: ".env.example presence",
        group: "self-sufficient",
        severity: "ok",
        reinstallable: true,
        message: `.env.example present at ${envExamplePath}`,
        durationMs: 0
      };
    } catch {
      return {
        id: "C8",
        fr: "FR-6",
        name: ".env.example presence",
        group: "self-sufficient",
        severity: "warning",
        reinstallable: true,
        message: `.env.example missing at ${envExamplePath}`,
        hint: "Reinstall to regenerate .env.example template",
        reinstallHint: "Installer writes .env.example based on installed extensions envRequirements",
        durationMs: 0
      };
    }
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/env-vars.ts
import fs15 from "node:fs";
import path14 from "node:path";
var envVarsCheck = {
  id: "C7",
  fr: "FR-5",
  name: "Required env vars",
  group: "needs-env",
  reinstallable: false,
  pool: "fs",
  async run(ctx) {
    const settingsLocalEnv = readSettingsLocalEnv(ctx.projectRoot);
    const dotenvValues = readDotenvFile(path14.join(ctx.projectRoot, ".env"));
    const results = [];
    for (const ext of ctx.installedExtensions) {
      for (const req of ext.envRequirements ?? []) {
        if (!req.required) continue;
        const processVal = process.env[req.name];
        const dotenvVal = dotenvValues[req.name];
        const settingsVal = settingsLocalEnv[req.name];
        const sources = [];
        if (processVal) sources.push("process.env");
        if (dotenvVal) sources.push(".env");
        if (settingsVal) sources.push("settings.local.json");
        const isSet = sources.length > 0;
        results.push({
          id: `C7:${req.name}`,
          fr: "FR-5",
          name: req.name,
          group: "needs-env",
          severity: isSet ? "ok" : "critical",
          reinstallable: false,
          message: isSet ? `set in ${sources.join(", ")}` : "required env var not set in .env or .claude/settings.local.json env block",
          hint: isSet ? void 0 : `Set ${req.name} in .env (see .env.example) OR .claude/settings.local.json env block`,
          extension: ext.name,
          durationMs: 0,
          envStatus: { name: req.name, status: isSet ? "set" : "unset" }
        });
      }
    }
    if (results.length === 0) {
      results.push({
        id: "C7",
        fr: "FR-5",
        name: "Required env vars",
        group: "needs-env",
        severity: "ok",
        reinstallable: false,
        message: "no required envRequirements declared by installed extensions",
        durationMs: 0
      });
    }
    return results;
  }
};
function readSettingsLocalEnv(projectRoot) {
  const p = path14.join(projectRoot, ".claude", "settings.local.json");
  try {
    const parsed = JSON.parse(fs15.readFileSync(p, "utf-8"));
    return parsed.env ?? {};
  } catch {
    return {};
  }
}

// tools/forbid-root-artifacts/doctor-check.ts
import fs16 from "node:fs";
import path15 from "node:path";
var HOOK_ID = "forbid-root-artifacts";
var REINSTALL = "python .dev-pomogator/tools/forbid-root-artifacts/setup.py";
function checkRootArtifactsInstall(repoRoot) {
  const cfg = path15.join(repoRoot, ".pre-commit-config.yaml");
  let content = "";
  try {
    if (fs16.existsSync(cfg)) content = fs16.readFileSync(cfg, "utf8");
  } catch {
    content = "";
  }
  if (!content || !content.includes(`id: ${HOOK_ID}`)) {
    return {
      status: "yellow",
      message: "forbid-root-artifacts pre-commit hook is not installed in this repo",
      fixAction: REINSTALL
    };
  }
  const entryMatch = content.match(/entry:\s*python3?\s+(\S+)/);
  const entryPath = entryMatch?.[1];
  if (entryPath) {
    let resolves = false;
    try {
      resolves = fs16.existsSync(path15.join(repoRoot, entryPath));
    } catch {
      resolves = false;
    }
    if (!resolves) {
      return {
        status: "red",
        message: `forbid-root-artifacts hook entry "${entryPath}" does not resolve \u2014 install is broken`,
        fixAction: REINSTALL
      };
    }
  }
  return {
    status: "green",
    message: "forbid-root-artifacts pre-commit hook installed and its entry path resolves"
  };
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/forbid-root-artifacts.ts
var META8 = {
  id: "C25",
  fr: "FR-10",
  name: "forbid-root-artifacts pre-commit install",
  group: "self-sufficient",
  reinstallable: true
};
var forbidRootArtifactsCheck = {
  ...META8,
  pool: "fs",
  async run(ctx) {
    const r = checkRootArtifactsInstall(ctx.projectRoot);
    const severity = r.status === "green" ? "ok" : r.status === "yellow" ? "warning" : "critical";
    return buildResult(
      META8,
      severity,
      r.message,
      r.fixAction ? { hint: `Reinstall: ${r.fixAction}`, reinstallHint: r.fixAction } : {}
    );
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/gh.ts
import { spawnSync as spawnSync2 } from "node:child_process";
var META9 = {
  id: "C-GH",
  fr: "FR-37",
  name: "GitHub CLI authentication",
  group: "needs-external",
  reinstallable: false
};
var AUTH_LOGIN_HINT = "Sign in with `gh auth login`.";
function ghInstallHint(platform) {
  if (platform === "win32") return "Install GitHub CLI with `winget install GitHub.cli`.";
  if (platform === "darwin") return "Install GitHub CLI with `brew install gh`.";
  return "Install GitHub CLI: https://cli.github.com/manual/installation";
}
function classifyGhReadiness(version, auth) {
  if (version.errorCode || version.status !== 0 || version.timedOut) return "missing-or-unusable";
  if (!auth || auth.errorCode || auth.status !== 0 || auth.timedOut) return "unauthenticated";
  return "available";
}
function runGh(args) {
  const result2 = spawnSync2("gh", args, {
    encoding: "utf8",
    timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
    windowsHide: true,
    // `gh auth status` intentionally writes account details to stderr. Discard it.
    stdio: "ignore"
  });
  const errorCode = result2.error?.code;
  return {
    status: result2.status,
    errorCode,
    timedOut: errorCode === "ETIMEDOUT" || result2.signal === "SIGTERM"
  };
}
function createGhCheck(runner = runGh, platform = process.platform) {
  return {
    ...META9,
    pool: "fs",
    async run() {
      const version = runner(["--version"]);
      const state = classifyGhReadiness(version, version.status === 0 ? runner(["auth", "status"]) : void 0);
      if (state === "available") {
        return buildResult(META9, "ok", "GitHub CLI is installed and authenticated.");
      }
      if (state === "missing-or-unusable") {
        const hint = ghInstallHint(platform);
        return buildResult(META9, "critical", `GitHub CLI is missing or unusable. ${hint}`, { hint });
      }
      return buildResult(
        META9,
        "warning",
        `GitHub CLI is installed but not authenticated. ${AUTH_LOGIN_HINT}`,
        { hint: AUTH_LOGIN_HINT }
      );
    }
  };
}
var ghCheck = createGhCheck();

// .claude/skills/pomogator-doctor/scripts/engine/checks/git.ts
var META10 = {
  id: "C2",
  fr: "FR-2",
  name: "Git presence",
  group: "self-sufficient",
  reinstallable: false
};
var gitCheck = {
  ...META10,
  pool: "fs",
  async run() {
    const { ok, output } = checkBinaryVersion("git", ["--version"], /git version/i);
    return ok ? buildResult(META10, "ok", output) : buildResult(META10, "critical", "git --version failed or not found in PATH", {
      hint: "Install Git (https://git-scm.com/downloads) and ensure it is in PATH"
    });
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/gitignore-block.ts
import fs18 from "node:fs";
import path17 from "node:path";

// .claude/skills/pomogator-doctor/scripts/engine/checks/canonical.ts
import fs17 from "node:fs";
import path16 from "node:path";
function readCanonicalManifest(projectRoot) {
  const manifestPath3 = path16.join(projectRoot, ".claude-plugin", "plugin.json");
  try {
    return JSON.parse(fs17.readFileSync(manifestPath3, "utf-8"));
  } catch {
    return null;
  }
}
function isCanonicalInstall(projectRoot) {
  return readCanonicalManifest(projectRoot) !== null;
}
var CANONICAL_REINSTALL_HINT = "Run `/plugin install dev-pomogator@stgmt --force` (canonical) \u2014 `npx dev-pomogator` is the deprecated v1 flow";

// .claude/skills/pomogator-doctor/scripts/engine/checks/gitignore-block.ts
var MARKER_BEGIN = "# >>> dev-pomogator (managed \u2014 do not edit) >>>";
var MARKER_END = "# <<< dev-pomogator (managed \u2014 do not edit) <<<";
var gitignoreBlockCheck = {
  id: "C14",
  fr: "FR-12",
  name: "Managed .gitignore block",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const canonical = isCanonicalInstall(ctx.projectRoot);
    const gitignorePath = path17.join(ctx.projectRoot, ".gitignore");
    let content;
    try {
      content = fs18.readFileSync(gitignorePath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return canonical ? build("ok", "canonical plugin install \u2014 managed .gitignore block not used") : build(
          "warning",
          ".gitignore missing at project root",
          "Reinstall to create .gitignore with managed block"
        );
      }
      return build("warning", `cannot read .gitignore: ${error.message}`);
    }
    const hasBegin = content.includes(MARKER_BEGIN);
    const hasEnd = content.includes(MARKER_END);
    if (hasBegin && hasEnd) {
      return build("ok", "managed gitignore block present");
    }
    if (hasBegin !== hasEnd) {
      return build(
        "critical",
        "managed gitignore block truncated (missing BEGIN or END marker)",
        "Reinstall to rewrite marker block cleanly"
      );
    }
    return canonical ? build("ok", "canonical plugin install \u2014 managed .gitignore block not used") : build(
      "warning",
      "no managed gitignore block \u2014 dev-pomogator files may leak via `git add .`",
      "Reinstall to add managed block automatically"
    );
  }
};
function build(severity, message, hint) {
  return {
    id: "C14",
    fr: "FR-12",
    name: "Managed .gitignore block",
    group: "self-sufficient",
    severity,
    reinstallable: severity !== "ok",
    message,
    hint,
    reinstallHint: CANONICAL_REINSTALL_HINT,
    durationMs: 0
  };
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/hook-script-paths.ts
import fs19 from "node:fs";
import path18 from "node:path";
var ID = "C31";
var FR = "FR-14";
var NAME = "Hook runtime dispatch and script paths resolve";
function extractScriptPaths(command) {
  const matches = command.matchAll(/(?:^|[\s"'/])((?:\.\/)?tools\/[\w./-]+\.(?:ts|cjs|mjs|js|sh|py))/g);
  return [...matches].map((m) => m[1].replace(/^\.\//, ""));
}
function isAnchored(command) {
  return command.includes("CLAUDE_PLUGIN_ROOT");
}
var hookScriptPathsCheck = {
  id: ID,
  fr: FR,
  name: NAME,
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? ctx.projectRoot;
    const hooksPath = path18.join(pluginRoot, ".claude-plugin", "hooks.json");
    let raw;
    try {
      raw = fs19.readFileSync(hooksPath, "utf-8");
    } catch {
      return build2("warning", `hooks.json not found at ${hooksPath}`);
    }
    let hooks;
    try {
      hooks = JSON.parse(raw);
    } catch (error) {
      return build2("critical", `hooks.json parse error: ${error.message}`);
    }
    const commands = [];
    JSON.stringify(hooks, (key, value) => {
      if (key === "command" && typeof value === "string") commands.push(value);
      return value;
    });
    const unanchored = [];
    const missing = [];
    for (const command of commands) {
      const scripts = extractScriptPaths(command);
      if (scripts.length === 0) continue;
      if (!isAnchored(command)) {
        unanchored.push(command.slice(0, 80));
        continue;
      }
      for (const script of scripts) {
        if (!fs19.existsSync(path18.join(pluginRoot, script))) missing.push(script);
      }
    }
    if (unanchored.length === 0 && missing.length === 0) {
      return build2("ok", `${commands.length} hook command(s) resolve against the plugin`);
    }
    const parts = [];
    if (unanchored.length > 0) {
      parts.push(`${unanchored.length} hook(s) name a plugin script by a project-relative path: ${unanchored.join(" | ")}`);
    }
    if (missing.length > 0) {
      parts.push(`${missing.length} hook script(s) missing from the plugin: ${missing.join(", ")}`);
    }
    return build2("critical", parts.join("; "), "Anchor every hook script to ${CLAUDE_PLUGIN_ROOT}");
  }
};
function build2(severity, message, hint) {
  return {
    id: ID,
    fr: FR,
    name: NAME,
    group: "self-sufficient",
    severity,
    reinstallable: true,
    message,
    hint,
    reinstallHint: CANONICAL_REINSTALL_HINT,
    durationMs: 0
  };
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/hook-service.ts
import fs20 from "node:fs";
import path19 from "node:path";
var requiredRuntimeFiles = [
  "tools/hook-service/server.mjs",
  "tools/hook-service/ensure-up.mjs",
  "tools/hook-service/session-bootstrap.mjs",
  "tools/hook-service/migrate-managed-hooks.mjs",
  "tools/hook-service/registry.json",
  ".claude-plugin/hooks.legacy.json"
];
function result(severity, message, details) {
  return {
    id: "C32",
    fr: "FR-24",
    name: "Shell-free hook service",
    group: "self-sufficient",
    severity,
    reinstallable: severity !== "ok",
    message,
    hint: severity === "ok" ? void 0 : "Reinstall or update dev-pomogator to regenerate the managed HTTP hook transport.",
    reinstallHint: severity === "ok" ? void 0 : CANONICAL_REINSTALL_HINT,
    durationMs: 0,
    details
  };
}
var hookServiceCheck = {
  id: "C32",
  fr: "FR-24",
  name: "Shell-free hook service",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const root = ctx.projectRoot;
    const absent = requiredRuntimeFiles.filter((file) => !fs20.existsSync(path19.join(root, file)));
    if (absent.length) return result("warning", `shell-free hook service is not installed (${absent.join(", ")})`, { absent });
    let manifest;
    let registry;
    try {
      manifest = JSON.parse(fs20.readFileSync(path19.join(root, ".claude-plugin/hooks.json"), "utf8"));
      registry = JSON.parse(fs20.readFileSync(path19.join(root, "tools/hook-service/registry.json"), "utf8"));
    } catch (error) {
      return result("critical", `cannot parse shell-free hook assets: ${error.message}`);
    }
    const problems = [];
    const bootstrap = manifest.hooks?.SessionStart?.flatMap((group) => group.hooks ?? []) ?? [];
    if (bootstrap.length !== 1 || bootstrap[0]?.type !== "command" || !bootstrap[0]?.command?.includes("tools/hook-service/session-bootstrap.mjs")) {
      problems.push("SessionStart must have exactly one hook-service bootstrap");
    }
    for (const [event, groups] of Object.entries(manifest.hooks ?? {})) {
      if (event === "SessionStart") continue;
      groups.forEach((group, groupIndex) => (group.hooks ?? []).forEach((hook, hookIndex) => {
        const id = `${event}/${groupIndex}/${hookIndex}`;
        const expected = `http://127.0.0.1:42619/v1/dispatch/${encodeURIComponent(id)}`;
        if (hook.type !== "http" || hook.url !== expected) problems.push(`${id} is not the canonical loopback HTTP route`);
        if (hook.headers?.["x-dev-pomogator-token"] !== "${DEV_POMOGATOR_HOOK_TOKEN}") problems.push(`${id} is missing the canonical hook-service token header`);
        if (!hook.allowedEnvVars?.includes("DEV_POMOGATOR_HOOK_TOKEN")) problems.push(`${id} does not allow DEV_POMOGATOR_HOOK_TOKEN`);
        const route = registry.routes?.[id];
        const target = route?.target;
        if (!target || path19.isAbsolute(target) || target.split(/[\\/]/).includes("..") || !fs20.existsSync(path19.join(root, target))) {
          problems.push(`${id} has no valid registry target`);
        }
        if (route?.timeout !== hook.timeout) problems.push(`${id} timeout drifts from registry`);
        if ((route?.matcher ?? "") !== (group.matcher ?? "")) problems.push(`${id} matcher drifts from registry`);
      }));
    }
    if (problems.length) return result("critical", problems.join("; "), { problems });
    return result("ok", "one SessionStart bootstrap and all managed hook routes use the local HTTP service");
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/hooks-exec.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import fs21 from "node:fs";
import os5 from "node:os";
import path20 from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
var META11 = {
  id: "C18",
  fr: "FR-14",
  name: "Hooks execute (portable runtime-dispatch smoke)",
  group: "self-sufficient",
  reinstallable: true
};
function locateBootstrap(projectRoot) {
  const override = process.env.DEV_POMOGATOR_DOCTOR_BOOTSTRAP;
  if (override) return fileExists(override) ? override : override;
  const here = path20.dirname(fileURLToPath4(import.meta.url));
  const candidates = [
    // checks → engine → scripts → pomogator-doctor → skills → .claude → <root>
    path20.resolve(here, "..", "..", "..", "..", "..", "..", "tools", "_shared", "bootstrap.cjs"),
    path20.join(projectRoot, "tools", "_shared", "bootstrap.cjs"),
    ...process.env.CLAUDE_PLUGIN_ROOT ? [path20.join(process.env.CLAUDE_PLUGIN_ROOT, "tools", "_shared", "bootstrap.cjs")] : []
  ];
  return candidates.find(fileExists) ?? null;
}
var hooksExecCheck = {
  ...META11,
  pool: "fs",
  async run(ctx) {
    const bootstrap = locateBootstrap(ctx.projectRoot);
    if (!bootstrap) {
      return buildResult(
        META11,
        "warning",
        "bootstrap.cjs not found \u2014 cannot smoke-test hook execution",
        { hint: "Reinstall dev-pomogator: /plugin install dev-pomogator@stgmt --force" }
      );
    }
    const probe = path20.join(os5.tmpdir(), `dp-hook-probe-${process.pid}-${process.hrtime.bigint()}.ts`);
    const MARKER = "HOOK_EXEC_OK";
    try {
      fs21.writeFileSync(probe, `const marker: string = '${MARKER}';
process.stdout.write(marker);
`);
      const res = spawnSync3(process.execPath, ["-e", `require(${JSON.stringify(bootstrap)})`, "--", probe], {
        encoding: "utf-8",
        timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
        env: { ...process.env, NODE_NO_WARNINGS: "1" }
      });
      const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
      if (res.status === 0 && out.includes(MARKER)) {
        return buildResult(META11, "ok", "hooks execute \u2014 the hook runner ran a TypeScript probe successfully");
      }
      const detail = (res.error?.message || out.split("\n").find((l) => l.trim()) || `exit ${res.status}`).slice(0, 160);
      return buildResult(
        META11,
        "critical",
        `hooks cannot execute: the hook runner failed on a probe (${detail})`,
        {
          hint: "Hooks will silently NOT fire. Ensure Node >= 22.6, run `npm install` for a local TypeScript runner, and update the plugin (/plugin update dev-pomogator@stgmt).",
          reinstallHint: "/plugin install dev-pomogator@stgmt --force"
        }
      );
    } catch (err) {
      return buildResult(
        META11,
        "critical",
        `hooks cannot execute: probe spawn threw (${err.message.slice(0, 160)})`,
        { hint: "Ensure Node >= 22.6 and reinstall dev-pomogator." }
      );
    } finally {
      try {
        fs21.unlinkSync(probe);
      } catch {
      }
    }
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/hooks-registry.ts
import fs22 from "node:fs";
import path21 from "node:path";
var hooksRegistryCheck = {
  id: "C6",
  fr: "FR-4",
  name: "Hooks registry sync",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const settingsPath = path21.join(ctx.projectRoot, ".claude", "settings.local.json");
    let settings = {};
    try {
      settings = JSON.parse(fs22.readFileSync(settingsPath, "utf-8"));
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT") {
        return build3("warning", "settings.local.json not found", "Run installer to create it");
      }
      return build3("critical", `settings.local.json parse error: ${error.message}`);
    }
    const expected = ctx.config?.managed?.[ctx.projectRoot]?.hooks ?? {};
    const actual = settings.hooks ?? {};
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    const missing = expectedKeys.filter((k) => !actualKeys.includes(k));
    const stale = actualKeys.filter((k) => !expectedKeys.includes(k) && k !== "user");
    if (missing.length === 0 && stale.length === 0) {
      return build3(
        "ok",
        expectedKeys.length === 0 ? "no managed hooks expected" : `${expectedKeys.length} hook(s) registered as expected`
      );
    }
    const parts = [];
    if (missing.length > 0) parts.push(`missing in settings: ${missing.join(", ")}`);
    if (stale.length > 0) parts.push(`unexpected keys: ${stale.join(", ")}`);
    return build3("critical", parts.join("; "), "Reinstall to sync hooks");
  }
};
function build3(severity, message, hint) {
  return {
    id: "C6",
    fr: "FR-4",
    name: "Hooks registry sync",
    group: "self-sufficient",
    severity,
    reinstallable: true,
    message,
    hint,
    reinstallHint: CANONICAL_REINSTALL_HINT,
    durationMs: 0
  };
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/mcp-parse.ts
import fs23 from "node:fs";
import path22 from "node:path";
function readMcpConfigs(ctx) {
  const result2 = /* @__PURE__ */ new Map();
  const paths = [
    path22.join(ctx.projectRoot, ".mcp.json"),
    // Canonical user-global MCP config is ~/.claude.json (NOT ~/.claude/mcp.json, which
    // Claude Code never creates) — the latter made every globally-registered MCP invisible.
    path22.join(ctx.homeDir, ".claude.json")
  ];
  for (const p of paths) {
    try {
      const parsed = JSON.parse(fs23.readFileSync(p, "utf-8"));
      for (const [name, cfg] of Object.entries(parsed.mcpServers ?? {})) {
        if (!result2.has(name)) result2.set(name, { name, ...cfg });
      }
    } catch {
    }
  }
  return result2;
}
function isPluginProvidedMcp(name) {
  return name.startsWith("plugin_") || name.startsWith("claude_ai_") || name === "claude-in-chrome";
}
var mcpParseCheck = {
  id: "C11",
  fr: "FR-9",
  name: "MCP servers referenced in rules/skills",
  group: "needs-external",
  reinstallable: false,
  pool: "mcp",
  async run(ctx) {
    const referenced = ctx.referencedMcpServers;
    if (referenced.size === 0) {
      return [
        {
          id: "C11",
          fr: "FR-9",
          name: "MCP servers referenced",
          group: "needs-external",
          severity: "ok",
          reinstallable: false,
          message: "no mcp__*__ references found in rules/skills",
          durationMs: 0
        }
      ];
    }
    const configured = readMcpConfigs(ctx);
    const missing = Array.from(referenced).filter(
      (n) => !configured.has(n) && !isPluginProvidedMcp(n)
    );
    if (missing.length === 0) {
      return [
        {
          id: "C11",
          fr: "FR-9",
          name: "MCP servers referenced",
          group: "needs-external",
          severity: "ok",
          reinstallable: false,
          message: `${referenced.size} referenced MCP server(s) all configured`,
          durationMs: 0
        }
      ];
    }
    return [
      {
        id: "C11",
        fr: "FR-9",
        name: "MCP servers referenced",
        group: "needs-external",
        severity: "warning",
        reinstallable: false,
        message: `${missing.length} referenced MCP server(s) not configured: ${missing.join(", ")}`,
        hint: `Add missing server(s) to .mcp.json or ~/.claude.json`,
        durationMs: 0,
        details: { missing, referencedCount: referenced.size }
      }
    ];
  }
};

// tools/mcp-setup/mcp-auth-detect.ts
import { spawnSync as spawnSync4 } from "node:child_process";
var OCTOCODE_TOKEN_VARS = ["GITHUB_TOKEN", "GH_TOKEN", "OCTOCODE_TOKEN"];
var CONTEXT7_KEY_VAR = "CONTEXT7_API_KEY";
function nonEmpty(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function fromEntryOrEnv(entry, env2, name) {
  const onEntry = entry?.env?.[name];
  if (nonEmpty(onEntry)) return onEntry;
  const onEnv = env2[name];
  return nonEmpty(onEnv) ? onEnv : void 0;
}
function apiKeyFromArgs(args) {
  if (!args) return void 0;
  const i = args.indexOf("--api-key");
  if (i >= 0 && nonEmpty(args[i + 1])) return args[i + 1];
  return void 0;
}
function context7Configured(entry, env2) {
  if (nonEmpty(fromEntryOrEnv(entry, env2, CONTEXT7_KEY_VAR))) return true;
  if (nonEmpty(apiKeyFromArgs(entry?.args))) return true;
  return false;
}
function ghAuthStatus(timeoutMs = 3e3) {
  try {
    const r = spawnSync4("gh", ["auth", "status"], {
      encoding: "utf-8",
      timeout: timeoutMs,
      windowsHide: true
    });
    return r.status === 0;
  } catch {
    return false;
  }
}
function octocodeConfigured(entry, env2, ghStatus = ghAuthStatus) {
  for (const name of OCTOCODE_TOKEN_VARS) {
    if (nonEmpty(fromEntryOrEnv(entry, env2, name))) return true;
  }
  return ghStatus();
}
function findEntry(configs, needle) {
  const entries = configs instanceof Map ? configs : new Map(Object.entries(configs));
  for (const [name, cfg] of entries) {
    if (name.toLowerCase().includes(needle.toLowerCase())) return cfg;
  }
  return void 0;
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/mcp-auth.ts
var META12 = {
  id: "C-MCPA",
  fr: "FR-MCP",
  name: "MCP auth (Context7 / Octocode)",
  group: "needs-external",
  reinstallable: false
};
var FIX_HINT = "\u0417\u0430\u043F\u0443\u0441\u0442\u0438 skill `configure-mcp` (\u0438\u043B\u0438 \u0441\u043A\u0430\u0436\u0438 \xAB\u043D\u0430\u0441\u0442\u0440\u043E\u0439 mcp\xBB): Context7 \u2014 \u0434\u0430\u0439 API-\u043A\u043B\u044E\u0447 (https://context7.com/dashboard) \u0438\u043B\u0438 `npx ctx7 setup`; Octocode \u2014 `gh auth login` \u0438\u043B\u0438 GitHub-\u0442\u043E\u043A\u0435\u043D (scopes repo, read:user, read:org). \u041A\u043B\u044E\u0447 \u0432\u043F\u0438\u0448\u0435\u0442\u0441\u044F \u0432 ~/.claude.json, \u0432\u0430\u0440\u043D\u0438\u043D\u0433 \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 \u0441\u043E \u0441\u043B\u0435\u0434. \u0441\u0435\u0441\u0441\u0438\u0438.";
var mcpAuthCheck = {
  ...META12,
  pool: "mcp",
  async run(ctx) {
    const configs = readMcpConfigs(ctx);
    const referenced = ctx.referencedMcpServers;
    const relevant = (name) => referenced.has(name) || findEntry(configs, name) !== void 0;
    const unconfigured = [];
    if (relevant("context7") && !context7Configured(findEntry(configs, "context7"), process.env)) {
      unconfigured.push("Context7 (\u043D\u0435\u0442 API-\u043A\u043B\u044E\u0447\u0430 \u2014 \u0430\u043D\u043E\u043D\u0438\u043C\u043D\u044B\u0439 \u0442\u0438\u0440)");
    }
    if (relevant("octocode") && !octocodeConfigured(findEntry(configs, "octocode"), process.env, () => ghAuthStatus())) {
      unconfigured.push("Octocode (\u043D\u0435\u0442 GitHub-\u0434\u043E\u0441\u0442\u0443\u043F\u0430)");
    }
    if (unconfigured.length === 0) {
      return buildResult(META12, "ok", "Context7/Octocode \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u044B (\u0438\u043B\u0438 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F)");
    }
    return buildResult(META12, "warning", `MCP \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u044B: ${unconfigured.join("; ")}`, {
      hint: FIX_HINT,
      details: { fixAction: "configure-mcp", fixSkill: "configure-mcp", unconfigured }
    });
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/mcp-probe.ts
import { spawn } from "node:child_process";
import { once } from "node:events";
var PROBE_TIMEOUT_MS2 = DOCTOR_TIMEOUTS.PROBE_MS;
async function probeStdioServer(cfg) {
  const started = Date.now();
  if (!cfg.command) return { ok: false, message: "no command defined", durationMs: 0 };
  const child = spawn(cfg.command, cfg.args ?? [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...cfg.env ?? {} }
  });
  const killAndWait = async (reason) => {
    try {
      if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
    } catch {
    }
    if (child.exitCode === null) {
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve5) => setTimeout(resolve5, 500))
      ]);
    }
    return { ok: false, message: reason, durationMs: Date.now() - started };
  };
  const reader = new Promise((resolve5) => {
    let buffer = "";
    let sawInit = false;
    let sawTools = false;
    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1) sawInit = true;
          if (msg.id === 2) sawTools = true;
          if (sawInit && sawTools) {
            resolve5({
              ok: true,
              message: "initialize + tools/list handshake complete",
              durationMs: Date.now() - started
            });
          }
        } catch {
          continue;
        }
      }
    });
    child.on(
      "error",
      (err) => resolve5({ ok: false, message: `spawn error: ${err.message}`, durationMs: Date.now() - started })
    );
    child.on("exit", (code) => {
      if (!sawInit || !sawTools) {
        resolve5({
          ok: false,
          message: `server exited (code=${code ?? "null"}) before handshake complete`,
          durationMs: Date.now() - started
        });
      }
    });
  });
  child.stdin?.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "pomogator-doctor", version: "1.0.0" }
      }
    }) + "\n"
  );
  child.stdin?.write(
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n"
  );
  const timeout = new Promise((resolve5) => {
    setTimeout(() => resolve5({ ok: false, message: "timeout", durationMs: PROBE_TIMEOUT_MS2 }), PROBE_TIMEOUT_MS2);
  });
  try {
    const outcome = await Promise.race([reader, timeout]);
    if (!outcome.ok) return await killAndWait(outcome.message);
    if (child.exitCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
      }
    }
    return outcome;
  } catch (error) {
    return await killAndWait(`exception: ${error.message}`);
  }
}
async function probeHttpServer(cfg) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS2);
  try {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}`, durationMs: Date.now() - started };
    }
    return { ok: true, message: `HTTP ${response.status}`, durationMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      message: error.name === "AbortError" ? "timeout" : error.message,
      durationMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}
var mcpProbeCheck = {
  id: "C12",
  fr: "FR-10",
  name: "MCP Full probe",
  group: "needs-external",
  reinstallable: false,
  pool: "mcp",
  async run(ctx) {
    const configured = readMcpConfigs(ctx);
    if (configured.size === 0) {
      return [
        {
          id: "C12",
          fr: "FR-10",
          name: "MCP Full probe",
          group: "needs-external",
          severity: "ok",
          reinstallable: false,
          message: "no MCP servers configured to probe",
          durationMs: 0
        }
      ];
    }
    const probes = Array.from(configured.values()).map(async (cfg) => {
      const outcome = cfg.url ? await probeHttpServer(cfg) : await probeStdioServer(cfg);
      return {
        id: `C12:${cfg.name}`,
        fr: "FR-10",
        name: `MCP probe: ${cfg.name}`,
        group: "needs-external",
        severity: outcome.ok ? "ok" : "critical",
        reinstallable: false,
        message: outcome.ok ? outcome.message : `probe failed: ${outcome.message} (${outcome.durationMs}ms)`,
        hint: outcome.ok ? void 0 : "Check MCP server logs or restart Claude Code",
        durationMs: outcome.durationMs
      };
    });
    return Promise.all(probes);
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/meridian.ts
import path23 from "node:path";
var META13 = {
  id: "C17",
  fr: "FR-49",
  name: "Meridian subscription proxy (gray-zone judge transport)",
  group: "needs-external",
  reinstallable: false
};
var PROBE_TIMEOUT_MS3 = 500;
var proxyUrl = () => process.env.MERIDIAN_URL || "http://127.0.0.1:3456";
function optedIn(ctx) {
  if ((process.env.CLAIM_GATE_JUDGE ?? "true").toLowerCase() !== "false") return { in: true };
  const base = readDotenvFile(path23.join(ctx.projectRoot, ".env")).ANTHROPIC_BASE_URL ?? "";
  if (/:3456|meridian|claude-subscription/i.test(base)) return { in: true };
  if (fileExists(path23.join(ctx.projectRoot, "tools", "claude-subscription-proxy", "docker-compose.yml"))) {
    return { in: true };
  }
  return {
    in: false,
    reason: "judge explicitly disabled (CLAIM_GATE_JUDGE=false) and proxy not wired (.env / infra)"
  };
}
var START_HINT = "Optional. Bring it up via the `proxy-up` skill, or run the start script under <plugin-root>/tools/claude-subscription-proxy/scripts/ (needs Docker + `claude login`). The FR-49e gray-zone judge fails open without it.";
var meridianCheck = {
  ...META13,
  pool: "fs",
  gate(ctx) {
    const o = optedIn(ctx);
    return o.in ? { relevant: true } : { relevant: false, reason: o.reason };
  },
  async run(ctx) {
    const url = proxyUrl();
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    ctx.signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS3);
    try {
      const res = await fetch(`${url}/health`, { signal: ctrl.signal });
      if (!res.ok) {
        return buildResult(META13, "warning", `proxy responded ${res.status} (not healthy)`, {
          hint: START_HINT
        });
      }
      let body = {};
      try {
        body = await res.json();
      } catch {
      }
      if (body.auth?.loggedIn === false) {
        return buildResult(META13, "warning", `up on ${url} but OAuth expired (auth.loggedIn:false)`, {
          hint: "`claude login` on the host, then restart the proxy (proxy-up skill)."
        });
      }
      return buildResult(META13, "ok", `up on ${url}${body.mode ? ` (mode:${body.mode})` : ""}`);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      return buildResult(META13, "warning", `not running on ${url} (${timedOut ? "timeout" : "no response"})`, {
        hint: START_HINT
      });
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
    }
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/node-version.ts
var import_semver = __toESM(require_semver2(), 1);
var REQUIRED_RANGE = ">=22.6.0";
var nodeVersionCheck = {
  id: "C1",
  fr: "FR-1",
  name: "Node version",
  group: "self-sufficient",
  reinstallable: false,
  pool: "fs",
  async run() {
    const current = process.versions.node;
    const ok = import_semver.default.satisfies(current, REQUIRED_RANGE, { includePrerelease: true });
    if (ok) {
      return {
        id: "C1",
        fr: "FR-1",
        name: "Node version",
        group: "self-sufficient",
        severity: "ok",
        reinstallable: false,
        message: `Node v${current} (${REQUIRED_RANGE} required)`,
        durationMs: 0
      };
    }
    const isBelow18 = import_semver.default.lt(current, "18.0.0");
    return {
      id: "C1",
      fr: "FR-1",
      name: "Node version",
      group: "self-sufficient",
      severity: isBelow18 ? "critical" : "warning",
      reinstallable: false,
      message: `Node v${current}, ${REQUIRED_RANGE} required for native TypeScript strip-types in hooks`,
      hint: "Upgrade Node to 22.6+ (https://nodejs.org). Below 22.6 hooks fall back to tsx (slower cold start).",
      durationMs: 0
    };
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/plugin-loader.ts
import fs24 from "node:fs";
import path24 from "node:path";
function readPluginManifest(projectRoot) {
  const candidates = [
    path24.join(projectRoot, ".dev-pomogator", ".claude-plugin", "plugin.json"),
    path24.join(projectRoot, ".claude-plugin", "plugin.json")
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs24.readFileSync(p, "utf-8"));
    } catch {
      continue;
    }
  }
  return null;
}
function enumerateFromPath(rel, kind, projectRoot) {
  const abs = path24.resolve(projectRoot, rel);
  let stat;
  try {
    stat = fs24.statSync(abs);
  } catch {
    return [{ name: rel, kind, physicalPath: abs }];
  }
  if (stat.isFile()) {
    const name = kind === "command" ? path24.basename(abs).replace(/\.md$/, "") : path24.basename(abs);
    return [{ name, kind, physicalPath: abs }];
  }
  let dirents;
  try {
    dirents = fs24.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [{ name: rel, kind, physicalPath: abs }];
  }
  if (kind === "command") {
    return dirents.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => ({ name: e.name.replace(/\.md$/, ""), kind, physicalPath: path24.join(abs, e.name) }));
  }
  return dirents.filter((e) => e.isDirectory()).map((e) => ({ name: e.name, skillMd: path24.join(abs, e.name, "SKILL.md") })).filter((d) => exists(d.skillMd)).map((d) => ({ name: d.name, kind, physicalPath: d.skillMd }));
}
function normalizeDeclared(manifest, projectRoot) {
  const out = [];
  const groups = [
    { arr: manifest.commands, kind: "command" },
    { arr: manifest.skills, kind: "skill" }
  ];
  for (const { arr, kind } of groups) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (typeof entry === "string") {
        out.push(...enumerateFromPath(entry, kind, projectRoot));
      } else if (entry && typeof entry.name === "string") {
        out.push({ name: entry.name, kind });
      }
    }
  }
  return out;
}
function classify(declaredName, kind, projectRoot, homeDir) {
  const projectDir = kind === "command" ? path24.join(projectRoot, ".claude", "commands") : path24.join(projectRoot, ".claude", "skills");
  const projectPath = kind === "command" ? path24.join(projectDir, `${declaredName}.md`) : path24.join(projectDir, declaredName);
  if (exists(projectPath)) return "OK-physical";
  const pluginRoot = path24.join(homeDir, ".claude", "plugins");
  if (searchPluginRegistry(pluginRoot, declaredName, kind)) return "OK-dynamic";
  return "BROKEN-missing";
}
function searchPluginRegistry(pluginRoot, name, kind) {
  let entries;
  try {
    entries = fs24.readdirSync(pluginRoot, { withFileTypes: true });
  } catch {
    return false;
  }
  const needle = kind === "command" ? `${name}.md` : name;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path24.join(pluginRoot, entry.name);
    if (containsEntry(nested, kind, needle)) return true;
  }
  return false;
}
function containsEntry(root, kind, needle) {
  const target = kind === "command" ? path24.join(root, "commands") : path24.join(root, "skills");
  try {
    const inside = fs24.readdirSync(target, { withFileTypes: true });
    return inside.some((e) => e.name === needle);
  } catch {
    return false;
  }
}
function exists(p) {
  try {
    fs24.accessSync(p, fs24.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
var pluginLoaderCheck = {
  id: "C15",
  fr: "FR-13",
  name: "Plugin-loader (commands/skills)",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const manifest = readPluginManifest(ctx.projectRoot);
    if (!manifest) {
      return [
        {
          id: "C15",
          fr: "FR-13",
          name: "Plugin-loader",
          group: "self-sufficient",
          severity: "ok",
          reinstallable: true,
          message: "no plugin.json manifest found \u2014 nothing to verify",
          durationMs: 0
        }
      ];
    }
    const declared = normalizeDeclared(manifest, ctx.projectRoot);
    if (declared.length === 0) {
      return [
        {
          id: "C15",
          fr: "FR-13",
          name: "Plugin-loader",
          group: "self-sufficient",
          severity: "ok",
          reinstallable: true,
          message: "plugin.json declares no commands or skills",
          durationMs: 0
        }
      ];
    }
    const broken = [];
    for (const entry of declared) {
      const state = entry.physicalPath !== void 0 ? exists(entry.physicalPath) ? "OK-physical" : "BROKEN-missing" : classify(entry.name, entry.kind, ctx.projectRoot, ctx.homeDir);
      if (state === "BROKEN-missing") broken.push(`${entry.kind}:${entry.name}`);
    }
    if (broken.length > 0) {
      return [
        {
          id: "C15",
          fr: "FR-13",
          name: "Plugin-loader",
          group: "self-sufficient",
          severity: "critical",
          reinstallable: true,
          message: `${broken.length} declared entry(ies) not registered: ${broken.join(", ")}`,
          hint: "Reinstall to repopulate plugin-loader registry",
          reinstallHint: CANONICAL_REINSTALL_HINT,
          state: "BROKEN-missing",
          durationMs: 0
        }
      ];
    }
    return [
      {
        id: "C15",
        fr: "FR-13",
        name: "Plugin-loader",
        group: "self-sufficient",
        severity: "ok",
        reinstallable: true,
        message: `all ${declared.length} declared command(s)/skill(s) present`,
        state: "OK-physical",
        durationMs: 0
      }
    ];
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/pomogator-home.ts
import fs25 from "node:fs";
import path25 from "node:path";
var MAKE = (id, name, severity, message, hint) => ({
  id,
  fr: "FR-3",
  name,
  group: "self-sufficient",
  severity,
  reinstallable: severity !== "ok",
  message,
  hint,
  reinstallHint: CANONICAL_REINSTALL_HINT,
  durationMs: 0
});
var pomogatorHomeCheck = {
  id: "C3",
  fr: "FR-3",
  name: "~/.dev-pomogator/ structure",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const results = [];
    const configPath = path25.join(ctx.homeDir, ".dev-pomogator", "config.json");
    if (ctx.configError) {
      const message = ctx.configError.message;
      if (message.includes("not found") && isCanonicalInstall(ctx.projectRoot)) {
        results.push(
          MAKE(
            "C3",
            "~/.dev-pomogator/config.json",
            "ok",
            "canonical plugin install \u2014 ~/.dev-pomogator/config.json not used (managed by /plugin install)"
          )
        );
        return results;
      }
      results.push(
        MAKE(
          "C3",
          "~/.dev-pomogator/config.json",
          "critical",
          message.includes("not found") ? `config.json not found: ${configPath}` : `config.json invalid JSON: ${message}`,
          "Reinstall to regenerate config"
        )
      );
      return results;
    }
    const configOk = fileExists2(configPath);
    results.push(
      configOk ? MAKE("C3", "~/.dev-pomogator/config.json", "ok", `config.json present at ${configPath}`) : MAKE("C3", "~/.dev-pomogator/config.json", "critical", `config.json missing: ${configPath}`)
    );
    const bootstrapPath = path25.join(
      ctx.homeDir,
      ".dev-pomogator",
      "scripts",
      "tsx-runner-bootstrap.cjs"
    );
    results.push(
      fileExists2(bootstrapPath) ? MAKE(
        "C4",
        "tsx-runner-bootstrap.cjs",
        "ok",
        "hook bootstrap script present"
      ) : MAKE(
        "C4",
        "tsx-runner-bootstrap.cjs",
        "critical",
        `bootstrap script missing: ${bootstrapPath}`,
        "All hooks will fail until this file exists"
      )
    );
    const missingTools = [];
    for (const ext of ctx.installedExtensions) {
      const toolDir = path25.join(ctx.homeDir, ".dev-pomogator", "tools", ext.name);
      if (!fs25.existsSync(toolDir)) missingTools.push(ext.name);
    }
    if (missingTools.length === 0 && ctx.installedExtensions.length > 0) {
      results.push(
        MAKE(
          "C5",
          "Extension tools directories",
          "ok",
          `all ${ctx.installedExtensions.length} installed extension tools present`
        )
      );
    } else if (missingTools.length > 0) {
      results.push(
        MAKE(
          "C5",
          "Extension tools directories",
          "critical",
          `missing tools for: ${missingTools.join(", ")}`,
          "Reinstall to restore extension tools"
        )
      );
    }
    return results;
  }
};
function fileExists2(p) {
  try {
    fs25.accessSync(p, fs25.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/python.ts
import { spawnSync as spawnSync5 } from "node:child_process";
function gatherPythonPackages(ctx) {
  const out = [];
  for (const ext of ctx.installedExtensions) {
    for (const pkg of ext.dependencies?.pythonPackages ?? []) {
      out.push({ pkg, extension: ext.name });
    }
  }
  return out;
}
function requiresPython(ctx) {
  return ctx.installedExtensions.some((ext) => {
    const binaries = ext.dependencies?.binaries ?? [];
    const pkgs = ext.dependencies?.pythonPackages ?? [];
    return binaries.includes("python3") || binaries.includes("python") || pkgs.length > 0;
  });
}
function detectPythonCommand() {
  for (const cmd of ["python3", "python"]) {
    const res = spawnSync5(cmd, ["--version"], {
      encoding: "utf-8",
      timeout: DOCTOR_TIMEOUTS.SPAWN_MS
    });
    if (res.status === 0 && /Python (\d+\.\d+)/i.test((res.stdout ?? "") + (res.stderr ?? ""))) {
      const version = ((res.stdout ?? "") + (res.stderr ?? "")).trim().split(/\s+/).pop() ?? "";
      return { command: cmd, version };
    }
  }
  return null;
}
var pythonCheck = {
  id: "C10",
  fr: "FR-8",
  name: "Python + packages",
  group: "needs-external",
  reinstallable: false,
  pool: "fs",
  gate(ctx) {
    return requiresPython(ctx) ? { relevant: true } : {
      relevant: false,
      reason: "no installed extension declares python3 or pythonPackages"
    };
  },
  async run(ctx) {
    const results = [];
    const python = detectPythonCommand();
    if (!python) {
      results.push({
        id: "C10a",
        fr: "FR-8",
        name: "Python 3",
        group: "needs-external",
        severity: "critical",
        reinstallable: false,
        message: "neither python3 nor python found in PATH",
        hint: "Install Python 3 (https://www.python.org/downloads/)",
        durationMs: 0
      });
      return results;
    }
    results.push({
      id: "C10a",
      fr: "FR-8",
      name: "Python 3",
      group: "needs-external",
      severity: "ok",
      reinstallable: false,
      message: `${python.command} v${python.version}`,
      durationMs: 0
    });
    const packages = gatherPythonPackages(ctx);
    const pkgResults = await Promise.all(
      packages.map(async ({ pkg, extension }) => {
        const res = spawnSync5(python.command, ["-c", `import ${pkg}`], {
          encoding: "utf-8",
          timeout: DOCTOR_TIMEOUTS.SPAWN_MS
        });
        const ok = res.status === 0;
        return {
          id: `C10b:${pkg}`,
          fr: "FR-8",
          name: `Python package: ${pkg}`,
          group: "needs-external",
          severity: ok ? "ok" : "critical",
          reinstallable: false,
          message: ok ? `${pkg} importable` : `import ${pkg} failed`,
          hint: ok ? void 0 : `pip install --user ${pkg}`,
          extension,
          durationMs: 0
        };
      })
    );
    return [...results, ...pkgResults];
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts
import fs26 from "node:fs";
import path26 from "node:path";
var OWNERSHIP_MARKER = "ccstatusline";
var statuslineCheck = {
  id: "C-NSL",
  fr: "FR-7",
  name: "Native statusLine (ccstatusline)",
  group: "self-sufficient",
  reinstallable: false,
  pool: "fs",
  async run(ctx) {
    const settingsFile = path26.join(ctx.homeDir, ".claude", "settings.json");
    const base = {
      id: "C-NSL",
      fr: "FR-7",
      name: "Native statusLine (ccstatusline)",
      group: "self-sufficient",
      reinstallable: false,
      durationMs: 0
    };
    let command;
    let unreadable = false;
    try {
      const parsed = JSON.parse(fs26.readFileSync(settingsFile, "utf-8"));
      command = typeof parsed.statusLine?.command === "string" ? parsed.statusLine.command : void 0;
    } catch {
      unreadable = fs26.existsSync(settingsFile);
    }
    if (command && command.includes(OWNERSHIP_MARKER)) {
      return { ...base, severity: "ok", message: "native statusLine (ccstatusline) configured" };
    }
    if (command) {
      return {
        ...base,
        severity: "ok",
        message: "custom user statusLine present \u2014 left untouched"
      };
    }
    if (unreadable) {
      return {
        ...base,
        severity: "warning",
        message: "settings.json is unreadable (invalid JSON) \u2014 statusLine not verified",
        hint: "Fix ~/.claude/settings.json JSON, then it will be reconciled next session"
      };
    }
    return {
      ...base,
      severity: "warning",
      message: "native statusLine not set in ~/.claude/settings.json",
      hint: `Apply NOW (current session): node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/native-statusline/apply-statusline.ts". Otherwise the SessionStart hook installs it next session. Opt out: DEV_POMOGATOR_STATUSLINE=off.`,
      details: {
        fixAction: "apply-statusline",
        fixScript: "tools/native-statusline/apply-statusline.ts",
        settingsFile
      }
    };
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/statusline-widgets.ts
import fs27 from "node:fs";
import path27 from "node:path";
var OWNERSHIP_MARKER2 = "ccstatusline";
var REQUIRED_WIDGET_TYPES = ["git-root-dir", "current-working-dir"];
var STOCK_DEFAULT_TYPES = /* @__PURE__ */ new Set([
  "model",
  "separator",
  "context-length",
  "git-branch",
  "git-changes",
  "flex-separator"
]);
var statuslineWidgetsCheck = {
  id: "C-NSW",
  fr: "FR-11",
  name: "Statusline widgets (repo + cwd)",
  group: "self-sufficient",
  reinstallable: false,
  pool: "fs",
  async run(ctx) {
    const base = {
      id: "C-NSW",
      fr: "FR-11",
      name: "Statusline widgets (repo + cwd)",
      group: "self-sufficient",
      reinstallable: false,
      durationMs: 0
    };
    const settingsFile = path27.join(ctx.homeDir, ".claude", "settings.json");
    let command;
    try {
      const parsed = JSON.parse(fs27.readFileSync(settingsFile, "utf-8"));
      command = typeof parsed.statusLine?.command === "string" ? parsed.statusLine.command : void 0;
    } catch {
      command = void 0;
    }
    if (!command || !command.includes(OWNERSHIP_MARKER2)) {
      return {
        ...base,
        severity: "ok",
        message: "statusLine is not ccstatusline \u2014 widget config not applicable (see C-NSL)"
      };
    }
    const configFile = path27.join(ctx.homeDir, ".config", "ccstatusline", "settings.json");
    const fixHint = `Apply NOW: node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/native-statusline/apply-statusline.ts" (adds git-root-dir + current-working-dir widgets; custom layouts are never touched).`;
    let lines;
    let unreadable = false;
    try {
      const parsed = JSON.parse(fs27.readFileSync(configFile, "utf-8"));
      lines = Array.isArray(parsed.lines) ? parsed.lines : void 0;
    } catch {
      unreadable = fs27.existsSync(configFile);
    }
    if (unreadable) {
      return {
        ...base,
        severity: "warning",
        message: "ccstatusline config is unreadable (invalid JSON) \u2014 widgets not verified",
        hint: `Fix ${configFile} JSON, then re-run /pomogator-doctor`
      };
    }
    if (!lines) {
      return {
        ...base,
        severity: "warning",
        message: "ccstatusline widget config missing \u2014 bar renders stock defaults without repo and cwd",
        hint: fixHint,
        details: { fixAction: "apply-statusline", configFile }
      };
    }
    const present = /* @__PURE__ */ new Set();
    for (const line of lines) {
      for (const item of line) {
        if (typeof item?.type === "string") present.add(item.type);
      }
    }
    const missing = REQUIRED_WIDGET_TYPES.filter((t) => !present.has(t));
    if (missing.length === 0) {
      return { ...base, severity: "ok", message: "statusline shows repo + cwd widgets" };
    }
    const stockShaped = [...present].every((t) => STOCK_DEFAULT_TYPES.has(t));
    if (!stockShaped) {
      return {
        ...base,
        severity: "ok",
        message: `custom widget layout present \u2014 left untouched (no ${missing.join(", ")})`
      };
    }
    return {
      ...base,
      severity: "warning",
      message: `statusline is stock-default \u2014 missing ${missing.join(", ")} (no repo/cwd on the bar)`,
      hint: fixHint,
      details: { fixAction: "apply-statusline", configFile, missing }
    };
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/tui-test-runner.ts
import fs28 from "node:fs";
import path28 from "node:path";
var TUI_TEST_RUNNER_DIR = "tools/tui-test-runner";
var tuiTestRunnerCheck = {
  id: "C-TTR",
  fr: "FR-14",
  name: "TUI test runner",
  group: "self-sufficient",
  gate: () => ({ relevant: true }),
  run: async (ctx) => {
    const base = {
      id: "C-TTR",
      fr: "FR-14",
      name: "TUI test runner",
      group: "self-sufficient",
      durationMs: 0
    };
    if (process.env.TEST_STATUSLINE_ENABLED !== "true") {
      return [];
    }
    const invocationProject = path28.resolve(ctx.projectRoot);
    const sessionProject = process.env.TEST_STATUSLINE_PROJECT;
    if (sessionProject && path28.resolve(sessionProject) !== invocationProject) {
      return {
        ...base,
        severity: "warning",
        message: `TUI test runner session project ${sessionProject} differs from invocation project ${invocationProject}`,
        hint: "Start a new Claude session in this worktree so TEST_STATUSLINE_PROJECT matches the invocation CWD."
      };
    }
    const runnerDir = path28.join(invocationProject, TUI_TEST_RUNNER_DIR);
    const wrapper = path28.join(runnerDir, "test_runner_wrapper.ts");
    const sessionStart = path28.join(runnerDir, "tui_session_start.ts");
    const missing = [wrapper, sessionStart].filter((file) => !fs28.existsSync(file));
    if (missing.length > 0) {
      return {
        ...base,
        severity: "warning",
        message: `TEST_STATUSLINE_ENABLED=true but the TUI test runner is incomplete under ${runnerDir}`,
        hint: "Restore tools/tui-test-runner from the dev-pomogator plugin, or set TEST_STATUSLINE_ENABLED=false."
      };
    }
    return {
      ...base,
      severity: "ok",
      message: `TUI test runner is available for ${ctx.projectRoot}`
    };
  }
};

// .claude/skills/pomogator-doctor/scripts/engine/checks/version-match.ts
var import_semver2 = __toESM(require_semver2(), 1);
var versionMatchCheck = {
  id: "C13",
  fr: "FR-11",
  name: "Version match (package.json vs config)",
  group: "self-sufficient",
  reinstallable: true,
  pool: "fs",
  async run(ctx) {
    const canonicalVersion = ctx.config?.version == null ? readCanonicalManifest(ctx.projectRoot)?.version ?? null : null;
    const configVersion = ctx.config?.version ?? canonicalVersion;
    const packageVersion = ctx.packageVersion;
    if (!configVersion || !packageVersion) {
      return build4(
        "warning",
        `cannot compare versions (config=${configVersion ?? "unknown"}, package=${packageVersion ?? "unknown"})`,
        "Reinstall to record current version"
      );
    }
    if (!import_semver2.default.valid(configVersion) || !import_semver2.default.valid(packageVersion)) {
      return build4(
        "warning",
        `invalid semver: config=${configVersion}, package=${packageVersion}`
      );
    }
    const diff = import_semver2.default.diff(configVersion, packageVersion);
    if (diff === null) {
      return build4("ok", `versions match: ${configVersion}`);
    }
    if (diff === "major") {
      return build4(
        "critical",
        `major version mismatch: package=${packageVersion}, config=${configVersion}`,
        "Reinstall with `npx dev-pomogator` to sync tools + hooks to new major"
      );
    }
    if (diff === "minor") {
      return build4(
        "warning",
        `minor version drift: package=${packageVersion}, config=${configVersion}`,
        "Reinstall to pick up new minor features"
      );
    }
    return build4(
      "ok",
      `patch-level drift only (package=${packageVersion}, config=${configVersion}) \u2014 no reinstall required`
    );
  }
};
function build4(severity, message, hint) {
  return {
    id: "C13",
    fr: "FR-11",
    name: "Version match",
    group: "self-sufficient",
    severity,
    reinstallable: severity !== "ok",
    message,
    hint,
    reinstallHint: CANONICAL_REINSTALL_HINT,
    durationMs: 0
  };
}

// .claude/skills/pomogator-doctor/scripts/engine/checks/index.ts
var phase2Checks = [
  nodeVersionCheck,
  gitCheck,
  ghCheck,
  pomogatorHomeCheck,
  hooksRegistryCheck,
  hooksExecCheck,
  hookScriptPathsCheck,
  hookServiceCheck,
  envVarsCheck,
  envExampleCheck,
  versionMatchCheck,
  gitignoreBlockCheck,
  claudeBinPriorityCheck,
  statuslineCheck,
  statuslineWidgetsCheck,
  tuiTestRunnerCheck,
  contextMenuCheck,
  carlCheck,
  forbidRootArtifactsCheck
];
var phase3Checks = [bunCheck, pythonCheck, dockerCheck, meridianCheck];
var phase4Checks = [
  mcpParseCheck,
  mcpProbeCheck,
  mcpAuthCheck,
  pluginLoaderCheck,
  claudeMemPluginCheck,
  claudeMemWorkerCheck,
  contextModeCheck
];
var allChecks = [
  ...phase2Checks,
  ...phase3Checks,
  ...phase4Checks
];

// .claude/skills/pomogator-doctor/scripts/engine/lock.ts
import fs29 from "node:fs";
import path29 from "node:path";
var LockHeldError = class extends Error {
  constructor(lockPath, holderPid) {
    super(`Another doctor run in progress (PID=${holderPid})`);
    this.lockPath = lockPath;
    this.holderPid = holderPid;
    this.name = "LockHeldError";
  }
  lockPath;
  holderPid;
};
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error.code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return false;
  }
}
function acquireLock(lockPath) {
  fs29.mkdirSync(path29.dirname(lockPath), { recursive: true });
  const pid = process.pid;
  try {
    fs29.writeFileSync(lockPath, String(pid), { flag: "wx" });
    return makeHandle(lockPath, pid);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  let holderPid = Number.NaN;
  try {
    holderPid = Number.parseInt(fs29.readFileSync(lockPath, "utf-8").trim(), 10);
  } catch {
    holderPid = Number.NaN;
  }
  if (Number.isFinite(holderPid) && isPidAlive(holderPid)) {
    throw new LockHeldError(lockPath, holderPid);
  }
  fs29.rmSync(lockPath, { force: true });
  fs29.writeFileSync(lockPath, String(pid), { flag: "wx" });
  return makeHandle(lockPath, pid);
}
function makeHandle(lockPath, pid) {
  let released = false;
  return {
    path: lockPath,
    pid,
    release() {
      if (released) return;
      released = true;
      try {
        const written = fs29.readFileSync(lockPath, "utf-8").trim();
        if (written === String(pid)) fs29.rmSync(lockPath, { force: true });
      } catch {
      }
    }
  };
}

// node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result2 = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result2 += 60;
        }
        return result2;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// node_modules/chalk/source/vendor/supports-color/index.js
import process2 from "node:process";
import os6 from "node:os";
import tty from "node:tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process2.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env } = process2;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function envForceColor() {
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      return 1;
    }
    if (env.FORCE_COLOR === "false") {
      return 0;
    }
    return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== void 0) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === void 0) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (process2.platform === "win32") {
    const osRelease = os6.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if (env.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty.isatty(2) })
};
var supports_color_default = supportsColor;

// node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = /* @__PURE__ */ Symbol("GENERATOR");
var STYLER = /* @__PURE__ */ Symbol("STYLER");
var IS_EMPTY = /* @__PURE__ */ Symbol("IS_EMPTY");
var levelMapping = [
  "ansi",
  "ansi",
  "ansi256",
  "ansi16m"
];
var styles2 = /* @__PURE__ */ Object.create(null);
var applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === void 0 ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk2 = (...strings) => strings.join(" ");
  applyOptions(chalk2, options);
  Object.setPrototypeOf(chalk2, createChalk.prototype);
  return chalk2;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default)) {
  styles2[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles2.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  styles2[model] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
  const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
  styles2[bgModel] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
}
var proto = Object.defineProperties(() => {
}, {
  ...styles2,
  level: {
    enumerable: true,
    get() {
      return this[GENERATOR].level;
    },
    set(level) {
      this[GENERATOR].level = level;
    }
  }
});
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === void 0) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === void 0) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== void 0) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, styles2);
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// .claude/skills/pomogator-doctor/scripts/engine/reporter.ts
var GROUP_ORDER = ["self-sufficient", "needs-env", "needs-external"];
var GROUP_EMOJI = {
  "self-sufficient": "\u{1F7E2}",
  "needs-env": "\u{1F7E1}",
  "needs-external": "\u{1F534}"
};
var GROUP_LABEL = {
  "self-sufficient": "Self-sufficient",
  "needs-env": "Needs env vars",
  "needs-external": "Needs external deps"
};
var SEVERITY_GLYPH = {
  ok: "\u2713",
  warning: "\u26A0",
  critical: "\u2717"
};
function colorize(text, severity) {
  if (severity === "ok") return source_default.green(text);
  if (severity === "warning") return source_default.yellow(text);
  return source_default.red(text);
}
function formatChalk(report) {
  const lines = [];
  lines.push(source_default.bold(`pomogator-doctor \u2014 ${report.installedExtensions.length} extension(s) installed`));
  lines.push("");
  const byGroup = /* @__PURE__ */ new Map();
  for (const group of GROUP_ORDER) byGroup.set(group, []);
  for (const result2 of report.results) {
    const list = byGroup.get(result2.group) ?? [];
    list.push(result2);
    byGroup.set(result2.group, list);
  }
  for (const group of GROUP_ORDER) {
    const list = byGroup.get(group) ?? [];
    if (list.length === 0) continue;
    lines.push(source_default.bold(`${GROUP_EMOJI[group]} ${GROUP_LABEL[group]}`));
    for (const result2 of list) {
      const glyph = colorize(SEVERITY_GLYPH[result2.severity], result2.severity);
      const name = result2.extension ? `${result2.name} (${result2.extension})` : result2.name;
      lines.push(`  ${glyph} ${source_default.bold(result2.id.padEnd(12))} ${name}`);
      lines.push(`      ${source_default.gray(result2.message)}`);
      if (result2.hint) lines.push(`      ${source_default.cyan("hint:")} ${result2.hint}`);
      if (result2.reinstallable && result2.severity !== "ok" && result2.reinstallHint) {
        lines.push(`      ${source_default.magenta("reinstall:")} ${result2.reinstallHint}`);
      }
    }
    lines.push("");
  }
  if (report.gatedOut.length > 0) {
    lines.push(source_default.dim(`Skipped ${report.gatedOut.length} check(s) (extensions not installed)`));
    lines.push("");
  }
  const { ok, warnings, critical, total, relevantOf } = report.summary;
  const summary = `${ok} ok, ${warnings} warnings, ${critical} critical (of ${total}/${relevantOf} relevant)`;
  const summaryColored = critical > 0 ? source_default.red.bold(summary) : warnings > 0 ? source_default.yellow.bold(summary) : source_default.green.bold(summary);
  lines.push(`Summary: ${summaryColored}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  return lines.join("\n");
}
function redactForJson(result2) {
  const { details, ...rest } = result2;
  const out = { ...rest };
  if (details && Object.keys(details).length > 0) out.details = details;
  if (result2.envStatus) {
    out.envStatus = { name: result2.envStatus.name, status: result2.envStatus.status };
  }
  return out;
}
function formatJson(report) {
  const serialized = {
    schemaVersion: report.schemaVersion,
    durationMs: report.durationMs,
    installedExtensions: report.installedExtensions,
    summary: report.summary,
    gatedOut: report.gatedOut,
    results: report.results.map(redactForJson),
    reinstallableIssues: report.reinstallableIssues.map(redactForJson),
    manualIssues: report.manualIssues.map(redactForJson)
  };
  return JSON.stringify(serialized, null, 2);
}
function buildHookOutput(report) {
  const { critical, warnings } = report.summary;
  if (critical === 0 && warnings === 0) {
    return { continue: true, suppressOutput: true };
  }
  const reinstallableCount = report.reinstallableIssues.length;
  const parts = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (warnings > 0) parts.push(`${warnings} warning`);
  if (reinstallableCount > 0) parts.push(`${reinstallableCount} reinstallable`);
  const head = `\u26A0 pomogator-doctor: ${parts.join(", ")}`;
  const tail = ", run /pomogator-doctor";
  const max = 100;
  const banner = (head + tail).length > max ? head.slice(0, max - tail.length - 1) + "\u2026" + tail : head + tail;
  return { continue: true, additionalContext: banner };
}
function exitCodeFor(report) {
  if (report.summary.critical > 0) return 2;
  if (report.summary.warnings > 0) return 1;
  return 0;
}

// .claude/skills/pomogator-doctor/scripts/engine/runner.ts
import fs30 from "node:fs";
import os7 from "node:os";
import path30 from "node:path";

// node_modules/yocto-queue/index.js
var Node = class {
  value;
  next;
  constructor(value) {
    this.value = value;
  }
};
var Queue = class {
  #head;
  #tail;
  #size;
  constructor() {
    this.clear();
  }
  enqueue(value) {
    const node = new Node(value);
    if (this.#head) {
      this.#tail.next = node;
      this.#tail = node;
    } else {
      this.#head = node;
      this.#tail = node;
    }
    this.#size++;
  }
  dequeue() {
    const current = this.#head;
    if (!current) {
      return;
    }
    this.#head = this.#head.next;
    this.#size--;
    if (!this.#head) {
      this.#tail = void 0;
    }
    return current.value;
  }
  peek() {
    if (!this.#head) {
      return;
    }
    return this.#head.value;
  }
  clear() {
    this.#head = void 0;
    this.#tail = void 0;
    this.#size = 0;
  }
  get size() {
    return this.#size;
  }
  *[Symbol.iterator]() {
    let current = this.#head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
  *drain() {
    while (this.#head) {
      yield this.dequeue();
    }
  }
};

// node_modules/p-limit/index.js
import { AsyncResource } from "async_hooks";
function pLimit(concurrency) {
  if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }
  const queue = new Queue();
  let activeCount = 0;
  const next = () => {
    activeCount--;
    if (queue.size > 0) {
      queue.dequeue()();
    }
  };
  const run = async (function_, resolve5, arguments_) => {
    activeCount++;
    const result2 = (async () => function_(...arguments_))();
    resolve5(result2);
    try {
      await result2;
    } catch {
    }
    next();
  };
  const enqueue = (function_, resolve5, arguments_) => {
    queue.enqueue(
      AsyncResource.bind(run.bind(void 0, function_, resolve5, arguments_))
    );
    (async () => {
      await Promise.resolve();
      if (activeCount < concurrency && queue.size > 0) {
        queue.dequeue()();
      }
    })();
  };
  const generator = (function_, ...arguments_) => new Promise((resolve5) => {
    enqueue(function_, resolve5, arguments_);
  });
  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount
    },
    pendingCount: {
      get: () => queue.size
    },
    clearQueue: {
      value() {
        queue.clear();
      }
    }
  });
  return generator;
}

// .claude/skills/pomogator-doctor/scripts/engine/runner.ts
async function executeChecks(options, checks) {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = options.timeout ?? DOCTOR_TIMEOUTS.GLOBAL_MS;
  const timer = setTimeout(() => controller.abort(new Error("Doctor timeout")), timeoutMs);
  try {
    const homeDir = options.homeDir ?? os7.homedir();
    const projectRoot = options.projectRoot ?? process.cwd();
    const { config, configError } = loadConfig(homeDir);
    const installedExtensions = config?.installedExtensions ?? [];
    const referencedMcpServers = collectReferencedMcpServers(projectRoot, homeDir);
    const packageVersion = readPackageVersion(projectRoot);
    const ctx = {
      config,
      configError,
      referencedMcpServers,
      installedExtensions,
      projectRoot,
      homeDir,
      signal: controller.signal,
      packageVersion,
      fix: options.fix ?? false
    };
    const { relevant, gatedOut } = gateChecks(checks, ctx, options.extension);
    const fsPool = pLimit(DOCTOR_POOLS.FS);
    const mcpPool = pLimit(DOCTOR_POOLS.MCP);
    const results = [];
    const tasks = relevant.map((def) => {
      const pool = def.pool === "mcp" ? mcpPool : fsPool;
      return pool(async () => {
        const out = await runSingleCheck(def, ctx);
        results.push(...out);
      });
    });
    await Promise.allSettled(tasks);
    const sorted = results.sort((a, b) => a.id.localeCompare(b.id));
    const summary = buildSummary(sorted, checks.length);
    const reinstallableIssues = sorted.filter((r) => r.severity !== "ok" && r.reinstallable);
    const manualIssues = sorted.filter((r) => r.severity !== "ok" && !r.reinstallable);
    return {
      results: sorted,
      durationMs: Date.now() - started,
      gatedOut,
      installedExtensions: installedExtensions.map((e) => e.name),
      summary,
      reinstallableIssues,
      manualIssues,
      schemaVersion: DOCTOR_SCHEMA_VERSION
    };
  } finally {
    clearTimeout(timer);
  }
}
async function runSingleCheck(def, ctx) {
  const started = Date.now();
  try {
    const out = await def.run(ctx);
    if (out === null) return [];
    const list = Array.isArray(out) ? out : [out];
    for (const r of list) {
      if (r.durationMs === void 0 || r.durationMs === 0) {
        r.durationMs = Date.now() - started;
      }
    }
    return list;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        id: def.id,
        fr: def.fr,
        name: def.name,
        group: def.group,
        severity: "critical",
        reinstallable: def.reinstallable,
        message: `internal error: ${message}`,
        hint: "Check logs and report bug",
        durationMs: Date.now() - started
      }
    ];
  }
}
function gateChecks(checks, ctx, extensionFilter) {
  const relevant = [];
  const gatedOut = [];
  const extInstalled = extensionFilter ? ctx.installedExtensions.some((e) => e.name === extensionFilter) : true;
  for (const def of checks) {
    if (extensionFilter && !extInstalled) {
      gatedOut.push({ id: def.id, fr: def.fr, reason: `extension '${extensionFilter}' not installed` });
      continue;
    }
    const gate = def.gate ? def.gate(ctx) : { relevant: true };
    if (!gate.relevant) {
      gatedOut.push({
        id: def.id,
        fr: def.fr,
        reason: gate.reason ?? "check not relevant for current installed extensions"
      });
      continue;
    }
    relevant.push(def);
  }
  return { relevant, gatedOut };
}
function buildSummary(results, totalPossible) {
  const ok = results.filter((r) => r.severity === "ok").length;
  const warnings = results.filter((r) => r.severity === "warning").length;
  const critical = results.filter((r) => r.severity === "critical").length;
  return {
    ok,
    warnings,
    critical,
    total: results.length,
    relevantOf: totalPossible
  };
}
function loadConfig(homeDir) {
  const configPath = path30.join(homeDir, ".dev-pomogator", "config.json");
  try {
    const raw = fs30.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return { config: parsed, configError: null };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { config: null, configError: new Error(`config not found: ${configPath}`) };
    }
    if (error instanceof SyntaxError) {
      return {
        config: null,
        configError: new Error(`config parse error: ${error.message}`)
      };
    }
    return { config: null, configError: error };
  }
}
function collectReferencedMcpServers(projectRoot, homeDir) {
  const refs = /* @__PURE__ */ new Set();
  const roots = [
    path30.join(projectRoot, ".claude", "rules"),
    path30.join(projectRoot, ".claude", "skills"),
    path30.join(homeDir, ".claude", "rules"),
    path30.join(homeDir, ".claude", "skills")
  ];
  const pattern = /mcp__([A-Za-z0-9_-]+)__/g;
  for (const root of roots) {
    walkMarkdown(root, (content) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        refs.add(match[1]);
      }
      pattern.lastIndex = 0;
    });
  }
  return refs;
}
function walkMarkdown(root, onContent) {
  let entries;
  try {
    entries = fs30.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      process.stderr.write(`[doctor] walkMarkdown failed for ${root}: ${error.message}
`);
    }
    return;
  }
  for (const entry of entries) {
    const full = path30.join(root, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(full, onContent);
    } else if (entry.isFile() && full.endsWith(".md")) {
      try {
        onContent(fs30.readFileSync(full, "utf-8"));
      } catch (error) {
        if (error.code !== "ENOENT") {
          process.stderr.write(`[doctor] read failed for ${full}: ${error.message}
`);
        }
      }
    }
  }
}
function readPackageVersion(projectRoot) {
  const candidates = [
    path30.join(projectRoot, "node_modules", "dev-pomogator", "package.json"),
    path30.join(projectRoot, "package.json")
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs30.readFileSync(p, "utf-8"));
      if (parsed.version && parsed.name === "dev-pomogator") return parsed.version;
      if (parsed.version) return parsed.version;
    } catch {
      continue;
    }
  }
  return null;
}

// .claude/skills/pomogator-doctor/scripts/engine/index.ts
async function runDoctor(options = {}, checks = allChecks) {
  const homeDir = options.homeDir ?? os8.homedir();
  const lockPath = path31.join(homeDir, ".dev-pomogator", "doctor.lock");
  const lock = acquireLock(lockPath);
  try {
    return await executeChecks(options, checks);
  } finally {
    lock.release();
  }
}
async function runQuiet(options = {}, checks = allChecks) {
  try {
    const report = await runDoctor({ ...options, quiet: true }, checks);
    const homeDir = options.homeDir ?? os8.homedir();
    const installed = fs31.existsSync(path31.join(homeDir, ".dev-pomogator", "config.json"));
    const actionableCritical = report.results.some(
      (result2) => result2.severity === "critical" && result2.group !== "needs-external"
    );
    if (!installed || !actionableCritical) {
      return { continue: true, suppressOutput: true };
    }
    return buildHookOutput(report);
  } catch {
    return { continue: true, suppressOutput: true };
  }
}
async function runVerbose(options = {}, checks = allChecks) {
  const report = await runDoctor(options, checks);
  return formatChalk(report);
}
function usage6() {
  return "Usage: pomogator-doctor [--json] [--extension=<name>] [--fix]";
}
function parseCliArgs(args) {
  const parsed = { json: false, fix: false, hook: false };
  for (const arg of args) {
    if (arg === "--json") parsed.json = true;
    else if (arg === "--fix") parsed.fix = true;
    else if (arg === "--hook") parsed.hook = true;
    else if (arg.startsWith("--extension=") && arg.length > "--extension=".length) {
      parsed.extension = arg.slice("--extension=".length);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}
async function main7(args = process.argv.slice(2)) {
  let cli;
  try {
    cli = parseCliArgs(args);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
${usage6()}
`);
    process.exitCode = 2;
    return;
  }
  process.env.DEV_POMOGATOR_DOCTOR_BUNDLE = "1";
  if (cli.hook) {
    let input = "";
    if (!process.stdin.isTTY) {
      for await (const chunk of process.stdin) input += String(chunk);
    }
    let projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    try {
      const payload = JSON.parse(input);
      if (typeof payload.cwd === "string" && payload.cwd.trim()) projectRoot = payload.cwd;
    } catch {
    }
    const output = await Promise.race([
      runQuiet({ projectRoot, homeDir: process.env.HOME || process.env.USERPROFILE, fix: false }),
      new Promise((resolve5) => setTimeout(
        () => resolve5({ continue: true, suppressOutput: true }),
        1e4
      ))
    ]);
    process.stdout.write(`${JSON.stringify(output)}
`);
    return;
  }
  const report = await runDoctor({
    projectRoot: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    homeDir: process.env.HOME || process.env.USERPROFILE,
    extension: cli.extension,
    fix: cli.fix
  });
  process.stdout.write(`${cli.json ? formatJson(report) : formatChalk(report)}
`);
  process.exitCode = exitCodeFor(report);
}
var invokedPath6 = process.argv[1] ? path31.resolve(process.argv[1]) : "";
if (invokedPath6 && import.meta.url === pathToFileURL6(invokedPath6).href) {
  void main7().catch((error) => {
    process.stderr.write(`pomogator-doctor failed: ${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 2;
  });
}
function lockPathFor(homeDir) {
  return path31.join(homeDir, ".dev-pomogator", "doctor.lock");
}
function emptyReport() {
  return {
    results: [],
    durationMs: 0,
    gatedOut: [],
    installedExtensions: [],
    summary: { ok: 0, warnings: 0, critical: 0, total: 0, relevantOf: 0 },
    reinstallableIssues: [],
    manualIssues: [],
    schemaVersion: DOCTOR_SCHEMA_VERSION
  };
}
export {
  LockHeldError,
  emptyReport,
  lockPathFor,
  runDoctor,
  runQuiet,
  runVerbose
};
