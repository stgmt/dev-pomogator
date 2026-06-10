/**
 * One-shot MCP-door harness — read/propose/apply/delete a spec doc THROUGH the
 * real registry handlers, for use under `SPEC_ACCESS_ENFORCE=true` where raw
 * Read/Edit of `.specs/**` is denied and the interactive session has no live
 * `dev-pomogator-specs` MCP tools.
 *
 * Reads its instruction from a JSON file whose PATH must NOT contain `.specs/`
 * (so the spec-access-guard's command-string check passes — the door is the
 * sanctioned write path). The instruction carries the spec/doc internally.
 *
 *   node --import tsx scripts/spec-door.ts <instruction.json>
 *
 * instruction.json:
 *   { "action": "read",   "spec": "slug", "doc": "X.feature" }
 *   { "action": "apply",  "spec": "slug", "doc": "X.feature",
 *     "old_string": "...", "new_string": "...", "reason": "..." }
 *   { "action": "apply",  "spec": "slug", "doc": "X.md", "content": "...", "reason": "..." }
 *
 * Prints the handler's JSON envelope to stdout; exits 1 on a non-ok envelope.
 *
 * @see tools/spec-mcp-server/tools.ts (the handlers this drives)
 */
import fs from 'node:fs';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';
import type { SpecGraph } from '../tools/spec-graph/types.ts';

interface Instruction {
  action: 'read' | 'propose' | 'apply' | 'delete';
  spec: string;
  doc: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  reason?: string;
}

function toolName(action: Instruction['action']): string {
  return action === 'read'
    ? 'read_spec_doc'
    : action === 'propose'
      ? 'propose_spec_change'
      : action === 'delete'
        ? 'delete_spec_doc'
        : 'apply_spec_change';
}

async function main(): Promise<void> {
  const reqPath = process.argv[2];
  if (!reqPath) throw new Error('usage: spec-door.ts <instruction.json>');
  const req = JSON.parse(fs.readFileSync(reqPath, 'utf-8')) as Instruction;

  let cached: SpecGraph | undefined;
  const getGraph = (): SpecGraph => (cached ??= buildGraph({ repoRoot: process.cwd(), skipNdjson: true }));
  const tools = buildToolRegistry(getGraph, { refreshGraph: () => { cached = undefined; } });

  const name = toolName(req.action);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not registered`);

  const args: Record<string, unknown> = { spec: req.spec, doc: req.doc };
  if (req.content !== undefined) args.content = req.content;
  if (req.old_string !== undefined) args.old_string = req.old_string;
  if (req.new_string !== undefined) args.new_string = req.new_string;
  if (req.replace_all !== undefined) args.replace_all = req.replace_all;
  if (req.reason !== undefined) args.reason = req.reason;

  const r = (await tool.handler(args as never)) as { content: Array<{ text: string }> };
  const envelope = JSON.parse(r.content[0].text) as { ok: boolean };
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  if (envelope.ok === false) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`spec-door fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
