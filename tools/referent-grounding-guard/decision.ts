/**
 * referent-grounding-guard — pure decision core (Component A).
 *
 * THE CASE IT COVERS: the user references a concrete artifact ("the original I showed you"); the agent
 * substitutes its own property-checklist and re-guesses; the user rejects; the agent guesses AGAIN — 16×.
 * No shipped harness binds *consecutive USER rejection of the same ask* → *stop guessing, enumerate the
 * referents, ask which* (see audit-reports/referent-grounding-failure-analysis.md §7.3 — the detection
 * MACHINERY exists, e.g. claude-learn; the recovery action is the narrower, uncommon part).
 *
 * This module is ONLY the deterministic, provable core: count the consecutive trailing run of user turns
 * that REJECT the prior deliverable. On >= threshold the UserPromptSubmit hook injects a polarity-flip
 * reminder. Pure + exported so a BDD Scenario Outline pins it both directions (mutation surface), and
 * builtins-only / no imports so it runs for plugin users with no node_modules (rule: dead-integration-guard).
 *
 * PROOF BOUNDARY (honest): this proves the GATE FIRES correctly. Whether the injected reminder actually
 * makes the model ask-instead-of-guess is BEHAVIOURAL — measured in shadow (fires-log) + a replay of the
 * real case, NOT proven here.
 */

export interface ReferentGuardConfig {
  /** consecutive rejecting user turns required to trip (default 2). */
  threshold?: number;
}

export interface ReferentGuardDecision {
  /** true → the hook should inject the "stop guessing / enumerate / ask which" reminder. */
  trip: boolean;
  /** length of the consecutive trailing run of rejecting user turns. */
  consecutiveRejections: number;
  /** the rejection phrase matched in each counted turn (oldest→newest) — agent-independent evidence for the fires-log. */
  matched: string[];
}

/**
 * Rejection lexicon — grounded in REAL tokens, NOT invented:
 *  • this session's own rejections ("не то", "никак не связано", "ты даун", "16 раз", "не верю", "шляпа");
 *  • claude-learn/learning-signal-hook.py CORRECTION+FRUSTRATION patterns ("wrong", "not that", "i said",
 *    "again?", "how many times", "you keep", "same mistake", "i just said").
 * JS \b is ASCII-only (no boundary before Cyrillic), so Russian alternatives use explicit edges / stems.
 */
const REJECTION_PATTERNS: RegExp[] = [
  // ── RU ──
  /(?:^|[\s,.;!?(])не\s*то(?:[\s,.;!?)]|$)/i,
  /(?:^|[\s,.;!?(])не\s*это(?:[\s,.;!?)]|$)/i,
  /не\s*так\b/i,
  /не\s+верю/i,
  /не\s+понял\s+сут/i,
  /никак\s+не\s+связ/i,
  /не\s*ориг/i,
  /\bопять\b/i,
  /\bснова\b/i,
  /\d+\s*раз\b/i,
  /\bты\s+(?:даун|дурак|дебил|тупой|идиот)/i,
  /\bхуйн/i,
  /\bшляп/i,
  // ── EN (claude-learn parity) ──
  /\bwrong\b/i,
  /not\s+that\b/i,
  /that'?s\s+not\b/i,
  /not\s+what\s+i\b/i,
  /\bi\s+said\b/i,
  /\bi\s+told\s+you\b/i,
  /\bi\s+just\s+said\b/i,
  /again\?/i,
  /how\s+many\s+times\b/i,
  /you\s+keep\b/i,
  /same\s+mistake\b/i,
  /\bstill\s+not\b/i,
  /\bnot\s+it\b/i,
];

/** First rejection phrase in a single user turn, or null if the turn is not a rejection. */
export function firstRejectionToken(turn: string): string | null {
  const text = (turn ?? '').trim();
  if (!text) return null;
  for (const re of REJECTION_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0].trim();
  }
  return null;
}

/**
 * Decide whether the referent-grounding guard trips. Walks the user turns from MOST RECENT backwards and
 * counts the trailing run of consecutive rejecting turns — a NEW (non-rejecting) ask ends the streak, so a
 * fresh request after a resolved one never trips. Pure: same input → same output.
 */
export function referentGuardDecision(
  recentUserTurns: string[],
  cfg: ReferentGuardConfig = {},
): ReferentGuardDecision {
  const threshold = Math.max(1, cfg.threshold ?? 2);
  const matched: string[] = [];
  for (let i = recentUserTurns.length - 1; i >= 0; i--) {
    const hit = firstRejectionToken(recentUserTurns[i]);
    if (!hit) break; // a non-rejection turn ends the consecutive trailing run
    matched.unshift(hit);
  }
  return { trip: matched.length >= threshold, consecutiveRejections: matched.length, matched };
}
