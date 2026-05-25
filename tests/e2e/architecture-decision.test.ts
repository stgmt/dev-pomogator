import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectAxes } from '../../extensions/specs-workflow/tools/specs-generator/architecture-decision/axis-detector.ts';
import {
  generateAxisArtefact,
  seededShuffle,
  renderAxisMarkdown,
} from '../../extensions/specs-workflow/tools/specs-generator/architecture-decision/artefact-generator.ts';
import { openInBrowser } from '../../extensions/specs-workflow/tools/specs-generator/architecture-decision/open-in-browser.ts';
import {
  compileIndex,
  collectRows,
} from '../../extensions/specs-workflow/tools/specs-generator/architecture-decision/index-compiler.ts';
import { checkArchitectureCoverage } from '../../extensions/specs-workflow/tools/specs-generator/architecture-decision/audit.ts';
import {
  renderAxisHtml,
  pickRecommended,
  type AxisModel,
  type VariantModel,
} from '../../extensions/specs-workflow/tools/specs-generator/architecture-decision/html-renderer.ts';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'architecture-decision');
const CLI = path.join(
  __dirname,
  '..',
  '..',
  'extensions',
  'specs-workflow',
  'tools',
  'specs-generator',
  'architecture-decision',
  'architecture-decision-cli.ts',
);

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}
function sampleAxis(): AxisModel {
  return JSON.parse(readFixture('sample-axis-model.json'));
}

const tmpDirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-test-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function runCli(args: string[], env?: Record<string, string>) {
  return spawnSync('npx', ['tsx', CLI, ...args], {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    env: env ? { ...process.env, ...env } : process.env,
  });
}

// Minimal valid variant for render-contract tests (ARCH007 correction/context7/policy).
function mkVariant(over: Partial<VariantModel> & Pick<VariantModel, 'id' | 'name'>): VariantModel {
  return {
    y_statement: 'y',
    maturity_ring: 'Adopt',
    cost_chip: '$',
    good: [],
    neutral: [],
    bad: [],
    when_to_choose: 'w',
    when_not_to_choose: 'n',
    is_recommended: false,
    ...over,
  };
}

