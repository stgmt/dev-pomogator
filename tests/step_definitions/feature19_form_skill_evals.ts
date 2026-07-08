/**
 * @feature19 step definitions — P16-2 executable evals for form-filler skills.
 *
 * These scenarios spawn the REAL eval runners for discovery-forms,
 * requirements-chk-matrix, and task-board-forms. The runners in turn exercise
 * the REAL spec-form-parsers CLI plus form-guards-dispatch, including negative
 * pins for the P16-1 deadlock regressions.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');

const FORM_SKILL_EVAL_RUNNERS: Record<string, string> = {
  'discovery-forms': '.claude/skills/discovery-forms/evals/run-evals.ts',
  'requirements-chk-matrix': '.claude/skills/requirements-chk-matrix/evals/run-evals.ts',
  'task-board-forms': '.claude/skills/task-board-forms/evals/run-evals.ts',
};

interface FormSkillEvalAggregate {
  skill_name: string;
  total: number;
  passed: number;
  failed: number;
  details: Array<{
    name: string;
    category: string;
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; actual: string }>;
    failures: string[];
  }>;
}

interface FormSkillEvalWorld extends V4World {
  formSkillName?: string;
  formEvalResult?: { status: number | null; stdout: string; stderr: string };
  formEvalAggregate?: FormSkillEvalAggregate;
}

function runEvalRunner(skillName: string): { status: number | null; stdout: string; stderr: string } {
  const runner = FORM_SKILL_EVAL_RUNNERS[skillName];
  assert.ok(runner, `unknown form skill eval runner: ${skillName}`);
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', runner, '--json'], {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    encoding: 'utf-8',
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

Given(/^the (discovery-forms|requirements-chk-matrix|task-board-forms) executable eval runner$/, function (this: FormSkillEvalWorld, skillName: string) {
  const runner = path.join(REPO_ROOT, FORM_SKILL_EVAL_RUNNERS[skillName]);
  assert.equal(fs.existsSync(runner), true, `${skillName} eval runner must exist at ${runner}`);
  this.formSkillName = skillName;
});

When(/^that form-skill eval runner executes$/, function (this: FormSkillEvalWorld) {
  assert.ok(this.formSkillName, 'form skill name must be set by Given');
  this.formEvalResult = runEvalRunner(this.formSkillName);
  assert.equal(
    this.formEvalResult.status,
    0,
    `${this.formSkillName} eval runner failed\nstdout:\n${this.formEvalResult.stdout}\nstderr:\n${this.formEvalResult.stderr}`,
  );
  this.formEvalAggregate = JSON.parse(this.formEvalResult.stdout) as FormSkillEvalAggregate;
});

Then(/^the eval aggregate is fully green and every case exercised the real form contracts$/, function (this: FormSkillEvalWorld) {
  const aggregate = this.formEvalAggregate!;
  assert.equal(aggregate.skill_name, this.formSkillName);
  assert.equal(aggregate.failed, 0, JSON.stringify(aggregate.details.filter((d) => !d.passed), null, 2));
  assert.equal(aggregate.passed, aggregate.total);
  assert.ok(aggregate.total >= 6, 'manifest-sync + behavioural cases must be present');

  const allChecks = aggregate.details.flatMap((detail) => detail.checks.map((check) => `${detail.name}: ${check.name}`));
  assert.ok(
    allChecks.some((name) => /spec-form-parsers --check/.test(name)),
    `expected a real spec-form-parsers --check invocation, got ${allChecks.join('\n')}`,
  );
  assert.ok(
    allChecks.some((name) => /form-guard|requirements-chk-guard|task-form-guard|user-story-form-guard|risk-assessment-guard|design-decision-guard/.test(name)),
    `expected a real form guard/dispatcher check, got ${allChecks.join('\n')}`,
  );
});

Then(/^the eval aggregate pins the P16-1 negative regression cases$/, function (this: FormSkillEvalWorld) {
  const aggregate = this.formEvalAggregate!;
  const names = aggregate.details.map((detail) => detail.name);
  if (this.formSkillName === 'requirements-chk-matrix') {
    assert.ok(names.includes('negative-invalid-nfr-chk-id-is-denied'), `missing CHK-FR{n}-NFR negative pin: ${names.join(', ')}`);
    const detail = aggregate.details.find((item) => item.name === 'negative-invalid-nfr-chk-id-is-denied')!;
    assert.ok(detail.checks.some((check) => /rejects invalid output|denies invalid output/.test(check.name) && check.passed));
  }
  if (this.formSkillName === 'task-board-forms') {
    assert.ok(names.includes('negative-lowercase-markers-are-denied'), `missing lowercase marker negative pin: ${names.join(', ')}`);
    const detail = aggregate.details.find((item) => item.name === 'negative-lowercase-markers-are-denied')!;
    assert.ok(detail.checks.some((check) => /rejects invalid output|denies invalid output/.test(check.name) && check.passed));
  }
});
