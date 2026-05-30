// Phase 6 BDD step definitions — architecture-research-workflow skill (FR-12).
//
// SPECGEN004_26 (7 stage outputs) — fully implemented.
// SPECGEN004_27 (rewind on new constraint) + SPECGEN004_28 (complexity
// heuristic falls through to research-workflow) — interactive prompts
// + create-spec integration land in tiny follow-ups; the step defs mark
// them PENDING with deferred-reason comments so the suite surfaces the
// scope explicitly.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initStageFiles, STAGES } from '../../.claude/skills/architecture-research-workflow/scripts/init.ts';
import { mergeStages } from '../../.claude/skills/architecture-research-workflow/scripts/merge.ts';
import type { V4World } from '../hooks/before-after.ts';

const THIS_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface ArchWorld extends V4World {
  archSlug?: string;
  initResult?: ReturnType<typeof initStageFiles>;
  mergeResult?: ReturnType<typeof mergeStages>;
}

Given(
  'the maintainer invokes `Skill\\({string})` with a feature description',
  function (this: ArchWorld, _skillName: string) {
    this.archSlug = 'arch-test-feature';
    // Stand in for a real Skill invocation — directly call the init script
    // the skill ships. The agent-flow part (the 7-stage conversation)
    // happens inside Claude Code; the file shape this scenario asserts is
    // what init + merge produce on disk.
    this.initResult = initStageFiles({ repoRoot: this.tempDir, slug: this.archSlug });
    // Seed each stage with a marker so the merged RESEARCH.md is testable.
    for (const stage of STAGES) {
      const file = path.join(this.initResult.dir, `${stage.num}-${stage.slug}.md`);
      fs.writeFileSync(
        file,
        `# Stage ${stage.num} — ${stage.title}\n\nMARKER-${stage.num}\n`,
      );
    }
  },
);

When('the skill completes all {int} stages', function (this: ArchWorld, _n: number) {
  assert.ok(this.archSlug, 'arch slug must be set');
  this.mergeResult = mergeStages({ repoRoot: this.tempDir, slug: this.archSlug });
});

Then(
  /^(\d+) stage output files are written to `\.specs\/\{slug\}\/\.architecture-research\/`$/,
  function (this: ArchWorld, count: string) {
    const n = parseInt(count, 10);
    const dir = path.join(this.tempDir, '.specs', this.archSlug!, '.architecture-research');
    const stageFiles = fs.readdirSync(dir).filter((f) => /^\d+-.+\.md$/.test(f));
    assert.equal(stageFiles.length, n);
    // And the merge step accounted for them all.
    assert.equal(this.mergeResult!.stagesIncluded, n);
  },
);

Then('files are committable \\(NOT in .gitignore)', function (this: ArchWorld) {
  // Repo's .gitignore must NOT exclude `.architecture-research/`. Read
  // the real .gitignore from the repo root (not the tempDir which has
  // no .gitignore).
  const realRepoRoot = path.resolve(THIS_FILE_DIR, '..', '..');
  const giPath = path.join(realRepoRoot, '.gitignore');
  if (!fs.existsSync(giPath)) return; // missing .gitignore → nothing excluded → ok
  const lines = fs.readFileSync(giPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    assert.ok(
      !trimmed.includes('.architecture-research'),
      `.gitignore must not exclude .architecture-research — found: "${trimmed}"`,
    );
  }
});

Then('final RESEARCH.md contains one Appendix per stage', function (this: ArchWorld) {
  const body = fs.readFileSync(this.mergeResult!.researchMdPath, 'utf8');
  for (const stage of STAGES) {
    assert.ok(
      body.includes(`Appendix — Stage ${stage.num}: ${stage.title}`),
      `RESEARCH.md missing appendix for stage ${stage.num}`,
    );
  }
});

// ─── SPECGEN004_27 — rewind audit trail (deferred) ──────────────────────

Given('Stage {int} has generated {int} architecture variants', function (_a: number, _b: number) {
  return 'pending';
});

When(
  'the user reveals a new constraint in Stage {int} decision Q&A loop',
  function (_a: number) {
    return 'pending';
  },
);

Then('the skill suggests `restart-from-stage {int}`', function (_a: number) {
  return 'pending';
});

Then(
  /^an audit-trail entry is recorded in `5-decisions-locked\.md` as `\[REWIND\] Stage \d+ → Stage \d+: <reason>`$/,
  function () {
    return 'pending';
  },
);

Then('a {int}-rewind hard limit prevents infinite loops', function (_a: number) {
  return 'pending';
});

// ─── SPECGEN004_28 — complexity heuristic (deferred) ────────────────────

Given(
  /^a small feature description \(single file change, no architecture decisions\)$/,
  function () {
    return 'pending';
  },
);

When('`create-spec` runs complexity heuristic detection', function () {
  return 'pending';
});

Then(
  /^the heuristic does NOT match \(no "архитектур"\/"v\\d\+"\/"rebuild" keywords AND <3 components\)$/,
  function () {
    return 'pending';
  },
);

Then(
  '`create-spec` invokes regular `Skill\\({string})` instead of `architecture-research-workflow`',
  function (_name: string) {
    return 'pending';
  },
);

Then('{int}-stage overhead is avoided', function (_n: number) {
  return 'pending';
});