describe('ARCH001: Axis detection', () => {
  it('ARCH001_01: greenfield PRD yields ≥1 axis with valid tiers', () => {
    const r = detectAxes(readFixture('greenfield-prd.md'));
    expect(r.axes_detected).toBeGreaterThanOrEqual(1);
    // invariant: cardinality — axes_detected == axes.length
    expect(r.axes_detected).toBe(r.axes.length);
    for (const a of r.axes) {
      expect(['Critical', 'Important', 'Deferred']).toContain(a.tier);
    }
  });

  it('ARCH001_02: brownfield PRD → hard-OUT, axes_detected=0', () => {
    const r = detectAxes(readFixture('brownfield-prd.md'));
    expect(r.axes_detected).toBe(0);
    expect(r.axes).toHaveLength(0);
    expect(r.skipped_reason).toMatch(/brownfield/);
  });

  it('ARCH001_03: seed axis ids are unique (no duplicate detection)', () => {
    const r = detectAxes(readFixture('greenfield-prd.md'));
    const seedIds = r.axes.filter((a) => !a.id.startsWith('clarify-')).map((a) => a.id);
    // invariant: uniqueness — each seed axis detected at most once
    expect(new Set(seedIds).size).toBe(seedIds.length);
  });

  it('ARCH001_04: NEEDS CLARIFICATION harvested as deferred axis', () => {
    const r = detectAxes(readFixture('greenfield-prd.md'));
    const clarify = r.axes.filter((a) => a.id.startsWith('clarify-'));
    expect(clarify.length).toBeGreaterThanOrEqual(1);
    expect(clarify.every((a) => a.tier === 'Deferred')).toBe(true);
  });

  it('ARCH001_05: matches golden expected-axes snapshot', () => {
    const golden = JSON.parse(readFixture('expected-axes.json'));
    const r = detectAxes(readFixture('greenfield-prd.md'));
    const ids = new Set(r.axes.map((a) => a.id));
    for (const expected of golden.expected_seed_axis_ids) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it('ARCH001_06: stack-locked prose enumerates axes + flags stack_locked (not hard-OUT)', () => {
    const prd = [
      '# PRD — locked stack, no code yet',
      'Users need persistent relational data and an HTTP API.',
      'The stack is already chosen (Supabase + Twilio) and is not being reconsidered.',
    ].join('\n');
    const r = detectAxes(prd);
    // locked PROSE must NOT hard-OUT (only a build manifest does) — axes still enumerated so
    // the completeness layer applies even when variant-picking is moot.
    expect(r.axes_detected).toBeGreaterThanOrEqual(1);
    expect(r.stack_locked).toBe(true);
    // contrast: a real build manifest still hard-OUTs to 0 axes
    expect(detectAxes('deps live in package.json').axes_detected).toBe(0);
  });
});

describe('ARCH002: Artefact generation', () => {
  it('ARCH002_01: generates self-contained md + html with recommendation', () => {
    const out = tmp();
    const r = generateAxisArtefact(sampleAxis(), out);
    expect(fs.existsSync(r.mdPath)).toBe(true);
    expect(fs.existsSync(r.htmlPath)).toBe(true);
    const html = fs.readFileSync(r.htmlPath, 'utf-8');
    expect(html).not.toMatch(/<link\b/); // self-contained: no external stylesheet
    expect(html).toContain('RECOMMENDED');
  });

  it('ARCH002_06: missing optional fields never crash the render (null-safe)', () => {
    // Regression: a variant lacking when_to_choose / when_not_to_choose (optional) must NOT
    // throw an opaque esc(undefined) — it should render, omitting those blocks.
    const minimal: AxisModel = {
      axis_id: 'x',
      axis_name: 'X',
      context: 'c',
      variants: [
        {
          id: 'a',
          name: 'A',
          y_statement: 'y',
          maturity_ring: 'Adopt',
          cost_chip: '$',
          good: [],
          neutral: [],
          bad: [],
          is_recommended: true,
        } as VariantModel,
      ],
    };
    expect(() => renderAxisHtml(minimal)).not.toThrow();
    expect(() => renderAxisMarkdown(minimal)).not.toThrow();
    const html = renderAxisHtml(minimal);
    expect(html).not.toContain('When to choose'); // block omitted, not crashed
    expect(html).not.toContain('undefined'); // no undefined leaked into output
  });

  it('ARCH002_02: seededShuffle conserves the multiset (no loss/dup)', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const out = seededShuffle(input, 'database');
    // invariant: conservation — same length, same set
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it('ARCH002_03: seededShuffle is deterministic for the same seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    expect(seededShuffle(input, 'x')).toEqual(seededShuffle(input, 'x'));
  });

  it('ARCH002_04: recommendation pinned top regardless of variant order', () => {
    const md = renderAxisMarkdown(sampleAxis());
    const recIdx = md.indexOf('✅ Recommended');
    expect(recIdx).toBeGreaterThan(-1);
    // recommendation section appears before the per-variant cards
    expect(recIdx).toBeLessThan(md.indexOf('## Neon'));
  });

  it('ARCH002_05: word-budget within ±15% for balanced variants', () => {
    const r = generateAxisArtefact(sampleAxis(), tmp());
    expect(r.wordBudgetOk).toBe(true);
  });
});

describe('ARCH003: Index compile', () => {
  function seedAxisFile(dir: string, id: string, status: string): void {
    fs.writeFileSync(
      path.join(dir, `AXIS-${id}.md`),
      `---\naxis_id: ${id}\nstatus: ${status}\nchosen: null\n---\n# ${id} axis\n`,
    );
  }

  it('ARCH003_01: collectRows cardinality — N axis files = N rows', () => {
    const dir = tmp();
    seedAxisFile(dir, 'a', 'pending');
    seedAxisFile(dir, 'b', 'accepted');
    seedAxisFile(dir, 'c', 'pending');
    const rows = collectRows(dir);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.axis_id)).size).toBe(3);
  });

  it('ARCH003_02: compile-index is idempotent', () => {
    const dir = tmp();
    seedAxisFile(dir, 'a', 'pending');
    const first = compileIndex(dir, 'spec');
    const firstMd = fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf-8');
    const second = compileIndex(dir, 'spec');
    const secondMd = fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf-8');
    expect(secondMd).toBe(firstMd);
    expect(second.axes_total).toBe(first.axes_total);
  });

  it('ARCH003_03: splice preserves user content outside AUTOGEN markers', () => {
    const dir = tmp();
    seedAxisFile(dir, 'a', 'pending');
    compileIndex(dir, 'spec');
    const withUser =
      fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf-8') + '\n## My notes\nkeep me\n';
    fs.writeFileSync(path.join(dir, 'INDEX.md'), withUser);
    compileIndex(dir, 'spec');
    expect(fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf-8')).toContain('keep me');
  });
});

