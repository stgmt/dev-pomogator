import fs from 'node:fs';
import { parseDotenvContent } from '../../../src/doctor/checks/_helpers.ts';

export interface EnvSnapshot {
  restore(): void;
}

export function snapshotEnv(keys?: string[]): EnvSnapshot {
  const relevantKeys = keys ?? Object.keys(process.env);
  const saved: Record<string, string | undefined> = {};
  for (const key of relevantKeys) {
    saved[key] = process.env[key];
  }
  return {
    restore() {
      for (const key of relevantKeys) {
        const prior = saved[key];
        if (prior === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = prior;
        }
      }
    },
  };
}

export function loadDotenvFixture(path: string): Record<string, string> {
  return parseDotenvContent(fs.readFileSync(path, 'utf-8'));
}

export function applyDotenvToProcess(path: string): EnvSnapshot {
  const values = loadDotenvFixture(path);
  const snapshot = snapshotEnv(Object.keys(values));
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  return snapshot;
}
