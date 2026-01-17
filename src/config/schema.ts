export type Platform = 'cursor' | 'claude';

export interface Config {
  platforms: Platform[];
  autoUpdate: boolean;
  lastCheck: string;
  cooldownHours: number;
  installedVersion: string;
  rememberChoice: boolean;
  installPath: {
    cursor: string;
    claude: string;
  };
}

export const DEFAULT_CONFIG: Config = {
  platforms: [],
  autoUpdate: true,
  lastCheck: new Date().toISOString(),
  cooldownHours: 6,
  installedVersion: '0.1.0',
  rememberChoice: true,
  installPath: {
    cursor: '.cursor/rules',
    claude: '~/.claude/plugins/dev-pomogator',
  },
};
