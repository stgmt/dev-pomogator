import { DEFAULT_HEADROOM_PROFILE, type HeadroomProfile, type HeadroomTopology, type RuntimeKind } from './profile.ts';

export interface RuntimeProbe {
  dockerHost: boolean;
  dockerWsl: boolean;
  pipx: boolean;
  wslIp?: string;
}

export interface HeadroomInstallRequest {
  enabled: boolean;
  topology?: HeadroomTopology;
  requestedRuntime?: RuntimeKind | 'auto';
  probe: RuntimeProbe;
}

export interface HeadroomInstallPlan {
  ok: boolean;
  reason?: string;
  profile?: HeadroomProfile;
  actions: string[];
}

export function buildInstallPlan(request: HeadroomInstallRequest): HeadroomInstallPlan {
  if (!request.enabled) {
    return {
      ok: false,
      reason: 'headroom beta requires explicit opt-in',
      actions: [],
    };
  }
  if (!request.topology) {
    return {
      ok: false,
      reason: 'select exactly one topology: codex-sub2api or anthropic-direct',
      actions: [],
    };
  }

  const runtime = chooseRuntime(request.probe, request.requestedRuntime ?? 'auto');
  if (!runtime) {
    return {
      ok: false,
      reason: 'Docker is unavailable on host/WSL and host fallback prerequisites are missing',
      actions: ['install Docker Desktop, enable WSL Docker, or install pipx for host-headless mode'],
    };
  }

  const claudeBaseUrl =
    runtime === 'docker-wsl' && request.probe.wslIp
      ? `http://${request.probe.wslIp}:${DEFAULT_HEADROOM_PROFILE.headroomPort}`
      : `http://127.0.0.1:${DEFAULT_HEADROOM_PROFILE.headroomPort}`;

  const profile: HeadroomProfile = {
    ...DEFAULT_HEADROOM_PROFILE,
    topology: request.topology,
    runtime,
    claudeBaseUrl,
  };

  return {
    ok: true,
    profile,
    actions: [
      'write dev-pomogator-owned runtime files',
      'backup and patch Claude Code settings',
      'install Claude wrapper without storing tokens',
      'install OS autostart entry',
      'run health and model-route smoke checks',
    ],
  };
}

function chooseRuntime(probe: RuntimeProbe, requested: RuntimeKind | 'auto'): RuntimeKind | null {
  if (requested !== 'auto') {
    if (requested === 'docker-host') return probe.dockerHost ? requested : null;
    if (requested === 'docker-wsl') return probe.dockerWsl ? requested : null;
    return probe.pipx ? requested : null;
  }
  if (probe.dockerHost) return 'docker-host';
  if (probe.dockerWsl) return 'docker-wsl';
  if (probe.pipx) return 'host-headless';
  return null;
}
