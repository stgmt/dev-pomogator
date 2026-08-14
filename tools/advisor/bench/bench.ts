/**
 * Advisor PoC bench.
 *
 * Two parts:
 *  A. OFFLINE trigger validation — feed synthetic Stop inputs + REAL transcripts
 *     from ~/.claude/projects and assert which key point (if any) the detector fires.
 *  B. LIVE transport check (--live) — one real sub2api call to prove the model
 *     returns guidance on a synthetic packet.
 *
 * Usage:
 *   npx tsx tools/advisor/bench/bench.ts
 *   npx tsx tools/advisor/bench/bench.ts --live            (needs ANTHROPIC_BASE_URL + token)
 *   npx tsx tools/advisor/bench/bench.ts --transcript <path>
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectKeyPoint, buildPacket, buildAdvisorPrompt, type KeyPoint } from '../advisor_stop.ts';
import { parseTranscriptEvents } from '../../claim-evidence-gate/transcript_events.ts';
import type { TranscriptEvent } from '../../claim-evidence-gate/transcript_events.ts';

interface Scenario {
  name: string;
  input: { last_assistant_message: string; session_id: string };
  events: TranscriptEvent[];
  expect: KeyPoint['kind'] | null;
}

function ev(type: 'user' | 'assistant', blocks: Array<Record<string, unknown>>): TranscriptEvent {
  return {
    seq: 0,
    line: 0,
    type,
    raw: { type, message: { role: type, content: blocks } },
    blocks: blocks as TranscriptEvent['blocks'],
    text: blocks.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n'),
    isSidechain: false,
  };
}

function toolUse(name: string, id = `id_${name}`) {
  return { type: 'tool_use', name, id, input: { foo: 'bar' } };
}
function toolResultError(content: string, id = 'id_x') {
  return { type: 'tool_result', tool_use_id: id, content, is_error: true };
}

const scenarios: Scenario[] = [
  {
    name: 'done-claim fires',
    input: { last_assistant_message: 'Готово, всё закоммичено, tests pass', session_id: 's1' },
    events: [ev('assistant', [toolUse('Bash')]), ev('assistant', [toolResultError('ok')])],
    expect: 'DONE_CLAIM',
  },
  {
    name: 'plain chat stays quiet',
    input: { last_assistant_message: 'Могу объяснить подробнее, если надо', session_id: 's2' },
    events: [],
    expect: null,
  },
  {
    name: 'recurring error fires',
    input: { last_assistant_message: 'всё ещё падает сборка', session_id: 's3' },
    events: [
      ev('assistant', [toolUse('Bash', 'a')]),
      ev('assistant', [toolResultError('Error: cannot find module x\n    at compile', 'a')]),
      ev('assistant', [toolUse('Bash', 'b')]),
      ev('assistant', [toolResultError('Error: cannot find module x\n    at compile', 'b')]),
    ],
    expect: 'RECURRING_ERROR',
  },
  {
    name: 'recurring error stale once stays quiet',
    input: { last_assistant_message: 'продолжаю', session_id: 's4' },
    events: [
      ev('assistant', [toolUse('Bash', 'a')]),
      ev('assistant', [toolResultError('Error: EBUSY', 'a')]),
      ev('assistant', [toolUse('Bash', 'b')]),
      ev('assistant', [toolResultError('Error: another thing', 'b')]),
    ],
    expect: null,
  },
  {
    name: 'plan approach fires',
    input: { last_assistant_message: 'предлагаю такой план:', session_id: 's5' },
    events: [ev('assistant', [toolUse('ExitPlanMode')])],
    expect: 'PLAN_APPROACH',
  },
  {
    name: 'done-claim without tool work stays quiet',
    input: { last_assistant_message: 'сделал выводы', session_id: 's6' },
    events: [],
    expect: null,
  },
  {
    name: 'done with real mutating work fires',
    input: { last_assistant_message: 'finally fixed it, shipping now', session_id: 's7' },
    events: [ev('assistant', [toolUse('Edit')]), ev('assistant', [toolResult('fixed', 'id_Edit')])],
    expect: 'DONE_CLAIM',
  },
];

function toolResult(content: string, id: string) {
  return { type: 'tool_result', tool_use_id: id, content, is_error: false };
}

function runOffline(): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;
  for (const s of scenarios) {
    const key = detectKeyPoint(s.input as never, s.events);
    const ok = (key?.kind ?? null) === s.expect;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name}  → got=${key?.kind ?? 'null'} expected=${s.expect}`);
    if (ok) pass += 1;
    else fail += 1;
  }
  // Real-transcript smoke: run detector over the most recent session files that exist.
  const root = path.join(os.homedir(), '.claude', 'projects');
  const candidates: string[] = [];
  if (fs.existsSync(root)) {
    const dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name));
    for (const dir of dirs) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f));
      for (const f of files) {
        try {
          const st = fs.statSync(f);
          if (Date.now() - st.mtimeMs < 1000 * 60 * 60 * 24 * 30 && st.size < 5_000_000) candidates.push(f);
        } catch { /* skip */ }
      }
    }
  }
  const samples = candidates.slice(0, 30);
  let fired = 0;
  for (const f of samples) {
    const events = parseTranscriptEvents(fs.readFileSync(f, 'utf-8')).events;
    const input = { last_assistant_message: events.filter((e) => e.type === 'assistant' && e.text.trim()).pop()?.text ?? '', session_id: path.basename(f), transcript_path: f, cwd: '' };
    const key = detectKeyPoint(input, events);
    if (key) {
      fired += 1;
      console.log(`REAL  ${key.kind}  ${path.basename(path.dirname(f))}/${path.basename(f)}  ← ${key.reason}`);
    }
  }
  console.log(`REAL transcript samples: ${samples.length}, key points fired: ${fired}`);
  return { pass, fail };
}

