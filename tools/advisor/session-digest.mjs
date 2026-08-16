/**
 * session-digest.mjs — the advisor's context engine (i.e. NOT "dump the whole session").
 *
 * Adapted from the patterns used by real-context assemblers:
 *   - pr-agent compression strategy: prioritize by relevance, not position; token-bounded; keep
 *     the precious signal, list the rest as "other modified".
 *   - pr-agent dynamic/asymmetric context: more context BEFORE the change than after; recent
 *     activity is detailed, distant activity degrades to summaries.
 *   - subagent-brief: the advisor gets a STRUCTURED BRIEF (goals, recent work, evidence) and does
 *     read-only self-verification instead of guessing; if evidence is missing it says so.
 *   - two-pass summary-then-advise (self-reflection): a cheap model builds the situation report,
 *     the advisor model advises on it — instead of one big call over raw 30k chars.
 *
 * Layers produced from one immutable transcript snapshot:
 *   A. GOALS   — first human request, latest human request (goal drift), active plan (from
 *                ExitPlanMode.input.plan, the plan file's own text) with its top-level steps.
 *   B. RECENT  — asymmetric window: the last K tool events in detail, older ones collapsed to a
 *                per-event one-liner + counts.
 *   C. ERRORS  — recurring error signatures (from fast-evidence).
 *   D. FILES/COMMANDS — touched paths and non-trivial bash (from fast-evidence).
 *   E. SELFCHECK — read-only probes: git status/branch/diff stat/diff check, touched-file
 *                existence, run in the repo; fail-open when not a git repo or cmd missing.
 *
 * Two passes:
 *   pass1 (cheap model)  -> situation report (goals, drift, blockers, unverified claims).
 *   pass2 (advisor model)-> guidance 3-6 bullets grounded in report + digest + selfcheck.
 *
 * Pure functions are unit-testable; no network in extract/layers/selfcheck.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractEvidenceParallel, renderEvidence } from './fast-evidence.mjs';
import {
  readOrCreateSummary, summaryFilePath, stateFilePath, parseTranscript, sliceDelta as sliceSummaryDelta,
  flattenDelta, DEFAULT_TEMPLATE,
} from './session-summary.mjs';
import { getMindlasStats, renderMindlasStats } from './mindlas-stats.mjs';

export const RECENT_DETAIL_EVENTS = 14;      // events kept in full detail (asymmetric head)
export const MAX_OLD_EVENTS = 40;            // older events collapsed to one-liners
export const MAX_USER_ASKS = 6;
export const MAX_PLAN_LINES = 40;
export const SELFCHECK_TIMEOUT_MS = 8000;

const ASK_NOISE_RE =
  /(Re-invocation of \/|is already loaded above|Base directory for this skill|continued from a previous conversation|Skill \/\S+ was loaded earlier|^\s*`|^# \/|^\s*<local-command|Request interrupted by user|Stop hook|task-notification)/;
const CONV_TYPES = new Set(['user', 'assistant']);

/* ---------------- lightweight transcript read ---------------- */

function textBlockText(block) {
  return typeof block?.text === 'string' ? block.text.trim() : '';
}

