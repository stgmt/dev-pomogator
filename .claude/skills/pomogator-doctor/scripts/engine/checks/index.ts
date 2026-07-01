import type { CheckDefinition } from '../types.js';
import { bunCheck } from './bun.js';
import { claudeBinPriorityCheck } from './claude-bin-priority.js';
import { claudeMemPluginCheck } from './claude-mem-plugin.js';
import { contextMenuCheck } from './context-menu.js';
import { dockerCheck } from './docker.js';
import { envExampleCheck } from './env-example.js';
import { envVarsCheck } from './env-vars.js';
import { forbidRootArtifactsCheck } from './forbid-root-artifacts.js';
import { gitCheck } from './git.js';
import { gitignoreBlockCheck } from './gitignore-block.js';
import { hooksExecCheck } from './hooks-exec.js';
import { hooksRegistryCheck } from './hooks-registry.js';
import { mcpAuthCheck } from './mcp-auth.js';
import { mcpParseCheck } from './mcp-parse.js';
import { mcpProbeCheck } from './mcp-probe.js';
import { meridianCheck } from './meridian.js';
import { nodeVersionCheck } from './node-version.js';
import { pluginLoaderCheck } from './plugin-loader.js';
import { pomogatorHomeCheck } from './pomogator-home.js';
import { pythonCheck } from './python.js';
import { statuslineCheck } from './statusline.js';
import { statuslineWidgetsCheck } from './statusline-widgets.js';
import { versionMatchCheck } from './version-match.js';

export const phase2Checks: CheckDefinition[] = [
  nodeVersionCheck,
  gitCheck,
  pomogatorHomeCheck,
  hooksRegistryCheck,
  hooksExecCheck,
  envVarsCheck,
  envExampleCheck,
  versionMatchCheck,
  gitignoreBlockCheck,
  claudeBinPriorityCheck,
  statuslineCheck,
  statuslineWidgetsCheck,
  contextMenuCheck,
  forbidRootArtifactsCheck,
];

export const phase3Checks: CheckDefinition[] = [bunCheck, pythonCheck, dockerCheck, meridianCheck];

export const phase4Checks: CheckDefinition[] = [mcpParseCheck, mcpProbeCheck, mcpAuthCheck, pluginLoaderCheck, claudeMemPluginCheck];

export const allChecks: CheckDefinition[] = [
  ...phase2Checks,
  ...phase3Checks,
  ...phase4Checks,
];

export {
  bunCheck,
  claudeBinPriorityCheck,
  claudeMemPluginCheck,
  contextMenuCheck,
  dockerCheck,
  envExampleCheck,
  envVarsCheck,
  forbidRootArtifactsCheck,
  gitCheck,
  gitignoreBlockCheck,
  hooksExecCheck,
  hooksRegistryCheck,
  mcpAuthCheck,
  mcpParseCheck,
  mcpProbeCheck,
  meridianCheck,
  nodeVersionCheck,
  pluginLoaderCheck,
  pomogatorHomeCheck,
  pythonCheck,
  statuslineCheck,
  statuslineWidgetsCheck,
  versionMatchCheck,
};
