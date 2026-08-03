import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { LIVE_EVIDENCE_SCHEMA, LIVE_TRACE_SCHEMA, PRODUCER_MARKER } from './schema.mjs';

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateManifestShape = ajv.compile(LIVE_EVIDENCE_SCHEMA);
const validateTraceShape = ajv.compile(LIVE_TRACE_SCHEMA);

function issue(code, message, pathValue = '') {
  return { code, message, path: pathValue };
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { error: issue('MISSING_FILE', `${label} is not readable: ${error.message}`, filePath) };
  }
  try {
    return { value: JSON.parse(raw), raw };
  } catch (error) {
    return { error: issue('INVALID_JSON', `${label} is not valid JSON: ${error.message}`, filePath) };
  }
}

function normalizeRelative(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return null;
  return relative;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function workspaceDigest(repoRoot, files) {
  const hash = crypto.createHash('sha256');
  for (const rel of [...files].sort()) {
    const absolute = path.resolve(repoRoot, rel);
    hash.update(rel.replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function currentGitSha(repoRoot) {
  const provided = process.env.DEV_POMOGATOR_GIT_SHA?.trim().toLowerCase();
  if (provided) {
    if (!HEX40.test(provided)) throw new Error('DEV_POMOGATOR_GIT_SHA is not a lowercase 40-character SHA-1');
    return provided;
  }
  return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim().toLowerCase();
}

function schemaIssues(validate, value) {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => issue('SCHEMA_INVALID', `${error.instancePath || '/'} ${error.message}`, error.instancePath || '/'));
}

function eventAssertions(profile, event) {
  const required = profile === 'cursor-mcp-catalog'
    ? ['producer', 'tool_catalog', 'server_name']
    : profile === 'cursor-enforce-mcp'
      ? ['producer', 'raw_write', 'mcp_apply', 'readback']
      : ['producer', 'powershell', 'path', 'pane', 'cleanup'];
  const missing = required.filter((key) => !event || event[key] === undefined);
  return missing.map((key) => issue('TRACE_ASSERTION_MISSING', `trace event is missing ${key}`, `/events/${key}`));
}

function recordIdentity(record, index) {
  return `${record.scenario_id}|${record.profile}|${index}`;
}

export function validateLiveEvidence({ manifestPath, repoRoot = process.cwd(), expectedScenarios = {}, expectedProfiles = {} }) {
  const errors = [];
  const manifestResult = readJson(manifestPath, 'live evidence manifest');
  if (manifestResult.error) return { ok: false, errors: [manifestResult.error], records: [] };
  const manifest = manifestResult.value;
  errors.push(...schemaIssues(validateManifestShape, manifest));
  if (errors.length) return { ok: false, errors, records: [] };

  const manifestRoot = path.dirname(path.resolve(manifestPath));
  const tracePath = path.resolve(manifestRoot, manifest.trace.path);
  const traceRelative = normalizeRelative(repoRoot, tracePath);
  if (!traceRelative) errors.push(issue('TRACE_OUTSIDE_WORKSPACE', 'trace path must resolve inside the current workspace', '/trace/path'));
  if (!fs.existsSync(tracePath)) errors.push(issue('MISSING_TRACE', 'trace file does not exist', '/trace/path'));

  let trace;
  if (fs.existsSync(tracePath)) {
    const traceResult = readJson(tracePath, 'live evidence trace');
    if (traceResult.error) errors.push(traceResult.error);
    else {
      trace = traceResult.value;
      errors.push(...schemaIssues(validateTraceShape, trace));
      const actualTraceHash = sha256File(tracePath);
      if (actualTraceHash !== manifest.trace.sha256) errors.push(issue('TRACE_HASH_MISMATCH', 'manifest trace.sha256 does not match trace bytes', '/trace/sha256'));
      if (trace?.producer?.marker !== PRODUCER_MARKER) errors.push(issue('PRODUCER_MARKER_MISSING', 'trace producer marker is not the live producer marker', '/producer/marker'));
    }
  }

  let actualGitSha;
  try {
    actualGitSha = currentGitSha(repoRoot);
  } catch (error) {
    errors.push(issue('GIT_SHA_UNAVAILABLE', `current checkout SHA is unavailable: ${error.message}`, '/git_sha'));
  }
  if (actualGitSha && manifest.git_sha !== actualGitSha) errors.push(issue('GIT_SHA_MISMATCH', 'manifest git_sha is not the current checkout HEAD', '/git_sha'));
  if (!HEX40.test(manifest.git_sha)) errors.push(issue('GIT_SHA_INVALID', 'git_sha must be a lowercase 40-character SHA-1', '/git_sha'));
  if (!HEX64.test(manifest.workspace_digest)) errors.push(issue('WORKSPACE_DIGEST_INVALID', 'workspace_digest must be a lowercase SHA-256 digest', '/workspace_digest'));

  const seen = new Map();
  for (let index = 0; index < manifest.records.length; index += 1) {
    const record = manifest.records[index];
    const key = `${record.scenario_id}|${record.profile}`;
    const previous = seen.get(key);
    if (previous) {
      errors.push(issue('DUPLICATE_CONFLICTING_RECORD', `duplicate evidence records for ${key}`, `/records/${index}`));
      if (JSON.stringify(previous) !== JSON.stringify(record)) errors.push(issue('CONFLICTING_RECORD', `duplicate evidence records disagree for ${key}`, `/records/${index}`));
    }
    seen.set(key, record);
    if (record.git_sha !== manifest.git_sha) errors.push(issue('RECORD_GIT_SHA_MISMATCH', `record ${recordIdentity(record, index)} is not bound to manifest git_sha`, `/records/${index}/git_sha`));
    if (record.workspace_digest !== manifest.workspace_digest) errors.push(issue('RECORD_WORKSPACE_DIGEST_MISMATCH', `record ${recordIdentity(record, index)} is not bound to manifest workspace_digest`, `/records/${index}/workspace_digest`));
    if (record.producer_version !== manifest.producer.version) errors.push(issue('PRODUCER_VERSION_MISMATCH', `record ${recordIdentity(record, index)} is not bound to producer.version`, `/records/${index}/producer_version`));
    if (record.trace_hash !== manifest.trace.sha256) errors.push(issue('RECORD_TRACE_HASH_MISMATCH', `record ${recordIdentity(record, index)} is not bound to manifest trace.sha256`, `/records/${index}/trace_hash`));
    const expectedProfile = expectedProfiles[record.scenario_id];
    if (expectedProfile && record.profile !== expectedProfile) errors.push(issue('PROFILE_MISMATCH', `expected profile ${expectedProfile} for ${record.scenario_id}, got ${record.profile}`, `/records/${index}/profile`));
    const expectedResult = expectedScenarios[record.scenario_id];
    if (expectedResult && expectedResult !== record.result) errors.push(issue('RESULT_MISMATCH', `expected ${expectedResult} for ${record.scenario_id}, got ${record.result}`, `/records/${index}/result`));
    if (!record.trace_event || !trace) errors.push(issue('MISSING_TRACE_ASSERTION', `record ${recordIdentity(record, index)} has no usable trace assertion`, `/records/${index}/trace_event`));
  }

  if (trace && manifest.records.length) {
    for (const record of manifest.records) {
      const matching = trace.events?.filter((event) => event?.scenario_id === record.scenario_id && event?.profile === record.profile) ?? [];
      if (matching.length !== 1) errors.push(issue(matching.length === 0 ? 'TRACE_SCENARIO_MISSING' : 'TRACE_SCENARIO_DUPLICATE', `trace must contain exactly one event for ${record.scenario_id}/${record.profile}`, '/trace/events'));
      if (matching.length === 1) errors.push(...eventAssertions(record.profile, matching[0]));
    }
  }

  return { ok: errors.length === 0, errors, records: manifest.records, traceRelative };
}

export function assertLiveEvidence(options) {
  const result = validateLiveEvidence(options);
  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.code}: ${error.message}`).join('; ');
    throw new Error(`live evidence rejected: ${summary}`);
  }
  return result;
}

export function digestWorkspace(repoRoot, files) {
  const missing = files.filter((rel) => !fs.existsSync(path.resolve(repoRoot, rel)));
  if (missing.length) throw new Error(`workspace files missing: ${missing.join(', ')}`);
  return workspaceDigest(repoRoot, files);
}
