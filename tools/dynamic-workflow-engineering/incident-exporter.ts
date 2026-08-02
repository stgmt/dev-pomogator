import fs from 'node:fs';
import path from 'node:path';

export interface IncidentManifest {
  schema_version: number;
  ground_truth: {
    spec_collector_attempts: number;
    spec_mcp_calls: number;
    aggregate_response_bytes: number;
    github_collector_completed: boolean;
    spec_collector_structured_outputs: number;
  };
  provenance: { journal_path_at_capture: string; derivation: string };
  acceptance_target: { maximum_mcp_calls: number; maximum_aggregate_response_bytes: number };
}

export interface IncidentExport {
  status: 'RECONCILED' | 'REPLAY_UNAVAILABLE';
  manifest: IncidentManifest;
  reason?: string;
  historicalTargetMet?: boolean;
  observed?: { attempts: number; calls: number; bytes: number; structuredOutputs: number };
}

function parseJsonLines(target: string): unknown[] {
  return fs.readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

interface TranscriptBlock { type?: string; id?: string; name?: string; tool_use_id?: string; content?: unknown }

function transcriptBlocks(row: unknown): TranscriptBlock[] {
  const content = (row as { message?: { content?: unknown } })?.message?.content;
  return Array.isArray(content) ? content as TranscriptBlock[] : [];
}

export function reconcileIncident(manifestPath: string): IncidentExport {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as IncidentManifest;
  if (!/tool_use_id/.test(manifest.provenance.derivation)) return { status: 'REPLAY_UNAVAILABLE', manifest, reason: 'producer derivation is not tool-use correlated' };
  const journalPath = manifest.provenance.journal_path_at_capture;
  if (!fs.existsSync(journalPath)) return { status: 'REPLAY_UNAVAILABLE', manifest, reason: 'producer journal is missing' };
  const journal = parseJsonLines(journalPath) as Array<{ type?: string; key?: string; agentId?: string; result?: unknown }>;
  const resultRows = journal.filter((entry) => entry.type === 'result');
  const completedGithub = resultRows.some((entry) => Array.isArray((entry.result as { issues?: unknown[] })?.issues) && (entry.result as { issues: unknown[] }).issues.length > 0);
  const workflowRoot = path.dirname(journalPath);
  const agentIds = new Set(journal.filter((entry) => entry.agentId).map((entry) => entry.agentId!));
  let calls = 0;
  let bytes = 0;
  for (const agentId of agentIds) {
    const transcript = path.join(workflowRoot, `agent-${agentId}.jsonl`);
    if (!fs.existsSync(transcript)) continue;
    const specToolIds = new Set<string>();
    for (const row of parseJsonLines(transcript)) {
      for (const block of transcriptBlocks(row)) {
        if (block.type === 'tool_use' && block.id && block.name?.startsWith('mcp__dev-pomogator-specs__')) specToolIds.add(block.id);
        if (block.type === 'tool_result' && block.tool_use_id && specToolIds.has(block.tool_use_id)) {
          calls += 1;
          bytes += Buffer.byteLength(typeof block.content === 'string' ? block.content : JSON.stringify(block.content), 'utf8');
        }
      }
    }
  }
  const githubResult = resultRows.find((entry) => Array.isArray((entry.result as { issues?: unknown[] })?.issues));
  const githubKey = githubResult?.key;
  const specStarts = journal.filter((entry) => entry.type === 'started' && entry.key && entry.key !== githubKey);
  const specKeys = new Set(specStarts.map((entry) => entry.key!));
  const attempts = specStarts.length;
  const structuredOutputs = journal.filter((entry) => entry.type === 'result' && entry.key && specKeys.has(entry.key)).length;
  const byteDelta = Math.abs(bytes - manifest.ground_truth.aggregate_response_bytes);
  const bytesCorroborated = byteDelta <= Math.max(1, Math.floor(manifest.ground_truth.aggregate_response_bytes * 0.12));
  if (attempts !== manifest.ground_truth.spec_collector_attempts || calls !== manifest.ground_truth.spec_mcp_calls || !bytesCorroborated || !completedGithub || structuredOutputs !== manifest.ground_truth.spec_collector_structured_outputs) {
    return { status: 'REPLAY_UNAVAILABLE', manifest, reason: `producer evidence mismatch (attempts=${attempts}, calls=${calls}, bytes=${bytes}, expectedBytes=${manifest.ground_truth.aggregate_response_bytes}, github=${completedGithub}, outputs=${structuredOutputs})` };
  }
  const targetMet = calls <= manifest.acceptance_target.maximum_mcp_calls && bytes <= manifest.acceptance_target.maximum_aggregate_response_bytes;
  return { status: 'RECONCILED', manifest, historicalTargetMet: targetMet, observed: { attempts, calls, bytes, structuredOutputs } };
}
