import type { Config } from './schema.js';
export declare function loadConfig(): Promise<Config | null>;
export declare function saveConfig(config: Config): Promise<void>;
export declare function updateLastCheck(): Promise<void>;
export declare function getConfigPath(): string;
export declare function getConfigDir(): string;
//# sourceMappingURL=index.d.ts.map