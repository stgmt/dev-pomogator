/**
 * Schema validator для `.onboarding.json` (FR-20, AC-2, AC-10, AC-18, AC-20).
 *
 * Phase 9 implementation: full AJV Draft 2020-12 validation loaded from
 * `schemas/onboarding.schema.json` + custom keyword `viaSkillConsistency`
 * enforcing FR-18 (non-empty raw_pattern_to_block when via_skill is set + forbidden=true).
 *
 * Public API:
 *  - validateOnboardingJson(raw): ValidationResult — non-throwing, returns {valid, errors}
 *  - validateOrThrow(raw): OnboardingJson — throws SchemaViolationError on invalid input
 *  - SchemaViolationError — carries structured errors array
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-20, AC.md#ac-2, AC.md#ac-10, AC.md#ac-18, onboard-repo-phase0_SCHEMA.md}.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type AnySchemaObject, type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import * as fsExtra from 'fs-extra';
import type { OnboardingJson, CommandBlock } from './types.ts';


export interface ValidationResult {
  valid: boolean;
  errors: string[];
}


export class SchemaViolationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Schema violation: ${errors.length} error(s)\n  - ${errors.join('\n  - ')}`);
    this.name = 'SchemaViolationError';
  }
}


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', 'schemas', 'onboarding.schema.json');


let cachedValidator: ReturnType<ReturnType<typeof buildAjv>['compile']> | null = null;


function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  const addFormatsFn = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
  (addFormatsFn as (ajv: Ajv2020) => void)(ajv);

  ajv.addKeyword({
    keyword: 'viaSkillConsistency',
    type: 'object',
    errors: true,
    validate: function validateViaSkill(_schema: unknown, data: unknown) {
      const self = validateViaSkill as unknown as { errors: ErrorObject[] };
      self.errors = [];
      if (data === null || typeof data !== 'object') return true;
      for (const [name, cmdRaw] of Object.entries(data as Record<string, unknown>)) {
        if (cmdRaw === null || typeof cmdRaw !== 'object') continue;
        const cmd = cmdRaw as Partial<CommandBlock>;
        if (cmd.via_skill != null && cmd.forbidden_if_skill_present === true) {
          if (!cmd.raw_pattern_to_block || cmd.raw_pattern_to_block === '') {
            self.errors.push({
              instancePath: `/commands/${name}`,
              schemaPath: '#/properties/commands/viaSkillConsistency',
              keyword: 'viaSkillConsistency',
              params: { command: name },
              message: `commands.${name}: forbidden_if_skill_present=true + via_skill set requires non-empty raw_pattern_to_block (FR-18)`,
            });
            continue;
          }
          try {
            new RegExp(cmd.raw_pattern_to_block);
          } catch (err) {
            self.errors.push({
              instancePath: `/commands/${name}/raw_pattern_to_block`,
              schemaPath: '#/properties/commands/viaSkillConsistency',
              keyword: 'viaSkillConsistency',
              params: { command: name },
              message: `commands.${name}.raw_pattern_to_block: invalid regex: ${(err as Error).message}`,
            });
          }
        }
      }
      return self.errors.length === 0;
    },
  });

  return ajv;
}


function loadSchema(): AnySchemaObject {
  const raw = fsExtra.readJsonSync(SCHEMA_PATH) as AnySchemaObject & { properties?: Record<string, AnySchemaObject> };
  // Inject custom keyword into commands property
  if (raw.properties && raw.properties.commands) {
    raw.properties.commands = {
      ...raw.properties.commands,
      viaSkillConsistency: true,
    } as AnySchemaObject;
  }
  return raw;
}


function getValidator() {
  if (cachedValidator) return cachedValidator;
  const ajv = buildAjv();
  const schema = loadSchema();
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}


export function resetValidatorCache(): void {
  cachedValidator = null;
}


function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || '(root)';
  const keyword = err.keyword;

  if (keyword === 'required') {
    const missing = (err.params as { missingProperty: string }).missingProperty;
    const prefix = path === '' ? '' : `${path}: `;
    return `${prefix}missing required field: ${missing}`;
  }

  if (keyword === 'enum') {
    const allowed = (err.params as { allowedValues: unknown[] }).allowedValues;
    return `${path}: must be one of ${allowed.join('|')}, ${err.message ?? ''}`.trim();
  }

  if (keyword === 'type') {
    return `${path}: ${err.message ?? `must be ${(err.params as { type: string }).type}`}`;
  }

  if (keyword === 'pattern') {
    return `${path}: pattern mismatch — ${err.message ?? ''}`.trim();
  }

  if (keyword === 'viaSkillConsistency') {
    return err.message ?? `${path}: viaSkillConsistency violation`;
  }

  return `${path}: ${err.message ?? keyword}`;
}


function dedupeMissingAtRoot(errors: string[]): string[] {
  // Convert "(root): missing required field: X" → "missing required field: X"
  return errors.map((e) => e.replace(/^\(root\): missing required field:/, 'missing required field:'));
}


export function validateOnboardingJson(raw: unknown): ValidationResult {
  if (raw === null || typeof raw !== 'object') {
    return { valid: false, errors: ['root: must be an object'] };
  }

  const validator = getValidator();
  const valid = validator(raw);
  if (valid) return { valid: true, errors: [] };

  const errors = (validator.errors ?? []).map(formatAjvError);
  return { valid: false, errors: dedupeMissingAtRoot(errors) };
}


export function validateOrThrow(raw: unknown): OnboardingJson {
  const result = validateOnboardingJson(raw);
  if (!result.valid) {
    throw new SchemaViolationError(result.errors);
  }
  return raw as OnboardingJson;
}
