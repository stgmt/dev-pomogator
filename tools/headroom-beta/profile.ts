import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type HeadroomTopology = 'codex-sub2api' | 'anthropic-direct';
export type RuntimeKind = 'docker-host' | 'docker-wsl' | 'host-headless';

export interface HeadroomProfile {
  topology: HeadroomTopology;
  runtime: RuntimeKind;
  headroomPort: number;
  sub2apiPort: number;
  claudeBaseUrl: string;
  mainModel: string;
  smallFastModel: string;
  haikuModel: string;
  maxContextTokens: number;
  autoCompactWindow: number;
  maxThinkingTokens: number;
  enableToolSearch: boolean;
}

export interface ClaudeSettingsPatchResult {
  settings: Record<string, unknown>;
  env: Record<string, string>;
}

export interface InstallPaths {
  home: string;
  localBinDir: string;
  claudeSettingsPath: string;
  wrapperPath: string;
  wrapperExePath: string;
  realClaudePath: string;
  startupDir: string;
  startupCmdPath: string;
  runtimeDir: string;
}

export const DEFAULT_HEADROOM_PROFILE: HeadroomProfile = {
  topology: 'codex-sub2api',
  runtime: 'docker-wsl',
  headroomPort: 8787,
  sub2apiPort: 18081,
  claudeBaseUrl: 'http://127.0.0.1:8787',
  mainModel: 'gpt-5.6-sol',
  smallFastModel: 'gpt-5.3-codex-spark',
  haikuModel: 'gpt-5.6-terra',
  maxContextTokens: 370_000,
  autoCompactWindow: 340_000,
  maxThinkingTokens: 8_000,
  enableToolSearch: true,
};

const CLAUDE_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK',
  'CLAUDE_CODE_MAX_CONTEXT_TOKENS',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'MAX_THINKING_TOKENS',
  'ENABLE_TOOL_SEARCH',
] as const;

export function defaultInstallPaths(home = os.homedir()): InstallPaths {
  const localBinDir = path.join(home, '.local', 'bin');
  return {
    home,
    localBinDir,
    claudeSettingsPath: path.join(home, '.claude', 'settings.json'),
    wrapperPath: path.join(localBinDir, 'claude.cmd'),
    wrapperExePath: path.join(localBinDir, 'claude.exe'),
    realClaudePath: path.join(localBinDir, 'claude-real.exe'),
    startupDir: path.join(
      home,
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
    ),
    startupCmdPath: path.join(
      home,
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'dev-pomogator-headroom-sub2api.cmd',
    ),
    runtimeDir: path.join(home, '.dev-pomogator', 'headroom-sub2api'),
  };
}

export function buildClaudeEnv(profile: HeadroomProfile): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: profile.claudeBaseUrl,
    ANTHROPIC_MODEL: profile.mainModel,
    ANTHROPIC_SMALL_FAST_MODEL: profile.smallFastModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.haikuModel,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(profile.maxContextTokens),
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(profile.autoCompactWindow),
    MAX_THINKING_TOKENS: String(profile.maxThinkingTokens),
    ENABLE_TOOL_SEARCH: profile.enableToolSearch ? 'true' : 'false',
  };
}

export function buildClaudeSettingsPatch(
  existing: Record<string, unknown>,
  profile: HeadroomProfile,
): ClaudeSettingsPatchResult {
  const existingEnv =
    existing.env && typeof existing.env === 'object' && !Array.isArray(existing.env)
      ? (existing.env as Record<string, unknown>)
      : {};
  const env = buildClaudeEnv(profile);
  const nextEnv: Record<string, unknown> = { ...existingEnv, ...env };

  // The beta installer never writes auth material to ~/.claude/settings.json.
  // A wrapper or user environment can supply ANTHROPIC_AUTH_TOKEN at process time.
  delete nextEnv.ANTHROPIC_AUTH_TOKEN;
  delete nextEnv.ANTHROPIC_API_KEY;

  return {
    settings: {
      ...existing,
      env: nextEnv,
      devPomogatorHeadroomBeta: {
        managedBy: 'dev-pomogator',
        enabled: true,
        topology: profile.topology,
        runtime: profile.runtime,
        updatedAt: new Date(0).toISOString(),
      },
    },
    env,
  };
}

