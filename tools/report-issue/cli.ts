import { pathToFileURL } from 'node:url';
import { reportIssue } from './reporter.ts';
import type { ReportInput } from './types.ts';

async function readInput(): Promise<ReportInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('Expected JSON input on stdin: {"description":"...","approvedDigest":"...","openBrowser":false}');
  const value = JSON.parse(raw) as ReportInput;
  if (typeof value.description !== 'string' || !value.description.trim()) throw new Error('description must be a non-empty string');
  if (value.approvedDigest !== undefined && typeof value.approvedDigest !== 'string') throw new Error('approvedDigest must be a string');
  if (value.openBrowser !== undefined && typeof value.openBrowser !== 'boolean') throw new Error('openBrowser must be a boolean');
  return value;
}

export async function main(): Promise<void> {
  const result = await reportIssue(await readInput());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
    process.exitCode = 1;
  });
}
