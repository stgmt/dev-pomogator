#!/usr/bin/env npx tsx
/**
 * DevContainer PostInstall Script
 *
 * Copies parameterized devcontainer templates to .devcontainer/ in the project root.
 * Handles migration if .devcontainer/ already exists (backup + merge).
 *
 * Variables substituted:
 *   {{PROJECT_NAME}}     — auto-detected from git remote or directory name
 *   {{WORKSPACE_FOLDER}} — /workspaces/{{PROJECT_NAME}}
 *   {{HOST_REPOS_PATH}}  — parent directory of the project (D:\repos style)
 *   {{HOST_NOVNC_PORT}}  — default 6080
 *   {{HOST_VNC_PORT}}    — default 5900
 *   {{VOLUME_NAME}}      — {{PROJECT_NAME}}-home
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

// --- Helpers ---

const isInteractive = process.stdin.isTTY === true;

function ask(question: string, defaultVal?: string): Promise<string> {
  // Non-interactive: use defaults silently
  if (!isInteractive) {
    if (defaultVal) {
      console.log(`  ${question}: ${defaultVal} (auto)`);
      return Promise.resolve(defaultVal);
    }
    return Promise.resolve('');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function detectProjectName(): string {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch { /* no git remote */ }
  return path.basename(process.cwd());
}

function detectReposPath(): string {
  const parent = path.dirname(process.cwd());
  // Windows: convert forward slashes to backslashes for Docker volume mounts
  // Linux/Mac: keep as-is
  if (process.platform === 'win32') {
    return parent.replace(/\//g, '\\');
  }
  return parent;
}

function copyRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function substituteFile(filePath: string, vars: Record<string, string>): void {
  const ext = path.extname(filePath).toLowerCase();
  // Skip binary files (patches, images)
  const binaryExts = ['.patch', '.png', '.jpg', '.gif', '.ico', '.woff', '.woff2', '.ttf'];
  if (binaryExts.includes(ext)) return;

  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    if (content.includes(placeholder)) {
      content = content.split(placeholder).join(value);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

function substituteRecursive(dir: string, vars: Record<string, string>): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      substituteRecursive(fullPath, vars);
    } else {
      substituteFile(fullPath, vars);
    }
  }
}

// --- Migration ---

interface MergeResult {
  aptPackages: string[];
  vscodeExtensions: string[];
  volumes: string[];
}

function extractAptPackages(dockerfilePath: string): string[] {
  if (!fs.existsSync(dockerfilePath)) return [];
  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  const packages: string[] = [];
  // Match apt-get install lines (potentially multi-line with \)
  const installRegex = /apt-get\s+install[^\\]*(?:\\[\s\S]*?)?\n/g;
  let match;
  while ((match = installRegex.exec(content)) !== null) {
    const block = match[0].replace(/\\\s*\n/g, ' ');
    const pkgRegex = /(?:^|\s)([a-z][a-z0-9.+-]+)/g;
    let pkg;
    while ((pkg = pkgRegex.exec(block)) !== null) {
      const name = pkg[1];
      if (!['apt-get', 'install', 'update', 'yes', 'no-install-recommends', 'y'].includes(name) && !name.startsWith('-')) {
        packages.push(name);
      }
    }
  }
  return [...new Set(packages)];
}

function extractVscodeExtensions(devcontainerPath: string): string[] {
  if (!fs.existsSync(devcontainerPath)) return [];
  try {
    const config = JSON.parse(fs.readFileSync(devcontainerPath, 'utf-8'));
    return config?.customizations?.vscode?.extensions || [];
  } catch {
    return [];
  }
}

function extractVolumes(composePath: string): string[] {
  if (!fs.existsSync(composePath)) return [];
  const content = fs.readFileSync(composePath, 'utf-8');
  const volumes: string[] = [];
  let inVolumes = false;
  for (const line of content.split('\n')) {
    if (line.match(/^\s+volumes:\s*$/)) {
      inVolumes = true;
      continue;
    }
    if (inVolumes && line.match(/^\s+-\s+/)) {
      volumes.push(line.trim().replace(/^-\s+/, ''));
    } else if (inVolumes && !line.match(/^\s/)) {
      inVolumes = false;
    }
  }
  return volumes;
}

async function migrateExisting(projectRoot: string): Promise<MergeResult | null> {
  const devcontainerDir = path.join(projectRoot, '.devcontainer');
  if (!fs.existsSync(devcontainerDir)) return null;

  console.log('\n  Existing .devcontainer/ detected.');
  if (isInteractive) {
    const answer = await ask('  Migrate to new template? (backup existing) [y/N]');
    if (answer.toLowerCase() !== 'y') {
      console.log('  Skipping devcontainer setup.');
      return null;
    }
  } else {
    console.log('  Non-interactive mode: auto-migrating with backup.');
  }

  // Extract user customizations before backup
  const result: MergeResult = {
    aptPackages: extractAptPackages(path.join(devcontainerDir, 'Dockerfile')),
    vscodeExtensions: extractVscodeExtensions(path.join(devcontainerDir, 'devcontainer.json')),
    volumes: extractVolumes(path.join(devcontainerDir, 'docker-compose.yml')),
  };

  // Backup
  const backupDir = path.join(projectRoot, '.devcontainer.backup');
  try {
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    fs.renameSync(devcontainerDir, backupDir);
    console.log(`  Backed up to .devcontainer.backup/`);
  } catch (err) {
    console.error(`  [ERROR] Failed to backup .devcontainer/: ${err instanceof Error ? err.message : 'unknown'}`);
    console.error('  Aborting migration to avoid data loss.');
    return null;
  }

  return result;
}

