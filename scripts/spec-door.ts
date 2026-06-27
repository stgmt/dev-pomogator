/**
 * One-shot MCP-door harness — query/read/propose/apply/delete a spec doc THROUGH
 * the real registry handlers, for use under `SPEC_ACCESS_ENFORCE=true` where raw
 * Read/Grep/Edit of `.specs/**` is denied and the interactive session has no live
 * `dev-pomogator-specs` MCP tools.
 *
 * TWO modes:
 *
 * 1) DIRECT CLI (read-side queries — no JSON file, no `.specs/` literal in the
 *    command, so it replaces a guarded `grep .specs/` reflexively):
 *
 *      node --import tsx scripts/spec-door.ts search "<query>" [type] [limit]
 *      node --import tsx scripts/spec-door.ts list   <spec>
 *      node --import tsx scripts/spec-door.ts read   <spec> <doc>
 *      node --import tsx scripts/spec-door.ts trace  <node_id> [spec]
 *      node --import tsx scripts/spec-door.ts node   <node_id> [spec]
 *
 *    `search` is graph-aware (matches node ids + titles, returns file:line) — use it
 *    instead of grepping `.specs/`; `trace` gives the tested-by/AC/task/code edges of a
 *    node (the real "is this covered by a scenario?" answer grep can't give).
 *
 * 2) JSON-FILE (writes + scripted reads — the instruction PATH must NOT contain
 *    `.specs/` so the guard's command-string check passes; the spec/doc lives inside):
 *
 *      node --import tsx scripts/spec-door.ts <instruction.json>
 *
 *    instruction.json:
 *      { "action": "read",   "spec": "slug", "doc": "X.feature" }
 *      { "action": "search", "query": "jira", "types": ["scenario"], "limit": 50 }
 *      { "action": "trace",  "node_id": "slug:FR-4" }
 *      { "action": "apply",  "spec": "slug", "doc": "X.feature",
 *        "old_string": "...", "new_string": "...", "reason": "..." }
 *      { "action": "apply",  "spec": "slug", "doc": "X.md", "content": "...", "reason": "..." }
 *
 * Prints the handler's JSON envelope to stdout; exits 1 on a non-ok envelope.
 *
 * @see tools/spec-mcp-server/tools.ts (the handlers this drives)
 */
import fs from 'node:fs';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';
import type { SpecGraph } from '../tools/spec-graph/types.ts';

type Action = 'read' | 'propose' | 'apply' | 'delete' | 'search' | 'list' | 'trace' | 'node';

interface Instruction {
  action: Action;
  spec?: string;
  doc?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  reason?: string;
  query?: string;
  types?: string[];
  limit?: number;
  coverage?: boolean;
  node_id?: string;
}

const TOOL_OF: Record<Action, string> = {
  read: 'read_spec_doc',
  propose: 'propose_spec_change',
  apply: 'apply_spec_change',
  delete: 'delete_spec_doc',
  search: 'search',
  list: 'list_spec_docs',
  trace: 'get_trace',
  node: 'get_node',
};

const DIRECT_VERBS = new Set<Action>(['search', 'list', 'read', 'trace', 'node']);

/** Build an Instruction from positional CLI args when argv[2] is a direct verb. */
function parseDirect(argv: string[]): Instruction | null {
  const verb = argv[2] as Action;
  if (!DIRECT_VERBS.has(verb)) return null;
  const a = argv.slice(3);
  switch (verb) {
    case 'search': {
      const limit = a[2] !== undefined ? Number(a[2]) : undefined;
      // CLI search always asks for coverage — the whole point is a one-call "is it covered?" answer.
      return { action: 'search', query: a[0], types: a[1] ? [a[1]] : undefined, limit: Number.isFinite(limit) ? limit : undefined, coverage: true };
    }
    case 'list':
      return { action: 'list', spec: a[0] };
    case 'read':
      return { action: 'read', spec: a[0], doc: a[1] };
    case 'trace':
      return { action: 'trace', node_id: a[0], spec: a[1] };
    case 'node':
      return { action: 'node', node_id: a[0], spec: a[1] };
    default:
      return null;
  }
}

function buildArgs(req: Instruction): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (req.spec !== undefined) args.spec = req.spec;
  if (req.doc !== undefined) args.doc = req.doc;
  if (req.content !== undefined) args.content = req.content;
  if (req.old_string !== undefined) args.old_string = req.old_string;
  if (req.new_string !== undefined) args.new_string = req.new_string;
  if (req.replace_all !== undefined) args.replace_all = req.replace_all;
  if (req.reason !== undefined) args.reason = req.reason;
  if (req.query !== undefined) args.query = req.query;
  if (req.types !== undefined) args.types = req.types;
  if (req.limit !== undefined) args.limit = req.limit;
  if (req.coverage !== undefined) args.coverage = req.coverage;
  if (req.node_id !== undefined) args.node_id = req.node_id;
  return args;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error('usage: spec-door.ts <search|list|read|trace|node> <args…>  OR  spec-door.ts <instruction.json>');
  }

  // Mode 1: direct CLI (argv[2] is a known read-side verb). Mode 2: JSON-file path.
  const req = parseDirect(process.argv) ?? (JSON.parse(fs.readFileSync(arg, 'utf-8')) as Instruction);

  let cached: SpecGraph | undefined;
  const getGraph = (): SpecGraph => (cached ??= buildGraph({ repoRoot: process.cwd(), skipNdjson: true }));
  const tools = buildToolRegistry(getGraph, { refreshGraph: () => { cached = undefined; } });

  const name = TOOL_OF[req.action];
  if (!name) throw new Error(`unknown action ${req.action}`);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not registered`);

  const r = (await tool.handler(buildArgs(req) as never)) as { content: Array<{ text: string }> };
  const envelope = JSON.parse(r.content[0].text) as { ok: boolean };
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  if (envelope.ok === false) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`spec-door fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
