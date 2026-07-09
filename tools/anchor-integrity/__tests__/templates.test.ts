// FR-34a / anchor-templates — a freshly-scaffolded spec must resolve every anchor
// in the Marksman LSP out of the box. scaffold-spec.ts copies the `*.md.template`
// files verbatim, so the guarantee reduces to: the template set is internally
// anchor-consistent. We load every template (stripping the `.template` suffix so
// same-dir cross-file resolution works) and assert checkLinks finds 0 broken.
//
// This is the regression that pins the `{название}`→braces fix: before it, a fresh
// scaffold carried 16 broken anchors (the `#fr-1-{название}` composite the heading
// slug `fr-1-название` never matched).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks, indexHeadings } from '../check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, '..', '..', 'specs-generator', 'templates');
const specsGeneratorCore = path.join(here, '..', '..', 'specs-generator', 'specs-generator-core.mjs');
const repoRoot = path.join(here, '..', '..', '..');
const hasTemplates = fs.existsSync(templatesDir);

const movedTemplateOwners = new Map([
  ['JIRA_SOURCE.md.template', [
    '.claude/skills/create-spec/references/templates/JIRA_SOURCE.md.template',
    '.agents/skills/create-spec/references/templates/JIRA_SOURCE.md.template',
  ]],
  ['ATTACHMENTS.md.template', [
    '.claude/skills/create-spec/references/templates/ATTACHMENTS.md.template',
    '.agents/skills/create-spec/references/templates/ATTACHMENTS.md.template',
  ]],
  ['AUDIT_REPORT.md.template', [
    '.claude/skills/create-spec/references/templates/AUDIT_REPORT.md.template',
    '.agents/skills/create-spec/references/templates/AUDIT_REPORT.md.template',
  ]],
  ['ARCHITECTURE_AXIS.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/ARCHITECTURE_AXIS.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/ARCHITECTURE_AXIS.md.template',
  ]],
  ['ARCHITECTURE_INDEX.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/ARCHITECTURE_INDEX.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/ARCHITECTURE_INDEX.md.template',
  ]],
  ['COMPLETENESS.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/COMPLETENESS.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/COMPLETENESS.md.template',
  ]],
  ['SYNTHESIS.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/SYNTHESIS.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/SYNTHESIS.md.template',
  ]],
]);

function sortedTemplateNames(dir: string): string[] {
  return fs.readdirSync(dir).filter((n) => n.endsWith('.template')).sort();
}

function scaffoldTemplateInputs(): string[] {
  const core = fs.readFileSync(specsGeneratorCore, 'utf-8');
  const mappingsBlock = core.match(/const templateMappings = \[[\s\S]*?\];/);
  expect(mappingsBlock, 'specs-generator-core.mjs must define templateMappings').not.toBeNull();
  return [...mappingsBlock![0].matchAll(/\[\s*['"]([^'"]+\.template)['"]\s*,/g)]
    .map((m) => m[1])
    .sort();
}

function featureRequirementTags(content: string): string[] {
  return [...new Set([...content.matchAll(/^\s*@(FR-\d+)\b/gm)].map((m) => m[1]))].sort();
}

describe('scaffold templates emit Marksman-resolvable anchors', () => {
  it.skipIf(!hasTemplates)('every `*.md.template` link anchor resolves (0 broken)', () => {
    const files = fs
      .readdirSync(templatesDir)
      .filter((n) => n.endsWith('.md.template'))
      .map((n) => ({
        file: n.replace(/\.template$/, ''),
        content: fs.readFileSync(path.join(templatesDir, n), 'utf-8'),
      }));

    expect(files.length).toBeGreaterThan(0);

    const broken = checkLinks(files);
    // Surface the exact offenders in the failure message — the fix slug is included.
    const detail = broken
      .map((b) => `${b.file}:${b.line} [${b.linkText}] #${b.brokenAnchor}` + (b.currentSlug ? ` → #${b.currentSlug}` : ' (ambiguous)'))
      .join('\n');
    expect(broken, `broken template anchors:\n${detail}`).toEqual([]);
  });

  it.skipIf(!hasTemplates)('feature.template @FR tags resolve against FR.md.template headings', () => {
    const feature = fs.readFileSync(path.join(templatesDir, 'feature.template'), 'utf-8');
    const fr = fs.readFileSync(path.join(templatesDir, 'FR.md.template'), 'utf-8');
    const frIndex = indexHeadings(fr);
    const tags = featureRequirementTags(feature);

    expect(tags, 'feature.template should carry concrete FR tags for generated scenarios').toEqual(['FR-1', 'FR-2', 'FR-3']);
    for (const tag of tags) {
      expect(frIndex.idToSlug.has(tag), `${tag} from feature.template must resolve to an FR.md.template heading`).toBe(true);
    }
  });

  it.skipIf(!hasTemplates)('templates directory contains only scaffold-instantiated templates', () => {
    expect(sortedTemplateNames(templatesDir)).toEqual(scaffoldTemplateInputs());
  });

  it.skipIf(!hasTemplates)('non-scaffold templates live with their owning skills', () => {
    for (const [templateName, ownerPaths] of movedTemplateOwners) {
      expect(fs.existsSync(path.join(templatesDir, templateName)), `${templateName} must not live in scaffold templates`).toBe(false);
      for (const ownerPath of ownerPaths) {
        expect(fs.existsSync(path.join(repoRoot, ownerPath)), `${templateName} owner missing: ${ownerPath}`).toBe(true);
      }
    }
  });
});