export function readConvo(raw) {
  const out = {
    userAsks: [],           // [{line, text}] real human prompts (noise-filtered)
    plan: null,             // last ExitPlanMode.input.plan markdown
    planFile: null,         // exitPlanMode.input.planFilePath if present
    toolEvents: [],         // [{line, type, name, input, err, resultText}] ordered
    assistantTexts: [],     // last few assistant final texts
  };
  let lastAssist = '';
  for (const [i, line] of String(raw ?? '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const type = String(o.type ?? '');
    if (!CONV_TYPES.has(type)) continue;
    const content = Array.isArray(o.message?.content) ? o.message.content : null;
    if (!content) continue;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (type === 'user' && b.type === 'text') {
        const t = textBlockText(b);
        if (t && t.length > 4 && !ASK_NOISE_RE.test(t)) out.userAsks.push({ line: i + 1, text: t });
      }
      if (type === 'user' && typeof b.tool_use_id === 'string') {
        const text = String(typeof b.content === 'string' ? b.content : (b.content && typeof b.content === 'object' ? JSON.stringify(b.content) : '')).replace(/\s+/g, ' ').slice(0, 600);
        const err = b.is_error === true;
        const id = String(b.tool_use_id ?? '');
        // attach result to the most recent toolEvent with a matching id (usually same stream)
        const prev = out.toolEvents[out.toolEvents.length - 1];
        if (prev && prev.id === id) prev.err = err, prev.resultText = text;
        else out.toolEvents.push({ line: i + 1, type: 'result', id, err, resultText: text });
      }
      if (type === 'assistant' && b.type === 'tool_use') {
        const name = String(b.name ?? '');
        // exclude the advisory tool's own in-flight call — the on-disk transcript lags, so the
        // advisor would otherwise see its own not-yet-resulted call as an empty `{}` response.
        if (/advisor|consult/i.test(name)) continue;
        out.toolEvents.push({
          line: i + 1, type: 'tool', id: String(b.id ?? ''), name,
          input: b.input ?? {}, err: false, resultText: '',
        });
        if (name === 'ExitPlanMode') {
          const input = (b.input ?? {}) ;
          const plan = typeof input.plan === 'string' ? input.plan : null;
          if (plan && plan.trim()) { out.plan = plan; out.planFile = typeof input.planFilePath === 'string' ? input.planFilePath : null; }
        }
      }
      if (type === 'assistant' && b.type === 'text') {
        const t = textBlockText(b);
        if (t && t.length > 4) lastAssist = t;
      }
    }
  }
  if (lastAssist) out.assistantTexts.push(lastAssist);
  return out;
}

/* ---------------- goals layer (plan + goal drift) ---------------- */

