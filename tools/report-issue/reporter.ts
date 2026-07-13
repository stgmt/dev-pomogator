import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sanitize, sanitizeArgs } from './sanitize.ts';
import { openUrl, runCommand } from './runtime.ts';
import type { CommandRunner, DuplicateIssue, IssueDraft, ReportInput, ReporterDependencies, ReportResult } from './types.ts';

const DEFAULT_REPOSITORY = 'stgmt/dev-pomogator';

function draftFrom(description: string): IssueDraft {
  const clean = sanitize(description).trim().replace(/\r\n/g, '\n');
  const firstLine = clean.split('\n').find((line) => line.trim())?.trim() || 'Issue report';
  const title = sanitize(firstLine.replace(/^#+\s*/, '').slice(0, 120));
  const body = sanitize(`## Report\n\n${clean}\n\n## Environment\n\n- Reported with dev-pomogator\n`);
  const digest = crypto.createHash('sha256').update(`${title}\n${body}`).digest('hex').slice(0, 16);
  return { title, body, digest };
}

function parseRepository(_remote: string, pluginJson: string): string {
  try {
    const metadata = JSON.parse(pluginJson) as { repository?: string; homepage?: string };
    for (const value of [metadata.repository, metadata.homepage]) {
      const match = value?.match(/github\.com\/([^/\s]+\/[^/\s#]+)\/?$/i);
      if (match?.[1].toLowerCase() === DEFAULT_REPOSITORY) return DEFAULT_REPOSITORY;
    }
  } catch { /* Use the canonical distribution target. */ }
  return DEFAULT_REPOSITORY;
}

function issueUrl(repository: string, draft: IssueDraft): string {
  const params = new URLSearchParams({ title: draft.title, body: draft.body });
  return `https://github.com/${repository}/issues/new?${params.toString()}`;
}

function saveDraft(directory: string, draft: IssueDraft, now: Date): string {
  fs.mkdirSync(directory, { recursive: true });
  const filename = `report-issue-${now.toISOString().replace(/[:.]/g, '-')}.md`;
  const target = path.join(directory, filename);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `# ${sanitize(draft.title)}\n\n${sanitize(draft.body)}\n`, 'utf8');
  fs.renameSync(temp, target);
  return target;
}

function isRepositoryIssueUrl(value: string, repository: string): boolean {
  try {
    const url = new URL(value);
    const pathPattern = new RegExp(`^/${repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/[1-9]\\d*$`, 'i');
    return url.protocol === 'https:' && url.hostname === 'github.com' && pathPattern.test(url.pathname);
  } catch {
    return false;
  }
}

function parseDuplicate(stdout: string, repository: string): DuplicateIssue | undefined {
  try {
    const issues = JSON.parse(stdout) as Array<{ number: unknown; title: unknown; url: unknown }>;
    const issue = issues[0];
    if (!issue || !Number.isSafeInteger(issue.number) || issue.number <= 0 || typeof issue.title !== 'string' || typeof issue.url !== 'string') return undefined;
    const url = sanitize(issue.url);
    return isRepositoryIssueUrl(url, repository) ? { number: issue.number, title: sanitize(issue.title), url } : undefined;
  } catch {
    return undefined;
  }
}

async function command(runner: CommandRunner, cwd: string, args: string[], timeoutMs: number) {
  return runner({ file: 'gh', args: sanitizeArgs(args), cwd, timeoutMs });
}

export async function reportIssue(input: ReportInput, dependencies: ReporterDependencies = {}): Promise<ReportResult> {
  const cwd = dependencies.repoRoot ?? process.cwd();
  const runner = dependencies.runCommand ?? runCommand;
  const opener = dependencies.openUrl ?? openUrl;
  const now = dependencies.now ?? (() => new Date());
  const commandTimeoutMs = dependencies.commandTimeoutMs ?? 8_000;
  const authTimeoutMs = dependencies.authTimeoutMs ?? 3_000;
  const draft = draftFrom(input.description);
  const remote = await runner({ file: 'git', args: ['remote', 'get-url', 'origin'], cwd, timeoutMs: commandTimeoutMs });
  let pluginJson = '';
  try { pluginJson = fs.readFileSync(path.join(cwd, '.claude-plugin', 'plugin.json'), 'utf8'); } catch { /* Use fallback. */ }
  const repository = parseRepository(sanitize(remote.stdout), sanitize(pluginJson));
  const url = issueUrl(repository, draft);
  const approved = input.approvedDigest === draft.digest;
  const fallback = (guidance: string): ReportResult => {
    const draftPath = saveDraft(dependencies.draftDirectory ?? path.join(cwd, '.dev-pomogator', 'report-issue'), draft, now());
    return { status: 'fallback', repository, draft, url, draftPath: sanitize(draftPath), guidance: sanitize(guidance) };
  };
  const openFallbackIfApproved = async (result: ReportResult): Promise<ReportResult> => {
    if (approved && input.openBrowser) result.browserOpened = await opener(result.url);
    return result;
  };

  // Read-only readiness and duplicate checks deliberately precede consent. This gives the
  // user all decision-relevant information while the creation/browser boundary stays hard.
  const auth = await command(runner, cwd, ['auth', 'status'], authTimeoutMs);
  if (auth.error || auth.code !== 0) {
    const detail = auth.error === 'missing' ? 'GitHub CLI is not installed.' : 'GitHub CLI is unavailable, offline, timed out, or not authenticated.';
    return openFallbackIfApproved(fallback(`${detail} Run \`gh auth login\` and retry, or use the filled GitHub URL.`));
  }

  const search = await command(runner, cwd, ['issue', 'list', '--repo', repository, '--state', 'open', '--search', draft.title, '--limit', '5', '--json', 'number,title,url'], commandTimeoutMs);
  if (search.error || search.code !== 0) return openFallbackIfApproved(fallback('GitHub duplicate search failed; use the saved draft and copyable URL.'));

  const duplicate = parseDuplicate(sanitize(search.stdout), repository);
  if (duplicate) return { status: 'duplicate', repository, draft, url, duplicate, guidance: 'A potentially duplicate open issue was found; no issue was created.' };

  if (!approved) {
    return {
      status: 'needs_approval',
      repository,
      draft,
      url,
      guidance: 'Review the sanitized repository, title, and body, then resubmit with the exact approval digest before any GitHub or browser action.',
    };
  }

  const created = await command(runner, cwd, ['issue', 'create', '--repo', repository, '--title', draft.title, '--body', draft.body], commandTimeoutMs);
  const createdUrl = sanitize(created.stdout.trim().split(/\s+/)[0] ?? '');
  if (created.error || created.code !== 0 || !isRepositoryIssueUrl(createdUrl, repository)) {
    return openFallbackIfApproved(fallback('GitHub issue creation failed or returned an unverified URL; use the saved draft and copyable URL.'));
  }
  return { status: 'created', repository, draft, url: createdUrl, guidance: 'GitHub issue created.' };
}
