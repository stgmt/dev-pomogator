#!/usr/bin/env npx tsx
/**
 * Claude subagent watchdog.
 *
 * Background Bash jobs are already covered by bg-task-guard markers. Claude
 * Agent/Task background work is different: Claude records it in the transcript
 * through Agent tool results, task-notifications, sidechain events, and task
 * output files under %TEMP%/claude. This hook watches that lifecycle and makes
 * lost/stale subagents visible to the main agent.
 *
 * Hook behavior:
 *   - UserPromptSubmit / SessionStart / PostToolUse: inject additionalContext.
 *   - Stop: block when a stale/lost/API-failed subagent is still unresolved.
 *   - Fail-open on parser/runtime errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type TaskKind = 'agent' | 'background' | 'task';
export type TaskStatus = 'running' | 'completed' | 'failed' | 'stopped';
export type IssueKind = 'stale-running' | 'lost-completion' | 'failed-api-error';

export interface WatchdogIssue {
  kind: IssueKind;
  taskId: string;
  taskKind: TaskKind;
  title?: string;
  status?: TaskStatus;
  ageMinutes: number;
  lastSeenAt?: string;
  outputFile?: string;
  outputBytes?: number;
  summary?: string;
  evidence: string;
}

interface TaskState {
  taskId: string;
  kind: TaskKind;
  status?: TaskStatus;
  title?: string;
  model?: string;
  subagentType?: string;
  toolUseIds: Set<string>;
  launchedAt?: number;
  lastSeenAt?: number;
  outputFile?: string;
  outputBytes?: number;
  summary?: string;
}

interface LaunchState {
  toolUseId: string;
  kind: TaskKind;
  title?: string;
  model?: string;
  subagentType?: string;
  launchedAt?: number;
}

export interface AnalyzeOptions {
  nowMs?: number;
  staleMs?: number;
  lookbackMs?: number;
  maxIssues?: number;
}

export interface AnalyzeResult {
  issues: WatchdogIssue[];
  observedTasks: number;
  transcriptPath: string;
}

interface HookInput {
  transcript_path?: string;
  transcriptPath?: string;
  cwd?: string;
  session_id?: string;
  sessionId?: string;
}

interface TextPart {
  text: string;
  toolUseId?: string;
}

const DEFAULT_STALE_MS = 30 * 60_000;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60_000;
const DEFAULT_MAX_ISSUES = 8;
const OUTPUT_FILE_RE = /(?:output_file|Output is being written to):\s*([A-Za-z]:[^\r\n]+?\.output)\b/i;
const AGENT_ID_RE = /agentId:\s*([A-Za-z0-9_-]+)/i;
const BG_ID_RE = /Command running in background with ID:\s*([A-Za-z0-9_-]+)/i;
const CLAUDE_API_FAILURE_RE =
  /\bAPI Error\b|Stream ended without receiving any events|Upstream service|Service temporarily unavailable|rate-limited|context window|max_output_tokens|Invalid value:|429|503|400/i;

function toMs(timestamp: unknown): number | undefined {
  if (typeof timestamp !== 'string' || timestamp.length === 0) return undefined;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : undefined;
}

function normalizePath(p: string): string {
  return p.trim().replace(/^["']|["']$/g, '');
}

function readTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => readTextFromContent(item)).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if (record.content !== undefined) return readTextFromContent(record.content);
  }
  return '';
}

function collectMessageTexts(record: Record<string, unknown>): TextPart[] {
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content;
  const out: TextPart[] = [];
  if (typeof content === 'string') {
    out.push({ text: content });
    return out;
  }
  if (!Array.isArray(content)) return out;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as Record<string, unknown>;
    const text = readTextFromContent(p.content ?? p.text);
    if (text) out.push({ text, toolUseId: typeof p.tool_use_id === 'string' ? p.tool_use_id : undefined });
  }
  return out;
}

function collectAttachmentTexts(record: Record<string, unknown>): TextPart[] {
  const attachment = record.attachment as Record<string, unknown> | undefined;
  if (!attachment) return [];
  const texts: TextPart[] = [];
  for (const key of ['content', 'stdout', 'stderr']) {
    const text = readTextFromContent(attachment[key]);
    if (text) texts.push({ text });
  }
  return texts;
}

function collectQueueTexts(record: Record<string, unknown>): TextPart[] {
  const content = record.content;
  const text = readTextFromContent(content);
  return text ? [{ text }] : [];
}

function xmlTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i');
  const match = re.exec(block);
  return match?.[1]?.trim();
}

function notificationBlocks(text: string): string[] {
  return Array.from(text.matchAll(/<task-notification\b[\s\S]*?<\/task-notification>/gi)).map((m) => m[0]);
}

function taskIdFromTaskOutput(text: string): string | undefined {
  return (
    xmlTag(text, 'task-id') ??
    xmlTag(text, 'task_id') ??
    /task[_-]id["'\s:=]+([A-Za-z0-9_-]+)/i.exec(text)?.[1]
  );
}

function getOrCreate(states: Map<string, TaskState>, taskId: string, kind: TaskKind): TaskState {
  const existing = states.get(taskId);
  if (existing) return existing;
  const created: TaskState = { taskId, kind, toolUseIds: new Set() };
  states.set(taskId, created);
  return created;
}

function updateOutputStats(state: TaskState): void {
  if (!state.outputFile) return;
  try {
    const stat = fs.statSync(state.outputFile);
    state.outputBytes = stat.size;
    const mtime = stat.mtimeMs;
    if (!state.lastSeenAt || mtime > state.lastSeenAt) state.lastSeenAt = mtime;
  } catch {
    // Missing output files are useful by themselves; keep the path as evidence.
  }
}

function registerNotification(states: Map<string, TaskState>, block: string, tsMs?: number): void {
  const taskId = xmlTag(block, 'task-id');
  if (!taskId) return;
  const status = xmlTag(block, 'status') as TaskStatus | undefined;
  const summary = xmlTag(block, 'summary');
  const outputFile = xmlTag(block, 'output-file');
  const toolUseId = xmlTag(block, 'tool-use-id');
  const kind: TaskKind = taskId.startsWith('a') ? 'agent' : 'background';
  const state = getOrCreate(states, taskId, kind);
  if (status) state.status = status;
  if (summary) {
    state.summary = summary;
    const agentTitle = /(?:Agent|agent) "([^"]+)"/.exec(summary)?.[1];
    if (agentTitle) state.title = agentTitle;
  }
  if (outputFile) state.outputFile = normalizePath(outputFile);
  if (toolUseId) state.toolUseIds.add(toolUseId);
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  updateOutputStats(state);
}

function registerAgentLaunch(
  states: Map<string, TaskState>,
  launches: Map<string, LaunchState>,
  toolUseId: string | undefined,
  text: string,
  tsMs?: number,
): void {
  if (!/Async agent launched successfully|agent is working in the background/i.test(text)) return;
  const agentId = AGENT_ID_RE.exec(text)?.[1];
  if (!agentId) return;
  const launch = toolUseId ? launches.get(toolUseId) : undefined;
  const state = getOrCreate(states, agentId, 'agent');
  state.status ??= 'running';
  state.title ??= launch?.title;
  state.model ??= launch?.model;
  state.subagentType ??= launch?.subagentType;
  if (toolUseId) state.toolUseIds.add(toolUseId);
  state.launchedAt ??= launch?.launchedAt ?? tsMs;
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  const outputFile = OUTPUT_FILE_RE.exec(text)?.[1];
  if (outputFile) state.outputFile = normalizePath(outputFile);
  updateOutputStats(state);
}

function registerBackgroundLaunch(
  states: Map<string, TaskState>,
  toolUseId: string | undefined,
  text: string,
  tsMs?: number,
): void {
  const taskId = BG_ID_RE.exec(text)?.[1];
  if (!taskId) return;
  const state = getOrCreate(states, taskId, 'background');
  state.status ??= 'running';
  if (toolUseId) state.toolUseIds.add(toolUseId);
  state.launchedAt ??= tsMs;
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  const outputFile = OUTPUT_FILE_RE.exec(text)?.[1];
  if (outputFile) state.outputFile = normalizePath(outputFile);
  updateOutputStats(state);
}

function registerTaskOutput(states: Map<string, TaskState>, text: string, tsMs?: number): void {
  if (!/<retrieval_status>\s*not_ready\s*<\/retrieval_status>/i.test(text) && !/<status>\s*running\s*<\/status>/i.test(text)) {
    return;
  }
  const taskId = taskIdFromTaskOutput(text);
  if (!taskId) return;
  const state = getOrCreate(states, taskId, taskId.startsWith('a') ? 'agent' : 'background');
  state.status ??= 'running';
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  updateOutputStats(state);
}

function registerAssistantToolUses(record: Record<string, unknown>, launches: Map<string, LaunchState>, tsMs?: number): void {
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as Record<string, unknown>;
    if (p.type !== 'tool_use') continue;
    const id = typeof p.id === 'string' ? p.id : undefined;
    const name = typeof p.name === 'string' ? p.name : undefined;
    if (!id || name !== 'Agent') continue;
    const input = (p.input ?? {}) as Record<string, unknown>;
    launches.set(id, {
      toolUseId: id,
      kind: 'agent',
      title: typeof input.description === 'string' ? input.description : undefined,
      model: typeof input.model === 'string' ? input.model : undefined,
      subagentType: typeof input.subagent_type === 'string' ? input.subagent_type : undefined,
      launchedAt: tsMs,
    });
  }
}

function registerSidechainAgent(states: Map<string, TaskState>, record: Record<string, unknown>, tsMs?: number): void {
  const agentId = typeof record.agentId === 'string' ? record.agentId : undefined;
  if (!agentId) return;
  const state = getOrCreate(states, agentId, 'agent');
  state.status ??= 'running';
  const message = record.message as Record<string, unknown> | undefined;
  if (typeof message?.model === 'string') state.model ??= message.model;
  if (tsMs) state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, tsMs);
  updateOutputStats(state);
}

function isFinal(status: TaskStatus | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'stopped';
}

function isClaudeApiFailure(summary: string | undefined): boolean {
  return typeof summary === 'string' && CLAUDE_API_FAILURE_RE.test(summary);
}

function issueFromState(state: TaskState, nowMs: number, staleMs: number): WatchdogIssue | undefined {
  updateOutputStats(state);
  const last = state.lastSeenAt ?? state.launchedAt;
  if (!last) return undefined;
  const ageMs = Math.max(0, nowMs - last);
  const ageMinutes = Math.floor(ageMs / 60_000);

  if (state.status === 'failed' && isClaudeApiFailure(state.summary)) {
    return {
      kind: 'failed-api-error',
      taskId: state.taskId,
      taskKind: state.kind,
      title: state.title,
      status: state.status,
      ageMinutes,
      lastSeenAt: new Date(last).toISOString(),
      outputFile: state.outputFile,
      outputBytes: state.outputBytes,
      summary: state.summary,
      evidence: 'Claude emitted a failed task-notification with an API/stream/context error; the child did not produce a trustworthy result and the parent must recover or report it explicitly.',
    };
  }

  if (state.status === 'stopped' && /No completion record/i.test(state.summary ?? '')) {
    return {
      kind: 'lost-completion',
      taskId: state.taskId,
      taskKind: state.kind,
      title: state.title,
      status: state.status,
      ageMinutes,
      lastSeenAt: new Date(last).toISOString(),
      outputFile: state.outputFile,
      outputBytes: state.outputBytes,
      summary: state.summary,
      evidence: 'Claude emitted a stopped task-notification with "No completion record"; the main agent cannot assume this child completed.',
    };
  }

  if (isFinal(state.status)) return undefined;
  if (ageMs < staleMs) return undefined;

  return {
    kind: 'stale-running',
    taskId: state.taskId,
    taskKind: state.kind,
    title: state.title,
    status: state.status ?? 'running',
    ageMinutes,
    lastSeenAt: new Date(last).toISOString(),
    outputFile: state.outputFile,
    outputBytes: state.outputBytes,
    summary: state.summary,
    evidence: 'No completed/failed/stopped task-notification after the last observed running activity; output file did not move within the stale threshold.',
  };
}

export function analyzeTranscript(transcriptPath: string, options: AnalyzeOptions = {}): AnalyzeResult {
  const nowMs = options.nowMs ?? Date.now();
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const lookbackMs = options.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_ISSUES;
  const states = new Map<string, TaskState>();
  const launches = new Map<string, LaunchState>();

  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const tsMs = toMs(parsed.timestamp);
    registerAssistantToolUses(parsed, launches, tsMs);
    registerSidechainAgent(states, parsed, tsMs);

    const texts = [
      ...collectMessageTexts(parsed),
      ...collectAttachmentTexts(parsed),
      ...collectQueueTexts(parsed),
    ];
    for (const part of texts) {
      registerAgentLaunch(states, launches, part.toolUseId, part.text, tsMs);
      registerBackgroundLaunch(states, part.toolUseId, part.text, tsMs);
      registerTaskOutput(states, part.text, tsMs);
      for (const block of notificationBlocks(part.text)) {
        registerNotification(states, block, tsMs);
      }
    }
  }

  const issues: WatchdogIssue[] = [];
  for (const state of states.values()) {
    const last = state.lastSeenAt ?? state.launchedAt ?? 0;
    if (last && nowMs - last > lookbackMs) continue;
    const issue = issueFromState(state, nowMs, staleMs);
    if (issue) issues.push(issue);
  }

  issues.sort((a, b) => issuePriority(a) - issuePriority(b) || issueAgeOrder(a) - issueAgeOrder(b));
  return { issues: issues.slice(0, maxIssues), observedTasks: states.size, transcriptPath };
}

function issuePriority(issue: WatchdogIssue): number {
  if (issue.kind === 'failed-api-error' && issue.taskKind === 'agent') return 0;
  if (issue.kind === 'lost-completion' && issue.taskKind === 'agent') return 0;
  if (issue.kind === 'failed-api-error') return 1;
  if (issue.kind === 'lost-completion') return 1;
  if (issue.taskKind === 'agent') return 2;
  return 3;
}

function issueAgeOrder(issue: WatchdogIssue): number {
  if (issue.kind === 'stale-running') return -issue.ageMinutes;
  return issue.ageMinutes;
}

export function formatIssues(issues: WatchdogIssue[]): string {
  return issues
    .map((issue) => {
      const title = issue.title ? ` "${issue.title}"` : '';
      const file = issue.outputFile ? ` output=${issue.outputFile}${issue.outputBytes !== undefined ? ` (${issue.outputBytes} bytes)` : ''}` : '';
      return `- ${issue.taskKind} ${issue.taskId}${title}: ${issue.kind}, age=${issue.ageMinutes}m, status=${issue.status ?? 'unknown'}.${file} Evidence: ${issue.evidence}`;
    })
    .join('\n');
}

export function buildHookOutput(event: string, result: AnalyzeResult): Record<string, unknown> {
  if (result.issues.length === 0) {
    if (event === 'Stop') return { decision: 'approve' };
    return { continue: true, suppressOutput: true };
  }

  const message = [
    'subagent-watchdog: unresolved background Claude work detected.',
    'The main agent must inspect/resume/stop the listed task(s) before claiming completion.',
    formatIssues(result.issues),
    'Actions: use TaskOutput/TaskStop when available, inspect the named output file only in bounded chunks, or explicitly report the lost completion. After resolving an old/lost task, acknowledge it with: node -e "require(require(\'path\').join(require(\'os\').homedir(),\'.dev-pomogator\',\'scripts\',\'tsx-runner-bootstrap.cjs\'))" -- ".dev-pomogator/tools/subagent-watchdog/subagent_watchdog.ts" --ack <task-id> --reason "<what you did>".',
  ].join('\n');

  if (event === 'Stop') {
    return { decision: 'block', reason: message };
  }
  return { continue: true, additionalContext: message };
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function watchdogLogPath(cwd: string): string {
  return path.join(cwd, '.dev-pomogator', '.subagent-watchdog.jsonl');
}

function watchdogAckPath(cwd: string): string {
  return path.join(cwd, '.dev-pomogator', '.subagent-watchdog-ack.jsonl');
}

function readAckedTaskIds(cwd: string): Set<string> {
  const acked = new Set<string>();
  try {
    const file = watchdogAckPath(cwd);
    if (!fs.existsSync(file)) return acked;
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as Record<string, unknown>;
        if (typeof row.taskId === 'string' && row.taskId) acked.add(row.taskId);
      } catch {
        const taskId = line.trim().split(/\s+/)[0];
        if (taskId) acked.add(taskId);
      }
    }
  } catch {
    // Bad ack file should not break hook checks.
  }
  return acked;
}

function appendAck(cwd: string, taskId: string, reason?: string): void {
  const file = watchdogAckPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), taskId, reason: reason ?? '' })}\n`);
}

function appendWatchdogLog(cwd: string, event: string, result: AnalyzeResult): void {
  try {
    const file = watchdogLogPath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const row = {
      ts: new Date().toISOString(),
      event,
      transcriptPath: result.transcriptPath,
      observedTasks: result.observedTasks,
      issues: result.issues,
    };
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
  } catch {
    // Best effort only. A logging failure must not hide hook output.
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

export async function runHook(rawInput: string, argv = process.argv): Promise<Record<string, unknown>> {
  const ackIdx = argv.indexOf('--ack');
  if (ackIdx >= 0) {
    const taskId = argv[ackIdx + 1];
    if (!taskId) return { continue: true, suppressOutput: true };
    const reasonIdx = argv.indexOf('--reason');
    appendAck(process.cwd(), taskId, reasonIdx >= 0 ? argv[reasonIdx + 1] : undefined);
    return { continue: true, suppressOutput: true };
  }

  const eventIdx = argv.indexOf('--event');
  const event = eventIdx >= 0 ? argv[eventIdx + 1] : process.env.CLAUDE_HOOK_EVENT_NAME ?? 'UserPromptSubmit';
  if (process.env.SUBAGENT_WATCHDOG_ENABLED === 'false') {
    return event === 'Stop' ? { decision: 'approve' } : { continue: true, suppressOutput: true };
  }

  const input = rawInput.trim() ? JSON.parse(rawInput) as HookInput : {};
  const transcriptPath = input.transcript_path ?? input.transcriptPath;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return event === 'Stop' ? { decision: 'approve' } : { continue: true, suppressOutput: true };
  }

  const result = analyzeTranscript(transcriptPath, {
    staleMs: readNumberEnv('SUBAGENT_WATCHDOG_STALE_MINUTES', 30) * 60_000,
    lookbackMs: readNumberEnv('SUBAGENT_WATCHDOG_LOOKBACK_HOURS', 24) * 60 * 60_000,
    maxIssues: readNumberEnv('SUBAGENT_WATCHDOG_MAX_ISSUES', DEFAULT_MAX_ISSUES),
  });
  const cwd = input.cwd ?? process.cwd();
  const acked = readAckedTaskIds(cwd);
  result.issues = result.issues.filter((issue) => !acked.has(issue.taskId));
  appendWatchdogLog(cwd, event, result);
  return buildHookOutput(event, result);
}

async function main(): Promise<void> {
  const raw = await readStdin();
  try {
    const output = await runHook(raw);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`subagent-watchdog skipped: ${error instanceof Error ? error.message : String(error)}\n`);
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().finally(() => process.exit(0));
}