export function buildGoalsLayer(convo) {
  const asks = convo.userAsks;
  const first = asks[0]?.text ?? '';
  const last = asks[asks.length - 1]?.text ?? '';
  const drift = first && last && first !== last
    ? { first: first.slice(0, 400), last: last.slice(0, 400) }
    : null;
  const planLines = String(convo.plan ?? '').split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const planHead = [];
  const SKIP_HEAD = /^(Простыми словами|Сейчас \(как работает\)|Как должно быть|Правильно понял\?|Context|Existing-Spec Inventory|Domain\/Lifecycle|Installation\/Runtime|Todos|Verification Plan|Источники|Пруфы|Связанные|Out of scope|Open questions|💬|🎯|📚|✅|❌)/;
  let sawSteps = false;
  for (const l of planLines.slice(0, 120)) {
    if (planHead.length >= MAX_PLAN_LINES) break;
    if (/^\|/.test(l)) continue;                 // table rows are noise in a plan
    if (/^#{1,4}\s/.test(l)) {
      const title = l.replace(/^#+\s*/, '').trim();
      // top-level headings + "Extracted Requirements" act as plan skeleton;
      // deeper (###) blocks that open after steps are tables/inventory → skip
      if (title.length > 2 && !SKIP_HEAD.test(title) && /^#{1,2}\s/.test(l)) planHead.push(`▸ ${title}`);
      continue;
    }
    if (/^[-*]\s*\[.{0,2}\]/.test(l) || /^\d+[.)]/.test(l)) {
      sawSteps = true;
      planHead.push(l.slice(0, 200));
      continue;
    }
    // a dash bullet is a step only before a "### / inventory" section opens
    if (/^[-*]\s+\S/.test(l) && !sawSteps && planHead.length < 6) planHead.push(l.slice(0, 160));
  }
  const plan = convo.plan
    ? { title: (convo.plan.split('\n')[0] ?? '').replace(/^#+\s*/, '').slice(0, 120) || '(untitled plan)', outline: planHead.slice(0, 20).join('\n'), source: convo.planFile ?? 'transcript ExitPlanMode' }
    : null;
  return { first, last, drift, plan };
}

/* ---------------- activity layer (asymmetric window) ---------------- */

export function buildActivityLayer(convo) {
  const events = convo.toolEvents;
  const detailed = events.slice(-RECENT_DETAIL_EVENTS).map((e) => {
    if (e.type === 'tool') {
      const input = JSON.stringify(e.input ?? {}).slice(0, 300);
      const result = e.resultText ? ` → ${e.resultText.slice(0, 260)}${e.err ? ' (ERROR)' : ''}` : '';
      return `[tool ${e.name}] ${input}${result}`;
    }
    return `[result${e.err ? ' ERROR' : ''}] ${(e.resultText ?? '').slice(0, 260)}`;
  });
  const older = events.slice(0, -RECENT_DETAIL_EVENTS).slice(-MAX_OLD_EVENTS).map((e) =>
    e.type === 'tool' ? `[tool ${e.name}] st=${e.err ? 'ERR' : 'ok'}` : '(result)',
  );
  const toolCounts = {};
  for (const e of events) if (e.type === 'tool') toolCounts[e.name] = (toolCounts[e.name] ?? 0) + 1;
  return { detailed, older, toolCounts, toolTotal: events.length };
}

/* ---------------- digest assembly (layers + self-check) ---------------- */

/** Repo conventions layer — pr-agent v0.39 behavior: feed AGENTS.md/CLAUDE.md rules verbatim.
 *  Extracts only the "rules" surface (headings + guidance lines / forbidden rules), token-bounded.
 */
const REPO_RULE_LINE_RE =
  /\b(SHALL|MUST|MAY|запрещ(?:ен|ено|ена|ены)|запрет|нельзя|обязан(?:ы|а|о)?|должен|только через|никогда|никогда не|NEVER|не\s+запрещай|HARD|strictly)\b/i;
const REPO_RULE_MAX_ENTRIES = 24;
const REPO_RULE_MAX_CHARS = 2400;

const RULE_TEXT_CACHE = new Map();

export async function buildRepoRulesLayer(repoRoot) {
  const candidates = [
    path.join(repoRoot ?? '', 'AGENTS.md'),
    path.join(repoRoot ?? '', 'CLAUDE.md'),
    path.join(repoRoot ?? '', '.claude', 'CLAUDE.md'),
  ];
  const entries = [];
  let source = '';
  for (const f of candidates) {
    let text;
    try {
      if (!fs.existsSync(f)) continue;
      text = fs.readFileSync(f, 'utf-8');
      RULE_TEXT_CACHE.set(f, text);
    } catch { continue; }
    source = f;
    const lines = text.split(/\r?\n/);
    let inRules = false;
    for (const l of lines) {
      const raw = l.trim();
      // headings "## Rules" / "### Always-apply" open the rules surface
      if (/^##+\s*Rules|^###+\s*(Always-apply|Triggered)/.test(raw)) { inRules = true; continue; }
      if (/^##+\s/.test(raw) && !/Rules|Always-apply|Triggered/.test(raw)) { inRules = false; continue; }
      if (!inRules) continue;
      // table row or bullet: <rule-name> | <meaning> | <path>  (skip header/separator rows)
      const table = raw.match(/^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (table) {
        const name = table[1].trim();
        const meaning = table[2].trim();
        if (/^(Description|Rule|---|-{2,}|Path)$/.test(name) || /^-+$/.test(name) || /^-+$/.test(meaning)) continue;
        entries.push(`- ${name}: ${meaning.slice(0, 220)}`);
        continue;
      }
      if (REPO_RULE_LINE_RE.test(raw) && raw.length > 8 && raw.length < 320) {
        entries.push(`- ${raw.replace(/\|/g, '/').slice(0, 240)}`);
      }
      if (entries.length >= REPO_RULE_MAX_ENTRIES * 4) break;
    }
    if (entries.length) break;
  }
  // dedupe + bound
  const seen = new Set();
  const uniq = [];
  for (const e of entries) {
    const key = e.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(e);
    if (uniq.length >= REPO_RULE_MAX_ENTRIES) break;
  }
  // char bound
  let used = 0;
  const bounded = [];
  for (const e of uniq) {
    if (used + e.length > REPO_RULE_MAX_CHARS) break;
    bounded.push(e);
    used += e.length;
  }
  return { source, entries: bounded };
}

/** Read-only repo probes: git state + touched-file existence. Fail-open. */
/** Run a single git subcommand async; returns stdout trimmed or null (fail-open, timeout-safe). */
function gitRun(repoRoot, args) {
  if (!repoRoot || !fs.existsSync(path.join(repoRoot, '.git'))) return Promise.resolve(null);
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: repoRoot, encoding: 'utf-8', windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ok */ } }, SELFCHECK_TIMEOUT_MS);
    child.stdout?.on('data', (d) => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? out.trim() : null); });
  });
}

