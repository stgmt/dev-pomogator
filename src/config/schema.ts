export type Platform = 'cursor' | 'claude';

export interface InstalledExtension {
  name: string;
  version: string;
  platform: Platform;
  projectPaths: string[];
}

export interface Config {
  platforms: Platform[];
  autoUpdate: boolean;
  lastCheck: string;
  cooldownHours: number;
  rememberChoice: boolean;
  installedExtensions: InstalledExtension[];
}

export const DEFAULT_CONFIG: Config = {
  platforms: [],
  autoUpdate: true,
  lastCheck: new Date().toISOString(),
  cooldownHours: 24,
  rememberChoice: true,
  installedExtensions: [],
};
