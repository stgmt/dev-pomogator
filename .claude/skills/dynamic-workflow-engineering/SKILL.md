---
name: dynamic-workflow-engineering
description: Run a finite, runtime-issued Dynamic Workflow packet with deterministic preflight, per-run evidence, partial-result preservation, and honest capability tiers.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Workflow, ToolSearch, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_spec_doc
---

# Dynamic Workflow Engineering

Use this skill when a task needs bounded multi-agent orchestration. Native Claude Code `Agent` is a separate subject and is never authorized by Workflow prose, labels, subtype, session, or environment.

## Canonical path

1. Build a finite packet that matches `tools/dynamic-workflow-engineering/contracts.json`.
2. Run the installed runtime preflight from `CLAUDE_PLUGIN_ROOT`:
   `node "$CLAUDE_PLUGIN_ROOT/tools/dynamic-workflow-engineering/runtime.bundle.mjs" prepare <packet.json>`.
3. Continue only when the decision is `allow`, `state.json` reached `ROOT_VERIFIED`, and the runtime returned `preparedPacketPath`.
4. Invoke Workflow with `scriptPath: "$CLAUDE_PLUGIN_ROOT/tools/dynamic-workflow-engineering/workflow.mjs"` and `args: { preparedPacketPath }`. The script reads the runtime-created envelope itself; raw caller-created packet objects are rejected.
5. Finalize through the runtime journal/verification path; do not infer completion from agent prose.

## Packet rules

The packet declares finite scopes, population digest, work packages, ownership, dependencies, barriers, evidence/output contract, stop condition, blocked/dropped states, all ceilings, root/worktree/base SHA/dirty allowlist, required gates, and runtime-issued run/attempt/owner identity.

- Unknown-size work needs an explicit discovery bound.
- Deterministic inventory happens before model work.
- One logical call is distinct from physical attempts.
- At most one materially changed retry is allowed.
- Completed branch output survives sibling failure.
- `COMPLETE` requires every mandatory branch.
- Raw prompts, secrets, tokens, and tool payloads do not enter audit journals.

## Guarantee

Read the capability matrix. Publish exactly one tier:

- `ENFORCED` only with real direct and Workflow-nested native-Agent deny-before-spawn plus independent valid Workflow-native delivery.
- `STEERING_ONLY` when the bounded runtime works but native-Agent enforcement is unproven.
- `UNAVAILABLE` when the safe runtime path cannot operate.

Never install or describe a fake protected hook.