describe('ARCH004: Browser launch (ENOENT-safe)', () => {
  it('ARCH004_01: never throws, returns launched boolean', async () => {
    const r = await openInBrowser('/nonexistent/path.html', 'linux');
    expect(typeof r.launched).toBe('boolean');
  });

  it('ARCH004_02: unknown binary → launched=false with file:// fallback', async () => {
    // 'linux' launcher uses xdg-open; on a CI box without it → ENOENT → fallback.
    const r = await openInBrowser('C:/x/y.html', 'linux');
    if (!r.launched) {
      expect(r.fallback).toMatch(/^file:\/\//);
    }
  });
});

describe('ARCH005: CLI integration (spawnSync)', () => {
  function writeLedger(dir: string, rows: Record<string, string>): void {
    const lines = [
      '| Dimension | Status | Pointer / Reason |',
      '|-----------|--------|------------------|',
      ...Object.entries(rows).map(([dim, cell]) => `| ${dim} | ${cell} |`),
      '',
    ];
    fs.writeFileSync(path.join(dir, 'COMPLETENESS.md'), lines.join('\n'));
  }

  it('ARCH005_01: detect-axes on greenfield → JSON axes, exit 0', () => {
    const res = runCli(['detect-axes', path.join(FIXTURES, 'greenfield-prd.md')]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.axes_detected).toBeGreaterThanOrEqual(1);
  });

  it('ARCH005_02: detect-axes on brownfield → axes_detected=0', () => {
    const res = runCli(['detect-axes', path.join(FIXTURES, 'brownfield-prd.md')]);
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).axes_detected).toBe(0);
  });

  it('ARCH005_03: missing arg → exit 2', () => {
    const res = runCli(['detect-axes']);
    expect(res.status).toBe(2);
  });

  it('ARCH005_04: audit pending axis → ARCHITECTURE_COVERAGE WARNING', () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, 'AXIS-x.md'),
      '---\naxis_id: x\nstatus: pending\n---\n# x\n',
    );
    const res = runCli(['audit', dir]);
    expect(res.status).toBe(0);
    const findings = JSON.parse(res.stdout).findings;
    expect(findings.some((f: { code: string }) => f.code === 'AXIS_PENDING')).toBe(true);
  });

  it('ARCH005_05: COMPLETENESS_COVERAGE blocks STOP on pending dimension', () => {
    const dir = tmp();
    writeLedger(dir, {
      'internal-consistency': 'addressed | diagram synced',
      'flow-completeness': 'addressed | all flows listed',
      'compliance-privacy': 'pending | ',
      'auth-secrets': 'addressed | signature auth',
      observability: 'addressed | system_errors table',
      'data-lifecycle': 'addressed | cleanup cron',
      'cost-quota': 'addressed | budget modelled',
      'deploy-ops': 'addressed | CI/CD documented',
    });
    const res = runCli(['audit-completeness', dir]);
    expect(res.status).toBe(0);
    const findings = JSON.parse(res.stdout).findings as Array<{
      code: string;
      severity: string;
      dimension_id?: string;
    }>;
    const pending = findings.filter((f) => f.code === 'DIMENSION_PENDING');
    expect(pending).toHaveLength(1);
    expect(pending[0].dimension_id).toBe('compliance-privacy');
    expect(pending[0].severity).toBe('WARNING');
    // invariant: not "complete" while any dimension pending
    expect(findings.some((f) => f.code === 'COMPLETENESS_COMPLETE')).toBe(false);

    // missing COMPLETENESS.md → all 8 dimensions pending (cardinality invariant)
    const empty = tmp();
    const res2 = runCli(['audit-completeness', empty]);
    const f2 = JSON.parse(res2.stdout).findings as Array<{ code: string }>;
    expect(f2.filter((f) => f.code === 'DIMENSION_PENDING')).toHaveLength(8);
  });

  it('ARCH005_06: all dimensions resolved → one COMPLETENESS_COMPLETE; short escape reason → WARNING_REASON_TOO_SHORT', () => {
    const dir = tmp();
    writeLedger(dir, {
      'internal-consistency': 'addressed | diagram synced',
      'flow-completeness': 'addressed | all flows listed',
      'compliance-privacy': 'out-of-scope | [skip-completeness-dimension: short]',
      'auth-secrets': 'addressed | signature auth',
      observability: 'addressed | system_errors table',
      'data-lifecycle': 'addressed | cleanup cron',
      'cost-quota': 'addressed | budget modelled',
      'deploy-ops': 'addressed | CI/CD documented',
    });
    const res = runCli(['audit-completeness', dir], { ARCHITECTURE_LOG_DIR: dir });
    expect(res.status).toBe(0);
    const findings = JSON.parse(res.stdout).findings as Array<{ code: string }>;
    // invariant: COMPLETENESS_COMPLETE appears at most once
    expect(findings.filter((f) => f.code === 'COMPLETENESS_COMPLETE')).toHaveLength(1);
    expect(findings.some((f) => f.code === 'DIMENSION_PENDING')).toBe(false);
    // reason "short" (5 chars) < 12 → WARNING_REASON_TOO_SHORT, and escape logged to sibling file
    expect(findings.some((f) => f.code === 'WARNING_REASON_TOO_SHORT')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'spec-completeness-escapes.jsonl'))).toBe(true);
  });

  it('ARCH005_07: addressed dimension with empty pointer → ADDRESSED_WITHOUT_POINTER (INFO, non-blocking)', () => {
    const dir = tmp();
    writeLedger(dir, {
      'internal-consistency': 'addressed | diagram synced',
      'flow-completeness': 'addressed | all flows listed',
      'compliance-privacy': 'addressed | ', // addressed but NO pointer cited
      'auth-secrets': 'addressed | signature auth',
      observability: 'addressed | system_errors table',
      'data-lifecycle': 'addressed | cleanup cron',
      'cost-quota': 'addressed | budget modelled',
      'deploy-ops': 'addressed | CI/CD documented',
    });
    const res = runCli(['audit-completeness', dir]);
    expect(res.status).toBe(0);
    const findings = JSON.parse(res.stdout).findings as Array<{
      code: string;
      severity: string;
      dimension_id?: string;
    }>;
    const noPtr = findings.filter((f) => f.code === 'ADDRESSED_WITHOUT_POINTER');
    expect(noPtr).toHaveLength(1);
    expect(noPtr[0].dimension_id).toBe('compliance-privacy');
    expect(noPtr[0].severity).toBe('INFO');
    // INFO does not block: the ledger is still "complete" (no pending dimensions)
    expect(findings.some((f) => f.code === 'COMPLETENESS_COMPLETE')).toBe(true);
    expect(findings.some((f) => f.code === 'DIMENSION_PENDING')).toBe(false);
  });
});

