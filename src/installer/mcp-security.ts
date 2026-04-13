/**
 * Secret detection in project `.mcp.json`.
 *
 * Personal-pomogator FR-10: warn users when their project `.mcp.json` contains
 * plaintext credentials that could leak into git via `git add .mcp.json`.
 *
 * This is a READ-ONLY check — we never modify `.mcp.json`. Users decide how
 * to handle warnings (move to env vars, add to .gitignore, or move MCP config
 * to global ~/.claude.json).
 *
 * Background: found in the wild in smarts repo (D:\\repos\\smarts\\.mcp.json)
 * containing JIRA_API_TOKEN and CONFLUENCE_API_TOKEN in Docker env args.
 * Installer now detects this pattern and warns at install time.
 */

import path from 'path';
import fs from 'fs-extra';

/** One detected secret pattern match. */
export interface SecretFinding {
  /** The pattern name (e.g. "JIRA_API_TOKEN"). */
  pattern: string;
  /** Short context excerpt around the match (for user review). */
  context: string;
}

/**
 * Regex of known secret-like tokens in MCP config files.
 *
 * Matches common credential patterns used in MCP server env vars:
 *   - JIRA_TOKEN / JIRA_API_TOKEN
 *   - CONFLUENCE_TOKEN / CONFLUENCE_API_TOKEN
 *   - API_KEY / APIKEY
 *   - SECRET
 *   - PASSWORD
 *   - PRIVATE_KEY
 *   - AUTH_TOKEN
 *   - BEARER
 *   - CLIENT_SECRET (OAuth)
 *   - GITHUB_TOKEN
 *   - GITLAB_TOKEN
 *   - OPENAI_API_KEY, ANTHROPIC_API_KEY
 */
const SECRET_PATTERN =
  /\b(JIRA_(?:API_)?TOKEN|CONFLUENCE_(?:API_)?TOKEN|API_KEY|APIKEY|SECRET|PASSWORD|PRIVATE_KEY|AUTH_TOKEN|BEARER|CLIENT_SECRET|GITHUB_TOKEN|GITLAB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b/gi;

/**
 * Check `{repoRoot}/.mcp.json` for plaintext secret patterns.
 *
 * Returns array of findings (empty if file absent or no matches).
 * Does NOT modify the file — read-only diagnostic.
 *
 * @param repoRoot Absolute path to target project root
 */
export async function checkMcpJsonForSecrets(repoRoot: string): Promise<SecretFinding[]> {
  const mcpPath = path.join(repoRoot, '.mcp.json');

  // Single read attempt: ENOENT (file absent) and other read errors both
  // return [] — no findings to report.
  let content: string;
  try {
    content = await fs.readFile(mcpPath, 'utf-8');
  } catch {
    return [];
  }

  const seenPatterns = new Set<string>();
  const findings: SecretFinding[] = [];

  let match: RegExpExecArray | null;
  while ((match = SECRET_PATTERN.exec(content)) !== null) {
    const pattern = match[1].toUpperCase();
    if (seenPatterns.has(pattern)) continue;
    seenPatterns.add(pattern);

    // Extract short context (20 chars before + match + 20 chars after)
    const start = Math.max(0, match.index - 20);
    const end = Math.min(content.length, match.index + match[0].length + 20);
    const context = content
      .slice(start, end)
      .replace(/\s+/g, ' ')
      .trim();

    findings.push({ pattern, context });
  }

  return findings;
}

/**
 * Print security warnings to console for findings.
 *
 * Called by installer after `checkMcpJsonForSecrets` returns non-empty list.
 * Format: prominent warning + numbered list of patterns + recommendations.
 *
 * Uses chalk yellow for visibility but does NOT throw — install continues.
 */
export function printSecretWarnings(findings: SecretFinding[]): void {
  if (findings.length === 0) return;

  const patterns = findings.map(f => f.pattern).join(', ');
  // Intentionally plain console.warn (caller may wrap in chalk)
  // Write to stderr so CI tools can separate diagnostic warnings from install
  // progress output. The test helper `runInstaller` captures both streams.
  console.error('');
  console.error('⚠  SECURITY: Found .mcp.json with potential plaintext secrets');
  console.error(`   Patterns detected: ${patterns}`);
  console.error('   Risk: `git add .` may expose credentials to team git history.');
  console.error('   Recommendations:');
  console.error('     1. Move secrets to environment variables (e.g. $JIRA_API_TOKEN)');
  console.error('     2. Add .mcp.json to .gitignore');
  console.error('     3. Or move MCP config to global ~/.claude.json (personal, not team-shared)');
  console.error('');
}