async function runLive(): Promise<void> {
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').trim();
  const tok = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!base || !tok) {
    console.log('LIVE SKIP — ANTHROPIC_BASE_URL/token not set');
    return;
  }
  const model = process.env.ADVISOR_MODEL ?? 'gpt-5.6-sol';

  interface LiveCase {
    label: string;
    key: KeyPoint;
    packet: string;
  }
  const cases: LiveCase[] = [
    {
      label: 'DONE_CLAIM',
      key: { kind: 'DONE_CLAIM', reason: 'финальное сообщение декларирует завершение работы', evidence: ['write ok'] },
      packet:
        `Реальная мини-сессия: юзер попросил создать tools/advisor/poc-probe.txt. ` +
        `В транскрипте: [TOOL Write] создан файл (File created successfully), [ASSISTANT] финальное: «Готово, файл создан».`,
    },
    {
      label: 'RECURRING_ERROR',
      key: { kind: 'RECURRING_ERROR', reason: 'один и тот же сбой повторяется (2x): cannot find module tsx', evidence: ['boom'] },
      packet:
        `Агент дважды запустил тест и дважды получил одинаковую ошибку: [TOOL_RESULT ERROR] Cannot find module 'tsx'. ` +
        `Третий прогон — та же ошибка. Финальное сообщение: «не пойму, почему tsx не виден».`,
    },
    {
      label: 'PLAN_APPROACH',
      key: { kind: 'PLAN_APPROACH', reason: 'ExitPlanMode / plan tool use in the recent window', evidence: ['ExitPlanMode seen'] },
      packet:
        `Юзер попросил спроектировать новый модуль. Агент вызвал ExitPlanMode. ` +
        `План: положить парсер в tools/advisor/, переиспользовать parseTranscriptEvents, вызов модели через sub2api /v1/messages.`,
    },
  ];

  console.log('\n== LIVE metric run ==');
  for (const c of cases) {
    const prompt = buildAdvisorPrompt(c.packet, c.key);
    const t0 = Date.now();
    let status = 0;
    let text = '';
    let usage: Record<string, unknown> = {};
    try {
      const r = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': tok, authorization: `Bearer ${tok}`, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 600, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
      });
      status = r.status;
      const j = (await r.json()) as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown> };
      text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
      usage = j.usage ?? {};
    } catch (e) {
      status = -1;
      text = String(e);
    }
    const ms = Date.now() - t0;
    const inTok = (usage as { input_tokens?: number }).input_tokens ?? -1;
    const outTok = (usage as { output_tokens?: number }).output_tokens ?? -1;
    const words = text.split(/\s+/).filter(Boolean).length;
    console.log(`LIVE ${c.label}: http=${status} ${ms}ms in=${inTok} out=${outTok} guidanceWords=${words} hasGuidance=${Boolean(text)}`);
    if (text) {
      console.log('  └ ' + text.replace(/\n+/g, '\n  ').split('\n').slice(0, 4).join('\n  ').slice(0, 700));
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const res = runOffline();
  if (args.includes('--fast')) {
    // Fast-mode evidence extraction (deterministic patterns, parallel chunks) over a real transcript.
    const { extractEvidenceParallel, renderEvidence } = await import('../fast-evidence.mjs');
    const targets = args.includes('--fast-sample')
      ? [path.join(os.homedir(), '.claude', 'projects', 'E--repos-dev-pomogator', 'daf63440-cdb2-402f-b00a-fb2ef5e69190.jsonl')]
      : [];
    let ran = false;
    for (const f of targets) {
      if (!fs.existsSync(f)) continue;
      const t0 = Date.now();
      const raw = fs.readFileSync(f, 'utf-8');
      const ev = await extractEvidenceParallel(raw);
      const packet = renderEvidence(ev);
      const ms = Date.now() - t0;
      console.log(`\nFAST ${path.basename(f)}: rawLines=${raw.split(/\r?\n/).length} extract=${ms}ms packetChars=${packet.length}`);
      console.log(`  recurring=${JSON.stringify(ev.recurring)}`);  console.log(`  files=${JSON.stringify(ev.files.slice(0, 4))}`);
      console.log(`  commands=${JSON.stringify(ev.commands.slice(0, 4))}  toolUses=${ev.toolUses} errResults=${ev.errResults}`);
      ran = true;
    }
    if (!ran) console.log('\nFAST — no sample transcript found; run with --fast-sample or point at a real session.');
  }
  if (args.includes('--live')) await runLive();
  if (args.includes('--transcript')) {
    const idx = args.indexOf('--transcript');
    const f = args[idx + 1];
    if (f && fs.existsSync(f)) {
      const events = parseTranscriptEvents(fs.readFileSync(f, 'utf-8')).events;
      const input = { last_assistant_message: events.filter((e) => e.type === 'assistant' && e.text.trim()).pop()?.text ?? '', session_id: 'manual', transcript_path: f, cwd: '' };
      const key = detectKeyPoint(input, events);
      console.log(`\nTRANSCRIPT ${f}`);
      console.log(`  detector → ${key?.kind ?? 'null'}  (${key?.reason ?? ''})`);
      if (key) console.log(`  packet head:\n${buildPacket(input, events).slice(0, 600)}`);
    }
  }
  process.exitCode = res.fail > 0 ? 1 : 0;
}

void main();