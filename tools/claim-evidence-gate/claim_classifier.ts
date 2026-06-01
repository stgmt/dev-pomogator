/**
 * Claim classifier for the claim-evidence gate.
 *
 * classify() inspects the final assistant message and returns the claim CLASSES it makes
 * that intrinsically require a tool to back them. firstUnsupported() pairs each hit with
 * the turn's tool_uses and returns the first claim that lacks its required evidence.
 *
 * Design bias: default to APPROVE. A hit requires a STRUCTURAL pattern (a verdict grid, a
 * standalone completion assertion, a negative-existence claim, an explicit [VERIFIED]
 * marker) — never a single stray word — and a block requires zero matching evidence.
 */

import type { ToolUse } from './turn_window.ts';

export type ClaimClass = 'analysis-verdict' | 'works-done' | 'not-found-impossible' | 'verified-marker';

export interface ClaimHit {
  cls: ClaimClass;
  /** plain-language description of the evidence the agent should have produced */
  need: string;
  /** for verified-marker: the X from [VERIFIED via X] */
  detail?: string;
}

/**
 * Strip fenced/inline code and quotations so verdict tokens or claims that appear inside
 * EXAMPLES or CITATIONS are not treated as live claims (same idiom as pinator-stop.js).
 */
export function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/«[^»]{1,400}»/g, ' ')
    .replace(/"[^"]{1,400}"/g, ' ')
    .replace(/'[^']{1,400}'/g, ' ');
}

// ── evidence predicates over the turn's tool_uses ───────────────────────────

/** Executor tools that can run something / produce a result or a verdict. */
function executorCount(tools: ToolUse[]): number {
  return tools.filter(
    (t) =>
      t.name === 'bash' ||
      t.name === 'powershell' ||
      t.name === 'agent' ||
      t.name === 'task' ||
      t.name.startsWith('mcp__'),
  ).length;
}

/** Search/lookup tools that can substantiate a "does not exist" claim. */
function searchCount(tools: ToolUse[]): number {
  return tools.filter(
    (t) =>
      t.name === 'grep' ||
      t.name === 'glob' ||
      t.name === 'websearch' ||
      t.name === 'webfetch' ||
      t.name === 'task' ||
      t.name === 'agent' ||
      t.name.startsWith('mcp__octocode') ||
      t.name.includes('search'),
  ).length;
}

// ── class detectors (operate on stripped text, except the [VERIFIED] marker) ──

const VERDICT = /(\bPASS\b|\bFAIL\b|✅|❌|✔|✗|\bPASSED\b|\bFAILED\b|\bПРОЙДЕН|\bПРОВАЛЕН|\bПРОВАЛ\b)/g;
const ENUM_ITEM = /\b(?:q|item|scene|сцена|вопрос|пункт|вариант|case|кейс|тест|test)\s*\d+/gi;

/** ≥2 rows of verdict tokens (a grid/list), or ≥2 enumerated items each carrying a verdict. */
function isAnalysisVerdict(text: string): boolean {
  const verdictLines = text.split(/\r?\n/).filter((ln) => {
    VERDICT.lastIndex = 0;
    return VERDICT.test(ln);
  }).length;
  if (verdictLines >= 2) return true;

  const enums = (text.match(ENUM_ITEM) ?? []).length;
  const verdicts = (text.match(VERDICT) ?? []).length;
  return enums >= 2 && verdicts >= 2;
}

// Deliberately NOT including bare "готово" — it marks "I finished the edit", not a
// claim that the thing WORKS, and would false-fire on almost every turn.
const WORKS_DONE =
  /(работает|заработал[оа]?|пофикшен[оа]?|починен[оа]?|фикс\s+(?:деплоен|задеплоен|готов|применён|применен)|вс[её]\s+ок|убит[оа]|works\b|deployed\b|all\s+good\b|fixed\b|тесты\s+(?:проходят|зелён)|зелёные\s+тесты|green\b)/i;
// NB: JS \b is ASCII-only and does NOT mark a boundary before Cyrillic, so these guards
// use (?:^|\s) / explicit separators instead of \b around Russian words.
const NEG_BEFORE = /(?:^|[\s,;(])(не|ни|если|чтобы|пока|not|no|n['’]t|when|to\s+make)\s*$/i;
const WORKS_EXPLAINER = /^[\s:]*(так|следующим|вот\s+как|потому|because|like\s+this|as\s+follows)/i;

/** A standalone completion assertion ("works/done/deployed") — not negated, not an explainer. */
function isWorksDone(text: string): boolean {
  const m = WORKS_DONE.exec(text);
  if (!m) return false;
  const before = text.slice(Math.max(0, m.index - 14), m.index);
  if (NEG_BEFORE.test(before)) return false; // negated / conditional
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 16);
  if (WORKS_EXPLAINER.test(after)) return false; // "работает так: ..." — explaining, not a claim
  return true;
}

const NOT_FOUND =
  /(не\s+нашёл|не\s+нашел|не\s+существует|нет\s+(?:такого|публичных|готового|готовых|решени)|архитектурно\s+невозможно|невозможно\s+(?:сделать|реализовать|починить)|единственный\s+способ|no\s+(?:public\s+)?solution|does(?:n['’]t|\s+not)\s+exist|architecturally\s+impossible|impossible\s+to)/i;

function isNotFound(text: string): boolean {
  return NOT_FOUND.test(text);
}

const VERIFIED_MARKER = /\[VERIFIED\s+via\s+([^\]]{1,80})\]/i;

// ── public API ──────────────────────────────────────────────────────────────

/** rawText = the raw assistant message (for the [VERIFIED] marker which lives in prose). */
export function classify(rawText: string): ClaimHit[] {
  const text = stripCode(rawText);
  const hits: ClaimHit[] = [];

  const vm = VERIFIED_MARKER.exec(rawText);
  if (vm) hits.push({ cls: 'verified-marker', need: `реальный вызов «${vm[1].trim()}» в этом ходе`, detail: vm[1].trim() });

  if (isAnalysisVerdict(text)) {
    hits.push({ cls: 'analysis-verdict', need: 'запуск инструмента (Bash/Task/MCP), который реально породил эти вердикты' });
  }
  if (isWorksDone(text)) {
    hits.push({ cls: 'works-done', need: 'реальный прогон (тесты/запуск) в этом ходе' });
  }
  if (isNotFound(text)) {
    hits.push({ cls: 'not-found-impossible', need: '≥2 поисковых вызова (Grep/Glob/WebSearch/octocode) в этом ходе' });
  }
  return hits;
}

const MIN_SEARCH_DEFAULT = 2;

export function evidenceSatisfied(hit: ClaimHit, tools: ToolUse[], minSearch = MIN_SEARCH_DEFAULT): boolean {
  switch (hit.cls) {
    case 'analysis-verdict':
    case 'works-done':
      return executorCount(tools) >= 1;
    case 'not-found-impossible':
      return searchCount(tools) >= minSearch;
    case 'verified-marker': {
      const tokens = (hit.detail ?? '').toLowerCase().match(/[a-zа-яё0-9]{3,}/g) ?? [];
      if (tokens.length === 0) return true; // nothing to match → don't block
      return tools.some((t) => tokens.some((tok) => t.name.includes(tok) || t.input.includes(tok)));
    }
  }
}

/** First claim that lacks its required evidence, or null if all claims are supported. */
export function firstUnsupported(rawText: string, tools: ToolUse[], minSearch = MIN_SEARCH_DEFAULT): ClaimHit | null {
  for (const hit of classify(rawText)) {
    if (!evidenceSatisfied(hit, tools, minSearch)) return hit;
  }
  return null;
}
