import os from 'node:os';
import path from 'node:path';

const SECRET_PATTERNS = [
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/gi,
  /\b(?:sk|pk|rk)_[A-Za-z0-9_-]{16,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|token)\s*[:=]\s*[^\s'"`]{8,}/gi,
];

/** Removes credentials and machine-specific home paths at every external boundary. */
export function sanitize(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[REDACTED]');

  const homes = new Set([os.homedir(), process.env.USERPROFILE ?? '', process.env.HOME ?? '']);
  for (const home of homes) {
    if (!home) continue;
    const normalized = path.resolve(home).replace(/\\/g, '/');
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped.replace(/\//g, '[\\\\/]'), 'gi'), '~');
  }
  result = result.replace(/(?:[A-Z]:)?[\\/]Users[\\/][^\\/\s]+/gi, '~');
  result = result.replace(/\/(?:home|Users)\/[^/\s]+/gi, '~');
  return result;
}

export function sanitizeArgs(args: readonly string[]): string[] {
  return args.map(sanitize);
}
