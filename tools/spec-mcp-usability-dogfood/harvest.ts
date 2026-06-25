/**
 * spec-mcp-usability-dogfood — harvest REAL usability friction with the spec-graph MCP door
 * (`mcp__dev-pomogator-specs__*`) out of Claude Code session transcripts, so the painful spots
 * surface as DATA instead of being re-typed from memory.
 *
 * Sibling of `spec-mcp-dogfood` (which checks each tool WORKS against the real graph). THIS checks
 * how USABLE each tool is: where the agent hit errors, retried, or gave up and went around the door.
 *
 * Governing rule: `verify-against-real-artifact` — the producer here is the Claude Code transcript
 * writer. We PARSE each door result as JSON and check `ok === false`; we NEVER substring-match "error"
 * on raw text (that flagged `ok:true` reads as failures — the canary bug this tool exists to avoid).
 *
 * Dep-safe: node builtins only (`fs`/`path`/`os`) — it ships in the plugin and must run with no
 * node_modules (rule `dead-integration-guard`). Fail-open: any parse error → that line/result is
 * bucketed, never throws.
 *
 * @see .specs/spec-mcp-usability-dogfood/  · sibling .claude/skills/spec-mcp-dogfood/
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const DOOR_PREFIX = 'mcp__dev-pomogator-specs__';
/** Raw tools that, used on a `.specs/` path, mean the agent went AROUND the door (a bypass signal). */
const RAW_TOOLS = new Set(['Bash', 'Write', 'Read', 'Edit', 'MultiEdit', 'Grep', 'Glob']);

export interface DoorResult {
  ok: boolean | null; // null = result text could not be parsed as JSON
  errorType: 'anchor-not-found' | 'form-contract' | 'other' | null;
  message: string;
  hint: string;
}
export interface DoorInteraction {
  idx: number; // position in the flattened tool stream (file order)
  name: string; // door tool name, prefix stripped
  spec: string | null;
  doc: string | null;
  isSidechain: boolean;
  result: DoorResult | null; // null = no matching tool_result found
}
export interface FrictionFinding {
  kind: 'error' | 'retry-after-fail' | 'raw-specs-access';
  tool: string;
  errorType?: string;
  spec: string | null;
  doc: string | null;
  count: number;
  sample: string; // a representative message / escape target
}
export interface ProposedFix {
  priority: number; // higher = more friction observed
  signal: string; // the data that triggered it
  fix: string; // the concrete improvement
}
export interface FrictionReport {
  sessions: string[];
  doorCalls: number;
  doorErrors: number;
  unparseableResults: number;
  sidechainSkipped: number;
  findings: FrictionFinding[];
  proposals: ProposedFix[];
}

// ── parsing ────────────────────────────────────────────────────────────────

/** A door result is JSON-as-text. Content may be a raw string OR `[{type:'text',text}]`. */
export function parseResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text?: unknown }).text ?? '') : '')).join('');
  return '';
}

/** Classify a door result by PARSING it as JSON (never substring "error" on raw text). */
export function classifyResult(content: unknown): DoorResult {
  const text = parseResultText(content);
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: null, errorType: null, message: '(unparseable result)', hint: '' };
  }
  const ok = obj.ok === true ? true : obj.ok === false ? false : true; // tools without `ok` are read-side successes
  if (ok) return { ok: true, errorType: null, message: '', hint: '' };
  const finding = (obj.finding ?? null) as { message?: unknown } | null;
  const findings = Array.isArray(obj.findings) ? obj.findings : [];
  const msg = String((finding && finding.message) ?? obj.error ?? (findings[0] && (findings[0] as { message?: unknown }).message) ?? 'unknown error');
  let errorType: DoorResult['errorType'] = 'other';
  if (/old_string not found/i.test(msg)) errorType = 'anchor-not-found';
  else if (obj.error === 'VALIDATION_FAILED' || findings.length > 0) errorType = 'form-contract';
  return { ok: false, errorType, message: msg, hint: String(obj.hint ?? '') };
}

interface RawTU { id: string; name: string; input: Record<string, unknown>; isSidechain: boolean }

/** Flatten a transcript into the ordered tool stream + a tool_use_id → result map. */
export function extractDoorInteractions(lines: string[]): {
  interactions: DoorInteraction[];
  toolStream: { name: string; input: Record<string, unknown>; idx: number }[];
  sidechainSkipped: number;
} {
  const uses: RawTU[] = [];
  const resultById = new Map<string, unknown>();
  const toolStream: { name: string; input: Record<string, unknown>; idx: number }[] = [];
  let sidechainSkipped = 0;

  for (const ln of lines) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(ln) as Record<string, unknown>;
    } catch {
      continue; // fail-open on a corrupt line
    }
    const isSidechain = o.isSidechain === true;
    const msg = o.message as { content?: unknown } | undefined;
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const c of msg.content as Array<Record<string, unknown>>) {
      if (c.type === 'tool_use') {
        const name = String(c.name ?? '');
        toolStream.push({ name, input: (c.input as Record<string, unknown>) ?? {}, idx: toolStream.length });
        if (name.startsWith(DOOR_PREFIX)) {
          if (isSidechain) {
            sidechainSkipped++;
            continue; // don't attribute a subagent's door struggle to the main agent
          }
          uses.push({ id: String(c.id ?? ''), name, input: (c.input as Record<string, unknown>) ?? {}, isSidechain });
        }
      } else if (c.type === 'tool_result') {
        resultById.set(String(c.tool_use_id ?? ''), c.content);
      }
    }
  }

  const interactions: DoorInteraction[] = uses.map((u, i) => {
    const hasResult = resultById.has(u.id);
    return {
      idx: i,
      name: u.name.slice(DOOR_PREFIX.length),
      spec: (u.input.spec as string) ?? (u.input.slug as string) ?? null,
      doc: (u.input.doc as string) ?? null,
      isSidechain: u.isSidechain,
      result: hasResult ? classifyResult(resultById.get(u.id)) : null,
    };
  });
  return { interactions, toolStream, sidechainSkipped };
}