export function renderClaudeWrapperCmd(profile: HeadroomProfile, paths: InstallPaths): string {
  const env = buildClaudeEnv(profile);
  const lines = [
    '@echo off',
    'setlocal',
    '',
    'set "WSL_IP="',
    "for /f \"tokens=1\" %%I in ('wsl.exe hostname -I 2^>nul') do (",
    '  set "WSL_IP=%%I"',
    '  goto :got_ip',
    ')',
    ':got_ip',
    '',
    'if not "%WSL_IP%"=="" (',
    `  set "ANTHROPIC_BASE_URL=http://%WSL_IP%:${profile.headroomPort}"`,
    ') else (',
    "  for /f \"tokens=2,*\" %%A in ('reg query HKCU\\Environment /v ANTHROPIC_BASE_URL 2^>nul ^| findstr ANTHROPIC_BASE_URL') do set \"ANTHROPIC_BASE_URL=%%B\"",
    ')',
    '',
    "for /f \"tokens=2,*\" %%A in ('reg query HKCU\\Environment /v ANTHROPIC_AUTH_TOKEN 2^>nul ^| findstr ANTHROPIC_AUTH_TOKEN') do set \"ANTHROPIC_AUTH_TOKEN=%%B\"",
    'if "%ANTHROPIC_AUTH_TOKEN%"=="" set "ANTHROPIC_AUTH_TOKEN=unused"',
    '',
    ...CLAUDE_ENV_KEYS.filter((key) => key !== 'ANTHROPIC_BASE_URL').map((key) => `set "${key}=${env[key]}"`),
    '',
    `"${paths.realClaudePath}" %*`,
    'exit /b %ERRORLEVEL%',
    '',
  ];
  return lines.join('\r\n');
}

export function renderWindowsStartupCmd(paths: InstallPaths): string {
  return [
    '@echo off',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${path.join(paths.runtimeDir, 'start-sub2api-headroom.ps1')}"`,
    '',
  ].join('\r\n');
}

export function renderStartSub2apiHeadroomPs1(paths: InstallPaths, profile: HeadroomProfile): string {
  const wslRuntime = windowsPathToWslPath(paths.runtimeDir);
  return [
    "$ErrorActionPreference = 'Stop'",
    '',
    `$runtime = '${escapeSingleQuotedPs(wslRuntime)}'`,
    "$ipLine = (& wsl.exe hostname -I 2>$null) -join ' '",
    "$wslIp = ($ipLine -split '\\s+' | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' } | Select-Object -First 1)",
    "if (-not [string]::IsNullOrWhiteSpace($wslIp)) {",
    `    $baseUrl = "http://\${wslIp}:${profile.headroomPort}"`,
    "    [Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $baseUrl, 'User')",
    '',
    "    $settingsPath = Join-Path $env:USERPROFILE '.claude\\settings.json'",
    '    if (Test-Path -LiteralPath $settingsPath) {',
    '        $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json',
    "        if (-not $settings.PSObject.Properties['env']) {",
    '            $settings | Add-Member -MemberType NoteProperty -Name env -Value ([pscustomobject]@{})',
    '        }',
    "        if ($settings.env.PSObject.Properties['ANTHROPIC_BASE_URL']) {",
    '            $settings.env.ANTHROPIC_BASE_URL = $baseUrl',
    '        } else {',
    "            $settings.env | Add-Member -MemberType NoteProperty -Name ANTHROPIC_BASE_URL -Value $baseUrl",
    '        }',
    '        $settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $settingsPath -Encoding UTF8',
    '    }',
    '}',
    `& wsl.exe bash -lc "cd '$runtime' && docker compose -p sub2api-codex up -d"`,
    '',
  ].join('\r\n');
}