describe('ARCH007: synthesis / correction-log / context7 proof / selection policy', () => {
  // @feature14
  it('ARCH007_01: synthesis emits SYNTHESIS.md; insight needs ≥2 known axes (others rejected)', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'AXIS-hosting.md'), '---\naxis_id: hosting\nstatus: accepted\n---\n# Hosting\n');
    fs.writeFileSync(path.join(dir, 'AXIS-auth.md'), '---\naxis_id: auth\nstatus: accepted\n---\n# Auth\n');
    const insights = [
      { axes: ['hosting', 'auth'], title: 'n8n redundant', description: 'both on supabase', recommendation: 'drop n8n' },
      { axes: ['hosting'], title: 'single', description: 'x', recommendation: 'y' }, // <2 axes → rejected
      { axes: ['hosting', 'ghost'], title: 'bad ref', description: 'x', recommendation: 'y' }, // unknown axis → rejected
    ];
    const insPath = path.join(dir, 'insights.json');
    fs.writeFileSync(insPath, JSON.stringify(insights));
    const res = runCli(['synthesis', dir, insPath]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as { insights_count: number; rejected: unknown[] };
    expect(out.insights_count).toBe(1); // only the cross-axis one survives
    expect(out.rejected).toHaveLength(2);
    expect(fs.existsSync(path.join(dir, 'SYNTHESIS.md'))).toBe(true);
    const md = fs.readFileSync(path.join(dir, 'SYNTHESIS.md'), 'utf-8');
    expect(md).toContain('hosting');
    expect(md).toContain('auth'); // insight references ≥2 axis ids
  });

  // @feature15
  it('ARCH007_02: correction_log renders a Corrections section; empty → none', () => {
    const axisWith: AxisModel = {
      axis_id: 'x',
      axis_name: 'X',
      context: 'c',
      variants: [mkVariant({ id: 'a', name: 'A', is_recommended: true, correction_log: ['предполагал X → нашёл Y → исправил'] })],
    };
    expect(renderAxisMarkdown(axisWith)).toContain('Corrections');

    const axisWithout: AxisModel = {
      axis_id: 'x',
      axis_name: 'X',
      context: 'c',
      variants: [mkVariant({ id: 'a', name: 'A', is_recommended: true })],
    };
    expect(renderAxisMarkdown(axisWithout)).not.toContain('Corrections');
  });

  // @feature16
  it('ARCH007_03: VERIFIED-via-context7 marker → verified proof chip; no-match → unverified chip', () => {
    const mk = (bullet: string): AxisModel => ({
      axis_id: 'x',
      axis_name: 'X',
      context: 'c',
      variants: [mkVariant({ id: 'a', name: 'A', is_recommended: true, good: [bullet] })],
    });
    const verified = renderAxisHtml(mk('fast setup [VERIFIED via context7:supabase 2.x]'));
    expect(verified).toContain('class="proof v"');
    expect(verified).toContain('context7:supabase');
    // marker lifted OUT of raw bullet text (not left as inline [VERIFIED ...])
    expect(verified).not.toContain('[VERIFIED via context7');

    const unverified = renderAxisHtml(mk('maybe [UNVERIFIED — Context7 no match]'));
    expect(unverified).toContain('class="proof u"');
  });

  // @feature17
  it('ARCH007_04: selected policy flips recommended; demonstration table renders; unset → mvp-poc', () => {
    const variants: VariantModel[] = [
      mkVariant({ id: 'serverless', name: 'Serverless', is_recommended: true, policy_fit: ['mvp-poc', 'cost-optimal'] }),
      mkVariant({ id: 'k8s', name: 'Kubernetes', cost_chip: '$$$', policy_fit: ['production-grade', 'scale-ready'] }),
    ];
    const axis = (policy?: AxisModel['selected_policy']): AxisModel => ({
      axis_id: 'h',
      axis_name: 'Hosting',
      context: 'c',
      variants,
      selected_policy: policy,
    });
    const mvp = renderAxisMarkdown(axis('mvp-poc'));
    const prod = renderAxisMarkdown(axis('production-grade'));
    expect(mvp).toMatch(/^recommended: serverless$/m);
    expect(prod).toMatch(/^recommended: k8s$/m);
    expect(mvp).not.toEqual(prod); // policy actually changes the artefact
    // demonstration table (variant × policy) renders when policy_fit differs
    expect(mvp).toContain('Recommendation depends on goal');
    // unset policy defaults to mvp-poc
    expect(pickRecommended(axis(undefined))?.id).toBe('serverless');
  });
});

