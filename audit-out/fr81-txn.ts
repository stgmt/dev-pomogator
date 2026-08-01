/**
 * FR-81 via apply_spec_transaction (FR+Story+Design+AC all-or-nothing).
 * Run: node --import tsx audit-out/fr81-txn.ts
 */
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';
import type { SpecGraph } from '../tools/spec-graph/types.ts';

const SPEC = 'spec-generator-v4';
const REASON =
  'FR-81 Cursor compat-first txn [skip-spec-steer: fr81 authoring via door]';

async function main(): Promise<void> {
  let cached: SpecGraph | undefined;
  const getGraph = (): SpecGraph =>
    (cached ??= buildGraph({ repoRoot: process.cwd(), skipNdjson: true }));
  const registry = buildToolRegistry(getGraph, {
    refreshGraph: () => {
      cached = undefined;
    },
  });

  const tool = registry.find((t) => t.name === 'apply_spec_transaction');
  if (!tool) throw new Error('apply_spec_transaction missing');

  const edits = [
    {
      spec: SPEC,
      doc: 'FR.md',
      section: {
        kind: 'insert_at_eof' as const,
        text: `

## FR-81

**Cursor IDE host compatibility (compat-first — one MCP path twin)**

Claude Code remains the canonical install (marketplace plugin / repo dogfood: skills, hooks, root \`.mcp.json\`). Cursor SHALL be a second client of the **same** SpecGraph MCP door without a second skill/hook tree or Cursor marketplace package.

- **FR-81a (native pickup):** Cursor SHALL consume project \`.claude/skills/\` and, when Third-party skills/hooks are enabled, project \`.claude/settings.json\` hooks (including Claude nested \`permissionDecision\` JSON and exit code 2). SHALL NOT require mirrored \`.cursor/skills\` or \`.cursor/hooks.json\` for day-1 door use.
- **FR-81b (MCP registration glue):** The project SHALL ship \`.cursor/mcp.json\` whose \`dev-pomogator-specs\` entry launches the same \`tools/spec-mcp-server/server.bundle.mjs\` as root \`.mcp.json\`. \`DEV_POMOGATOR_REPO_ROOT\` / \`resolveRepoRoot\` SHALL tolerate Cursor env and an unexpanded \`\${CLAUDE_PROJECT_DIR}\` literal by falling back to a cwd that contains \`.specs/\`.
- **FR-81c (split proof):** Deterministic suite evidence covers file presence, JSON door-entry parity, and \`resolveRepoRoot\`. Live Cursor dogfood (manual evidence) covers MCP tool catalog visibility, enforce deny on raw \`.specs/**\` Write/Edit when enforce is on, and successful MCP mutation. Suite MUST NOT fake-green the live ACs.
- **FR-81d (non-goals):** No Cursor marketplace plugin; FR-41 phase spawn remains \`claude -p\` (usable from Cursor only if Claude CLI is on PATH); no new skill wrapper (user entry remains create-spec / README).
- **FR-81e (drift):** Root \`.mcp.json\` and \`.cursor/mcp.json\` \`dev-pomogator-specs\` entries SHALL stay content-equivalent (BDD parity; helper \`tools/spec-mcp-server/ensure-cursor-mcp.ts\`).
- **FR-81f (known host gaps):** Document that Claude matcher \`Glob\` may not fire under Cursor third-party tool maps and Claude \`mcp__…\` matchers may not bind Cursor MCP call names. Day-1 smoke focuses Write/Edit/Read/Shell. Cursor loads project settings.json, not plugin hooks.json.
- **FR-81g (install contract):** Installing for Claude Code SHALL remain unchanged. Enabling Cursor on the same tree SHALL require at most \`.cursor/mcp.json\` plus Settings → Third-party skills/hooks. This repo SHALL commit the twin for dogfood. Consumer projects MAY copy the twin or run doctor warn/apply (\`ensure-cursor-mcp.ts\`) — not a second distribution channel.

**Зависит от:** FR-4, FR-14, FR-39.
**Связанные AC:** [AC-81.1](ACCEPTANCE_CRITERIA.md#ac-811), [AC-81.2](ACCEPTANCE_CRITERIA.md#ac-812), [AC-81.3](ACCEPTANCE_CRITERIA.md#ac-813), [AC-81.4](ACCEPTANCE_CRITERIA.md#ac-814), [AC-81.5](ACCEPTANCE_CRITERIA.md#ac-815), [AC-81.6](ACCEPTANCE_CRITERIA.md#ac-816)
**Use Case:** [UC-33](USE_CASES.md#uc-33)
**User Story:** [User Story 61](USER_STORIES.md#user-story-61-cursor-uses-the-same-spec-door-priority-p1)
`,
      },
    },
    {
      spec: SPEC,
      doc: 'USER_STORIES.md',
      section: {
        kind: 'insert_at_eof' as const,
        text: `

### User Story 61: Cursor uses the same spec door (Priority: P1)

**Требование:** [FR-81](FR.md#fr-81)

As a developer using Cursor on a project that already has Claude Code / \`.claude\` dogfood, I want the same SpecGraph MCP door without porting skills or hooks, so that I can author and gate specs from either IDE.

**Why:** Dual-host rewrite would drift; Cursor already loads \`.claude/skills\` and project hooks — only the MCP path layout differs.

**Independent Test:** With Third-party skills/hooks enabled and \`.cursor/mcp.json\` present, Cursor lists \`dev-pomogator-specs\` tools; create-spec skill is discoverable from \`.claude/skills\`; raw Write under \`.specs/\` is denied when enforce is on and MCP apply succeeds.

**Acceptance Scenarios:**

Given the project has \`.claude/skills/create-spec\` and root \`.mcp.json\` door
When Cursor loads the workspace with Third-party skills enabled
Then create-spec (or equivalent) is available without a \`.cursor/skills\` copy

Given \`.cursor/mcp.json\` registers \`dev-pomogator-specs\`
When the Cursor MCP catalog is inspected after reload
Then the door tools are listed

Given SPEC_ACCESS enforce is on and project hooks loaded
When the agent attempts a raw Write to a \`.specs/**\` path
Then the PreToolUse guard denies and points to MCP mutation tools
`,
      },
    },
    {
      spec: SPEC,
      doc: 'DESIGN.md',
      section: {
        kind: 'insert_at_eof' as const,
        text: `

### Decision: Claude Code canonical host; Cursor second client via official compat + MCP path glue

**Требование:** [FR-81](FR.md#fr-81)

**Rationale:** Cursor natively loads \`.claude/skills/\` and (with Third-party toggle) \`.claude/settings.json\` hooks, including Claude deny JSON. The only layout mismatch is MCP config path: Claude/plugin use root \`.mcp.json\`; Cursor reads \`.cursor/mcp.json\`. Shipping a content-equivalent twin plus \`ensure-cursor-mcp.ts\` / doctor warn avoids forking skills, hooks, or the SpecGraph server.

**Trade-off:** Live enforce/MCP catalog proof stays manual dogfood (Docker cannot drive Cursor UI). Matcher gaps (Glob / \`mcp__\` names) are documented rather than silently claimed as full FR-39 parity.

**Alternatives considered:**
- Mirror skills/hooks under \`.cursor/\`: rejected — drifts from Claude SoT and duplicates maintenance.
- Cursor marketplace plugin: rejected — Anthropic plugin.json is not Cursor's install channel; overkill for one path adapter.
- Rewrite FR-41 to Cursor Task agents: deferred — hybrid (phases in Claude Code, day-to-day door in Cursor) is enough for FR-81.
`,
      },
    },
    {
      spec: SPEC,
      doc: 'ACCEPTANCE_CRITERIA.md',
      section: {
        kind: 'insert_at_eof' as const,
        text: `

## AC-81.1
**Требование:** [FR-81](FR.md#fr-81)
WHEN Cursor loads a project with \`.claude/skills/\` and Third-party skills enabled THEN the agent SHALL discover the same spec skills without a \`.cursor/skills\` mirror (live dogfood evidence).

## AC-81.2
**Требование:** [FR-81](FR.md#fr-81)
WHEN the repository is checked out THEN \`.cursor/mcp.json\` SHALL exist and its \`dev-pomogator-specs\` entry SHALL launch \`tools/spec-mcp-server/server.bundle.mjs\` (deterministic).

## AC-81.3
**Требование:** [FR-81](FR.md#fr-81)
WHEN Cursor has loaded project \`.claude/settings.json\` hooks and SPEC_ACCESS enforce is on THEN a raw Write/Edit of \`.specs/**\` SHALL be denied (live dogfood evidence).

## AC-81.4
**Требование:** [FR-81](FR.md#fr-81)
WHEN the Cursor MCP door is loaded THEN \`apply_spec_change\` / \`create_spec\` SHALL succeed for a valid mutation (live dogfood evidence).

## AC-81.5
**Требование:** [FR-81](FR.md#fr-81)
WHEN root \`.mcp.json\` and \`.cursor/mcp.json\` are compared THEN their \`dev-pomogator-specs\` entries SHALL be content-equivalent (deterministic; \`ensure-cursor-mcp.ts --check\`).

## AC-81.6
**Требование:** [FR-81](FR.md#fr-81)
WHEN documenting or performing install THEN Claude Code install SHALL be unchanged and Cursor enablement SHALL require at most \`.cursor/mcp.json\` plus the Third-party toggle — not a second marketplace package or duplicated skills/hooks.
`,
      },
    },
    {
      spec: SPEC,
      doc: 'USE_CASES.md',
      section: {
        kind: 'insert_at_eof' as const,
        text: `

## UC-33

**Cursor second-client install and door smoke**

**Goal:** enable Cursor on a tree that already has Claude Code / \`.claude\` without a second plugin.

**Trigger:** Developer opens the repo in Cursor after Claude Code dogfood or plugin install.

**Main flow:**

1. Confirm Claude Code install is unchanged (skills/hooks/root \`.mcp.json\`).
2. Enable Cursor Settings → Third-party skills/hooks.
3. Ensure \`.cursor/mcp.json\` exists (committed twin, \`ensure-cursor-mcp.ts\`, or copy from root \`.mcp.json\`).
4. Reload Cursor; verify MCP catalog includes \`dev-pomogator-specs\`.
5. Smoke: MCP read/\`get_spec_status\`; under enforce, raw \`.specs\` Write denied; MCP \`apply_spec_change\` succeeds.

**Outcome:** One door, two hosts; install delta is one MCP file + toggle.

**Linked stories:** [User Story 61](USER_STORIES.md#user-story-61-cursor-uses-the-same-spec-door-priority-p1)
`,
      },
    },
  ];

  const result = await tool.handler({ edits, reason: REASON } as never);
  const text = (result as { content: Array<{ text: string }> }).content[0].text;
  const parsed = JSON.parse(text);
  console.log(JSON.stringify(parsed, null, 2).slice(0, 8000));
  if (!parsed.ok) process.exit(1);

  // Follow-up single-doc patches that now have FR-81 anchors
  const applyTool = registry.find((t) => t.name === 'apply_spec_change')!;
  async function apply(doc: string, old_string: string, new_string: string): Promise<void> {
    const r = await applyTool.handler({
      spec: SPEC,
      doc,
      old_string,
      new_string,
      reason: REASON,
    } as never);
    const p = JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);
    if (!p.ok) {
      console.error('FAIL', doc, JSON.stringify(p, null, 2).slice(0, 3000));
      throw new Error('apply failed');
    }
    console.log('OK apply', doc);
  }

  await apply(
    'FR.md',
    '- `claude` CLI must be installed in each env where Claude Code runs (documented in onboard-repo flow)',
    '- `claude` CLI must be installed in each env where Claude Code runs (documented in onboard-repo flow)\n- Cursor IDE is a supported second agent host for the same SpecGraph/MCP door when project `.claude/` is present and `.cursor/mcp.json` registers the door (see [FR-81](#fr-81)); Claude Code remains the canonical plugin distribution channel',
  );
  await apply(
    'FR.md',
    '- **FR-39d (хук живой, не мёртвый):** `spec-access-guard` SHALL быть зарегистрирован в ОБОИХ манифестах (`.claude/settings.json` + `.claude-plugin/hooks.json`), пройти deps-absent прогон, попасть в поимённый пин SPECGEN004_52 и в PROTECTED_HOOKS meta-guard-а — урок пяти мёртвых стражей (P16-1) кодируется требованием.',
    '- **FR-39d (хук живой, не мёртвый):** `spec-access-guard` SHALL быть зарегистрирован в ОБОИХ манифестах (`.claude/settings.json` + `.claude-plugin/hooks.json`), пройти deps-absent прогон, попасть в поимённый пин SPECGEN004_52 и в PROTECTED_HOOKS meta-guard-а — урок пяти мёртвых стражей (P16-1) кодируется требованием. Cursor third-party hooks load the **project** `.claude/settings.json` (not `.claude-plugin/hooks.json`); dogfood therefore depends on project settings remaining present (see [FR-81](#fr-81) / FR-81f).',
  );

  await apply(
    'README.md',
    `## TL;DR — что умеет уже сегодня

Один MCP-сервер + 8 авто-резолверов + детектор cross-spec несоответствий + LSP wiki-links + hooks которые блокируют поломанные правки до save. Цель — **AI агент видит весь спек целиком за один вызов и не галлюцинирует над спеками**.

\`\`\`bash
# В Claude Code:
/spec-backlog              # посмотреть очередь несоответствий
/cross-spec-reconcile      # запустить full детектор
/cross-spec-resolve        # interactive walker по findings
\`\`\`
`,
    `## TL;DR — что умеет уже сегодня

Один MCP-сервер + 8 авто-резолверов + детектор cross-spec несоответствий + LSP wiki-links + hooks которые блокируют поломанные правки до save. Цель — **AI агент видит весь спек целиком за один вызов и не галлюцинирует над спеками**.

**Hosts:** Claude Code = canonical plugin install. Cursor = same \`.claude/\` tree (native skill/hook pickup) + one twin file \`.cursor/mcp.json\` (FR-81). No second skill/hook mirror.

\`\`\`bash
# В Claude Code:
/spec-backlog              # посмотреть очередь несоответствий
/cross-spec-reconcile      # запустить full детектор
/cross-spec-resolve        # interactive walker по findings
\`\`\`

### Cursor install checklist (FR-81)

1. Claude Code plugin or repo dogfood (unchanged).
2. Cursor Settings → enable Third-party skills/hooks.
3. Ensure \`.cursor/mcp.json\` (committed here, or \`node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts\`).
4. Reload Cursor → MCP list shows \`dev-pomogator-specs\`.
5. Smoke: MCP read / \`get_spec_status\`; under enforce, raw Write to \`.specs/\` denied.
`,
  );

  await apply(
    'CHANGELOG.md',
    `# Changelog

## 2026-07-28 — Systematic AI-agent planner specified
`,
    `# Changelog

## 2026-07-31 — FR-81 Cursor compat-first (spec + twin MCP file)

- Spec: FR-81 / US-61 / UC-33 / AC-81.1–6 / DESIGN decision / Phase 46 tasks / SPECGEN004_665–669.
- Dogfood: committed \`.cursor/mcp.json\` twin of root door; \`ensure-cursor-mcp.ts\` + doctor C33 warn/apply hint.
- Deterministic scenarios 665–667; live 668–669 remain evidence-pending (not suite-green).

## 2026-07-28 — Systematic AI-agent planner specified
`,
  );

  console.log('FR-81 txn + follow-ups done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
