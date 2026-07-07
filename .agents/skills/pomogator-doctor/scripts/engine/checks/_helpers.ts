import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { DOCTOR_TIMEOUTS } from '../constants.js';
import type { CheckDefinition, CheckResult } from '../types.js';

type ResultMeta = Pick<CheckDefinition, 'id' | 'fr' | 'name' | 'group' | 'reinstallable'>;

export function buildResult(
  meta: ResultMeta,
  severity: CheckResult['severity'],
  message: string,
  extra: Partial<CheckResult> = {},
): CheckResult {
  return {
    id: meta.id,
    fr: meta.fr,
    name: meta.name,
    group: meta.group,
    reinstallable: meta.reinstallable,
    severity,
    message,
    durationMs: 0,
    ...extra,
  };
}

export function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export interface BinaryVersionResult {
  ok: boolean;
  output: string;
  error?: string;
}

export function checkBinaryVersion(
  bin: string,
  args: string[] = ['--version'],
  pattern?: RegExp,
): BinaryVersionResult {
  const result = spawnSync(bin, args, {
    encoding: 'utf-8',
    timeout: DOCTOR_TIMEOUTS.SPAWN_MS,
  });
  const combined = ((result.stdout ?? '') + (result.stderr ?? '')).trim();
  if (result.status === 0 && (!pattern || pattern.test(combined))) {
    return { ok: true, output: combined };
  }
  return {
    ok: false,
    output: combined,
    error: result.error?.message,
  };
}

export function parseDotenvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function readDotenvFile(envPath: string): Record<string, string> {
  try {
    return parseDotenvContent(fs.readFileSync(envPath, 'utf-8'));
  } catch {
    return {};
  }
}
