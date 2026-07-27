import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import {
  AIPOMOGATOR_DEEPSEEK_MODEL,
  OPENROUTER_DEEPSEEK_MODEL,
  loadConfig,
} from '../../tools/prompt-suggest/prompt_suggest_core.ts';
import { clearDeepSeekCatalogCache, selectAipomogatorDeepSeek } from '../../tools/_shared/deepseek-model.ts';
import { LEARNINGS_DEFAULT_MODEL } from '../../tools/learnings-capture/semantic.ts';
import { CLAUDE_MEM_DEEPSEEK_MODEL, INSTALL_ARGS } from '../../tools/claude-mem-bootstrap/install-claude-mem.ts';

interface DeepSeekWorld {
  deepSeekConfig?: ReturnType<typeof loadConfig>;
  deepSeekCatalog?: { data?: Array<{ id?: string }> };
  deepSeekSelected?: string | null;
  deepSeekScopedFiles?: string[];
  deepSeekWorkload?: {
    rubric: string[];
    rollout_without_product_results: string;
    sample: { input_tokens: number; output_tokens: number };
    baseline: { cost_usd: number };
    candidate: { cost_usd: number };
  };
}

const ROOT = process.env.APP_DIR || process.cwd();
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'haiku-to-deepseek-migration');
const scopedFiles = [
  'tools/_shared/deepseek-model.ts',
  'tools/prompt-suggest/prompt_suggest_core.ts',
  'tools/prompt-suggest/prompt_suggest_stop.bundle.mjs',
  'tools/claim-evidence-gate/meridian-judge.ts',
  'tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs',
  'tools/learnings-capture/semantic.ts',
  'tools/claude-mem-bootstrap/install-claude-mem.ts',
  '.claude/skills/cross-spec-reconcile/scripts/full-mode.ts',
  '.claude/skills/cross-spec-reconcile/references/semantic-judge-prompt.md',
  '.agents/skills/cross-spec-reconcile/scripts/full-mode.ts',
  '.agents/skills/cross-spec-reconcile/references/semantic-judge-prompt.md',
  '.claude/skills/meridian-model-call/SKILL.md',
  '.agents/skills/meridian-model-call/SKILL.md',
];

function withEnv<T>(changes: Record<string, string | undefined>, fn: () => T): T {
  const before = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(changes)) {
    before.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

Given<DeepSeekWorld>(/^prompt-suggest has no model override and uses "(OpenRouter|AiPomogator)" credentials$/, function (provider: string) {
  this.deepSeekConfig = withEnv({
    OPENROUTER_API_KEY: provider === 'OpenRouter' ? 'redacted' : undefined,
    AUTO_COMMIT_API_KEY: provider === 'AiPomogator' ? 'redacted' : undefined,
    PROMPT_SUGGEST_MODEL: undefined,
  }, loadConfig);
});

When<DeepSeekWorld>(/^the supported prompt-suggest configuration resolves its model$/, function () {
  assert.ok(this.deepSeekConfig?.llm);
});

Then<DeepSeekWorld>(/^the effective prompt-suggest model is "([^"]+)"$/, function (model: string) {
  assert.equal(this.deepSeekConfig?.llm?.model, model);
});

Given<DeepSeekWorld>(/^the producer-shaped AiPomogator catalog fixture "([^"]+)"$/, function (name: string) {
  this.deepSeekCatalog = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
});

When<DeepSeekWorld>(/^the DeepSeek route is selected from that catalog$/, async function () {
  clearDeepSeekCatalogCache();
  const payload = this.deepSeekCatalog;
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  try {
    this.deepSeekSelected = (await selectAipomogatorDeepSeek({
      baseUrl: 'https://aipomogator.ru/go/v1',
      apiKey: 'redacted',
      fetchImpl,
    })).model;
  } catch {
    this.deepSeekSelected = null;
  }
});

Then<DeepSeekWorld>(/^the selected route is exactly "([^"]+)" and came from the catalog$/, function (model: string) {
  assert.equal(this.deepSeekSelected, model);
  assert.ok(this.deepSeekCatalog?.data?.some((row) => row.id === model));
});

Then<DeepSeekWorld>(/^no model is selected and Haiku is not used as a fallback$/, function () {
  assert.equal(this.deepSeekSelected, null);
  assert.ok(this.deepSeekCatalog?.data?.every((row) => row.id !== this.deepSeekSelected));
});

Given<DeepSeekWorld>(/^the scoped active model-selection surfaces$/, function () {
  this.deepSeekScopedFiles = scopedFiles;
});

