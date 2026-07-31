import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseAgentTodosRaw,
  readTaskCensusCache,
  type AgentTodo,
  type TaskCensusCache,
} from '../spec-graph/task-census.ts';
import {
  resultSucceeded,
  transcriptText,
  type TranscriptBlock,
  type TranscriptEvent,
  type TranscriptEvents,
} from './transcript_events.ts';
import {
  ensureApprovedPlanLedger,
  fullSha256,
  planLedgerIsActive,
  type PlanCommitmentSeed,
} from './plan_commitment_ledger.ts';

export type WorkSourceKind = 'task' | 'plan' | 'spec' | 'goal';

export interface WorkCommitment {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked';
  sourceKind: WorkSourceKind;
}

export interface PinatorWorkSource {
  kind: WorkSourceKind;
  id: string;
  title: string;
  revision: string;
  evidence: string[];
  commitments: WorkCommitment[];
}

export interface PinatorWorkContext {
  sessionId: string;
  revision: string;
  sources: PinatorWorkSource[];
  commitments: WorkCommitment[];
  conflicts: string[];
}

export interface WorkContextInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  workspace_roots?: string[];
}

interface PlanApproval {
  path: string;
  body: string;
  toolUseId: string;
  seq: number;
  line: number;
}

const OPEN_STATUS = new Set(['pending', 'in_progress', 'in-progress', 'blocked']);
const CLOSED_STATUS = new Set(['completed', 'deleted', 'done']);
const EXIT_PLAN_TOOL = /(?:^|__)ExitPlanMode$/i;
const SPEC_TOOL = /(?:^|__)(?:apply_spec_change|apply_spec_transaction|apply_proposed_patch|replace_in_section|amend_requirement|create_spec|set_entity_status)$/i;

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function stableRevision(sources: PinatorWorkSource[]): string {
  return sha(JSON.stringify(sources.map((source) => ({
    kind: source.kind,
    id: source.id,
    revision: source.revision,
    commitments: source.commitments.map((commitment) => [commitment.id, commitment.status]),
  }))));
}

function blockInput(block: TranscriptBlock): Record<string, unknown> {
  return block.input && typeof block.input === 'object' ? block.input : {};
}

function resultText(event: (TranscriptEvent & { block: TranscriptBlock }) | undefined): string {
  return event ? transcriptText(event.block.content) : '';
}

function planPathFromResult(text: string): string | null {
  const explicit = text.match(/plan has been saved to:\s*([^\r\n]+\.md)/i)?.[1]?.trim();
  if (explicit) return explicit;
  const first = text.split(/\r?\n/, 1)[0]?.trim();
  if (first && /^(?:[a-z]:[\\/]|\/).+\.md$/i.test(first)) return first;
  return null;
}

