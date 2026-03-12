export interface ClaudeStatusLineEntry {
  type: string;
  command: string;
}

export interface ExistingClaudeStatusLineEntry {
  type?: string;
  command?: string;
}

export interface ResolveClaudeStatusLineInput {
  repoRoot: string;
  existing?: ExistingClaudeStatusLineEntry;
  projectStatusLine?: ExistingClaudeStatusLineEntry;
  globalStatusLine?: ExistingClaudeStatusLineEntry;
  statusLineConfig: ClaudeStatusLineEntry;
}

export interface ParsedWrappedStatusLineCommand {
  userCommand: string;
  managedCommand: string;
}

export interface SelectedClaudeStatusLine {
  source: 'project' | 'global' | 'none';
  kind: 'none' | 'managed' | 'wrapped' | 'user';
  entry?: ExistingClaudeStatusLineEntry;
}

export interface ResolvedClaudeStatusLine extends ClaudeStatusLineEntry {
  mode: 'direct' | 'wrapped';
  source: 'project' | 'global' | 'none';
  existingKind: 'none' | 'managed' | 'wrapped' | 'user';
}

const MANAGED_STATUSLINE_DIR = '.dev-pomogator/tools/test-statusline/';
const WRAPPER_SCRIPT_MARKER = 'statusline_wrapper.js';

function normalizeRepoRoot(repoRoot: string): string {
  return repoRoot.replace(/\\/g, '/');
}

function quoteArgument(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFlagValue(command: string, flag: string): string | null {
  const match = command.match(
    new RegExp(`${escapeRegExp(flag)}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`)
  );

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function decodeBase64Strict(value: string): string | null {
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) {
    return null;
  }

  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const normalizedInput = value.replace(/=+$/, '');
  const normalizedRoundTrip = Buffer.from(decoded, 'utf-8')
    .toString('base64')
    .replace(/=+$/, '');

  return normalizedInput === normalizedRoundTrip ? decoded : null;
}

function normalizeExistingStatusLine(
  entry?: ExistingClaudeStatusLineEntry
): ExistingClaudeStatusLineEntry | undefined {
  const command = entry?.command?.trim();
  if (!command) {
    return undefined;
  }

  return {
    type: entry?.type,
    command,
  };
}

export function isWrappedStatusLineCommand(command: string): boolean {
  return command.includes(WRAPPER_SCRIPT_MARKER);
}

export function isManagedStatusLineCommand(command: string): boolean {
  return command.includes(MANAGED_STATUSLINE_DIR) && !isWrappedStatusLineCommand(command);
}

export function classifyClaudeStatusLineCommand(
  command?: string
): SelectedClaudeStatusLine['kind'] {
  const normalizedCommand = command?.trim();
  if (!normalizedCommand) {
    return 'none';
  }

  if (isWrappedStatusLineCommand(normalizedCommand)) {
    return 'wrapped';
  }

  if (isManagedStatusLineCommand(normalizedCommand)) {
    return 'managed';
  }

  return 'user';
}

export function selectExistingClaudeStatusLine({
  existing,
  projectStatusLine,
  globalStatusLine,
}: Pick<ResolveClaudeStatusLineInput, 'existing' | 'projectStatusLine' | 'globalStatusLine'>): SelectedClaudeStatusLine {
  const project = normalizeExistingStatusLine(projectStatusLine ?? existing);
  if (project) {
    return {
      source: 'project',
      kind: classifyClaudeStatusLineCommand(project.command),
      entry: project,
    };
  }

  const global = normalizeExistingStatusLine(globalStatusLine);
  if (global) {
    return {
      source: 'global',
      kind: classifyClaudeStatusLineCommand(global.command),
      entry: global,
    };
  }

  return {
    source: 'none',
    kind: 'none',
  };
}

export function resolveManagedStatusLineCommand(repoRoot: string, rawCommand: string): string {
  return rawCommand.replace(
    /\.dev-pomogator\/tools\/([^\s'"]+)/,
    (_match, relativeToolPath: string) =>
      quoteArgument(`${normalizeRepoRoot(repoRoot)}/.dev-pomogator/tools/${relativeToolPath}`)
  );
}

export function buildWrappedStatusLineCommand(
  repoRoot: string,
  userCommand: string,
  managedCommand: string
): string {
  const wrapperPath = `${normalizeRepoRoot(repoRoot)}/.dev-pomogator/tools/test-statusline/statusline_wrapper.js`;
  const encodedUserCommand = Buffer.from(userCommand, 'utf-8').toString('base64');
  const encodedManagedCommand = Buffer.from(managedCommand, 'utf-8').toString('base64');

  return [
    'node',
    quoteArgument(wrapperPath),
    '--user-b64',
    quoteArgument(encodedUserCommand),
    '--managed-b64',
    quoteArgument(encodedManagedCommand),
  ].join(' ');
}

export function parseWrappedStatusLineCommand(command: string): ParsedWrappedStatusLineCommand | null {
  if (!isWrappedStatusLineCommand(command)) {
    return null;
  }

  const encodedUserCommand = extractFlagValue(command, '--user-b64');
  const encodedManagedCommand = extractFlagValue(command, '--managed-b64');
  if (!encodedUserCommand || !encodedManagedCommand) {
    return null;
  }

  const userCommand = decodeBase64Strict(encodedUserCommand);
  const managedCommand = decodeBase64Strict(encodedManagedCommand);
  if (!userCommand || !managedCommand) {
    return null;
  }

  return {
    userCommand,
    managedCommand,
  };
}

export function resolveClaudeStatusLine({
  repoRoot,
  existing,
  projectStatusLine,
  globalStatusLine,
  statusLineConfig,
}: ResolveClaudeStatusLineInput): ResolvedClaudeStatusLine {
  const managedCommand = resolveManagedStatusLineCommand(repoRoot, statusLineConfig.command);
  const selected = selectExistingClaudeStatusLine({
    existing,
    projectStatusLine,
    globalStatusLine,
  });
  const existingCommand = selected.entry?.command;

  if (!existingCommand) {
    return {
      type: statusLineConfig.type,
      command: managedCommand,
      mode: 'direct',
      source: 'none',
      existingKind: 'none',
    };
  }

  if (selected.kind === 'wrapped') {
    const wrapped = parseWrappedStatusLineCommand(existingCommand);
    if (!wrapped) {
      return {
        type: statusLineConfig.type,
        command: managedCommand,
        mode: 'direct',
        source: selected.source,
        existingKind: selected.kind,
      };
    }

    return {
      type: statusLineConfig.type,
      command: buildWrappedStatusLineCommand(repoRoot, wrapped.userCommand, managedCommand),
      mode: 'wrapped',
      source: selected.source,
      existingKind: selected.kind,
    };
  }

  if (selected.kind === 'managed') {
    return {
      type: statusLineConfig.type,
      command: managedCommand,
      mode: 'direct',
      source: selected.source,
      existingKind: selected.kind,
    };
  }

  return {
    type: statusLineConfig.type,
    command: buildWrappedStatusLineCommand(repoRoot, existingCommand, managedCommand),
    mode: 'wrapped',
    source: selected.source,
    existingKind: selected.kind,
  };
}