// ── friction detection ───────────────────────────────────────────────────────

const PROPOSAL_BY_ERROR: Record<string, (n: number) => string> = {
  'anchor-not-found': (n) =>
    `apply_spec_change anchored old_string is SINGLE-LINE + CRLF-sensitive (${n}× "not found"). Fix: (1) document the whole-doc \`content\` replace param in the tool DESCRIPTION; (2) add a hint to the "old_string not found" error naming CRLF + the \`content\` fallback.`,
  'form-contract': (n) =>
    `Form-contract findings surface only AFTER a failed apply (${n}× VALIDATION_FAILED). Fix: expose the doc's required-form contract UP FRONT — a describe_contract tool, or include the form checklist in create_spec / propose_spec_change output.`,
  other: (n) => `${n}× door error of an uncategorised type — inspect the messages and add a targeted hint.`,
};

export function detectFriction(interactions: DoorInteraction[], toolStream: { name: string; input: Record<string, unknown>; idx: number }[]): {
  findings: FrictionFinding[];
  proposals: ProposedFix[];
} {
  const findings: FrictionFinding[] = [];

  // 1) errors, grouped by tool+errorType
  const errKey = (i: DoorInteraction) => `${i.name}|${i.result?.errorType}`;
  const errGroups = new Map<string, DoorInteraction[]>();
  for (const i of interactions) {
    if (i.result?.ok === false) {
      const k = errKey(i);
      (errGroups.get(k) ?? errGroups.set(k, []).get(k)!).push(i);
    }
  }
  for (const [, group] of errGroups) {
    const first = group[0];
    findings.push({
      kind: 'error',
      tool: first.name,
      errorType: first.result?.errorType ?? 'other',
      spec: first.spec,
      doc: first.doc,
      count: group.length,
      sample: first.result?.message ?? '',
    });
  }

  // 2) retry-after-fail: a fail on (tool,spec,doc) immediately followed (in door order) by the same triple
  const retryGroups = new Map<string, number>();
  for (let i = 1; i < interactions.length; i++) {
    const prev = interactions[i - 1];
    const cur = interactions[i];
    if (prev.result?.ok === false && cur.name === prev.name && cur.spec === prev.spec && cur.doc === prev.doc) {
      const k = `${cur.name}|${cur.spec}|${cur.doc}`;
      retryGroups.set(k, (retryGroups.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of retryGroups) {
    const [tool, spec, doc] = k.split('|');
    findings.push({ kind: 'retry-after-fail', tool, spec: spec || null, doc: doc || null, count: n, sample: `${n}× re-tried same tool on ${spec}/${doc} after a failure` });
  }

  // 3) raw-specs-access: a raw tool (Bash/Write/Read/Grep/Edit) touched a `.specs/` path — a door BYPASS.
  // Honest scope: this counts ALL such touches in the stream, NOT strictly "within K steps after a door
  // failure" (windowing that to post-failure escapes is a planned refinement). Some are habit/unawareness,
  // some follow a door failure — either way each is a signal the door didn't serve that need.
  let bypassCount = 0;
  const bypassSamples: string[] = [];
  for (let s = 0; s < toolStream.length; s++) {
    const t = toolStream[s];
    if (!RAW_TOOLS.has(t.name)) continue;
    const blob = JSON.stringify(t.input);
    if (/\.specs[\\/]/.test(blob)) {
      bypassCount++;
      if (bypassSamples.length < 3) bypassSamples.push(`${t.name} on ${(blob.match(/[\w./\\-]*\.specs[\w./\\-]*/) ?? ['?'])[0]}`);
    }
  }
  if (bypassCount > 0) {
    findings.push({ kind: 'raw-specs-access', tool: 'raw', spec: null, doc: null, count: bypassCount, sample: bypassSamples.join('; ') });
  }

  // proposals — ranked by observed friction (count). The RANKING is the value.
  const proposals: ProposedFix[] = [];
  const errByType = new Map<string, number>();
  for (const f of findings) if (f.kind === 'error' && f.errorType) errByType.set(f.errorType, (errByType.get(f.errorType) ?? 0) + f.count);
  for (const [type, n] of errByType) {
    proposals.push({ priority: n, signal: `${n}× ${type} door error`, fix: (PROPOSAL_BY_ERROR[type] ?? PROPOSAL_BY_ERROR.other)(n) });
  }
  const retryTotal = findings.filter((f) => f.kind === 'retry-after-fail').reduce((a, f) => a + f.count, 0);
  if (retryTotal > 0) proposals.push({ priority: retryTotal, signal: `${retryTotal}× retry-after-fail`, fix: `The agent re-issued the same failing call ${retryTotal}× — the error text isn't actionable enough to fix on the first read. Make each door error self-correcting (name the cause + the exact next move).` });
  if (bypassCount > 0) proposals.push({ priority: bypassCount + 1, signal: `${bypassCount}× raw tool on .specs`, fix: `The agent used a raw Bash/Write/Read on .specs ${bypassCount}× instead of a door tool — each is a door-DX gap (a door tool missing, undiscoverable, or just-failed). Triage the top targets: was a door tool absent, or was it avoided after friction?` });
  proposals.sort((a, b) => b.priority - a.priority);

  return { findings, proposals };
}

// ── session discovery + orchestration ────────────────────────────────────────

/** All `~/.claude/projects/*<basename>*` dirs (handles Windows + WSL path encodings for one repo). */
export function findProjectDirs(homeDir: string, cwd: string): string[] {
  const base = path.basename(cwd.replace(/[\\/]+$/, ''));
  const root = path.join(homeDir, '.claude', 'projects');
  const out: string[] = [];
  try {
    for (const e of fs.readdirSync(root)) if (e.toLowerCase().includes(base.toLowerCase())) out.push(path.join(root, e));
  } catch {
    /* no projects dir → empty */
  }
  return out;
}

export function listSessionFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(d)) if (f.endsWith('.jsonl')) files.push(path.join(d, f));
    } catch {
      /* skip */
    }
  }
  return files;
}

