import type { CheckDefinition } from '../types.js';
import { bunCheck } from './bun.js';
import { claudeBinPriorityCheck } from './claude-bin-priority.js';
import { dockerCheck } from './docker.js';
import { envExampleCheck } from './env-example.js';
import { envVarsCheck } from './env-vars.js';
import { gitCheck } from './git.js';
import { gitignoreBlockCheck } from './gitignore-block.js';
import { hooksRegistryCheck } from './hooks-registry.js';
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
  envVarsCheck,
  envExampleCheck,
  versionMatchCheck,
  gitignoreBlockCheck,
  claudeBinPriorityCheck,
  statuslineCheck,
  statuslineWidgetsCheck,
];

export const phase3Checks: CheckDefinition[] = [bunCheck, pythonCheck, dockerCheck, meridianCheck];

export const phase4Checks: CheckDefinition[] = [mcpParseCheck, mcpProbeCheck, pluginLoaderCheck];

export const allChecks: CheckDefinition[] = [
  ...phase2Checks,
  ...phase3Checks,
  ...phase4Checks,
];

export {
  bunCheck,
  claudeBinPriorityCheck,
  dockerCheck,
  envExampleCheck,
  envVarsCheck,
  gitCheck,
  gitignoreBlockCheck,
  hooksRegistryCheck,
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
