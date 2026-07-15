import { describe, expect, it } from 'vitest';
import { buildSupportedHeadroomArgs } from '../headroom-flags.ts';
import { buildInstallPlan } from '../plan.ts';
import {
  DEFAULT_HEADROOM_PROFILE,
  buildClaudeSettingsPatch,
  defaultInstallPaths,
  renderClaudeWrapperCmd,
  renderStartSub2apiHeadroomPs1,
} from '../profile.ts';

describe('headroom beta Claude settings patch', () => {
  it('preserves unknown keys and hooks while writing routing env without secrets', () => {
    const existing = {
      hooks: { Stop: [{ matcher: '', hooks: [] }] },
      customKey: { nested: true },
      env: {
        KEEP_ME: 'yes',
        ANTHROPIC_AUTH_TOKEN: 'secret',
      },
    };

    const patched = buildClaudeSettingsPatch(existing, DEFAULT_HEADROOM_PROFILE).settings;

    expect(patched.hooks).toEqual(existing.hooks);
    expect(patched.customKey).toEqual(existing.customKey);
    expect((patched.env as Record<string, string>).KEEP_ME).toBe('yes');
    expect((patched.env as Record<string, string>).ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect((patched.env as Record<string, string>).ANTHROPIC_MODEL).toBe('gpt-5.6-sol');
    expect((patched.env as Record<string, string>).ANTHROPIC_SMALL_FAST_MODEL).toBe('gpt-5.3-codex-spark');
    expect((patched.env as Record<string, string>).ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.6-terra');
    expect((patched.env as Record<string, string>).CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('340000');
  });
});

describe('headroom beta Windows wrapper', () => {
  it('plans both claude.cmd and claude.exe wrapper paths', () => {
    const paths = defaultInstallPaths('C:\\Users\\agent');

    expect(paths.wrapperPath).toBe('C:\\Users\\agent\\.local\\bin\\claude.cmd');
    expect(paths.wrapperExePath).toBe('C:\\Users\\agent\\.local\\bin\\claude.exe');
    expect(paths.realClaudePath).toBe('C:\\Users\\agent\\.local\\bin\\claude-real.exe');
  });

  it('routes Claude Code through Headroom and delegates to claude-real.exe', () => {
    const paths = defaultInstallPaths('C:\\Users\\agent');
    const cmd = renderClaudeWrapperCmd(DEFAULT_HEADROOM_PROFILE, paths);

    expect(cmd).toContain('wsl.exe hostname -I');
    expect(cmd).toContain('ANTHROPIC_BASE_URL=http://%WSL_IP%:8787');
    expect(cmd).toContain('ANTHROPIC_MODEL=gpt-5.6-sol');
    expect(cmd).toContain('ANTHROPIC_SMALL_FAST_MODEL=gpt-5.3-codex-spark');
    expect(cmd).toContain('ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-5.6-terra');
    expect(cmd).toContain('CLAUDE_CODE_MAX_CONTEXT_TOKENS=370000');
    expect(cmd).toContain('CLAUDE_CODE_AUTO_COMPACT_WINDOW=340000');
    expect(cmd).toContain('ANTHROPIC_AUTH_TOKEN=unused');
    expect(cmd).toContain('claude-real.exe" %*');
  });
});

describe('headroom beta WSL start script', () => {
  it('uses braced PowerShell interpolation for WSL IP plus port', () => {
    const paths = defaultInstallPaths('C:\\Users\\agent');
    const script = renderStartSub2apiHeadroomPs1(paths, DEFAULT_HEADROOM_PROFILE);

    expect(script).toContain('"http://${wslIp}:8787"');
    expect(script).not.toContain('"http://$wslIp:8787"');
    expect(script).toContain('docker compose -p sub2api-codex up -d');
  });
});

describe('headroom flag filtering', () => {
  it('skips stale unsupported flags and keeps supported token-mode flags', () => {
    const helpText = [
      '--host TEXT',
      '--port INTEGER',
      '--mode [cache|token]',
      '--intercept-tool-results',
      '--no-ccr-proactive-expansion',
      '--anthropic-api-url TEXT',
      '--no-subscription-tracking',
      '--compression-max-workers INTEGER',
    ].join('\n');

    const args = buildSupportedHeadroomArgs({ topology: 'codex-sub2api', helpText });

    expect(args).toContain('--mode');
    expect(args).toContain('token');
    expect(args).toContain('--intercept-tool-results');
    expect(args).toContain('--no-ccr-proactive-expansion');
    expect(args).toContain('--no-subscription-tracking');
    expect(args).toContain('--compression-max-workers');
    expect(args).not.toContain('--code-aware');
  });
});

describe('headroom beta install planner', () => {
  it('requires explicit beta opt-in and exactly one topology', () => {
    expect(buildInstallPlan({ enabled: false, topology: 'codex-sub2api', probe: { dockerHost: true, dockerWsl: false, pipx: false } }).ok).toBe(false);
    expect(buildInstallPlan({ enabled: true, probe: { dockerHost: true, dockerWsl: false, pipx: false } }).ok).toBe(false);
  });

  it('prefers Docker host, then WSL Docker, then host fallback', () => {
    expect(
      buildInstallPlan({
        enabled: true,
        topology: 'codex-sub2api',
        probe: { dockerHost: true, dockerWsl: true, pipx: true, wslIp: '172.30.1.2' },
      }).profile?.runtime,
    ).toBe('docker-host');

    const wsl = buildInstallPlan({
      enabled: true,
      topology: 'codex-sub2api',
      probe: { dockerHost: false, dockerWsl: true, pipx: true, wslIp: '172.30.1.2' },
    });
    expect(wsl.profile?.runtime).toBe('docker-wsl');
    expect(wsl.profile?.claudeBaseUrl).toBe('http://172.30.1.2:8787');

    expect(
      buildInstallPlan({
        enabled: true,
        topology: 'anthropic-direct',
        probe: { dockerHost: false, dockerWsl: false, pipx: true },
      }).profile?.runtime,
    ).toBe('host-headless');
  });
});
