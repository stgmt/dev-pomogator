/**
 * Jargon / verbosity detector for the agent's FINAL user-facing message.
 *
 * Decides whether a response is a "wall of internal codes" (FR-21 / ARCH012 /
 * VARIANT_COVERAGE … with no plain-language gloss) or excessively verbose prose —
 * the exact failure modes the user keeps having to correct by hand.
 *
 * Pure + side-effect-free so it is unit-testable in isolation; the Stop hook
 * (answer_simple_stop.ts) wraps it with anti-loop marker logic.
 *
 * Design guard (avoid H1 over-application — see memory
 * feedback_single-incident-rules-over-generalize): only fires on a USER-FACING
 * prose answer that is genuinely dense with project codes. Hard-OUT for short
 * answers and for messages that are mostly code / diffs / tables (legitimate
 * technical artifacts), so it never nags on normal engineering output.
 */

export interface DetectOptions {
  /** Distinct internal codes tolerated before blocking (block at count > this). */
  maxCodes?: number;
  /** Prose word count above which a code-free answer is flagged as too long. */
  maxWords?: number;
  /** Below this word count the message is too short to judge — hard-OUT. */
  minWords?: number;
  /** Below this prose:total ratio the message is mostly code/tables — hard-OUT. */
  minProseRatio?: number;
}

export interface DetectResult {
  block: boolean;
  reasons: string[];
  stats: { words: number; distinctCodes: number; codes: string[]; proseRatio: number };
}

const DEFAULTS: Required<DetectOptions> = {
  maxCodes: 2,
  maxWords: 240,
  minWords: 60,
  minProseRatio: 0.55,
};

// Project-internal codes — NOT general engineering vocabulary (staging/CI/JSON/etc.
// stay allowed; those are fine for a technical reader). Each entry returns the matched
// literal so the block reason can name the offenders concretely.
const CODE_PATTERNS: RegExp[] = [
  /\b(?:FR|AC|NFR|UC|US|CHK)-?\d+\b/gi, // FR-21, AC-13, US-4, CHK-FR3
  /\bARCH-?\d{2,}\b/gi, // ARCH012
  /\bPLUGIN-?\d+\b/gi, // PLUGIN014
  /@feature\d+\b/gi, // @feature16
  /\bWave[-\s]?\d+\b/gi, // Wave 14
  /\bPhase\s?\d+(?:\.\d+)?\b/gi, // Phase 1.75
  /\bSTOP\s?#?\d+\b/gi, // STOP #3
  /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, // VARIANT_COVERAGE, MATRIX_COMPLETE (≥2 SCREAMING segments)
];

/** Remove fenced + inline code and markdown tables so we only judge user-facing prose. */
function stripNonProse(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`\n]+`/g, ' ') // inline code (file paths, identifiers)
    .replace(/^\s*\|.*\|\s*$/gm, ' '); // markdown table rows
}

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function detectJargon(message: string, opts: DetectOptions = {}): DetectResult {
  const cfg = { ...DEFAULTS, ...opts };
  const reasons: string[] = [];

  const prose = stripNonProse(message);
  const proseWords = countWords(prose);
  // proseRatio = prose vs the RAW message (code counted in the denominator only) —
  // so a code/diff/table-heavy answer scores low and is hard-OUT'd.
  const totalWords = countWords(message) || 1;
  const proseRatio = Math.min(1, proseWords / totalWords);

  // Distinct internal codes in PROSE only (code blocks already stripped).
  const found = new Set<string>();
  for (const re of CODE_PATTERNS) {
    for (const m of prose.matchAll(re)) found.add(m[0].toLowerCase());
  }
  const codes = [...found];
  const stats = { words: proseWords, distinctCodes: codes.length, codes, proseRatio };

  // Hard-OUT: mostly code / diffs / tables → legitimate technical output, never nag.
  if (proseRatio < cfg.minProseRatio) return { block: false, reasons, stats };

  const codeFlag = codes.length > cfg.maxCodes;
  const verboseFlag = proseWords > cfg.maxWords;

  // Hard-OUT: short AND clean → nothing wrong (e.g. "Готово, тест зелёный").
  // Code density is judged regardless of length: a one-liner with 3+ internal codes
  // is exactly the wall-of-codes failure, so it must not be skipped for being short.
  if (proseWords < cfg.minWords && !codeFlag) return { block: false, reasons, stats };

  if (codeFlag) {
    const shown = codes.slice(0, 6).join(', ');
    reasons.push(
      `Стена внутренних кодов (${codes.length}): ${shown}${codes.length > 6 ? ', …' : ''}. ` +
        `Перепиши простым языком — расшифруй каждый код в скобках бытовыми словами или убери. ` +
        `Читатель не обязан знать что значат эти коды.`,
    );
  }
  if (verboseFlag && !codeFlag) {
    reasons.push(
      `Ответ слишком длинный (${proseWords} слов сплошной прозой, порог ${cfg.maxWords}). ` +
        `Сократи до сути: что сделал и что дальше, без пересказа деталей.`,
    );
  }

  return { block: reasons.length > 0, reasons, stats };
}