describe('ARCH008: two-lens artefact + decision economics (R24/R25)', () => {
  // @feature20
  it('ARCH008_01: renders business band + comparison matrix + reality section', () => {
    const axis: AxisModel = {
      axis_id: 'hosting',
      axis_name: 'Hosting',
      context: 'c',
      variants: [
        mkVariant({
          id: 'supabase',
          name: 'Supabase',
          is_recommended: true,
          business_summary: { gets: 'БД+auth+API', time_to_market: '1-2 дня', cost: '$0→$25', risk: 'lock-in' },
          scorecard: [
            { criterion: 'Лёгкость интеграции', verdict: 'good', value: 'из коробки' },
            { criterion: 'Vendor lock-in', verdict: 'bad', value: 'высокий' },
          ],
          reality_check: ['SSL — авто на свой домен', 'Бэкапы — pg_dump cron на free-плане'],
        }),
        mkVariant({
          id: 'vps',
          name: 'VPS',
          scorecard: [
            { criterion: 'Лёгкость интеграции', verdict: 'bad', value: 'всё руками' },
            { criterion: 'Vendor lock-in', verdict: 'good', value: 'нет' },
          ],
        }),
      ],
    };
    const html = renderAxisHtml(axis);
    expect(html).toContain('💼 Для бизнеса'); // business lens
    expect(html).toContain('Карта сравнения'); // comparison matrix (criteria × variants)
    expect(html).toContain('Лёгкость интеграции');
    expect(html).toContain('Реальность — что руками'); // reality-check section
  });

  // @feature21
  it('ARCH008_02: renders cost-at-scale ladder + time-costs + exit-cost + reversibility banner', () => {
    const axis: AxisModel = {
      axis_id: 'hosting',
      axis_name: 'Hosting',
      context: 'c',
      door_type: 'one-way',
      variants: [
        mkVariant({
          id: 'supabase',
          name: 'Supabase',
          is_recommended: true,
          cost_at_scale: [
            { tier: 'MVP/100', cost: '$0' },
            { tier: '10k', cost: '$25' },
            { tier: '100k', cost: '$300+' },
          ],
          time_costs: { to_market: '1-2 дня', to_feature: 'часы', to_test: 'встроено', to_support: '~2ч/мес' },
          exit_cost: 'Postgres легко, Auth+RLS ~2 нед',
        }),
      ],
    };
    const html = renderAxisHtml(axis);
    expect(html).toContain('Стоимость на масштабе'); // cost-at-scale ladder
    expect(html).toContain('$300+'); // top tier visible (MVP-cheap-then-explodes)
    expect(html).toContain('⏱ Время команды'); // time-costs block
    expect(html).toContain('class="exit"'); // exit-cost line
    expect(html).toContain('Необратимое решение'); // one-way door banner (reversibility)
  });
});

