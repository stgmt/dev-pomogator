/**
 * Secret redaction for Phase 0 pre-write validation (NFR-S1).
 *
 * Scans generated content (`.onboarding.json`, `.onboarding.md`, rule file) для
 * known secret patterns — blocks write if CRITICAL leakage detected. Phase 0 must
 * never leak `AUTO_COMMIT_API_KEY` values or similar — variable names are fine,
 * values are not.
 *
 * Patterns cover: OpenAI (sk-*), GitHub PATs (ghp_/gho_/ghs_/ghu_/ghr_),
 * Slack tokens (xox[bpsoa]-*), AWS Access Keys (AKIA*), JWTs (eyJ*.*.*),
 * Google OAuth (ya29.*).
 *
 * See .specs/onboard-repo-phase0/NFR.md#security.
 */


export interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high';
}


// Order matters: more specific patterns before generic (anthropic sk-ant- before generic sk-*).
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'anthropic-api-key', regex: /sk-ant-[A-Za-z0-9_-]{20,}/g, severity: 'critical' },
  { name: 'openai-api-key', regex: /sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/g, severity: 'critical' },
  { name: 'github-pat', regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g, severity: 'critical' },
  { name: 'slack-token', regex: /xox[bpsoa]-[A-Za-z0-9-]{10,}/g, severity: 'critical' },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' },
  { name: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: 'high' },
  { name: 'google-oauth', regex: /\bya29\.[A-Za-z0-9_-]{20,}\b/g, severity: 'critical' },
];


export interface SecretHit {
  pattern: string;
  severity: 'critical' | 'high';
  match: string;
  position: number;
}


export function detectSecrets(content: string): SecretHit[] {
  if (typeof content !== 'string' || content.length === 0) return [];
  const hits: SecretHit[] = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content)) !== null) {
      hits.push({
        pattern: pattern.name,
        severity: pattern.severity,
        match: match[0],
        position: match.index,
      });
    }
  }
  return hits;
}


export interface RedactionResult {
  redacted: string;
  hits: SecretHit[];
  hasCritical: boolean;
}


export function redactSecrets(content: string): RedactionResult {
  if (typeof content !== 'string' || content.length === 0) {
    return { redacted: content, hits: [], hasCritical: false };
  }

  const hits = detectSecrets(content);
  if (hits.length === 0) {
    return { redacted: content, hits: [], hasCritical: false };
  }

  let redacted = content;
  for (const hit of hits) {
    const replacement = `[REDACTED:${hit.pattern}]`;
    redacted = redacted.split(hit.match).join(replacement);
  }

  return {
    redacted,
    hits,
    hasCritical: hits.some((h) => h.severity === 'critical'),
  };
}


export class SecretLeakageError extends Error {
  constructor(public readonly hits: SecretHit[]) {
    const critical = hits.filter((h) => h.severity === 'critical');
    const summary = critical.length > 0
      ? `${critical.length} critical secret(s) detected: ${critical.map((h) => h.pattern).join(', ')}`
      : `${hits.length} secret(s) detected: ${hits.map((h) => h.pattern).join(', ')}`;
    super(`SecretLeakageError: ${summary}. Phase 0 aborted to prevent leakage.`);
    this.name = 'SecretLeakageError';
  }
}


export function assertNoSecretsInContent(content: string, context?: string): void {
  const hits = detectSecrets(content);
  const critical = hits.filter((h) => h.severity === 'critical');
  if (critical.length > 0) {
    const err = new SecretLeakageError(critical);
    if (context) err.message = `[${context}] ${err.message}`;
    throw err;
  }
}


export function assertNoSecretsInObject(obj: unknown, context?: string): void {
  const serialized = JSON.stringify(obj);
  assertNoSecretsInContent(serialized, context);
}