function latestApprovedPlan(events: TranscriptEvents): PlanApproval | null {
  let latest: PlanApproval | null = null;
  for (const [id, use] of events.toolUses) {
    if (use.isSidechain || !EXIT_PLAN_TOOL.test(String(use.block.name ?? ''))) continue;
    const result = events.toolResults.get(id);
    if (!resultSucceeded(result)) continue;
    const text = resultText(result);
    if (!/(?:user has approved your plan|## Approved Plan(?: \(edited by user\))?:)/i.test(text)) continue;
    const input = blockInput(use.block);
    const planPath = typeof input.planFilePath === 'string'
      ? input.planFilePath
      : planPathFromResult(text);
    if (!planPath) continue;
    const approved = text.match(/## Approved Plan(?: \(edited by user\))?:\s*([\s\S]+)/i)?.[1]?.trim();
    let body = approved ?? '';
    if (!body) {
      try { body = fs.readFileSync(planPath, 'utf-8'); } catch { body = ''; }
    }
    if (!body) continue;
    if (!latest || result.seq > latest.seq) latest = { path: planPath, body, toolUseId: id, seq: result.seq, line: result.line };
  }
  return latest;
}

function extractPlanCommitments(body: string, planHash: string): PlanCommitmentSeed[] {
  const todoSection = body.match(/##\s+📋\s+Todos\s*([\s\S]*?)(?=\n##\s|$)/i)?.[1]
    ?? body.match(/##\s+(?:Implementation Plan|План реализации)\s*([\s\S]*?)(?=\n##\s|$)/i)?.[1]
    ?? '';
  const commitments: PlanCommitmentSeed[] = [];
  for (const line of todoSection.split(/\r?\n/)) {
    const checkbox = line.match(/^\s*(?:[-*]\s+)?\[([ xX])\]\s+(.+)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (!checkbox && !numbered) continue;
    if (checkbox?.[1]?.toLowerCase() === 'x') continue;
    const title = (checkbox?.[2] ?? numbered?.[1] ?? '').replace(/[*`>#]/g, '').trim();
    if (!title) continue;
    const ordinal = commitments.length + 1;
    const explicit = line.match(/`([a-z0-9][a-z0-9._-]{2,})`/i)?.[1]
      ?? line.match(/\bid:\s*([a-z0-9][a-z0-9._-]+)/i)?.[1];
    const id = explicit
      ? `${explicit}:${ordinal}`
      : `plan-${fullSha256(`${planHash}\0${ordinal}\0${title.toLowerCase()}`).slice(0, 20)}`;
    commitments.push({ id, title, ordinal });
  }
  if (commitments.length === 0) {
    commitments.push({ id: `plan-${fullSha256(`${planHash}\0fallback`).slice(0, 20)}`, title: 'Execute the approved implementation plan', ordinal: 1 });
  }
  return commitments;
}

function taskSources(input: WorkContextInput, events: TranscriptEvents): PinatorWorkSource[] {
  if (!input.transcript_path) return [];
  let tasks: AgentTodo[];
  try { tasks = parseAgentTodosRaw(events.raw); } catch { return []; }
  return tasks
    .filter((task) => OPEN_STATUS.has(task.status) && !task.ambiguous)
    .map((task) => ({
      kind: 'task' as const,
      id: task.id ?? `task-line-${task.line ?? task.seq}`,
      title: task.subject || task.id || 'Open Claude task',
      revision: `${task.seq}:${task.status}`,
      evidence: [`transcript:${task.line ?? task.seq}`],
      commitments: [{
        id: task.id ?? `task-line-${task.line ?? task.seq}`,
        title: task.subject || task.id || 'Open Claude task',
        status: task.status === 'blocked' ? 'blocked' : task.status === 'pending' ? 'pending' : 'in_progress',
        sourceKind: 'task',
      }],
    }));
}

function planSource(input: WorkContextInput, events: TranscriptEvents, repoRoot: string): PinatorWorkSource[] {
  const approval = latestApprovedPlan(events);
  const sessionId = input.session_id?.trim();
  if (!approval || !sessionId) return [];
  const planHash = fullSha256(approval.body);
  const ledger = ensureApprovedPlanLedger(repoRoot, {
    sessionId,
    planHash,
    planPath: approval.path,
    approvalToolUseId: approval.toolUseId,
    approvalResultSeq: approval.seq,
    approvalResultLine: approval.line,
    commitments: extractPlanCommitments(approval.body, planHash),
  });
  if (!ledger || !planLedgerIsActive(ledger)) return [];
  return [{
    kind: 'plan',
    id: planHash,
    title: path.basename(approval.path),
    revision: `${ledger.updatedAt}:${planHash}`,
    evidence: [`transcript:${approval.line}`, `approval:${approval.toolUseId}`],
    commitments: ledger.commitments
      .filter((commitment) => commitment.state !== 'complete')
      .map((commitment) => ({ id: commitment.id, title: commitment.title, status: 'pending', sourceKind: 'plan' })),
  }];
}

function selectedSpecSlugs(events: TranscriptEvents): Map<string, number> {
  const selected = new Map<string, number>();
  for (const [id, use] of events.toolUses) {
    if (use.isSidechain || !SPEC_TOOL.test(String(use.block.name ?? ''))) continue;
    if (!resultSucceeded(events.toolResults.get(id))) continue;
    const input = blockInput(use.block);
    const slug = typeof input.spec === 'string' ? input.spec : typeof input.slug === 'string' ? input.slug : '';
    if (slug) selected.set(slug, use.line);
  }
  return selected;
}

function specSources(input: WorkContextInput, events: TranscriptEvents, repoRoot: string): PinatorWorkSource[] {
  const selected = selectedSpecSlugs(events);
  if (selected.size === 0) return [];
  let census: TaskCensusCache | null = null;
  try { census = readTaskCensusCache(repoRoot); } catch { census = null; }
  if (!census) return [];
  const sources: PinatorWorkSource[] = [];
  for (const [slug, line] of selected) {
    const row = census.specs.find((spec) => spec.slug === slug);
    if (!row || row.open <= 0) continue;
    const commitment: WorkCommitment = {
      id: row.nextOpen?.id ?? `spec-${slug}-open`,
      title: row.nextOpen?.title ?? `${row.open} open spec task${row.open === 1 ? '' : 's'}`,
      status: 'in_progress',
      sourceKind: 'spec',
    };
    sources.push({
      kind: 'spec',
      id: slug,
      title: slug,
      revision: `${census.ts}:${row.open}:${row.nextOpen?.id ?? ''}`,
      evidence: [line ? `transcript:${line}` : `session-spec:${slug}`, `.dev-pomogator/.task-census.json`],
      commitments: [commitment],
    });
  }
  return sources;
}

function goalSources(events: TranscriptEvents): PinatorWorkSource[] {
  let latest: { met: boolean; condition: string; seq: number; line: number } | null = null;
  for (const event of events.events) {
    if (event.isSidechain) continue;
    const attachment = event.raw.attachment;
    if (!attachment || typeof attachment !== 'object') continue;
    const record = attachment as Record<string, unknown>;
    if (record.type !== 'goal_status' || typeof record.met !== 'boolean') continue;
    const condition = typeof record.condition === 'string' ? record.condition.trim() : '';
    latest = { met: record.met, condition, seq: event.seq, line: event.line };
  }
  if (!latest || latest.met || !latest.condition) return [];
  return [{
    kind: 'goal',
    id: `goal-${sha(latest.condition)}`,
    title: latest.condition,
    revision: `${latest.seq}:active`,
    evidence: [`transcript:${latest.line}`],
    commitments: [{ id: `goal-${sha(latest.condition)}`, title: latest.condition, status: 'in_progress', sourceKind: 'goal' }],
  }];
}

function conflictsOf(sources: PinatorWorkSource[]): string[] {
  const byTitle = new Map<string, Set<WorkSourceKind>>();
  for (const source of sources) for (const commitment of source.commitments) {
    const key = commitment.title.trim().toLowerCase();
    if (!key) continue;
    const kinds = byTitle.get(key) ?? new Set<WorkSourceKind>();
    kinds.add(source.kind);
    byTitle.set(key, kinds);
  }
  return [...byTitle.entries()]
    .filter(([, kinds]) => kinds.size > 1)
    .map(([title, kinds]) => `${title}: ${[...kinds].sort().join('+')}`);
}

export function collectPinatorWorkContext(
  input: WorkContextInput,
  events: TranscriptEvents,
): PinatorWorkContext | null {
  const repoRoot = path.resolve(input.workspace_roots?.[0] ?? input.cwd ?? process.cwd());
  const sources = [
    ...taskSources(input, events),
    ...planSource(input, events, repoRoot),
    ...specSources(input, events, repoRoot),
    ...goalSources(events),
  ].sort((a, b) => {
    const order: Record<WorkSourceKind, number> = { task: 0, plan: 1, spec: 2, goal: 3 };
    return order[a.kind] - order[b.kind] || a.id.localeCompare(b.id);
  });
  if (sources.length === 0) return null;
  const commitments = sources.flatMap((source) => source.commitments);
  return {
    sessionId: input.session_id ?? 'unknown-session',
    revision: stableRevision(sources),
    sources,
    commitments,
    conflicts: conflictsOf(sources),
  };
}

export function contextHasOpenWork(context: PinatorWorkContext): boolean {
  return context.commitments.some((commitment) => !CLOSED_STATUS.has(commitment.status));
}
