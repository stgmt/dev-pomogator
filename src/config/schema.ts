export type Platform = 'cursor' | 'claude';

export interface InstalledExtension {
  name: string;
  version: string;
  platform: Platform;
  projectPaths: string[];
  managed?: Record<string, ManagedFiles>;
}

export interface ManagedFiles {
  commands?: string[];
  rules?: string[];
  tools?: string[];
  hooks?: Record<string, string[]>;
}

export interface Config {
  platforms: Platform[];
  autoUpdate: boolean;
  enableMemory?: boolean;
  lastCheck: string;
  cooldownHours: number;
  rememberChoice: boolean;
  installedExtensions: InstalledExtension[];
}

export const DEFAULT_CONFIG: Config = {
  platforms: [],
  autoUpdate: true,
  enableMemory: true,
  lastCheck: new Date().toISOString(),
  cooldownHours: 24,
  rememberChoice: true,
  installedExtensions: [],
};
