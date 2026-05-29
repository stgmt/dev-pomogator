/**
 * FR-26 LLM content boundary — deny-list pre-spawn check.
 *
 * Before any `claude -p` subprocess is invoked for semantic-drift analysis,
 * the prompt (FR + AC + Scenario text) is scanned for high-risk fragments
 * that must NEVER leave the local process boundary:
 *
 *   • secret-bearing identifiers (`API_KEY`, `BEARER`, `SECRET_KEY`,
 *     `PASSWORD`, `TOKEN`)
 *   • dotfile paths (`.env`, `.npmrc`, `.netrc`, `.git-credentials`)
 *   • private key file extensions (`.pem`, `.key`, `.pfx`, `.p12`)
 *
 * All matches are case-insensitive. The first match short-circuits with a
 * `denied` verdict so the caller never has to decide which pattern matched.
 * A SEMANTIC_CHECK_SKIPPED_DENY_LIST finding is the canonical signal the
 * MCP server emits when this fires.
 *
 * Per-spec opt-out at the FR.md frontmatter level (`spec_llm_judge_deny:
 * true`) is handled one layer up — see `index.ts`.
 *
 * @see .specs/spec-generator-v4/FR.md FR-26
 */

const DENY_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // Screaming-snake env-var style — case-SENSITIVE so plain English words
  // ("password", "token") in legitimate spec prose don't match.
  { name: 'secret-id-envvar', re: /\b(API[_-]?KEY|BEARER|SECRET[_-]?KEY|PASSWORD|TOKEN|ACCESS[_-]?KEY)\b/ },
  // Common assignment shape: `API_KEY=sk-...`, `password = "..."`. Matches
  // case-insensitively because the `=` makes the intent unambiguous.
  { name: 'secret-id-assign', re: /\b(api[_-]?key|secret[_-]?key|password|access[_-]?key|token)\s*[:=]\s*['"]?[\w.\-]{6,}/i },
  // HTTP `Authorization: Bearer <opaque>` header pattern.
  { name: 'bearer-header',    re: /\bAuthorization\s*:\s*Bearer\s+[\w.\-]+/i },
  { name: 'aws-key',          re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'dotfile',          re: /\.(env|npmrc|netrc|git-credentials)\b/i },
  { name: 'pem-key',          re: /\.(pem|key|pfx|p12)\b/i },
  { name: 'pem-header',       re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
  { name: 'jwt-shape',        re: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/ },
];

export interface DenyVerdict {
  denied: boolean;
  /** Which named pattern matched. Present iff `denied`. */
  pattern?: string;
  /** The matched substring, truncated to 80 chars. Present iff `denied`. */
  match?: string;
}

/**
 * Scan an arbitrary text payload (typically the constructed LLM prompt)
 * for any deny-list pattern. Returns the FIRST match — order of patterns
 * does not matter semantically, the caller only needs «is this safe to
 * send?».
 */
export function checkDenyList(text: string): DenyVerdict {
  for (const p of DENY_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      return {
        denied: true,
        pattern: p.name,
        match: m[0].length > 80 ? m[0].slice(0, 77) + '…' : m[0],
      };
    }
  }
  return { denied: false };
}

/**
 * Exported for tests + audit tooling — the full pattern catalogue. The
 * runtime path uses `checkDenyList`; this getter is for documentation.
 */
export function listPatterns(): ReadonlyArray<{ name: string; re: RegExp }> {
  return DENY_PATTERNS;
}
