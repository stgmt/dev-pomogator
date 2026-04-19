import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface InstalledExtensionFixture {
  name: string;
  version?: string;
  dependencies?: {
    node?: string;
    binaries?: string[];
    pythonPackages?: string[];
    docker?: boolean;
  };
  envRequirements?: Array<{ name: string; required: boolean; example?: string }>;
  managedHooks?: Record<string, string>;
}

export interface TempHomeOptions {
  skipTools?: boolean;
  hooksDivergent?: boolean;
  corruptConfig?: boolean;
  configVersion?: string;
  packageVersion?: string;
  installedExtensions?: InstalledExtensionFixture[];
  envInSettingsLocal?: Record<string, string>;
  pluginJson?: { commands?: Array<{ name: string }>; skills?: Array<{ name: string }> };
  pluginCommandsOnDisk?: string[];
}

export interface TempHome {
  homeDir: string;
  projectDir: string;
  envSnapshot: {
    HOME: string | undefined;
    USERPROFILE: string | undefined;
  };
  cleanup: () => void;
}

const DEFAULT_EXTENSION: InstalledExtensionFixture = {
  name: 'auto-commit',
  version: '1.5.0',
  envRequirements: [{ name: 'AUTO_COMMIT_API_KEY', required: true, example: 'sk-...' }],
  managedHooks: {
    Stop: 'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
  },
};

export function buildTempHome(opts: TempHomeOptions = {}): TempHome {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomogator-doctor-home-'));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pomogator-doctor-proj-'));

  const envSnapshot = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;

  const extensions = opts.installedExtensions ?? [DEFAULT_EXTENSION];
  const devPomogator = path.join(homeDir, '.dev-pomogator');
  fs.mkdirSync(path.join(devPomogator, 'scripts'), { recursive: true });

  fs.writeFileSync(
    path.join(devPomogator, 'scripts', 'tsx-runner-bootstrap.cjs'),
    '// stub bootstrap for fixtures\nmodule.exports = () => undefined;\n',
  );

  if (!opts.skipTools) {
    for (const ext of extensions) {
      fs.mkdirSync(path.join(devPomogator, 'tools', ext.name), { recursive: true });
    }
  }

  const configObj = {
    platforms: ['claude'],
    version: opts.configVersion ?? opts.packageVersion ?? '1.5.0',
    autoUpdate: false,
    installedExtensions: extensions.map((ext) => ({
      name: ext.name,
      version: ext.version ?? '1.5.0',
      platform: 'claude',
      dependencies: ext.dependencies ?? {},
      envRequirements: ext.envRequirements ?? [],
    })),
    managed: {
      [projectDir]: {
        hooks: Object.fromEntries(
          extensions
            .filter((ext) => ext.managedHooks)
            .flatMap((ext) => Object.entries(ext.managedHooks!)),
        ),
      },
    },
  };

  const configPath = path.join(devPomogator, 'config.json');
  if (opts.corruptConfig) {
    fs.writeFileSync(configPath, '{ this is not valid json');
  } else {
    fs.writeFileSync(configPath, JSON.stringify(configObj, null, 2));
  }

  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settingsLocal: Record<string, unknown> = { env: opts.envInSettingsLocal ?? {} };
  if (!opts.hooksDivergent && !opts.corruptConfig) {
    settingsLocal.hooks = {};
    for (const ext of extensions) {
      if (!ext.managedHooks) continue;
      for (const [hookName, cmd] of Object.entries(ext.managedHooks)) {
        const arr = (settingsLocal.hooks as Record<string, unknown>)[hookName] ?? [];
        (settingsLocal.hooks as Record<string, unknown>)[hookName] = [
          ...(arr as unknown[]),
          { hooks: [{ type: 'command', command: cmd, timeout: 15000 }] },
        ];
      }
    }
  } else if (opts.hooksDivergent) {
    settingsLocal.hooks = {
      Stop: [{ hooks: [{ type: 'command', command: 'echo stale-hook-from-another-project' }] }],
    };
  }

  fs.writeFileSync(
    path.join(claudeDir, 'settings.local.json'),
    JSON.stringify(settingsLocal, null, 2),
  );

  if (opts.pluginJson) {
    const pluginDir = path.join(projectDir, '.dev-pomogator', '.claude-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(opts.pluginJson, null, 2));

    if (opts.pluginCommandsOnDisk) {
      const commandsDir = path.join(claudeDir, 'commands');
      fs.mkdirSync(commandsDir, { recursive: true });
      for (const name of opts.pluginCommandsOnDisk) {
        fs.writeFileSync(
          path.join(commandsDir, `${name}.md`),
          `---\ndescription: Stub ${name}\n---\n\nStub\n`,
        );
      }
    }
  }

  if (opts.packageVersion) {
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'test-project', version: opts.packageVersion }, null, 2),
    );
  }

  return {
    homeDir,
    projectDir,
    envSnapshot,
    cleanup() {
      process.env.HOME = envSnapshot.HOME;
      process.env.USERPROFILE = envSnapshot.USERPROFILE;
      rmWithRetry(homeDir);
      rmWithRetry(projectDir);
    },
  };
}

function rmWithRetry(dir: string, attempts = 3): void {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') throw error;
      if (i === attempts - 1) return;
      const until = Date.now() + 100 * (i + 1);
      while (Date.now() < until) {
        // sync spin — acceptable in test cleanup
      }
    }
  }
}