/**
 * Read-only repo probes, ASYNC: git state (branch/status/diff/diff-check run in parallel) +
 * touched-file existence. Fail-open: any error → null/empty, never throws.
 */
export async function runSelfCheck(repoRoot, touchedFiles = []) {
  const res = { git: null, files: null, problems: [] };
  // git subcommands run in PARALLEL (each is a separate async spawn, event loop not blocked).
  // `diff --check` is the most expensive on a dirty/large tree, so it's optional and skipped by
  // default on the fast path (git status --porcelain already tells us dirty); enabled via env.
  const wantCheck = process.env.ADVISOR_GIT_DIFF_CHECK === '1';
  const jobs = [
    gitRun(repoRoot, ['status', '--porcelain', '--branch']),
    gitRun(repoRoot, ['diff', '--stat', '--no-color']),
  ];
  if (wantCheck) jobs.push(gitRun(repoRoot, ['diff', '--check']));
  const [status, diffStat, diffCheck] = await Promise.all(jobs);
  if (status != null) {
    const branchM = status.match(/^## ([^\s.]+)/);
    res.git = {
      branch: branchM ? branchM[1] : '?',
      statusLines: status.split(/\r?\n/).length,
      statusHead: status.split(/\r?\n/).slice(0, 25).join('\n'),
      diffStat: diffStat ?? '',
      diffCheckClean: wantCheck ? !diffCheck : null,
    };
    if (wantCheck && typeof diffCheck === 'string' && diffCheck) res.problems.push('git diff --check not clean');
  }
  // touched-file existence (from fast-evidence files layer)
  if (Array.isArray(touchedFiles) && touchedFiles.length) {
    const checked = [];
    const missing = [];
    for (const f of touchedFiles.slice(0, 20)) {
      const abs = path.isAbsolute(f) ? f : repoRoot ? path.join(repoRoot, f) : f;
      if (fs.existsSync(abs)) checked.push(f);
      else missing.push(f);
    }
    res.files = { checked: checked.length, missing };
    if (missing.length) res.problems.push(`touched files missing on disk: ${missing.join(', ')}`);
  }
  return res;
}

export const SELF_PICKED_FILES = null; // legacy; file existence handled via touch

/** Check touched-file existence (from fast-evidence files layer) — cheap sync, no git. */
export function checkTouchedFiles(repoRoot, touchedFiles = []) {
  const res = { files: null, problems: [] };
  if (Array.isArray(touchedFiles) && touchedFiles.length) {
    const checked = [];
    const missing = [];
    for (const f of touchedFiles.slice(0, 20)) {
      const abs = path.isAbsolute(f) ? f : repoRoot ? path.join(repoRoot, f) : f;
      if (fs.existsSync(abs)) checked.push(f);
      else missing.push(f);
    }
    res.files = { checked: checked.length, missing };
    if (missing.length) res.problems.push(`touched files missing on disk: ${missing.join(', ')}`);
  }
  return res;
}

export async function buildSessionDigest({ transcriptPath, repoRoot }) {
  if (!transcriptPath) return { ok: false, reason: 'no transcript' };
  // read transcript + repo-rules + git self-check run together; the layers below are pure/fast
  const [[raw, rawErr], repoRules, selfCheckGit] = await Promise.all([
    fs.promises.readFile(transcriptPath, 'utf-8').then((t) => [t, null], (e) => ['', e]),
    buildRepoRulesLayer(repoRoot),
    runSelfCheck(repoRoot), // git part only (no touched-files yet — parallel, unblocks event loop)
  ]);
  if (rawErr) return { ok: false, reason: `cannot read transcript: ${rawErr.message}` };
  const convo = readConvo(raw);
  const fast = await extractEvidenceParallel(raw);
  const fastPacket = renderEvidence(fast);
  const activity = buildActivityLayer(convo);
  const goals = buildGoalsLayer(convo);
  // file existence check needs fast.files — cheap sync, no git
  const filesCheck = checkTouchedFiles(repoRoot, fast.files);
  const selfCheck = {
    git: selfCheckGit.git,
    files: filesCheck.files ?? selfCheckGit.files ?? null,
    problems: [...(selfCheckGit.problems ?? []), ...(filesCheck.problems ?? [])],
  };
  return {
    ok: true,
    rawLen: raw.length,
    lineCount: raw.split(/\r?\n/).length,
    goals,
    activity,
    repoRules,
    fast: { recurring: fast.recurring, files: fast.files, commands: fast.commands, userAsks: fast.userAsks, toolUses: fast.toolUses, errResults: fast.errResults, packet: fastPacket },
    selfCheck,
    assistantTexts: convo.assistantTexts.slice(-2),
  };
}

export function renderDigest(d) {
  return renderDigestPrioritized(d, {}).text;
}

/**
 * pr-agent-style prioritized, token-aware rendering:
 *  - collect "units" (page sections) each with a PRIORITY (higher = more important), a render that
 *    yields the full block, and optionally a compact "list" fallback;
 *  - fit units into a token budget: important units go in full; the rest are demoted to their list
 *    form; leftover units become a trailing "…and N more" count (like pr-agent's `other modified files`).
 *  - token estimate is approximate (chars/4) — good enough for internal budgeting.
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text) {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN) + 1;
}

export function renderDigestPrioritized(d, opts = {}) {
  const maxTokens = opts.maxTokens ?? Number(process.env.ADVISOR_DIGEST_MAX_TOKENS || 3000);
  // Build sections: { title, priority, body, list }
  const sections = [];
  const got = (title, body, priority, list) => {
    if (body && String(body).trim()) sections.push({ title, body: String(body), priority, list });
  };

  // A goals — highest priority, small
  if (d.goals?.plan) {
    got('GOAL / active plan', `title: ${d.goals.plan.title}\n${d.goals.plan.outline}`, 100,
      `GOAL: ${d.goals.plan.title}`);
  }
  if (d.goals?.drift) {
    got('GOAL DRIFT (start -> now)', `START: ${d.goals.drift.first}\nNOW: ${d.goals.drift.last}`, 95,
      `GOAL DRIFT present: start≠now`);
  } else if (d.goals?.last) {
    got('GOAL (latest)', d.goals.last, 95, `GOAL: ${d.goals.last.slice(0, 120)}`);
  }

  // B activity — recent detail is precious (asymmetric), older collapsed
  if (d.activity?.detailed?.length) {
    got('RECENT ACTIVITY', d.activity.detailed.join('\n'), 90,
      `RECENT ACTIVITY: ${d.activity.toolTotal} tool events (${Object.entries(d.activity.toolCounts ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')})`);
  }

  // C repo rules — pr-agent v0.39 behavior: feed AGENTS.md/CLAUDE.md conventions
  if (d.repoRules?.entries?.length) {
    got('REPO RULES (AGENTS.md/CLAUDE.md, applicable)', d.repoRules.entries.join('\n'), 85,
      d.repoRules.entries.slice(0, 8).join('; '));
  }

  // D errors
  if (d.fast?.recurring?.length) {
    got('RECURRING / ERROR SIGNALS', d.fast.recurring.map((s) => `- ${s}`).join('\n'), 80,
      d.fast.recurring.slice(0, 6).map((s) => `- ${s}`).join('\n'));
  }
  // E files
  if (d.fast?.files?.length) {
    got('FILES TOUCHED', d.fast.files.map((f) => `- ${f}`).join('\n'), 60,
      `FILES TOUCHED: ${d.fast.files.join(', ')}`);
  }
  // F commands
  if (d.fast?.commands?.length) {
    got('COMMANDS', d.fast.commands.map((c) => `- \`${c}\``).join('\n'), 50,
      `COMMANDS: ${d.fast.commands.join('; ')}`);
  }
  // G user prompts
  if (d.fast?.userAsks?.length) {
    got('USER PROMPTS (deduped)', d.fast.userAsks.map((a) => `- ${a.slice(0, 240)}`).join('\n'), 55,
      d.fast.userAsks.slice(0, 6).map((a) => `- ${a.slice(0, 120)}`).join('\n'));
  }
  // H selfcheck
  if (d.selfCheck?.git) {
    got('GIT SELF-CHECK', `branch=${d.selfCheck.git.branch} statusLines=${d.selfCheck.git.statusLines}\n${(d.selfCheck.git.statusHead || '')}`, 70,
      `GIT: ${d.selfCheck.git.branch} (${d.selfCheck.git.statusLines} status lines)`);
  }
  if (d.selfCheck?.problems?.length) {
    got('SELF-CHECK PROBLEMS', d.selfCheck.problems.map((p) => `- ${p}`).join('\n'), 90,
      d.selfCheck.problems.slice(0, 4).map((p) => `- ${p}`).join('\n'));
  }
  if (d.fast?.packet) {
    const stats = d.fast.packet.split('\n').filter((l) => l.trim().includes('tool_use blocks') || l.trim().includes('is_error'));
    if (stats.length) got('STATS', stats.join('\n'), 20, stats.join('; '));
  }

  // Fit into budget: sorted by priority desc; assign "full" until budget exhausted,
  // then "list" until budget exhausted again; the rest are counted as omitted.
  const ordered = sections.slice().sort((a, b) => b.priority - a.priority);
  const settled = [];
  const listBucket = [];
  let used = estimateTokens('## ' + ' '); // heading overhead
  let omitted = 0;

  const pushFull = (s, estimate) => {
    settled.push({ title: s.title, body: s.body });
    used += estimate;
  };
  const pushList = (s, estimate) => {
    if (s.list) listBucket.push({ title: s.title, body: s.list });
    used += estimate;
  };

  for (const s of ordered) {
    const fullEst = estimateTokens(s.body) + 2;
    if (used + fullEst <= maxTokens) { pushFull(s, fullEst); continue; }
    // full doesn't fit — try the compact list
    const listEst = estimateTokens(s.list ?? s.body) + 1;
    if (s.list && used + listEst <= maxTokens) { pushList(s, listEst); continue; }
    omitted++;
  }

  const out = [];
  for (const s of settled) out.push(`## ${s.title}\n${s.body}`);
  for (const s of listBucket) out.push(`## ${s.title} (compact)\n${s.body}`);
  if (omitted > 0) out.push(`## …and ${omitted} more section(s) omitted (budget ${maxTokens} tok)`);
  out.push(`\n(digest: ${sections.length} sections, budget ${maxTokens} tok, kept ${settled.length} full + ${listBucket.length} compact, omitted ${omitted})`);
  return { text: out.join('\n\n'), sections: ordered.length, kept: settled.length, compact: listBucket.length, omitted, maxTokens };
}

/* ---------------- two-pass consult ---------------- */

export function buildPass1Prompt(rendered) {
  return (
    `You are a session SUMMARIZER. Below is a structured digest of an AI coding session ` +
    `(plan/goal, goal drift, recent tool activity, error signals, files, commands, git state).\n` +
    `Produce a tight SITUATION REPORT (max ~60 words per section):\n` +
    `1. GOAL(s) — what the session is actually trying to achieve, and if the goal drifted start->now, state BOTH.\n` +
    `2. PROGRESS — what was recently done (tool calls, files, commands) and what is in-flight.\n` +
    `3. RISK — recurring errors, unverified claims (claims WITHOUT a confirming tool result), dirty diff, missing evidence.\n` +
    `4. MISSING — what information is still needed to judge this session fairly.\n` +
    `Do NOT invent facts. If an area has no data, say "no data".\n\n` + rendered
  );
}

/**
 * Build the pass-2 (advisor) prompt.
 *
 * `skeptic` — `balanced` (default) or `strict`:
 *   strict: the old always-on "double-check BEFORE declaring done" framing — biases every answer
 *           toward "don't declare done yet", even on complete, evidenced work.
 *   balanced: advises a REAL verdict. It blocks completion ONLY when there is an actual reason
 *           (missing evidence, goal drift, rule violation, recurring errors, dirty tree the agent
 *           must not touch) — otherwise it says the work looks sound and names ONE check. Avoids
 *           the template "Do not declare completion yet …" on every consult.
 */
export function buildPass2Prompt(rendered, report, { skeptic = 'balanced' } = {}) {
  if (skeptic === 'strict') {
    return (
      `You are an independent ADVISOR for an AI coding agent. A summarizer already distilled the session; ` +
      `below it is (a) that situation report and (b) the underlying structured digest (goals, recent tool ` +
      `activity, error signals, git self-check).\n\n` +
      `Give 3-6 concrete guidance bullets: what is risky, what to double-check BEFORE continuing or ` +
      `declaring done, what the agent may have missed. Ground every bullet in evidence from the report/digest ` +
      `(naming files/tools/errors). If the work looks sound, say so and name the ONE thing most worth ` +
      `verifying. If evidence is missing for an important claim, say so explicitly instead of assuming. ` +
      `Plain text, no JSON.\n\n` +
      `## SITUATION REPORT (summarizer)\n${report}\n\n` +
      `## STRUCTURED DIGEST\n${rendered}`
    );
  }
  // balanced — the advisor must give a genuine verdict, not reflexively block.
  return (
    `You are an independent ADVISOR for an AI coding agent. A summarizer already distilled the session; ` +
    `below it is (a) that situation report and (b) the underlying structured digest (goals, recent tool ` +
    `activity, error signals, git self-check).\n\n` +
    `Give a genuine, grounded verdict as 3-6 bullets.\n` +
    `- If the work looks COMPLETE and evidenced (the digest shows the actions, results and any required ` +
    `checks actually ran), say so clearly — do NOT manufacture "don't declare done" for its own sake. ` +
    `Name the ONE thing still most worth verifying.\n` +
    `- ONLY raise "completion is premature / do not declare done" when there is a CONCRETE reason in the ` +
    `digest: a required tool call or result is missing/unrun, the goal drifted from the plan, a repository ` +
    `rule (REPO RULES) is violated, errors recur, or evidence for an important claim is absent.\n` +
    `- Reference evidence by name (files, tools, errors, rule names). Plain text, no JSON.\n\n` +
    `## SITUATION REPORT (summarizer)\n${report}\n\n` +
    `## STRUCTURED DIGEST\n${rendered}`
  );
}

/** Cheap pass-1 model. Keep it lighter than the advisor. cacheControl: breakpoint on the last
 *  user message → cache_read hits on repeated calls (Mode B / repeat consults). */
export async function callModel(prompt, { model, maxTokens = 700, timeoutMs = 30000, cacheControl = false } = {}) {
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!base || !key) return { ok: false, text: '[model] no ANTHROPIC_BASE_URL/token configured' };
  const m = model ?? process.env.ADVISOR_MODEL ?? 'gpt-5.6-sol';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let messages = [{ role: 'user', content: prompt }];
  if (cacheControl) {
    messages = [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }];
  }
  try {
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: m, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages }),
    });
    if (!r.ok) return { ok: false, text: `[model] HTTP ${r.status} from ${base}` };
    const j = await r.json();
    const text = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    return { ok: Boolean(text), text: text || '[model] empty', usage: j.usage ?? null };
  } catch (e) {
    return { ok: false, text: `[model] ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function twoPassConsult(rendered, { summarizerModel, advisorModel, maxPass1Tokens = 700, timeoutMs = 45000, skeptic } = {}) {
  const p1 = await callModel(buildPass1Prompt(rendered), { model: summarizerModel ?? process.env.ADVISOR_SUMMARIZER_MODEL ?? 'gpt-5.6-luna', maxTokens: maxPass1Tokens, timeoutMs });
  if (!p1.ok) return { ok: false, error: p1.text, report: null, guidance: null };
  const report = p1.text;
  const mode = skeptic ?? process.env.ADVISOR_SKEPTIC ?? 'balanced';
  const p2 = await callModel(buildPass2Prompt(rendered, report, { skeptic: mode }), { model: advisorModel ?? process.env.ADVISOR_MODEL ?? 'gpt-5.6-sol', maxTokens: 800, timeoutMs });
  return { ok: p2.ok, error: p2.ok ? null : p2.text, report, guidance: p2.text, skeptic: mode };
}

/**
 * Build the advisor's view from the ROLLING SESSION SUMMARY (when one exists) + a small DELTA of
 * recent transcript entries — instead of rebuilding the whole 10MB+ digest.
 *
 * Returns { packet, meta } where meta tells the caller which mode was used.
 * - If summary.md exists AND its content is not merely the empty template → `summary` mode:
 *   packet = summary text + a compact transcript tail (last ~12 events) + repo-rules + git head.
 * - Else → fall back to the prioritized full-digest (first consult of a fresh session).
 */
export async function buildSummaryPacket({ transcriptPath, repoRoot, sessionId, maxTokens } = {}) {
  const metaBase = { mode: 'summary', summary: null, delta: 0, rawChars: 0, packetChars: 0 };
  const file = summaryFilePath(repoRoot, sessionId);
  const exists = file && fs.existsSync(file);
  let summary = '';
  let usedSummary = false;
  if (exists) {
    summary = fs.readFileSync(file, 'utf-8');
    usedSummary = summary.trim() !== DEFAULT_TEMPLATE.trim();
  }
  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  metaBase.rawChars = raw.length;

  if (usedSummary) {
    const { entries } = parseTranscript(raw);
    // delta = last ~12 events (asymmetric freshness), plus evidence layers
    const tailEvents = entries.slice(-12);
    const fast = await extractEvidenceParallel(raw);
    const deltaFlat = flattenDelta(tailEvents).slice(-30);
    const parts = [
      `# SESSION SUMMARY (rolling, from prior extractions)\n${summary}`,
      '## RECENT ACTIVITY (delta tail)',
      deltaFlat.length ? deltaFlat.join('\n') : '(no recent tool activity recorded)',
    ];
    if (fast.recurring?.length) parts.push(`## RECURRING / ERROR SIGNALS\n${fast.recurring.map((s) => `- ${s}`).join('\n')}`);
    if (fast.files?.length) parts.push(`## FILES TOUCHED\n${fast.files.map((f) => `- ${f}`).join('\n')}`);
    if (fast.commands?.length) parts.push(`## COMMANDS\n${fast.commands.map((c) => `- ${c}`).join('\n')}`);

    // MINDLAS deterministic metrics (fail-open; omitted when mindlas unavailable)
    let mindlasStats = null;
    try { mindlasStats = await getMindlasStats(); } catch { mindlasStats = null; }
    if (mindlasStats) {
      parts.push(renderMindlasStats(mindlasStats.parsed));
      metaBase.mindlas = true;
    } else {
      metaBase.mindlas = false;
    }

    const packet = parts.join('\n\n');
    metaBase.packetChars = packet.length;
    metaBase.mode = 'summary';
    metaBase.delta = tailEvents.length;
    metaBase.summary = true;
    return { packet, meta: metaBase };
  }

  // fall back
  const d = await buildSessionDigest({ transcriptPath, repoRoot });
  const rendered = renderDigestPrioritized(d, {}).text;
  metaBase.mode = 'digest';
  metaBase.packetChars = rendered.length;

  // MINDLAS metrics appended to the fallback digest too
  let mindlasStats2 = null;
  try { mindlasStats2 = await getMindlasStats(); } catch { mindlasStats2 = null; }
  if (mindlasStats2) {
    const md = renderMindlasStats(mindlasStats2.parsed);
    if (md) { metaBase.mindlas = true; return { packet: `${rendered}\n\n${md}`, meta: metaBase }; }
  }
  metaBase.mindlas = false;
  return { packet: rendered, meta: metaBase };
}