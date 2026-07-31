import fs from 'node:fs';

export interface TranscriptBlock {
  type?: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  is_error?: boolean;
  text?: string;
}

export interface TranscriptEvent {
  seq: number;
  line: number;
  type: string;
  raw: Record<string, unknown>;
  blocks: TranscriptBlock[];
  text: string;
  isSidechain: boolean;
}

export interface ResultConfirmedEvidence {
  id: string;
  toolName: string;
  resultSeq: number;
  resultLine: number;
}

export interface TranscriptEvents {
  raw: string;
  events: TranscriptEvent[];
  toolUses: Map<string, TranscriptEvent & { block: TranscriptBlock }>;
  toolResults: Map<string, TranscriptEvent & { block: TranscriptBlock }>;
}

export function isTypedHumanPrompt(event: TranscriptEvent | { raw: Record<string, unknown>; blocks: TranscriptBlock[] }): boolean {
  const raw = event.raw;
  const message = raw.message as Record<string, unknown> | undefined;
  const role = String(raw.type ?? message?.role ?? '');
  if (role !== 'user') return false;
  if (raw.isMeta === true || raw.isCompactSummary === true || raw.isVisibleInTranscriptOnly === true) return false;
  if (raw.promptSource === 'system') return false;
  const blocks = event.blocks;
  const hasText = blocks.some((block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0);
  const hasToolResult = blocks.some((block) => block.type === 'tool_result');
  return hasText && !hasToolResult;
}

function blocksOf(value: unknown): TranscriptBlock[] {
  const message = value && typeof value === 'object'
    ? (value as Record<string, unknown>).message
    : undefined;
  const content = message && typeof message === 'object'
    ? (message as Record<string, unknown>).content
    : undefined;
  if (!Array.isArray(content)) return [];
  return content.filter((block): block is TranscriptBlock => Boolean(block && typeof block === 'object'));
}

export function transcriptText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(transcriptText).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (record.content !== undefined) return transcriptText(record.content);
  try { return JSON.stringify(value); } catch { return ''; }
}

export function parseTranscriptEvents(rawTranscript: string): TranscriptEvents {
  const events: TranscriptEvent[] = [];
  const toolUses = new Map<string, TranscriptEvent & { block: TranscriptBlock }>();
  const toolResults = new Map<string, TranscriptEvent & { block: TranscriptBlock }>();
  const lines = rawTranscript.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line?.trim()) continue;
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const blocks = blocksOf(raw);
      const event: TranscriptEvent = {
        seq: events.length,
        line: index + 1,
        type: String(raw.type ?? ''),
        raw,
        blocks,
        text: transcriptText((raw.message as Record<string, unknown> | undefined)?.content),
        isSidechain: raw.isSidechain === true,
      };
      events.push(event);
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.id) toolUses.set(block.id, { ...event, block });
        if (block.type === 'tool_result' && block.tool_use_id) toolResults.set(block.tool_use_id, { ...event, block });
      }
    } catch {
      // A malformed transcript line cannot arm Pinator.
    }
  }

  return { raw: rawTranscript, events, toolUses, toolResults };
}

export function readTranscriptEvents(transcriptPath: string): TranscriptEvents | null {
  try {
    return parseTranscriptEvents(fs.readFileSync(transcriptPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function resultSucceeded(result: (TranscriptEvent & { block: TranscriptBlock }) | undefined): boolean {
  if (!result || result.isSidechain) return false;
  return result.block.is_error !== true;
}

export function resultConfirmedEvidence(events: TranscriptEvents): ResultConfirmedEvidence[] {
  const evidence: ResultConfirmedEvidence[] = [];
  for (const [id, use] of events.toolUses) {
    if (use.isSidechain) continue;
    const result = events.toolResults.get(id);
    if (!resultSucceeded(result)) continue;
    evidence.push({
      id,
      toolName: String(use.block.name ?? ''),
      resultSeq: result!.seq,
      resultLine: result!.line,
    });
  }
  return evidence;
}
