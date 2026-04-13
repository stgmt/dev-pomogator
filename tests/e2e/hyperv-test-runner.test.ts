import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { parse as parseYaml } from 'yaml';
import { appPath } from './helpers';

/**
 * CORE_HVTR000: HyperV Test Runner
 *
 * Static BDD assertions that verify the hyperv-test-runner infrastructure exists
 * in the repo as defined in .specs/hyperv-test-runner/. No VM creation, no admin
 * required — all checks are file existence, content regex, schema parse, and
 * PowerShell AST parse (Windows-only via skipIf).
 *
 * Maps to .specs/hyperv-test-runner/hyperv-test-runner.feature scenarios HVTR001..HVTR016.
 */

const TOOLS_DIR = appPath('tools', 'hyperv-test-runner');
const SCENARIOS_DIR = appPath('tests', 'hyperv-scenarios');
const SKILL_DIR = appPath('.claude', 'skills', 'hyperv-test-runner');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const LIFECYCLE_SCRIPTS = [
  '01-create-vm.ps1',
  '02-post-install.ps1',
  '03-checkpoint.ps1',
  '04-revert-and-launch.ps1',
  '05-cleanup.ps1',
];
const COMMON_PS = path.join(TOOLS_DIR, 'lib', 'common.ps1');
const IS_WIN = process.platform === 'win32';

function readIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function parsePowerShellAst(scriptPath: string): { ok: boolean; errors: string } {
  const cmd = `$err = $null; [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replace(/\\/g, '\\\\')}', [ref]$null, [ref]$err); if ($err) { $err | ForEach-Object { Write-Output $_.Message }; exit 1 } else { exit 0 }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], {
    encoding: 'utf-8',
  });
  return { ok: result.status === 0, errors: result.stdout + result.stderr };
}

function extractFrontmatter(md: string): Record<string, unknown> | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe('CORE_HVTR000: HyperV Test Runner', () => {
  // @feature1
  describe('Scenario: HVTR001_lifecycle_scripts_exist', () => {
    it('HVTR001_01: should have all 5 lifecycle scripts in tools/hyperv-test-runner', () => {
      for (const script of LIFECYCLE_SCRIPTS) {
        const fullPath = path.join(TOOLS_DIR, script);
        expect(fs.existsSync(fullPath), `Missing: ${script}`).toBe(true);
      }
    });

    it('HVTR001_02: should have lib/common.ps1 shared helpers module', () => {
      expect(fs.existsSync(COMMON_PS)).toBe(true);
    });
  });

  // @feature1
  describe('Scenario: HVTR002_lifecycle_scripts_have_admin_check', () => {
    it('HVTR002_01: each 0X-*.ps1 references admin elevation check', () => {
      for (const script of LIFECYCLE_SCRIPTS) {
        const content = readIfExists(path.join(TOOLS_DIR, script));
        expect(content, `Cannot read ${script}`).not.toBeNull();
        expect(content!).toMatch(/Assert-Admin|IsInRole|WindowsPrincipal/);
      }
    });

    it('HVTR002_02: common.ps1 defines Test-IsAdmin and Assert-Admin functions', () => {
      const content = readIfExists(COMMON_PS);
      expect(content).not.toBeNull();
      expect(content!).toMatch(/function\s+Test-IsAdmin/);
      expect(content!).toMatch(/function\s+Assert-Admin/);
      expect(content!).toMatch(/IsInRole|WindowsPrincipal/);
    });
  });

  // @feature1
  describe.skipIf(!IS_WIN)('Scenario: HVTR003_lifecycle_scripts_parse_as_powershell', () => {
    it('HVTR003_01: each lifecycle script parses without syntax errors', () => {
      for (const script of [...LIFECYCLE_SCRIPTS, 'lib/common.ps1']) {
        const fullPath = path.join(TOOLS_DIR, script);
        if (!fs.existsSync(fullPath)) continue;
        const { ok, errors } = parsePowerShellAst(fullPath);
        expect(ok, `${script} parse errors:\n${errors}`).toBe(true);
      }
    });

    it('HVTR003_02: scripts contain no leftover placeholder tokens', () => {
      for (const script of LIFECYCLE_SCRIPTS) {
        const content = readIfExists(path.join(TOOLS_DIR, script));
        if (content === null) continue;
        expect(content, `${script} has placeholder`).not.toMatch(/<TODO>|<FILL>|<placeholder>/i);
      }
    });
  });

  // @feature2
  describe.skipIf(!IS_WIN)('Scenario: HVTR004_snapshot_param_supported', () => {
    it('HVTR004_01: 03-checkpoint.ps1 declares -Snapshot parameter with default baseline-clean', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '03-checkpoint.ps1'));
      expect(content, '03-checkpoint.ps1 missing').not.toBeNull();
      expect(content!).toMatch(/\[string\]\s*\$Snapshot\s*=\s*["']baseline-clean["']/);
    });

    it('HVTR004_02: 04-revert-and-launch.ps1 declares -Snapshot parameter with default baseline-clean', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '04-revert-and-launch.ps1'));
      expect(content, '04-revert-and-launch.ps1 missing').not.toBeNull();
      expect(content!).toMatch(/\[string\]\s*\$Snapshot\s*=\s*["']baseline-clean["']/);
    });
  });

  // @feature3
  describe('Scenario: HVTR005_revert_and_launch_calls_vmconnect', () => {
    it('HVTR005_01: 04-revert-and-launch.ps1 invokes vmconnect.exe', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '04-revert-and-launch.ps1'));
      expect(content, 'Script missing').not.toBeNull();
      expect(content!).toMatch(/vmconnect\.exe|Start-Process\s+vmconnect/i);
    });

    it('HVTR005_02: 04-revert-and-launch.ps1 references EnableEnhancedSessionMode', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '04-revert-and-launch.ps1'));
      expect(content).not.toBeNull();
      expect(content!).toMatch(/EnableEnhancedSessionMode/);
    });
  });

  // @feature4
  describe('Scenario: HVTR006_post_install_enables_rdp', () => {
    it('HVTR006_01: 02-post-install.ps1 sets fDenyTSConnections to 0', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '02-post-install.ps1'));
      expect(content, 'Script missing').not.toBeNull();
      expect(content!).toMatch(/fDenyTSConnections/);
      expect(content!).toMatch(/-Value\s+0/);
    });

    it('HVTR006_02: 02-post-install.ps1 enables Remote Desktop firewall rule', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '02-post-install.ps1'));
      expect(content).not.toBeNull();
      expect(content!).toMatch(/Enable-NetFirewallRule/);
      expect(content!).toMatch(/Remote Desktop/);
    });
  });

  // @feature6
  describe('Scenario: HVTR007_skill_file_exists_with_metadata', () => {
    it('HVTR007_01: SKILL.md exists in .claude/skills/hyperv-test-runner/', () => {
      expect(fs.existsSync(SKILL_MD)).toBe(true);
    });

    it('HVTR007_02: frontmatter has required fields name/description/allowed-tools', () => {
      const content = readIfExists(SKILL_MD);
      expect(content, 'SKILL.md missing').not.toBeNull();
      const fm = extractFrontmatter(content!);
      expect(fm, 'frontmatter not parseable').not.toBeNull();
      expect(fm!.name).toBe('hyperv-test-runner');
      expect(fm!.description).toBeTruthy();
      expect(fm!['allowed-tools']).toBeTruthy();
    });

    it('HVTR007_03: allowed-tools includes Bash and Read', () => {
      const content = readIfExists(SKILL_MD);
      if (content === null) return;
      const fm = extractFrontmatter(content);
      if (fm === null) return;
      const allowed = String(fm['allowed-tools'] ?? '');
      expect(allowed).toMatch(/Bash/);
      expect(allowed).toMatch(/Read/);
    });
  });

  // @feature6
  describe('Scenario: HVTR008_skill_triggers_cover_languages', () => {
    it('HVTR008_01: SKILL.md description contains Russian and English triggers', () => {
      const content = readIfExists(SKILL_MD);
      expect(content, 'SKILL.md missing').not.toBeNull();
      const fm = extractFrontmatter(content!);
      expect(fm).not.toBeNull();
      const desc = String(fm!.description ?? '');
      expect(desc).toMatch(/протестируй|проверь|сохрани|чистой винде/i);
      expect(desc).toMatch(/test in clean windows|run scenario|save baseline/i);
    });
  });

  // @feature8
  describe('Scenario: HVTR009_catalog_directory_exists', () => {
    it('HVTR009_01: tests/hyperv-scenarios/ directory exists', () => {
      expect(fs.existsSync(SCENARIOS_DIR)).toBe(true);
    });

    it('HVTR009_02: directory contains schema.json', () => {
      expect(fs.existsSync(path.join(SCENARIOS_DIR, 'schema.json'))).toBe(true);
    });

    it('HVTR009_03: directory contains at least one HV*.yaml scenario', () => {
      if (!fs.existsSync(SCENARIOS_DIR)) {
        expect.fail('SCENARIOS_DIR missing');
      }
      const yamls = fs.readdirSync(SCENARIOS_DIR).filter((f) => /^HV\d{3}_.+\.yaml$/.test(f));
      expect(yamls.length, 'no HV*.yaml found').toBeGreaterThanOrEqual(1);
    });
  });

  // @feature8
  describe('Scenario: HVTR010_catalog_schema_is_valid_json_schema', () => {
    it('HVTR010_01: schema.json parses as JSON', () => {
      const schemaPath = path.join(SCENARIOS_DIR, 'schema.json');
      expect(fs.existsSync(schemaPath), 'schema.json missing').toBe(true);
      const content = fs.readFileSync(schemaPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('HVTR010_02: schema declares draft-07 (or later) and required top-level fields', () => {
      const schemaPath = path.join(SCENARIOS_DIR, 'schema.json');
      if (!fs.existsSync(schemaPath)) return;
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      expect(schema['$schema']).toMatch(/json-schema\.org\/draft-(0[7-9]|1\d|2\d)/);
      expect(schema.type).toBe('object');
      const required: string[] = schema.required ?? [];
      for (const field of ['id', 'name', 'preconditions', 'steps', 'assertions', 'post_test']) {
        expect(required, `missing required field ${field}`).toContain(field);
      }
    });
  });

  // @feature8
  describe('Scenario: HVTR011_reference_scenario_HV001_validates', () => {
    it('HVTR011_01: HV001_install-clean.yaml exists and parses', () => {
      const yamlPath = path.join(SCENARIOS_DIR, 'HV001_install-clean.yaml');
      expect(fs.existsSync(yamlPath), 'HV001_install-clean.yaml missing').toBe(true);
      const content = fs.readFileSync(yamlPath, 'utf-8');
      expect(() => parseYaml(content)).not.toThrow();
    });

    it('HVTR011_02: HV001 has required fields and id matches HV001', () => {
      const yamlPath = path.join(SCENARIOS_DIR, 'HV001_install-clean.yaml');
      if (!fs.existsSync(yamlPath)) return;
      const scenario = parseYaml(fs.readFileSync(yamlPath, 'utf-8'));
      expect(scenario.id).toBe('HV001');
      expect(scenario.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(scenario.preconditions?.checkpoint).toBe('baseline-clean');
      expect(Array.isArray(scenario.steps)).toBe(true);
      expect(scenario.steps.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(scenario.assertions)).toBe(true);
      expect(scenario.assertions.length).toBeGreaterThanOrEqual(1);
      expect(scenario.post_test?.revert).toBe('baseline-clean');
    });

    it('HVTR011_03: HV001 contains at least one screenshot_match assertion', () => {
      const yamlPath = path.join(SCENARIOS_DIR, 'HV001_install-clean.yaml');
      if (!fs.existsSync(yamlPath)) return;
      const scenario = parseYaml(fs.readFileSync(yamlPath, 'utf-8'));
      const hasScreenshot = (scenario.assertions ?? []).some(
        (a: { type?: string }) => a.type === 'screenshot_match',
      );
      expect(hasScreenshot, 'HV001 must have screenshot_match assertion').toBe(true);
    });
  });

  // @feature9
  describe('Scenario: HVTR012_gitignore_includes_run_artifacts', () => {
    it('HVTR012_01: .gitignore mentions hyperv-runs path', () => {
      const gitignore = readIfExists(appPath('.gitignore'));
      expect(gitignore, '.gitignore missing').not.toBeNull();
      expect(gitignore!).toMatch(/\.dev-pomogator\/hyperv-runs/);
    });
  });

  // @feature11
  describe('Scenario: HVTR013_readme_includes_roadmap_section', () => {
    it('HVTR013_01: spec README contains ## Roadmap heading', () => {
      const readmePath = appPath('.specs', 'hyperv-test-runner', 'README.md');
      expect(fs.existsSync(readmePath), 'spec README missing').toBe(true);
      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/^##\s+Roadmap/m);
    });

    it('HVTR013_02: Roadmap section mentions phases v0..v4', () => {
      const readmePath = appPath('.specs', 'hyperv-test-runner', 'README.md');
      if (!fs.existsSync(readmePath)) return;
      const content = fs.readFileSync(readmePath, 'utf-8');
      const roadmapMatch = content.match(/##\s+Roadmap[\s\S]*?(?=\n##\s|\n#\s|$)/);
      expect(roadmapMatch, 'Roadmap section not found').not.toBeNull();
      const roadmap = roadmapMatch![0];
      for (const phase of ['v0', 'v1', 'v2', 'v3', 'v4']) {
        expect(roadmap, `phase ${phase} not in Roadmap`).toMatch(new RegExp(`\\b${phase}\\b`));
      }
    });

    it('HVTR013_03: Roadmap section has Entry/Exit criteria for each phase', () => {
      const readmePath = appPath('.specs', 'hyperv-test-runner', 'README.md');
      if (!fs.existsSync(readmePath)) return;
      const content = fs.readFileSync(readmePath, 'utf-8');
      const roadmapMatch = content.match(/##\s+Roadmap[\s\S]*?(?=\n##\s|\n#\s|$)/);
      if (!roadmapMatch) return;
      const roadmap = roadmapMatch[0];
      expect(roadmap).toMatch(/Entry/i);
      expect(roadmap).toMatch(/Exit/i);
    });
  });

  // @feature12
  describe.skipIf(!IS_WIN)('Scenario: HVTR014_cleanup_requires_confirm_or_force', () => {
    it('HVTR014_01: 05-cleanup.ps1 declares -Confirm or -Force switch parameter', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '05-cleanup.ps1'));
      expect(content, '05-cleanup.ps1 missing').not.toBeNull();
      expect(content!).toMatch(/\[switch\]\s*\$(Confirm|Force)/);
    });

    it('HVTR014_02: 05-cleanup.ps1 fails fast when neither Confirm nor Force is passed', () => {
      const content = readIfExists(path.join(TOOLS_DIR, '05-cleanup.ps1'));
      if (content === null) return;
      expect(content!).toMatch(/-not\s*\(\s*\$Confirm\s+-or\s+\$Force\s*\)/);
      expect(content!).toMatch(/throw|exit\s+1/i);
    });
  });

  // @feature7
  describe('Scenario: HVTR015_skill_reuses_debug_screenshot', () => {
    it('HVTR015_01: SKILL.md references debug-screenshot screenshot.ps1 path', () => {
      const content = readIfExists(SKILL_MD);
      expect(content, 'SKILL.md missing').not.toBeNull();
      expect(content!).toMatch(
        /(\.claude\/skills\/debug-screenshot|extensions\/debug-screenshot[\\\/].*?)scripts[\\\/]screenshot\.ps1/,
      );
    });

    it('HVTR015_02: SKILL.md does not define a custom Win32 screenshot helper', () => {
      const content = readIfExists(SKILL_MD);
      if (content === null) return;
      expect(content).not.toMatch(/Add-Type\s+-AssemblyName\s+System\.Drawing/);
    });
  });

  // @feature10
  describe('Scenario: HVTR016_skill_documents_catalog_extension_workflow', () => {
    it('HVTR016_01: SKILL.md contains a Catalog Extension section', () => {
      const content = readIfExists(SKILL_MD);
      expect(content, 'SKILL.md missing').not.toBeNull();
      expect(content!).toMatch(/Catalog Extension|Extend Catalog|Trigger 3/i);
    });

    it('HVTR016_02: SKILL.md references reading .specs/<feature>/FR.md for catalog generation', () => {
      const content = readIfExists(SKILL_MD);
      if (content === null) return;
      expect(content).toMatch(/\.specs\/.*?FR\.md|\.specs\/<feature>\/FR\.md/);
    });

    it('HVTR016_03: SKILL.md references generating new HV<NNN>_<slug>.yaml files', () => {
      const content = readIfExists(SKILL_MD);
      if (content === null) return;
      expect(content).toMatch(/HV<NNN>|tests\/hyperv-scenarios\/HV/);
    });
  });
});