export function harvest(sessionFiles: string[]): FrictionReport {
  const allInteractions: DoorInteraction[] = [];
  const allStream: { name: string; input: Record<string, unknown>; idx: number }[] = [];
  let unparseable = 0;
  let sidechainSkipped = 0;
  for (const f of sessionFiles) {
    let lines: string[];
    try {
      lines = fs.readFileSync(f, 'utf-8').split('\n').filter(Boolean);
    } catch {
      continue;
    }
    const { interactions, toolStream, sidechainSkipped: ss } = extractDoorInteractions(lines);
    sidechainSkipped += ss;
    for (const i of interactions) {
      if (i.result && i.result.ok === null) unparseable++;
      allInteractions.push(i);
    }
    for (const t of toolStream) allStream.push(t);
  }
  const { findings, proposals } = detectFriction(allInteractions, allStream);
  return {
    sessions: sessionFiles,
    doorCalls: allInteractions.length,
    doorErrors: allInteractions.filter((i) => i.result?.ok === false).length,
    unparseableResults: unparseable,
    sidechainSkipped,
    findings,
    proposals,
  };
}

export function renderMarkdown(r: FrictionReport): string {
  const lines: string[] = [];
  lines.push('# MCP door usability — friction harvested from session transcripts', '');
  lines.push(`- sessions scanned: **${r.sessions.length}**`);
  lines.push(`- door calls: **${r.doorCalls}** · door errors: **${r.doorErrors}** · unparseable results: ${r.unparseableResults} · sidechain skipped: ${r.sidechainSkipped}`, '');
  lines.push('## Findings (derived from data)', '');
  if (!r.findings.length) lines.push('_No door friction found in the scanned sessions._');
  for (const f of r.findings) {
    const where = f.spec ? ` ${f.spec}${f.doc ? '/' + f.doc : ''}` : '';
    lines.push(`- **${f.kind}** · \`${f.tool}\`${f.errorType ? ' (' + f.errorType + ')' : ''}${where} — ×${f.count}: ${f.sample.slice(0, 160)}`);
  }
  lines.push('', '## Proposed improvements (ranked by observed friction)', '');
  if (!r.proposals.length) lines.push('_Nothing to propose._');
  r.proposals.forEach((p, i) => lines.push(`${i + 1}. **[${p.priority}]** ${p.fix}\n   - signal: ${p.signal}`));
  return lines.join('\n') + '\n';
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(argv: string[]): void {
  const asJson = argv.includes('--json');
  const sessionFlagIdx = argv.indexOf('--session');
  let sessionFiles: string[];
  if (sessionFlagIdx >= 0 && argv[sessionFlagIdx + 1]) {
    sessionFiles = [argv[sessionFlagIdx + 1]];
  } else {
    const dirs = findProjectDirs(os.homedir(), process.cwd());
    sessionFiles = listSessionFiles(dirs);
  }
  const report = harvest(sessionFiles);
  process.stdout.write(asJson ? JSON.stringify(report, null, 2) + '\n' : renderMarkdown(report));
}

const isDirect = process.argv[1]?.endsWith('harvest.ts') || process.argv[1]?.endsWith('harvest.js');
if (isDirect) main(process.argv.slice(2));
