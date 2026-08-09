import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_FRAME_BYTES = 256_000;
const MAX_OUTPUT_BYTES = 256_000;
const target = resolve(process.argv[2] || '');
const protocol = process.argv[3] || 'handle';
const original = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr };

function boundedFrame(value) {
  const frame = JSON.stringify(value);
  if (Buffer.byteLength(frame) > MAX_FRAME_BYTES) {
    throw Object.assign(new Error('worker frame exceeded limit'), { code: 'WORKER_FRAME_LIMIT' });
  }
  return frame;
}

function normalizeOutput(value) {
  if (value == null) return {};
  if (typeof value === 'string') return { additionalContext: value };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('worker handler returned a non-object result'), { code: 'WORKER_PROTOCOL' });
  }
  return value;
}

let handler;
try {
  handler = await import(pathToFileURL(target).href);
  if (protocol === 'handle' && typeof handler.handle !== 'function') {
    throw new Error(`worker handler ${target} must export handle(input, request)`);
  }
  if (protocol === 'runHook' && typeof handler.runHook !== 'function') {
    throw new Error(`worker handler ${target} must export runHook(rawInput, argv)`);
  }
} catch (error) {
  original.stderr.write(`worker load failed: ${error?.message || String(error)}\n`);
  process.exit(1);
}

async function dispatch(request) {
  const input = request.input ?? {};
  if (protocol === 'runHook') {
    return normalizeOutput(await handler.runHook(JSON.stringify(input), request.args || []));
  }
  return normalizeOutput(await handler.handle(input, request));
}

let queue = Promise.resolve();
const input = createInterface({ input: original.stdin, crlfDelay: Infinity });
input.on('line', line => {
  if (Buffer.byteLength(line) > MAX_FRAME_BYTES) {
    original.stderr.write('worker request exceeded frame limit\n');
    input.close();
    return;
  }
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    original.stderr.write('worker received malformed frame\n');
    input.close();
    return;
  }
  queue = queue.then(async () => {
    try {
      const output = await dispatch(request);
      original.stdout.write(`${boundedFrame({ version: 1, request_id: request.request_id, output, worker_pid: process.pid })}\n`);
    } catch (error) {
      const frame = {
        version: 1,
        request_id: request.request_id,
        error: String(error?.message || error),
        code: error?.code || 'WORKER_RUNTIME',
        worker_pid: process.pid,
      };
      original.stdout.write(`${boundedFrame(frame)}\n`);
    }
  });
});

input.on('close', () => queue.finally(() => process.exit(0)));
