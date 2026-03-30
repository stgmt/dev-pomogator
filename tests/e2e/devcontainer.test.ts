import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  runInstaller,
  appPath,
  setupCleanState,
} from './helpers';

/**
 * PLUGIN012: DevContainer Extension Tests
 *
 * Tests that the devcontainer extension installs correctly:
 * - Tool files copied to .dev-pomogator/tools/devcontainer/
 * - Templates have valid structure and placeholders
 * - Extension manifest is complete
 * - Docker-in-Docker, accessibility, and dynamic ports are configured
 *
 * @implemented: devcontainer.test.ts
 */
describe('PLUGIN012: DevContainer Extension', () => {
  beforeAll(async () => {
    await setupCleanState('claude');
    await runInstaller('--claude --all');
  });

  const toolsBase = (...segments: string[]) =>
    appPath('.dev-pomogator', 'tools', 'devcontainer', ...segments);

  // @feature1 — Tool files installed
  describe('Scenario: Tool files are installed after clean installation', () => {
    it('should create .dev-pomogator/tools/devcontainer/ directory', async () => {
      expect(await fs.pathExists(toolsBase())).toBe(true);
    });

    it('should install postinstall.ts', async () => {
      expect(await fs.pathExists(toolsBase('postinstall.ts'))).toBe(true);
    });

    it('should install launch-worktree.ps1', async () => {
      expect(await fs.pathExists(toolsBase('launch-worktree.ps1'))).toBe(true);
    });

    it('should install core template files', async () => {
      const coreFiles = [
        'templates/Dockerfile',
        'templates/docker-compose.yml',
        'templates/devcontainer.json',
        'templates/.dockerignore',
        'templates/start.bat',
        'templates/stop.bat',
      ];
      for (const file of coreFiles) {
        expect(await fs.pathExists(toolsBase(file))).toBe(true);
      }
    });

    it('should install all 13 shell scripts', async () => {
      const scripts = [
        'pre-create.sh',
        'post-create.sh',
        'post-start.sh',
        'entrypoint.sh',
        'start-gui.sh',
        'oculos-wrapper.sh',
        'open-browser.sh',
        'firefox-wrapper.sh',
        'create-stealth-profile.sh',
        'save.sh',
        'restore.sh',
        'auto-snapshot.sh',
        'update-content.sh',
      ];
      for (const script of scripts) {
        expect(await fs.pathExists(toolsBase('templates', 'scripts', script))).toBe(true);
      }
    });

    it('should install OculOS AT-SPI2 patch', async () => {
      expect(
        await fs.pathExists(toolsBase('templates', 'patches', 'oculos-atspi2-fix.patch')),
      ).toBe(true);
    });
  });

  // @feature2 — Template structure validation
  describe('Scenario: Template files have valid structure', () => {
    it('should have multi-stage Dockerfile', async () => {
      const content = await fs.readFile(toolsBase('templates', 'Dockerfile'), 'utf-8');
      expect(content).toContain('AS rust-builder');
      expect(content).toContain('AS node-builder');
      expect(content).toContain('AS final');
      expect(content).toContain('COPY --from=rust-builder');
      expect(content).toContain('COPY --from=node-builder');
    });

    it('should have docker-compose.yml with healthcheck', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'docker-compose.yml'),
        'utf-8',
      );
      expect(content).toContain('healthcheck:');
      expect(content).toContain('pgrep -f');
      expect(content).toContain('Xvfb');
    });

    it('should have docker-compose.yml with security capabilities', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'docker-compose.yml'),
        'utf-8',
      );
      expect(content).toContain('SYS_ADMIN');
      expect(content).toContain('NET_ADMIN');
      expect(content).toContain('SYS_PTRACE');
      expect(content).toContain('seccomp=unconfined');
    });

    it('should have valid devcontainer.json', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'devcontainer.json'),
        'utf-8',
      );
      // Replace placeholders to make valid JSON for parsing
      const jsonStr = content
        .replace(/\{\{PROJECT_NAME\}\}/g, 'test-project')
        .replace(/\{\{WORKSPACE_FOLDER\}\}/g, '/workspaces/test-project');
      const config = JSON.parse(jsonStr);
      expect(config.dockerComposeFile).toBe('docker-compose.yml');
      expect(config.service).toBe('app');
      expect(config.remoteUser).toBe('vscode');
      expect(config.forwardPorts).toContain(6080);
    });

    it('should have start.bat with Docker check and compose commands', async () => {
      const content = await fs.readFile(toolsBase('templates', 'start.bat'), 'utf-8');
      expect(content).toContain('docker info');
      expect(content).toContain('docker compose');
      expect(content).toContain('up -d --build');
      expect(content).toContain('localhost');
    });

    it('should have stop.bat with compose down', async () => {
      const content = await fs.readFile(toolsBase('templates', 'stop.bat'), 'utf-8');
      expect(content).toContain('docker compose');
      expect(content).toContain('down --remove-orphans');
    });
  });

  // @feature3 — Parameterization placeholders
  describe('Scenario: Template files contain parameterization placeholders', () => {
    it('should have {{WORKSPACE_FOLDER}} in Dockerfile', async () => {
      const content = await fs.readFile(toolsBase('templates', 'Dockerfile'), 'utf-8');
      expect(content).toContain('{{WORKSPACE_FOLDER}}');
    });

    it('should have {{PROJECT_NAME}} in docker-compose.yml', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'docker-compose.yml'),
        'utf-8',
      );
      expect(content).toContain('{{PROJECT_NAME}}');
    });

    it('should have {{WORKSPACE_FOLDER}} in devcontainer.json', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'devcontainer.json'),
        'utf-8',
      );
      expect(content).toContain('{{WORKSPACE_FOLDER}}');
    });

    it('should NOT contain hardcoded ai-pomogator-smi references', async () => {
      const templateDir = toolsBase('templates');
      const files = await collectTextFiles(templateDir);
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        expect(content).not.toContain('ai-pomogator-smi');
      }
    });
  });

  // @feature4 — Extension manifest completeness
  describe('Scenario: Extension manifest is complete', () => {
    let manifest: Record<string, unknown>;

    beforeAll(async () => {
      const manifestPath = path.resolve(
        __dirname,
        '../../extensions/devcontainer/extension.json',
      );
      manifest = await fs.readJson(manifestPath);
    });

    it('should declare devcontainer tool', () => {
      expect(manifest.tools).toHaveProperty('devcontainer');
    });

    it('should have postInstall for claude platform', () => {
      const postInstall = manifest.postInstall as Record<string, unknown>;
      expect(postInstall).toHaveProperty('claude');
    });

    it('should list all template files in toolFiles', () => {
      const toolFiles = (manifest.toolFiles as Record<string, string[]>)?.devcontainer || [];
      expect(toolFiles.length).toBeGreaterThanOrEqual(20);
      // Check key files are listed
      expect(toolFiles).toContain('.dev-pomogator/tools/devcontainer/postinstall.ts');
      expect(toolFiles).toContain('.dev-pomogator/tools/devcontainer/launch-worktree.ps1');
      expect(
        toolFiles.some((f: string) => f.includes('templates/Dockerfile')),
      ).toBe(true);
      expect(
        toolFiles.some((f: string) => f.includes('templates/docker-compose.yml')),
      ).toBe(true);
    });

    it('should have every toolFile existing on disk', async () => {
      const toolFiles = (manifest.toolFiles as Record<string, string[]>)?.devcontainer || [];
      for (const relPath of toolFiles) {
        const fullPath = appPath(relPath);
        expect(
          await fs.pathExists(fullPath),
          `Missing toolFile: ${relPath}`,
        ).toBe(true);
      }
    });
  });

  // @feature5 — Docker-in-Docker
  describe('Scenario: Docker-in-Docker support is configured', () => {
    it('should mount Docker socket in docker-compose.yml', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'docker-compose.yml'),
        'utf-8',
      );
      expect(content).toContain('/var/run/docker.sock:/var/run/docker.sock');
    });

    it('should install docker-ce-cli in Dockerfile', async () => {
      const content = await fs.readFile(toolsBase('templates', 'Dockerfile'), 'utf-8');
      expect(content).toContain('docker-ce-cli');
      expect(content).toContain('docker-compose-plugin');
    });

    it('should have Docker GID sync in post-start.sh', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'scripts', 'post-start.sh'),
        'utf-8',
      );
      expect(content).toContain('docker.sock');
      expect(content).toContain('groupadd');
      expect(content).toContain('usermod');
    });
  });

  // @feature6 — Chromium accessibility
  describe('Scenario: Chromium accessibility support is configured', () => {
    it('should build OculOS from source in Dockerfile', async () => {
      const content = await fs.readFile(toolsBase('templates', 'Dockerfile'), 'utf-8');
      expect(content).toContain('oculos');
      expect(content).toContain('cargo build --release');
      expect(content).toContain('oculos-atspi2-fix.patch');
    });

    it('should install at-spi2-core in Dockerfile', async () => {
      const content = await fs.readFile(toolsBase('templates', 'Dockerfile'), 'utf-8');
      expect(content).toContain('at-spi2-core');
      expect(content).toContain('libatspi2.0-0');
    });

    it('should start AT-SPI2 registryd in start-gui.sh', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'scripts', 'start-gui.sh'),
        'utf-8',
      );
      expect(content).toContain('at-spi2-registryd');
      expect(content).toContain('toolkit-accessibility true');
    });

    it('should resolve accessibility bus in oculos-wrapper.sh', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'scripts', 'oculos-wrapper.sh'),
        'utf-8',
      );
      expect(content).toContain('org.a11y.Bus');
      expect(content).toContain('GetAddress');
    });

    it('should launch Chromium with --no-sandbox in open-browser.sh', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'scripts', 'open-browser.sh'),
        'utf-8',
      );
      expect(content).toContain('--no-sandbox');
      expect(content).toContain('--remote-debugging-port');
    });
  });

  // @feature7 — Dynamic port allocation
  describe('Scenario: Dynamic port allocation support', () => {
    it('should use HOST_NOVNC_PORT env variable in docker-compose.yml', async () => {
      const content = await fs.readFile(
        toolsBase('templates', 'docker-compose.yml'),
        'utf-8',
      );
      expect(content).toContain('HOST_NOVNC_PORT');
      expect(content).toContain('HOST_VNC_PORT');
    });

    it('should have Get-NextPorts function in launch-worktree.ps1', async () => {
      const content = await fs.readFile(toolsBase('launch-worktree.ps1'), 'utf-8');
      expect(content).toContain('Get-NextPorts');
      expect(content).toContain('Get-WorktreeEnvPort');
      expect(content).toContain('HOST_NOVNC_PORT');
    });

    it('should read ports from .env in start.bat', async () => {
      const content = await fs.readFile(toolsBase('templates', 'start.bat'), 'utf-8');
      expect(content).toContain('.env');
      expect(content).toContain('HOST_NOVNC_PORT');
      expect(content).toContain('NOVNC_PORT');
    });
  });
});

// --- Helper ---

async function collectTextFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const binaryExts = ['.patch', '.png', '.jpg', '.gif', '.ico'];

  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (!binaryExts.includes(path.extname(entry.name).toLowerCase())) {
        result.push(full);
      }
    }
  }

  await walk(dir);
  return result;
}
