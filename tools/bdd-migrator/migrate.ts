#!/usr/bin/env node
/**
 * bdd-migrator — deterministic inventory + classifier for the BDD-only migration (FR-M1).
 *
 * This is the MECHANICAL half of the migrator: given a spec slug it reports the migration
 * plan — which scenarios are graph-traceable, whether the `.feature` is wired into cucumber,
 * and how each vitest test classifies (the three classes finding #11 found in the answer-simple
 * pilot). Authoring the actual step-defs is the LLM half, driven by the `bdd-migrator` skill via
 * the strong-tests §6.5 recipe; this tool tells the skill exactly what is left to do.
 *
 * Classes (per finding #11):
 *   - runtime   → test calls a real engine (imports a tools/ module & invokes it, or spawnSync/
 *                 execSync). Migrates to a real-engine step-def (strong, mutation-checkable).
 *   - artifact  → test only inspects file structure (fs read + assert). Migrates to a
 *                 file-inspection step-def (same strength as the vitest, now graph-traceable).
 *   - manual    → it.skip / needs a live session (no automation hook). Tag the scenario @manual.
 *
 * Usage:  npx tsx tools/bdd-migrator/migrate.ts --spec <slug> [--json]
 * Exit:   0 = analysed; 2 = spec/feature not found.
 *
 * @see audit-reports/v4-dogfood-retrospective.md finding #11 (the spec for this tool)
 * @see .claude/skills/strong-tests/SKILL.md §6.5 (the authoring recipe the skill runs)
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

export type TestClass = 'runtime' | 'artifact' | 'manual' | 'unknown';
export interface ScenarioInfo {
  id: string;
  tagState: 'real' | 'comment' | 'none';
  tags: string[];
}
export interface VitestInfo {
  name: string;
  cls: TestClass;
}
export interface MigrationPlan {
  spec: string;
  featurePath: string | null;
  wiredInCucumber: boolean;
  scenarios: ScenarioInfo[];
  vitestFiles: string[];
  vitestTests: VitestInfo[];
  actions: string[];
}

/** Parse a `.feature` into scenarios + whether each carries a REAL tag line vs a `# comment`. */
export function parseScenarios(feature: string): ScenarioInfo[] {
  const lines = feature.split(/\r?\n/);
  const out: ScenarioInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/);
    if (!m) continue;
    // Walk upward over blank lines collecting the immediately-preceding tag/comment lines.
    let tagState: ScenarioInfo['tagState'] = 'none';
    const tags: string[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim();
      if (t === '') continue;
      const real = t.match(/^(@[^\s]+(?:\s+@[^\s]+)*)$/);
      const comment = t.match(/^#\s*(@\S+)/);
      if (real) {
        tagState = 'real';
        tags.push(...real[1].split(/\s+/));
        // keep walking — multiple tag lines may stack
        continue;
      }
      if (comment) {
        if (tagState !== 'real') tagState = 'comment';
        tags.push(comment[1]);
      }
      break;
    }
    // Prefer a short id token (CODE_NN) from the scenario title when present.
    const idTok = m[1].match(/^([A-Za-z]+\d+_\d+|[A-Za-z]+\d+)/);
    out.push({ id: idTok ? idTok[1] : m[1].slice(0, 40), tagState, tags });
  }
  return out;
}

/** Symbols imported from a `tools/` module — invoking one in a test = a real engine call. */
export function toolImportSymbols(src: string): string[] {
  const syms: string[] = [];
  const re = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"][^'"]*tools\/[^'"]+['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const s of m[1].split(',')) {
      const name = s.trim().split(/\s+as\s+/)[0].trim();
      if (name && /^[A-Za-z_$]\w*$/.test(name)) syms.push(name);
    }
  }
  return syms;
}

/**
 * Classify a single it()/test() body. `toolSymbols` are names imported from tools/ — a body that
 * CALLS one is runtime even if it also reads files (the classifier's blind spot found on
 * skill-listing-budget: ensureSkillListingBudget(...) + fs.readJson was mis-labelled artifact).
 */
