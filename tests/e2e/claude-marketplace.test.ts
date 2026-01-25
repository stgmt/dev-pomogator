import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';

const ROOT_DIR = path.join(__dirname, '..', '..');

describe('Claude Code Marketplace', () => {
  describe('marketplace.json', () => {
    it('should exist in .claude-plugin directory', async () => {
      const marketplacePath = path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json');
      expect(await fs.pathExists(marketplacePath)).toBe(true);
    });

    it('should have valid JSON structure', async () => {
      const marketplacePath = path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json');
      const content = await fs.readJson(marketplacePath);
      
      expect(content.name).toBe('dev-pomogator');
      expect(content.owner).toBeDefined();
      expect(content.owner.name).toBe('stgmt');
      expect(content.plugins).toBeDefined();
      expect(Array.isArray(content.plugins)).toBe(true);
    });

    it('should list suggest-rules plugin', async () => {
      const marketplacePath = path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json');
      const content = await fs.readJson(marketplacePath);
      
      const suggestRules = content.plugins.find((p: any) => p.name === 'suggest-rules');
      expect(suggestRules).toBeDefined();
      expect(suggestRules.source).toBe('./extensions/suggest-rules');
      expect(suggestRules.version).toBeDefined();
    });

    it('should list specs-workflow plugin', async () => {
      const marketplacePath = path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json');
      const content = await fs.readJson(marketplacePath);
      
      const specsWorkflow = content.plugins.find((p: any) => p.name === 'specs-workflow');
      expect(specsWorkflow).toBeDefined();
      expect(specsWorkflow.source).toBe('./extensions/specs-workflow');
      expect(specsWorkflow.version).toBeDefined();
    });
  });

  describe('suggest-rules plugin.json', () => {
    it('should exist', async () => {
      const pluginPath = path.join(ROOT_DIR, 'extensions', 'suggest-rules', '.claude-plugin', 'plugin.json');
      expect(await fs.pathExists(pluginPath)).toBe(true);
    });

    it('should have valid structure', async () => {
      const pluginPath = path.join(ROOT_DIR, 'extensions', 'suggest-rules', '.claude-plugin', 'plugin.json');
      const content = await fs.readJson(pluginPath);
      
      expect(content.name).toBe('suggest-rules');
      expect(content.version).toBeDefined();
      expect(content.description).toBeDefined();
      expect(content.commands).toBe('./claude/commands');
    });

    it('should have commands directory', async () => {
      const commandsPath = path.join(ROOT_DIR, 'extensions', 'suggest-rules', 'claude', 'commands');
      expect(await fs.pathExists(commandsPath)).toBe(true);
    });

    it('should have suggest-rules.md command', async () => {
      const cmdPath = path.join(ROOT_DIR, 'extensions', 'suggest-rules', 'claude', 'commands', 'suggest-rules.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);
    });
  });

  describe('specs-workflow plugin.json', () => {
    it('should exist', async () => {
      const pluginPath = path.join(ROOT_DIR, 'extensions', 'specs-workflow', '.claude-plugin', 'plugin.json');
      expect(await fs.pathExists(pluginPath)).toBe(true);
    });

    it('should have valid structure', async () => {
      const pluginPath = path.join(ROOT_DIR, 'extensions', 'specs-workflow', '.claude-plugin', 'plugin.json');
      const content = await fs.readJson(pluginPath);
      
      expect(content.name).toBe('specs-workflow');
      expect(content.version).toBeDefined();
      expect(content.description).toBeDefined();
      expect(content.commands).toBe('./claude/commands');
    });

    it('should have commands directory', async () => {
      const commandsPath = path.join(ROOT_DIR, 'extensions', 'specs-workflow', 'claude', 'commands');
      expect(await fs.pathExists(commandsPath)).toBe(true);
    });

    it('should have create-spec.md command', async () => {
      const cmdPath = path.join(ROOT_DIR, 'extensions', 'specs-workflow', 'claude', 'commands', 'create-spec.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);
    });
  });

  describe('forbid-root-artifacts plugin', () => {
    it('should be listed in marketplace.json', async () => {
      const marketplacePath = path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json');
      const content = await fs.readJson(marketplacePath);
      
      const plugin = content.plugins.find((p: any) => p.name === 'forbid-root-artifacts');
      expect(plugin).toBeDefined();
      expect(plugin.source).toBe('./extensions/forbid-root-artifacts');
    });

    it('should have plugin.json', async () => {
      const pluginPath = path.join(ROOT_DIR, 'extensions', 'forbid-root-artifacts', '.claude-plugin', 'plugin.json');
      expect(await fs.pathExists(pluginPath)).toBe(true);
      
      const content = await fs.readJson(pluginPath);
      expect(content.name).toBe('forbid-root-artifacts');
      expect(content.commands).toBe('./claude/commands');
    });

    it('should have configure-root-artifacts.md command', async () => {
      const cmdPath = path.join(ROOT_DIR, 'extensions', 'forbid-root-artifacts', 'claude', 'commands', 'configure-root-artifacts.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);
    });
  });
});