When<DeepSeekWorld>(/^their canonical and delivered artifacts are inspected$/, function () {
  for (const relative of this.deepSeekScopedFiles ?? []) assert.ok(fs.existsSync(path.join(ROOT, relative)), relative);
});

Then<DeepSeekWorld>(/^every direct OpenRouter default is "([^"]+)"$/, function (model: string) {
  assert.equal(OPENROUTER_DEEPSEEK_MODEL, model);
  const sharedPolicy = fs.readFileSync(path.join(ROOT, 'tools/_shared/deepseek-model.ts'), 'utf8');
  assert.match(sharedPolicy, new RegExp(model.replaceAll('/', '\\/')));
});

Then<DeepSeekWorld>(/^every routed AiPomogator default is "([^"]+)"$/, function (model: string) {
  assert.equal(AIPOMOGATOR_DEEPSEEK_MODEL, model);
  const sharedPolicy = fs.readFileSync(path.join(ROOT, 'tools/_shared/deepseek-model.ts'), 'utf8');
  assert.match(sharedPolicy, new RegExp(model.replaceAll('/', '\\/')));
});

Then<DeepSeekWorld>(/^the learning and claude-mem defaults use DeepSeek V4 Flash$/, function () {
  assert.equal(LEARNINGS_DEFAULT_MODEL, AIPOMOGATOR_DEEPSEEK_MODEL);
  assert.equal(CLAUDE_MEM_DEEPSEEK_MODEL, OPENROUTER_DEEPSEEK_MODEL);
  assert.ok(INSTALL_ARGS.includes('openrouter'));
  assert.ok(INSTALL_ARGS.includes(CLAUDE_MEM_DEEPSEEK_MODEL));
});

Then<DeepSeekWorld>(/^no scoped active selector contains a Haiku model ID$/, function () {
  for (const relative of this.deepSeekScopedFiles ?? []) {
    const content = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(content, /(?:anthropic\/claude-(?:3-)?haiku|claude-haiku-4-5-20251001)/i, relative);
  }
});

Then<DeepSeekWorld>(/^canonical sources and their generated or mirrored artifacts agree$/, function () {
  assert.equal(
    fs.readFileSync(path.join(ROOT, '.claude/skills/cross-spec-reconcile/scripts/full-mode.ts'), 'utf8'),
    fs.readFileSync(path.join(ROOT, '.agents/skills/cross-spec-reconcile/scripts/full-mode.ts'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(path.join(ROOT, '.claude/skills/meridian-model-call/SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(ROOT, '.agents/skills/meridian-model-call/SKILL.md'), 'utf8'),
  );
  for (const bundle of [
    'tools/prompt-suggest/prompt_suggest_stop.bundle.mjs',
    'tools/claim-evidence-gate/claim_evidence_gate_stop.bundle.mjs',
  ]) {
    const content = fs.readFileSync(path.join(ROOT, bundle), 'utf8');
    assert.match(content, /deepseek-v4-flash/);
    assert.doesNotMatch(content, /claude-(?:3-)?haiku|claude-haiku-4-5-20251001/i);
  }
});

Given<DeepSeekWorld>(/^the captured workload and pricing evidence$/, function () {
  this.deepSeekWorkload = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'workload-and-pricing.json'), 'utf8'));
});

When<DeepSeekWorld>(/^rollout readiness is evaluated without product workload results$/, function () {
  assert.ok(this.deepSeekWorkload);
});

Then<DeepSeekWorld>(/^the migration rollout decision is "([^"]+)"$/, function (decision: string) {
  assert.equal(this.deepSeekWorkload?.rollout_without_product_results, decision);
});

Then<DeepSeekWorld>(/^the rubric covers quality, failures, latency, and cost$/, function () {
  assert.deepEqual(this.deepSeekWorkload?.rubric, [
    'relevance', 'hallucination', 'russian_language_quality', 'format_and_length',
    'empty_or_malformed_rate', 'latency', 'cost',
  ]);
});

Then<DeepSeekWorld>(/^the historical costs remain context rather than current-price proof$/, function () {
  assert.equal(this.deepSeekWorkload?.sample.input_tokens, 842);
  assert.equal(this.deepSeekWorkload?.sample.output_tokens, 11);
  assert.equal(this.deepSeekWorkload?.baseline.cost_usd, 0.00022425);
  assert.equal(this.deepSeekWorkload?.candidate.cost_usd, 0.00007776);
});