describe('ARCH009: full-report ARCHITECTURE.html (FR-19)', () => {
  // @feature22
  it('ARCH009_01: assembles one self-contained ARCHITECTURE.html via renderers (spawnSync CLI)', () => {
    const dir = tmp();
    const hosting: AxisModel = {
      axis_id: 'hosting',
      axis_name: 'Hosting',
      context: 'c',
      door_type: 'one-way',
      variants: [
        mkVariant({
          id: 'supabase',
          name: 'Supabase',
          is_recommended: true,
          business_summary: { gets: 'БД+auth', time_to_market: '1-2 дня', cost: '$0→$25', risk: 'lock-in' },
          scorecard: [
            { criterion: 'Лёгкость интеграции', verdict: 'good', value: 'из коробки' },
            { criterion: 'Vendor lock-in', verdict: 'bad', value: 'высокий' },
          ],
          reality_check: ['SSL авто на свой домен'],
        }),
        mkVariant({
          id: 'vps',
          name: 'VPS',
          scorecard: [
            { criterion: 'Лёгкость интеграции', verdict: 'bad', value: 'руками' },
            { criterion: 'Vendor lock-in', verdict: 'good', value: 'нет' },
          ],
        }),
      ],
    };
    const auth: AxisModel = {
      axis_id: 'auth',
      axis_name: 'Auth',
      context: 'c',
      variants: [mkVariant({ id: 'supabase-auth', name: 'Supabase Auth', is_recommended: true })],
    };
    // generate-axis persists AXIS-*.model.json (the source the full-report re-renders from)
    generateAxisArtefact(hosting, dir);
    generateAxisArtefact(auth, dir);
    fs.writeFileSync(
      path.join(dir, 'COMPLETENESS.md'),
      '| dimension | status | pointer |\n|---|---|---|\n| auth-secrets | addressed | Vault |\n',
    );
    const insPath = path.join(dir, 'insights.json');
    fs.writeFileSync(
      insPath,
      JSON.stringify([{ axes: ['hosting', 'auth'], title: 'n8n redundant', description: 'both supabase', recommendation: 'drop n8n' }]),
    );

    const res = runCli(['full-report', dir, insPath]);
    expect(res.status).toBe(0);
    const out = JSON.parse(res.stdout) as { axes_count: number; insights_count: number };
    expect(out.axes_count).toBe(2);
    expect(out.insights_count).toBe(1);

    const html = fs.readFileSync(path.join(dir, 'ARCHITECTURE.html'), 'utf-8');
    expect((html.match(/<!DOCTYPE/g) ?? []).length).toBe(1); // single self-contained doc
    expect(html).toContain('href="#axis-hosting"'); // index matrix anchors
    expect(html).toContain('id="axis-hosting"');
    expect(html).toContain('id="axis-auth"'); // every axis section present
    expect(html).toContain('💼 Для бизнеса'); // rich content inherited via renderAxisSection
    expect(html).toContain('Карта сравнения');
    expect(html).toContain('Необратимое решение'); // door banner inherited
    expect(html).toContain('Cross-axis synthesis'); // synthesis section
    expect(html).toContain('System completeness'); // completeness table
    expect(html).not.toMatch(/<link\b/); // self-contained
  });
});
