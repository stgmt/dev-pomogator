/**
 * Advisor MCP server — client-side replica of the native Anthropic advisor, with a context-engine.
 *
 * Native contract: executor calls `advisor()` with an EMPTY input; server constructs the
 * advisor's view from the full context automatically. Our sub2api proxy can't run server-side
 * tools, so the same contract is implemented client-side via MCP, and the advisor's view is built
 * by the session context engine (session-digest.mjs) rather than by dumping the whole 30k-char
 * transcript.
 *
 * Modes (ADVISOR_MODE) — all read the same on-disk transcript (CLAUDE_CODE_SESSION_ID +
 * CLAUDE_PROJECT_DIR):
 *   - `digest` (default): Structured Session Digest — goals + goal-drift + plan outline, asymmetric
 *     recent-activity window, recurring errors, touched files/commands, read-only git/file
 *     self-check, then TWO-PASS consult: a cheap summarizer model builds the situation report,
 *     the advisor model advises on it. Extra env:
 *       ADVISOR_SELF_CHECK=1 (default) — include git status/diff/touched-file existence probes.
 *       ADVISOR_SUMMARIZER_MODEL (default gpt-5.6-luna).
 *   - `fast`: deterministic pattern extraction (fast-evidence.mjs), single advisor call.
 *   - `full`: recent transcript blocks verbatim, single advisor call (legacy).
 *
 * Fail-open everywhere: no env/config/transcript/unreachable/adapter error -> short honest message.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveTranscriptPath, buildTranscriptPacket, consultAdvisorFromTranscript } from './transcript-packet.mjs';
import { buildFastEvidence, renderEvidence } from './fast-evidence.mjs';
import { buildSessionDigest, renderDigest, twoPassConsult, buildSummaryPacket } from './session-digest.mjs';

const MODE = (process.env.ADVISOR_MODE ?? 'digest').toLowerCase();
const SELF_CHECK = (process.env.ADVISOR_SELF_CHECK ?? '1') !== '0';
const USE_SUMMARY = (process.env.ADVISOR_SESSION_SUMMARY ?? '0') === '1';

function transcriptRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

async function buildForMode(transcriptPath) {
  if (MODE === 'full') {
    const raw = fs.readFileSync(transcriptPath, 'utf-8');
    const packet = buildTranscriptPacket(raw);
    return { packet, meta: { mode: 'full', chars: raw.length, lines: raw.split(/\r?\n/).length } };
  }
  if (MODE === 'fast') {
    const f = await buildFastEvidence(transcriptPath);
    const packet = renderEvidence(f.stats);
    return { packet, meta: { mode: 'fast', chars: f.raw.length, lines: f.raw.split(/\r?\n/).length } };
  }
  // digest
  if (USE_SUMMARY) {
    const summaryRes = await buildSummaryPacket({
      transcriptPath,
      repoRoot: transcriptRoot(),
      sessionId: process.env.CLAUDE_CODE_SESSION_ID ?? 'unknown',
    });
    return { packet: summaryRes.packet, meta: summaryRes.meta };
  }
  const d = await buildSessionDigest({ transcriptPath, repoRoot: transcriptRoot() });
  if (!d.ok) return { packet: `[advisor] digest failed: ${d.reason}`, meta: { mode: 'digest', error: d.reason, selfCheck: false } };
  const rendered = renderDigest(d);
  const meta = {
    mode: 'digest', rawChars: d.rawLen, rawLines: d.lineCount,
    plan: Boolean(d.goals?.plan), drift: Boolean(d.goals?.drift),
    recentDetail: d.activity?.detailed?.length ?? 0, toolTotal: d.activity?.toolTotal ?? 0,
    recurring: d.fast?.recurring?.length ?? 0, files: d.fast?.files?.length ?? 0,
    selfCheck: SELF_CHECK, git: Boolean(d.selfCheck?.git),
    packetChars: rendered.length,
  };
  return { packet: rendered, meta, digest: d };
}

const server = new McpServer({ name: 'dev-pomogator-advisor', version: '0.4.0' });

server.tool(
  'advisor',
  'Backed by a stronger reviewer model. It takes NO parameters: your conversation context — the goal/plan, recent tool calls and results — is forwarded. Call it BEFORE substantive work (before writing/editing/declaring an answer), before declaring the task complete, when stuck on recurring errors, or when considering a change of approach. It returns guidance you should apply before continuing.',
  {},
  async () => {
    const transcriptPath = resolveTranscriptPath();
    if (!transcriptPath) return { content: [{ type: 'text', text: '[advisor] transcript not found — aborting consultation' }] };

    let packet;
    let meta;
    let twoPass;
    try {
      const b = await buildForMode(transcriptPath);
      packet = b.packet;
      meta = b.meta;
      if (MODE === 'digest' && (process.env.ADVISOR_TWOPASS ?? '1') === '1') {
        const res = await twoPassConsult(packet, {});
        if (res.ok) {
          twoPass = { report: res.report, guidance: res.guidance };
          packet = res.guidance;
        } else {
          // fallback: single-call advice on the digest
          const fallback = await consultAdvisorFromTranscript(packet);
          packet = fallback || `[advisor] two-pass failed: ${res.error}`;
        }
      } else {
        packet = (await consultAdvisorFromTranscript(packet)) || '[advisor] empty guidance';
      }
    } catch (e) {
      return { content: [{ type: 'text', text: `[advisor] build/consult failed: ${e.message}` }] };
    }

    if (process.env.ADVISOR_TRACE === '1') {
      try {
        fs.appendFileSync(path.join(os.tmpdir(), 'advisor-mcp-trace.log'),
          JSON.stringify({ ts: new Date().toISOString(), transcriptPath, meta, guidance: packet, twoPass: Boolean(twoPass) }) + '\n', 'utf-8');
      } catch { /* best-effort */ }
    }
    return { content: [{ type: 'text', text: packet }] };
  },
);

await server.connect(new StdioServerTransport());