function mergeCustomizations(projectRoot: string, mergeResult: MergeResult): void {
  const devcontainerDir = path.join(projectRoot, '.devcontainer');

  // Merge VS Code extensions into devcontainer.json
  if (mergeResult.vscodeExtensions.length > 0) {
    const dcPath = path.join(devcontainerDir, 'devcontainer.json');
    if (fs.existsSync(dcPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(dcPath, 'utf-8'));
        const existing = config?.customizations?.vscode?.extensions || [];
        const merged = [...new Set([...existing, ...mergeResult.vscodeExtensions])];
        if (!config.customizations) config.customizations = {};
        if (!config.customizations.vscode) config.customizations.vscode = {};
        config.customizations.vscode.extensions = merged;
        fs.writeFileSync(dcPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
        const added = merged.length - existing.length;
        if (added > 0) {
          console.log(`  Merged ${added} VS Code extension(s) from existing config`);
        }
      } catch (err) {
        console.warn(`  [WARN] Could not merge VS Code extensions: ${err instanceof Error ? err.message : 'parse error'}`);
      }
    }
  }

  // Log user apt packages for manual review
  if (mergeResult.aptPackages.length > 0) {
    console.log(`  User apt packages from old Dockerfile (review .devcontainer.backup/Dockerfile):`);
    console.log(`    ${mergeResult.aptPackages.slice(0, 10).join(', ')}${mergeResult.aptPackages.length > 10 ? '...' : ''}`);
    console.log(`  Add custom packages to .devcontainer/Dockerfile manually if needed.`);
  }
}

// --- Main ---

async function main() {
  const projectRoot = process.cwd();
  const templatesDir = path.join(projectRoot, '.dev-pomogator', 'tools', 'devcontainer', 'templates');

  if (!fs.existsSync(templatesDir)) {
    console.log('  Templates not found at .dev-pomogator/tools/devcontainer/templates/');
    console.log('  Skipping devcontainer setup.');
    return;
  }

  // Early exit if .devcontainer/ already exists (idempotency on reinstall)
  const forceReconfigure = process.argv.includes('--reconfigure') ||
                            process.env.DEVCONTAINER_RECONFIGURE === '1';
  const devcontainerDir = path.join(projectRoot, '.devcontainer');

  if (fs.existsSync(devcontainerDir) && !forceReconfigure) {
    console.log('\n  DevContainer already configured at .devcontainer/, skipping.');
    console.log('  To reconfigure, set DEVCONTAINER_RECONFIGURE=1 or pass --reconfigure');
    return;
  }

  console.log('\n  DevContainer Setup');
  console.log('  ==================\n');

  // Check for existing .devcontainer/ (only reached with --reconfigure)
  const mergeResult = await migrateExisting(projectRoot);
  // mergeResult === null: either no existing dir OR user declined migration
  // If declined and .devcontainer still exists (not moved to backup), skip entirely
  if (mergeResult === null && fs.existsSync(devcontainerDir)) {
    return;
  }

  // Auto-detect parameters
  const defaultName = detectProjectName();
  const defaultReposPath = detectReposPath();

  const projectName = await ask('  Project name', defaultName);
  const noVncPort = await ask('  noVNC port', '6080');
  const vncPort = await ask('  VNC port', '5900');
  const reposPath = await ask('  Host repos path', defaultReposPath);

  const vars: Record<string, string> = {
    PROJECT_NAME: projectName,
    WORKSPACE_FOLDER: `/workspaces/${projectName}`,
    HOST_REPOS_PATH: reposPath,
    HOST_NOVNC_PORT: noVncPort,
    HOST_VNC_PORT: vncPort,
    VOLUME_NAME: `${projectName}-home`,
  };

  // Copy templates to .devcontainer/
  const destDir = path.join(projectRoot, '.devcontainer');
  console.log('\n  Copying templates...');
  copyRecursive(templatesDir, destDir);

  // Substitute variables
  console.log('  Substituting variables...');
  substituteRecursive(destDir, vars);

  // Create .env with port defaults
  const envContent = [
    '# Auto-generated by dev-pomogator devcontainer extension',
    `HOST_NOVNC_PORT=${noVncPort}`,
    `HOST_VNC_PORT=${vncPort}`,
    `HOST_REPOS_PATH=${reposPath}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(destDir, '.env'), envContent, 'utf-8');

  // Create snapshots directory
  fs.mkdirSync(path.join(destDir, 'snapshots'), { recursive: true });
  fs.writeFileSync(path.join(destDir, 'snapshots', '.gitkeep'), '', 'utf-8');

  // Merge user customizations if migrating
  if (mergeResult) {
    mergeCustomizations(projectRoot, mergeResult);
  }

  // Copy launch-worktree.ps1 to scripts/
  const launchWorktreeSrc = path.join(projectRoot, '.dev-pomogator', 'tools', 'devcontainer', 'launch-worktree.ps1');
  if (fs.existsSync(launchWorktreeSrc)) {
    const scriptsDir = path.join(projectRoot, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(launchWorktreeSrc, path.join(scriptsDir, 'launch-worktree.ps1'));
    console.log('  Installed scripts/launch-worktree.ps1');
  }

  console.log('\n  DevContainer setup complete!');
  console.log(`  Project: ${projectName}`);
  console.log(`  noVNC:   localhost:${noVncPort}`);
  console.log(`  VNC:     localhost:${vncPort}`);
  console.log(`  Repos:   ${reposPath}`);
  console.log('');
  console.log('  To start: double-click .devcontainer\\start.bat');
  console.log('  Or: docker compose -f .devcontainer/docker-compose.yml up -d --build');
  console.log('  Worktrees: .\\scripts\\launch-worktree.ps1');
  console.log('');
}

main().catch((err) => {
  console.error('DevContainer setup error:', err.message);
  process.exit(1);
});
