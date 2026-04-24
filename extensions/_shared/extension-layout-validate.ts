#!/usr/bin/env npx tsx
/**
 * Extension layout validator.
 *
 * Scans each `extensions/<name>/` folder for layout violations:
 *   1. Rule files under `extensions/<name>/rules/` (should be at `.claude/rules/<name>/`)
 *   2. Skill files under `extensions/<name>/skills/` (should be at `.claude/skills/<skill>/`)
 *   3. extension.json ruleFiles and skills paths pointing to NON-EXISTENT source files
 *
 * Exit code:
 *   0 — clean (or no extensions)
 *   1 — violations found (actionable messages on stderr)
 *
 * See: .claude/rules/extension-layout.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

interface Finding {
  severity: 'error' | 'warning';
  extension: string;
  path?: string;
  message: string;
  hint: string;
}

/**
 * Scan a single extension directory for layout violations.
 * Pure function — takes paths, returns findings.
 */
export function validateExtensionLayout(
  packageRoot: string,
  extName: string,
): Finding[] {
  const findings: Finding[] = [];
  const extPath = path.join(packageRoot, 'extensions', extName);
  const manifestPath = path.join(extPath, 'extension.json');

  if (!fs.existsSync(manifestPath)) {
    return findings; // not an extension
  }

  // Rule 1: no rules/ or skills/ under extensions/{name}/
  const rulesDir = path.join(extPath, 'rules');
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    const items = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    for (const item of items) {
      findings.push({
        severity: 'error',
        extension: extName,
        path: path.join('extensions', extName, 'rules', item),
        message: `Rule file in wrong location: extensions/${extName}/rules/${item}`,
        hint: `Move to .claude/rules/${extName}/${item} (dev-pomogator repo root)`,
      });
    }
  }

  const skillsDir = path.join(extPath, 'skills');
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    const walk = (dir: string, rel: string = ''): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const relPath = rel ? path.join(rel, entry.name) : entry.name;
        if (entry.isDirectory()) out.push(...walk(full, relPath));
        else if (entry.name === 'SKILL.md' || entry.name.endsWith('.ts')) out.push(relPath);
      }
      return out;
    };
    const items = walk(skillsDir);
    for (const item of items) {
      findings.push({
        severity: 'error',
        extension: extName,
        path: path.join('extensions', extName, 'skills', item),
        message: `Skill file in wrong location: extensions/${extName}/skills/${item}`,
        hint: `Move to .claude/skills/{skill-name}/... (dev-pomogator repo root)`,
      });
    }
  }

  // Rule 2: extension.json ruleFiles / skills paths resolve to existing source files
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Check ruleFiles.claude
    const ruleFiles: string[] = manifest.ruleFiles?.claude || [];
    for (const r of ruleFiles) {
      const src = path.join(packageRoot, r);
      if (!fs.existsSync(src)) {
        findings.push({
          severity: 'error',
          extension: extName,
          path: r,
          message: `extension.json ruleFiles.claude path does not exist at source: ${r}`,
          hint: `Create the file at ${src} OR remove entry from extension.json`,
        });
      }
    }

    // Check skills
    const skills: Record<string, string> = manifest.skills || {};
    for (const [name, relPath] of Object.entries(skills)) {
      const src = path.join(packageRoot, relPath);
      if (!fs.existsSync(src)) {
        findings.push({
          severity: 'error',
          extension: extName,
          path: relPath,
          message: `extension.json skills.${name} path does not exist at source: ${relPath}`,
          hint: `Create the skill directory with SKILL.md at ${src} OR remove entry from extension.json`,
        });
      }
    }

    // Note: skillFiles entries are TARGET paths (where files will land after install),
    // not source paths. The source dir is resolved via manifest.skills.{name}; installer
    // copies the entire dir. Validation of skillFiles as source-existence would be a
    // false positive (entries intentionally point at non-existent repo-root paths).
    //
    // Instead, warn if skillFiles target path convention is wrong (must start with
    // .claude/skills/{name}/).
    const skillFiles: Record<string, string[]> = manifest.skillFiles || {};
    for (const [name, files] of Object.entries(skillFiles)) {
      for (const f of files) {
        const expectedPrefix = `.claude/skills/${name}/`;
        if (!f.startsWith(expectedPrefix)) {
          findings.push({
            severity: 'warning',
            extension: extName,
            path: f,
            message: `extension.json skillFiles.${name} entry does not start with ${expectedPrefix}`,
            hint: `Target-path convention: entries must be under .claude/skills/<skill-name>/ (installed location). Use ${expectedPrefix}${path.basename(f)} or similar.`,
          });
        }
      }
    }
  } catch (err) {
    findings.push({
      severity: 'error',
      extension: extName,
      message: `Cannot parse extension.json: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Fix JSON syntax',
    });
  }

  return findings;
}

/** Scan all extensions in packageRoot. */
export function validateAllExtensions(packageRoot: string): Finding[] {
  const extensionsDir = path.join(packageRoot, 'extensions');
  if (!fs.existsSync(extensionsDir)) return [];

  const findings: Finding[] = [];
  const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue; // skip _shared etc
    findings.push(...validateExtensionLayout(packageRoot, entry.name));
  }
  return findings;
}

/** CLI entry. */
async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageRoot = path.resolve(__dirname, '..', '..');

  const findings = validateAllExtensions(packageRoot);

  if (findings.length === 0) {
    console.log('[extension-layout-validate] ✓ All extensions conform to layout convention');
    process.exit(0);
  }

  console.error(`[extension-layout-validate] Found ${findings.length} violation(s):\n`);
  for (const f of findings) {
    const sev = f.severity === 'error' ? '❌' : '⚠️ ';
    console.error(`${sev} [${f.extension}] ${f.message}`);
    console.error(`     💡 ${f.hint}`);
    console.error('');
  }
  console.error(`Fix violations OR check .claude/rules/extension-layout.md for convention.`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error(`[extension-layout-validate] Error: ${err instanceof Error ? err.stack : String(err)}`);
    process.exit(1);
  });
}
