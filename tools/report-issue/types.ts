export interface CommandRequest {
  file: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: 'missing' | 'timeout' | 'spawn';
}

export type CommandRunner = (request: CommandRequest) => Promise<CommandResult>;
export type UrlOpener = (url: string) => Promise<boolean>;

export interface IssueDraft {
  title: string;
  body: string;
  digest: string;
}

export interface DuplicateIssue {
  number: number;
  title: string;
  url: string;
}

export type ReportStatus = 'needs_approval' | 'created' | 'duplicate' | 'fallback';

export interface ReportInput {
  description: string;
  approvedDigest?: string;
  openBrowser?: boolean;
}

export interface ReportResult {
  status: ReportStatus;
  repository: string;
  draft: IssueDraft;
  url: string;
  duplicate?: DuplicateIssue;
  draftPath?: string;
  guidance?: string;
  browserOpened?: boolean;
}

export interface ReporterDependencies {
  runCommand?: CommandRunner;
  openUrl?: UrlOpener;
  now?: () => Date;
  repoRoot?: string;
  draftDirectory?: string;
  authTimeoutMs?: number;
  commandTimeoutMs?: number;
}