export function classifyTestBody(body: string, toolSymbols: string[] = []): TestClass {
  if (/\bspawnSync\b|\bexecSync\b|\bspawn\b/.test(body)) return 'runtime';
  if (toolSymbols.some((s) => new RegExp(`\\b${s}\\s*\\(`).test(body))) return 'runtime';
  if (/\b(detect|run|build|parse|compute|validate|audit|generate|resolve|ensure|apply)[A-Z]\w*\s*\(/.test(body)) return 'runtime';
  if (/\bfs\.|readFileSync|pathExists|readJson|existsSync/.test(body)) return 'artifact';
  return 'unknown';
}

/** Split a vitest file into it()/test() blocks (incl. it.skip) and classify each. */
export function classifyVitestFile(src: string): VitestInfo[] {
  const toolSymbols = toolImportSymbols(src);
  const out: VitestInfo[] = [];
  const re = /\b(it|test)(\.skip|\.only)?\s*\(\s*(['"`])([\s\S]*?)\3/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const skipped = m[2] === '.skip';
    const name = m[4];
    // Body = from this match to the next it/test (rough block boundary).
    const start = m.index;
    re.lastIndex = m.index + m[0].length;
    const nextMatch = /\b(it|test)(\.skip|\.only)?\s*\(/.exec(src.slice(re.lastIndex));
    const end = nextMatch ? re.lastIndex + nextMatch.index : src.length;
    const body = src.slice(start, end);
    out.push({ name, cls: skipped ? 'manual' : classifyTestBody(body, toolSymbols) });
  }
  return out;
}

function isWired(featureRel: string): boolean {
  const cfgPath = path.join(REPO, 'cucumber.json');
  if (!fs.existsSync(cfgPath)) return false;
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const paths: string[] = cfg?.default?.paths ?? [];
    const norm = (p: string) => p.replace(/\\/g, '/');
    return paths.map(norm).includes(norm(featureRel));
  } catch {
    return false;
  }
}

/** Find vitest files plausibly owning a spec: tests/e2e/<slug>.test.ts + slug-named matches. */
function findVitestFiles(slug: string): string[] {
  const hits: string[] = [];
  const direct = path.join(REPO, 'tests', 'e2e', `${slug}.test.ts`);
  if (fs.existsSync(direct)) hits.push(path.relative(REPO, direct).replace(/\\/g, '/'));
  return hits;
}

export function buildPlan(slug: string): MigrationPlan {
  const featureRel = `.specs/${slug}/${slug}.feature`;
  const featureAbs = path.join(REPO, featureRel);
  const hasFeature = fs.existsSync(featureAbs);
  const scenarios = hasFeature ? parseScenarios(fs.readFileSync(featureAbs, 'utf-8')) : [];
  const vitestFiles = findVitestFiles(slug);
  const vitestTests = vitestFiles.flatMap((f) => classifyVitestFile(fs.readFileSync(path.join(REPO, f), 'utf-8')));
  const wired = hasFeature && isWired(featureRel);

  const actions: string[] = [];
  if (!hasFeature) actions.push(`NO .feature — author scenarios for ${slug} (create-spec born-BDD)`);
  const commentTagged = scenarios.filter((s) => s.tagState === 'comment');
  if (commentTagged.length) actions.push(`fix ${commentTagged.length} comment-tag(s) → real @tag lines (graph-invisible otherwise): ${commentTagged.map((s) => s.id).join(', ')}`);
  const untagged = scenarios.filter((s) => s.tagState === 'none');
  if (untagged.length) actions.push(`tag ${untagged.length} untagged scenario(s): ${untagged.map((s) => s.id).join(', ')}`);
  if (hasFeature && !wired) actions.push(`wire ${featureRel} into cucumber.json paths (gated by tags) once step-defs exist`);
  const byClass = { runtime: 0, artifact: 0, manual: 0, unknown: 0 };
  for (const t of vitestTests) byClass[t.cls]++;
  if (vitestFiles.length) {
    actions.push(`migrate ${vitestTests.length} vitest test(s) → step-defs [runtime:${byClass.runtime} artifact:${byClass.artifact} manual:${byClass.manual} unknown:${byClass.unknown}], then delete ${vitestFiles.join(', ')}`);
  } else {
    actions.push(`no slug-named vitest file — already migrated or cross-cutting (check project-test-trace.ts for orphans)`);
  }

  return { spec: slug, featurePath: hasFeature ? featureRel : null, wiredInCucumber: wired, scenarios, vitestFiles, vitestTests, actions };
}

function render(plan: MigrationPlan): string {
  const L: string[] = [];
  L.push(`bdd-migrator plan — spec: ${plan.spec}`);
  L.push(`  feature: ${plan.featurePath ?? '(none)'}  wired: ${plan.wiredInCucumber ? 'yes' : 'NO'}`);
  L.push(`  scenarios (${plan.scenarios.length}): ` + (plan.scenarios.map((s) => `${s.id}[${s.tagState}]`).join(', ') || '(none)'));
  L.push(`  vitest: ${plan.vitestFiles.join(', ') || '(none)'}`);
  for (const t of plan.vitestTests) L.push(`    - ${t.cls.padEnd(8)} ${t.name}`);
  L.push(`  actions:`);
  for (const a of plan.actions) L.push(`    • ${a}`);
  return L.join('\n');
}

/** Specs that own a tests/e2e/<slug>.test.ts AND a matching .feature — migration candidates. */
function discoverMigratableSpecs(): string[] {
  const e2e = path.join(REPO, 'tests', 'e2e');
  if (!fs.existsSync(e2e)) return [];
  const slugs: string[] = [];
  for (const f of fs.readdirSync(e2e)) {
    const m = f.match(/^(.+)\.test\.ts$/);
    if (!m) continue;
    if (fs.existsSync(path.join(REPO, '.specs', m[1], `${m[1]}.feature`))) slugs.push(m[1]);
  }
  return slugs;
}

/** Lower score = easier/safer to migrate first (all-clean + few tests). */
export function migratability(plan: MigrationPlan): { score: number; label: string } {
  const c = { runtime: 0, artifact: 0, manual: 0, unknown: 0 };
  for (const t of plan.vitestTests) c[t.cls]++;
  const total = plan.vitestTests.length || 1;
  const score = (c.manual + c.unknown) * 100 + total;
  const label = c.manual + c.unknown === 0 ? 'clean' : c.unknown ? 'needs-triage' : 'has-manual';
  return { score, label };
}

/** Emit a prioritised batch plan over all candidate specs that still own a vitest file. */
function runBatch(): void {
  const rows = discoverMigratableSpecs()
    .map((slug) => {
      const plan = buildPlan(slug);
      return { slug, plan, m: migratability(plan) };
    })
    .filter((r) => r.plan.vitestFiles.length > 0)
    .sort((a, b) => a.m.score - b.m.score);
  console.log(`bdd-migrator BATCH plan — ${rows.length} spec(s) with a vitest file + matching .feature, easiest first:\n`);
  for (const r of rows) {
    const c = { runtime: 0, artifact: 0, manual: 0, unknown: 0 };
    for (const t of r.plan.vitestTests) c[t.cls]++;
    console.log(
      `  [${r.m.label.padEnd(12)}] ${r.slug.padEnd(30)} tests:${String(r.plan.vitestTests.length).padStart(3)}` +
        `  R:${c.runtime} A:${c.artifact} M:${c.manual} U:${c.unknown}  wired:${r.plan.wiredInCucumber ? 'y' : 'n'}`,
    );
  }
  console.log(`\nBatch model: author step-defs for a batch of specs (parallelisable via test-author subagents,`);
  console.log(`throttle ~3/wave per the swarm rate-limit finding), then ONE full cucumber run validates all —`);
  console.log(`the run is the serial bottleneck (last-write-wins ndjson), so amortise it across the batch.`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--batch')) {
    runBatch();
    process.exit(0);
  }
  const specIdx = args.indexOf('--spec');
  const slug = specIdx >= 0 ? args[specIdx + 1] : undefined;
  const asJson = args.includes('--json');
  if (!slug) {
    console.error('usage: npx tsx tools/bdd-migrator/migrate.ts --spec <slug> [--json]');
    process.exit(2);
  }
  if (!fs.existsSync(path.join(REPO, '.specs', slug))) {
    console.error(`spec not found: .specs/${slug}`);
    process.exit(2);
  }
  const plan = buildPlan(slug);
  console.log(asJson ? JSON.stringify(plan, null, 2) : render(plan));
  process.exit(0);
}

const isDirectRun = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');
if (isDirectRun) main();
