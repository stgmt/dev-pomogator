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
import {
  detectComplexity,
  type HeuristicResult,
} from '../../.claude/skills/create-spec/scripts/complexity-heuristic.ts';
import {
  decideRewind,
  appendRewindEntry,
  countRewinds,
  REWIND_LIMIT,
  type RewindDecision,
} from '../../.claude/skills/architecture-research-workflow/scripts/rewind-tracker.ts';
import type { V4World } from '../hooks/before-after.ts';

const THIS_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));

interface ArchWorld extends V4World {
  archSlug?: string;
  initResult?: ReturnType<typeof initStageFiles>;
  mergeResult?: ReturnType<typeof mergeStages>;
  heuristicPrompt?: string;
  heuristicResult?: HeuristicResult;
  rewindDecision?: RewindDecision;
  rewindToStage?: number;
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

// ─── SPECGEN004_27 — rewind audit trail. Wired to the real rewind-tracker. ──

Given('Stage {int} has generated {int} architecture variants', function (
  this: ArchWorld,
  stage: number,
  _variants: number,
) {
  this.archSlug = 'arch-rewind-feature';
  const dir = path.join(this.tempDir, '.specs', this.archSlug, '.architecture-research');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stage}-variants.md`), `# Stage ${stage}\n\n4 variants generated.\n`);
});

When(
  'the user reveals a new constraint in Stage {int} decision Q&A loop',
  function (this: ArchWorld, fromStage: number) {
    // A Stage-5 Q&A constraint rewinds to Stage 4 (variant generation).
    this.rewindToStage = fromStage - 1;
    this.rewindDecision = decideRewind({
      repoRoot: this.tempDir,
      slug: this.archSlug!,
      attempt: { fromStage, toStage: this.rewindToStage, reason: 'new constraint: must run fully offline' },
      now: new Date('2026-06-03T00:00:00Z'),
    });
    if (this.rewindDecision.allowed && this.rewindDecision.entry) {
      appendRewindEntry(this.tempDir, this.archSlug!, this.rewindDecision.entry);
    }
  },
);

Then('the skill suggests `restart-from-stage {int}`', function (this: ArchWorld, stage: number) {
  assert.ok(this.rewindDecision!.allowed, `rewind should be allowed: ${this.rewindDecision!.reason}`);
  assert.equal(stage, this.rewindToStage);
});

Then(
  /^an audit-trail entry is recorded in `5-decisions-locked\.md` as `\[REWIND\] Stage \d+ → Stage \d+: <reason>`$/,
  function (this: ArchWorld) {
    const file = path.join(
      this.tempDir, '.specs', this.archSlug!, '.architecture-research', '5-decisions-locked.md',
    );
    assert.ok(fs.existsSync(file), '5-decisions-locked.md must exist after a rewind');
    assert.match(fs.readFileSync(file, 'utf8'), /^\[REWIND\] Stage 5 → Stage 4: /m);
  },
);

Then('a {int}-rewind hard limit prevents infinite loops', function (this: ArchWorld, limit: number) {
  assert.equal(limit, REWIND_LIMIT);
  // Drive the tracker to the limit, then prove the next rewind is denied.
  while (countRewinds(this.tempDir, this.archSlug!) < REWIND_LIMIT) {
    const d = decideRewind({
      repoRoot: this.tempDir,
      slug: this.archSlug!,
      attempt: { fromStage: 5, toStage: 4, reason: 'another constraint' },
      now: new Date(),
    });
    if (d.allowed && d.entry) appendRewindEntry(this.tempDir, this.archSlug!, d.entry);
    else break;
  }
  const denied = decideRewind({
    repoRoot: this.tempDir,
    slug: this.archSlug!,
    attempt: { fromStage: 5, toStage: 4, reason: 'one too many' },
    now: new Date(),
  });
  assert.equal(denied.allowed, false, 'a rewind beyond the hard limit must be denied');
});

// ─── SPECGEN004_28 — complexity heuristic routes small features away from
//     the 7-stage architecture skill. Wired to the real detectComplexity().

Given(
  /^a small feature description \(single file change, no architecture decisions\)$/,
  function (this: ArchWorld) {
    // No architecture keyword (архитектур/rebuild/redesign/v\d+) and no
    // PascalCase component nouns ⇒ below the ≥3-component threshold.
    this.heuristicPrompt = 'add a loading spinner to the submit button when it is clicked';
  },
);

When('`create-spec` runs complexity heuristic detection', function (this: ArchWorld) {
  this.heuristicResult = detectComplexity(this.heuristicPrompt!);
});

Then(
  /^the heuristic does NOT match \(no "архитектур"\/"v\\d\+"\/"rebuild" keywords AND <3 components\)$/,
  function (this: ArchWorld) {
    const r = this.heuristicResult!;
    assert.equal(r.keywordHits.length, 0, `expected no architecture keywords, got ${JSON.stringify(r.keywordHits)}`);
    assert.ok(r.components.length < 3, `expected <3 component nouns, got ${JSON.stringify(r.components)}`);
    assert.equal(r.verdict, 'use-research-workflow');
  },
);

Then(
  '`create-spec` invokes regular `Skill\\({string})` instead of `architecture-research-workflow`',
  function (this: ArchWorld, name: string) {
    // The verdict routes to the lighter skill — and the scenario names it.
    assert.equal(name, 'research-workflow');
    assert.equal(this.heuristicResult!.verdict, 'use-research-workflow');
  },
);

Then('{int}-stage overhead is avoided', function (this: ArchWorld, _n: number) {
  // The heavy N-stage architecture skill is only entered on the architecture
  // verdict; a research-workflow verdict skips it entirely.
  assert.notEqual(this.heuristicResult!.verdict, 'use-architecture-research-workflow');
});
