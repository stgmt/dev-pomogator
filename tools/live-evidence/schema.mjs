/**
 * Machine-readable contract for externally produced live evidence.
 *
 * This is deliberately separate from the Cucumber feature files: a live result
 * is an attestation about a real producer run, not a fixture that the suite can
 * manufacture. The runtime validator applies the cross-field and trace checks
 * that JSON Schema cannot express.
 */

export const LIVE_EVIDENCE_SCHEMA_ID = 'dev-pomogator.live-evidence.v2';
export const LIVE_TRACE_SCHEMA_ID = 'dev-pomogator.live-evidence.trace.v2';
export const PRODUCER_MARKER = 'dev-pomogator-live-evidence-producer/v2';

export const LIVE_EVIDENCE_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: LIVE_EVIDENCE_SCHEMA_ID,
  title: 'dev-pomogator live evidence manifest',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'generated_at', 'git_sha', 'workspace_files', 'workspace_digest', 'producer', 'trace', 'records'],
  properties: {
    schema: { const: LIVE_EVIDENCE_SCHEMA_ID },
    generated_at: { type: 'string', format: 'date-time' },
    git_sha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    workspace_files: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'string', minLength: 1 },
    },
    workspace_digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    producer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'version', 'marker'],
      properties: {
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        marker: { const: PRODUCER_MARKER },
      },
    },
    trace: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'sha256'],
      properties: {
        path: { type: 'string', minLength: 1 },
        sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      },
    },
    records: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'scenario_id',
          'profile',
          'result',
          'git_sha',
          'workspace_digest',
          'producer_name',
          'producer_version',
          'trace_event',
          'trace_event_sha256',
          'trace_hash',
        ],
        properties: {
          scenario_id: { type: 'string', minLength: 1 },
          profile: { type: 'string', minLength: 1 },
          result: { const: 'PASSED' },
          git_sha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
          workspace_digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          producer_name: { type: 'string', minLength: 1 },
          producer_version: { type: 'string', minLength: 1 },
          trace_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          trace_event: { type: 'string', minLength: 1 },
          trace_event_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        },
      },
    },
  },
});

export const LIVE_TRACE_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: LIVE_TRACE_SCHEMA_ID,
  title: 'dev-pomogator live evidence trace',
  type: 'object',
  required: ['schema', 'producer', 'events'],
  properties: {
    schema: { const: LIVE_TRACE_SCHEMA_ID },
    producer: {
      type: 'object',
      required: ['name', 'version', 'marker'],
      properties: {
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        marker: { const: PRODUCER_MARKER },
      },
    },
    platform: { type: 'string', minLength: 1 },
    events: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['event_id', 'scenario_id', 'profile'],
        properties: {
          event_id: { type: 'string', minLength: 1 },
          scenario_id: { type: 'string', minLength: 1 },
          profile: { type: 'string', minLength: 1 },
        },
      },
    },
  },
});
