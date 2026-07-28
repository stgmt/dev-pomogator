import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKILL_PATH = path.join(ROOT, '.claude/skills/research-workflow/SKILL.md');

interface ResearchConstraintWorld {
  researchWorkflowSkill: string;
}

Given<ResearchConstraintWorld>(/^the canonical research-workflow skill is available$/, function () {
  assert.ok(fs.existsSync(SKILL_PATH), `missing ${SKILL_PATH}`);
  this.researchWorkflowSkill = fs.readFileSync(SKILL_PATH, 'utf8');
});

When<ResearchConstraintWorld>(/^its recommendation constraint contract is inspected$/, function () {
  assert.match(this.researchWorkflowSkill, /Hard constraints are eligibility gates/);
});

Then<ResearchConstraintWorld>(/^a candidate above EUR 200 is rejected before deep research$/, function () {
  assert.match(this.researchWorkflowSkill, /price ≤ €200/);
  assert.match(this.researchWorkflowSkill, /do not deep-research it/);
  assert.match(this.researchWorkflowSkill, /never pad with over-budget items/);
});

Then<ResearchConstraintWorld>(/^only candidates passing budget, region, and availability gates may be recommended$/, function () {
  assert.match(this.researchWorkflowSkill, /budget ceiling, currency, region,\s*availability/);
  assert.match(this.researchWorkflowSkill, /Re-check price and availability immediately before the recommendation/);
});

When<ResearchConstraintWorld>(/^its model-provider verification contract is inspected$/, function () {
  assert.match(this.researchWorkflowSkill, /Consumer credential contract/);
  assert.match(this.researchWorkflowSkill, /Precedence matrix/);
});

Then<ResearchConstraintWorld>(/^provider, endpoint, model namespace, credential source, and precedence are required$/, function () {
  for (const requirement of [
    /Provider\/model namespace/,
    /Consumer credential contract/,
    /Precedence matrix/,
    /exact base URL \+ protocol/,
  ]) assert.match(this.researchWorkflowSkill, requirement);
});

Then<ResearchConstraintWorld>(/^a credential-name mismatch is not classified as model unavailability$/, function () {
  assert.match(this.researchWorkflowSkill, /configuration incompatibility, а не «модель недоступна»/i);
  assert.match(this.researchWorkflowSkill, /configuration mismatch ≠ unsupported model/i);
});
