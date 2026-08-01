/**
 * FR-81 remaining docs: README, CHANGELOG, feature, TASKS, FILE_CHANGES, REQUIREMENTS.
 * Run: node --import tsx audit-out/fr81-rest.ts
 */
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';
import type { SpecGraph } from '../tools/spec-graph/types.ts';

const SPEC = 'spec-generator-v4';
const REASON =
  'FR-81 Cursor compat remaining docs [skip-spec-steer: fr81 authoring via door]';

async function main(): Promise<void> {
  let cached: SpecGraph | undefined;
  const getGraph = (): SpecGraph =>
    (cached ??= buildGraph({ repoRoot: process.cwd(), skipNdjson: true }));
  const registry = buildToolRegistry(getGraph, {
    refreshGraph: () => {
      cached = undefined;
    },
  });

  async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tool = registry.find((t) => t.name === name);
    if (!tool) throw new Error(`missing ${name}`);
    const result = await tool.handler(args as never);
    const parsed = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
    if (!parsed.ok) {
      console.error(`FAIL ${name}`, JSON.stringify(parsed, null, 2).slice(0, 4000));
      throw new Error(`${name} failed`);
    }
    console.log(`OK ${name} ${String(args.doc ?? '')}`);
    return parsed;
  }

  // README — replace unique short anchor
  await call('apply_spec_change', {
    spec: SPEC,
    doc: 'README.md',
    old_string:
      'Цель — **AI агент видит весь спек целиком за один вызов и не галлюцинирует над спеками**.\n\n```bash\n# В Claude Code:\n/spec-backlog              # посмотреть очередь несоответствий\n/cross-spec-reconcile      # запустить full детектор\n/cross-spec-resolve        # interactive walker по findings\n```\n\n---',
    new_string:
      'Цель — **AI агент видит весь спек целиком за один вызов и не галлюцинирует над спеками**.\n\n**Hosts:** Claude Code = canonical plugin install. Cursor = same `.claude/` tree (native skill/hook pickup) + one twin file `.cursor/mcp.json` (FR-81). No second skill/hook mirror.\n\n```bash\n# В Claude Code:\n/spec-backlog              # посмотреть очередь несоответствий\n/cross-spec-reconcile      # запустить full детектор\n/cross-spec-resolve        # interactive walker по findings\n```\n\n### Cursor install checklist (FR-81)\n\n1. Claude Code plugin or repo dogfood (unchanged).\n2. Cursor Settings → enable Third-party skills/hooks.\n3. Ensure `.cursor/mcp.json` (committed here, or `node --import tsx tools/spec-mcp-server/ensure-cursor-mcp.ts`).\n4. Reload Cursor → MCP list shows `dev-pomogator-specs`.\n5. Smoke: MCP read / `get_spec_status`; under enforce, raw Write to `.specs/` denied.\n\n---',
    reason: REASON,
  });

  await call('apply_spec_change', {
    spec: SPEC,
    doc: 'CHANGELOG.md',
    old_string: '# Changelog\n\n## 2026-07-28 — Systematic AI-agent planner specified',
    new_string:
      '# Changelog\n\n## 2026-07-31 — FR-81 Cursor compat-first (spec + twin MCP file)\n\n- Spec: FR-81 / US-61 / UC-33 / AC-81.1–6 / DESIGN decision / Phase 46 tasks / SPECGEN004_665–669.\n- Dogfood: committed `.cursor/mcp.json` twin of root door; `ensure-cursor-mcp.ts` + doctor C33 warn/apply hint.\n- Deterministic scenarios 665–667; live 668–669 remain evidence-pending (not suite-green).\n\n## 2026-07-28 — Systematic AI-agent planner specified',
    reason: REASON,
  });

  await call('insert_at_eof', {
    spec: SPEC,
    doc: 'spec-generator-v4.feature',
    text: `

@feature81 @FR-81 @AC-81.2
Scenario: SPECGEN004_665 Cursor mcp twin file ships the door bundle
  Given the repository root contains ".cursor/mcp.json"
  When the Cursor MCP config is loaded
  Then it names the "dev-pomogator-specs" server
  And the launch path includes "tools/spec-mcp-server/server.bundle.mjs"

@feature81 @FR-81 @AC-81.5
Scenario: SPECGEN004_666 root and Cursor door entries stay equivalent
  Given root ".mcp.json" and ".cursor/mcp.json" both declare "dev-pomogator-specs"
  When ensure-cursor-mcp runs with "--check"
  Then it exits 0 reporting the door entries match

@feature81 @FR-81 @AC-81.2
Scenario: SPECGEN004_667 resolveRepoRoot tolerates Cursor-like placeholder env
  Given DEV_POMOGATOR_REPO_ROOT is the literal "\${CLAUDE_PROJECT_DIR}"
  And process.cwd() is a directory that contains ".specs"
  When resolveRepoRoot runs
  Then it returns the cwd that contains ".specs"

@feature81 @FR-81 @AC-81.1 @AC-81.4
Scenario: SPECGEN004_668 Cursor session lists the MCP door
  Given Cursor Third-party skills are enabled and ".cursor/mcp.json" is loaded
  When the agent inspects the MCP tool catalog
  Then "dev-pomogator-specs" tools are listed
  # Live dogfood — pending manual evidence; not suite-green until recorded

@feature81 @FR-81 @AC-81.3 @AC-81.4
Scenario: SPECGEN004_669 Cursor enforce denies raw specs write and MCP apply succeeds
  Given SPEC_ACCESS enforce is on and project ".claude/settings.json" hooks are loaded in Cursor
  When the agent attempts a raw Write under ".specs/"
  Then the PreToolUse guard denies the write
  And a valid MCP apply_spec_change succeeds
  # Live dogfood — pending manual evidence; not suite-green until recorded
`,
    reason: REASON,
  });

  await call('insert_at_eof', {
    spec: SPEC,
    doc: 'TASKS.md',
    text: `

## Phase 46 — Cursor compat-first (FR-81)

- [ ] Ship Cursor MCP twin — id: p46-cursor-mcp-twin — Status: TODO | Est: 60m
  _Requirements: [FR-81](FR.md#fr-81)_
  _Acceptance: AC-81.2, AC-81.5, AC-81.6_
  **Files:** \`.cursor/mcp.json\`, \`tools/spec-mcp-server/ensure-cursor-mcp.ts\`, \`.claude/skills/pomogator-doctor/scripts/engine/checks/cursor-mcp-twin.ts\`
  **Done When:**
  - [ ] \`.cursor/mcp.json\` matches root \`dev-pomogator-specs\` entry
  - [ ] \`ensure-cursor-mcp.ts --check\` exits 0
  - [ ] Doctor C33 warns when twin missing and hints apply command
  - [ ] Docker BDD records SPECGEN004_665 and SPECGEN004_666

- [ ] resolveRepoRoot Cursor env smoke — id: p46-cursor-repo-root — Status: TODO | Est: 45m
  _Requirements: [FR-81](FR.md#fr-81)_
  _Acceptance: AC-81.2_
  _depends: hard:p46-cursor-mcp-twin_
  **Files:** \`tools/spec-mcp-server/server.ts\`, \`tests/step_definitions/feature81_cursor_compat.ts\`
  **Done When:**
  - [ ] SPECGEN004_667 passes against real \`resolveRepoRoot\`

- [ ] Cursor live dogfood evidence — id: p46-cursor-live-dogfood — Status: TODO | Est: 90m
  _Requirements: [FR-81](FR.md#fr-81)_
  _Acceptance: AC-81.1, AC-81.3, AC-81.4_
  _depends: hard:p46-cursor-mcp-twin_
  **Files:** \`README.md\` checklist, \`CHANGELOG.md\` evidence note
  **Done When:**
  - [ ] Manual evidence recorded for SPECGEN004_668 and SPECGEN004_669 (not claimed via suite-green alone)
`,
    reason: REASON,
  });

  await call('insert_at_eof', {
    spec: SPEC,
    doc: 'FILE_CHANGES.md',
    text: `

## Phase 46 — Cursor compat-first (FR-81)

| Path | Action | Reason |
|------|--------|--------|
| \`.cursor/mcp.json\` | create | Cursor path-layout twin of root door ([FR-81](FR.md#fr-81)) |
| \`tools/spec-mcp-server/ensure-cursor-mcp.ts\` | create | Sync/check twin vs root ([FR-81](FR.md#fr-81) e/g) |
| \`.claude/skills/pomogator-doctor/scripts/engine/checks/cursor-mcp-twin.ts\` | create | Doctor C33 warn + apply hint ([FR-81](FR.md#fr-81) g) |
| \`.claude/skills/pomogator-doctor/scripts/engine/checks/index.ts\` | edit | Register C33 |
| \`tests/step_definitions/feature81_cursor_compat.ts\` | create | Deterministic SPECGEN004_665–667 steps |
| \`README.md\` (spec) | edit | Host note + Cursor install checklist |
`,
    reason: REASON,
  });

  // CHK rows — append near end of matrix table if possible via insert_at_eof
  await call('insert_at_eof', {
    spec: SPEC,
    doc: 'REQUIREMENTS.md',
    text: `
| CHK-FR81-01 | FR-81 Cursor skills native pickup via AC-81.1 | FR-81, AC-81.1, @feature81, UC-33 | Live dogfood | Draft | Third-party toggle |
| CHK-FR81-02 | FR-81 .cursor/mcp.json ships door via AC-81.2 | FR-81, AC-81.2, @feature81, SPECGEN004_665 | BDD scenario | Draft | Deterministic |
| CHK-FR81-03 | FR-81 enforce deny raw specs write via AC-81.3 | FR-81, AC-81.3, @feature81, SPECGEN004_669 | Live dogfood | Draft | Pending evidence |
| CHK-FR81-04 | FR-81 MCP apply succeeds via AC-81.4 | FR-81, AC-81.4, @feature81, SPECGEN004_668 | Live dogfood | Draft | Pending evidence |
| CHK-FR81-05 | FR-81 mcp.json parity via AC-81.5 | FR-81, AC-81.5, @feature81, SPECGEN004_666 | BDD scenario | Draft | ensure-cursor-mcp --check |
| CHK-FR81-06 | FR-81 install = one MCP file via AC-81.6 | FR-81, AC-81.6, @feature81, UC-33 | Manual review | Draft | No second plugin |
`,
    reason: REASON,
  });

  console.log('FR-81 rest done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