export function renderDockerComposeYaml(profile: HeadroomProfile): string {
  const sub2apiUrl =
    profile.topology === 'codex-sub2api'
      ? 'http://sub2api:8080'
      : '${ANTHROPIC_API_URL:-https://api.anthropic.com}';
  const sub2apiBlock =
    profile.topology === 'codex-sub2api'
      ? [
          '',
          '  sub2api:',
          '    image: ${SUB2API_IMAGE:-ghcr.io/stgmt/sub2api:latest}',
          '    restart: unless-stopped',
          '    ports:',
          `      - "\${SUB2API_BIND_HOST:-127.0.0.1}:\${SUB2API_PORT:-${profile.sub2apiPort}}:8080"`,
          '    env_file:',
          '      - .env',
          '    healthcheck:',
          '      test: ["CMD", "wget", "-q", "-T", "5", "-O", "/dev/null", "http://localhost:8080/health"]',
          '      interval: 30s',
          '      timeout: 10s',
          '      retries: 3',
          '      start_period: 30s',
        ].join('\n')
      : '';

  return [
    'services:',
    '  headroom:',
    '    build:',
    '      context: .',
    '      dockerfile: Dockerfile.headroom',
    '      args:',
    '        HEADROOM_VERSION: ${HEADROOM_VERSION:-0.31.0}',
    '    image: ${HEADROOM_IMAGE:-dev-pomogator-headroom:0.31.0}',
    '    restart: unless-stopped',
    '    command:',
    '      - --host',
    '      - 0.0.0.0',
    '      - --port',
    `      - "${profile.headroomPort}"`,
    '      - --mode',
    '      - token',
    '      - --intercept-tool-results',
    '      - --no-ccr-proactive-expansion',
    '      - --anthropic-api-url',
    `      - ${sub2apiUrl}`,
    ...(profile.topology === 'codex-sub2api' ? ['      - --no-subscription-tracking'] : []),
    '      - --request-timeout-seconds',
    '      - "900"',
    '      - --anthropic-pre-upstream-concurrency',
    '      - "${HEADROOM_ANTHROPIC_PRE_UPSTREAM_CONCURRENCY:-8}"',
    '      - --compression-max-workers',
    '      - "${HEADROOM_COMPRESSION_MAX_WORKERS:-2}"',
    '      - --log-file',
    '      - /root/.headroom/logs/proxy-requests.jsonl',
    '    environment:',
    '      - HEADROOM_MODE=token',
    '      - HEADROOM_SAVINGS_PROFILE=${HEADROOM_SAVINGS_PROFILE:-coding}',
    '      - HEADROOM_TARGET_RATIO=${HEADROOM_TARGET_RATIO:-0.25}',
    '      - HEADROOM_COMPRESS_USER_MESSAGES=1',
    '      - HEADROOM_PROTECT_RECENT=1',
    '      - HEADROOM_LOSSLESS_THEN_LOSSY=1',
    '      - HEADROOM_PROTECT_READS=1',
    '      - HEADROOM_CODE_AWARE_ENABLED=1',
    '      - HEADROOM_TOOL_SEARCH=1',
    '      - HEADROOM_DEDUPE=1',
    '      - HEADROOM_CONTEXT_TOOL=${HEADROOM_CONTEXT_TOOL:-rtk}',
    '    ports:',
    `      - "\${HEADROOM_BIND_HOST:-127.0.0.1}:\${HEADROOM_PORT:-${profile.headroomPort}}:${profile.headroomPort}"`,
    '    volumes:',
    '      - headroom-data:/root/.headroom',
    ...(profile.topology === 'codex-sub2api'
      ? ['    depends_on:', '      sub2api:', '        condition: service_healthy']
      : []),
    '    healthcheck:',
    '      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen(\'http://localhost:8787/health\', timeout=5).read()"]',
    '      interval: 30s',
    '      timeout: 10s',
    '      retries: 3',
    '      start_period: 10s',
    sub2apiBlock,
    '',
    'volumes:',
    '  headroom-data:',
    '',
  ].join('\n');
}

export function renderDockerfileHeadroom(): string {
  return [
    'ARG PYTHON_VERSION=3.12',
    'ARG HEADROOM_VERSION=0.31.0',
    '',
    'FROM python:${PYTHON_VERSION}-slim',
    '',
    'ARG HEADROOM_VERSION',
    'ENV PIP_NO_CACHE_DIR=1 \\',
    '    PYTHONDONTWRITEBYTECODE=1 \\',
    '    PYTHONUNBUFFERED=1',
    '',
    'RUN python -m pip install --upgrade pip \\',
    '    && python -m pip install "headroom-ai[proxy,code,relevance,html,spreadsheet,otel,reports,mcp]==${HEADROOM_VERSION}" \\',
    '    && headroom tools install \\',
    '    && python -c "from headroom.rtk.installer import ensure_rtk; from headroom.lean_ctx.installer import ensure_lean_ctx; from headroom.graph.tokensave_installer import ensure_tokensave; print(ensure_rtk()); print(ensure_lean_ctx()); print(ensure_tokensave())"',
    '',
    'ENTRYPOINT ["headroom", "proxy"]',
    'CMD ["--host", "0.0.0.0", "--port", "8787"]',
    '',
  ].join('\n');
}

export function renderRuntimeEnvExample(profile: HeadroomProfile): string {
  const secret = () => crypto.randomBytes(24).toString('hex');
  return [
    '# Generated by dev-pomogator Headroom beta installer.',
    '# Replace placeholders before first real sub2api login. Do not commit this file.',
    'HEADROOM_VERSION=0.31.0',
    'HEADROOM_BIND_HOST=127.0.0.1',
    `HEADROOM_PORT=${profile.headroomPort}`,
    `SUB2API_PORT=${profile.sub2apiPort}`,
    'SUB2API_IMAGE=ghcr.io/stgmt/sub2api:latest',
    `POSTGRES_PASSWORD=${secret()}`,
    `ADMIN_PASSWORD=${secret()}`,
    `JWT_SECRET=${secret()}`,
    `TOTP_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`,
    '',
  ].join('\n');
}

export function readJsonObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) {
      fs.unlinkSync(tmp);
    }
  }
}

export function writeTextAtomic(filePath: string, data: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, data, 'utf-8');
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) {
      fs.unlinkSync(tmp);
    }
  }
}

function windowsPathToWslPath(value: string): string {
  const normalized = path.resolve(value).replace(/\\/g, '/');
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function escapeSingleQuotedPs(value: string): string {
  return value.replace(/'/g, "''");
}
