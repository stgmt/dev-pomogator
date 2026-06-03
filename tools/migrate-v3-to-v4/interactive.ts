// Interactive per-file prompt for the migrate-v3-to-v4 CLI
// (SPECGEN004_25 / FR-11 NFR-Usability-4).
//
// When the CLI runs WITHOUT `--suggest-only`, the user gets a per-file
// approve / skip / edit prompt with a 30-second default-skip timeout.
// `promptApplyTimeout` is the pure async function — the CLI passes a
// `readline` source so tests can drive it deterministically.

export type Decision = 'apply' | 'skip' | 'edit';

/** Default per-file prompt timeout (FR-11 NFR-Usability-4 — 30 seconds). */
export const DEFAULT_PROMPT_TIMEOUT_MS = 30_000;

export interface PromptOptions {
  /** Source of user input — async iterator of lines. Tests inject a mock. */
  input: AsyncIterable<string>;
  /** Sink for the prompt text (defaults to process.stdout.write). */
  write?: (chunk: string) => void;
  /** Timeout in ms; default {@link DEFAULT_PROMPT_TIMEOUT_MS} per FR-11 NFR-Usability-4. */
  timeoutMs?: number;
  /** Per-file context (filename, number of headings) for the prompt body. */
  context: {
    file: string;
    headingCount: number;
  };
}

export interface PromptResult {
  decision: Decision;
  /** True iff the timeout fired instead of a real user response. */
  timedOut: boolean;
  rawInput?: string;
}

function parseDecision(raw: string): Decision | null {
  const norm = raw.trim().toLowerCase();
  if (norm === 'a' || norm === 'apply' || norm === 'y' || norm === 'yes') return 'apply';
  if (norm === 's' || norm === 'skip' || norm === 'n' || norm === 'no') return 'skip';
  if (norm === 'e' || norm === 'edit') return 'edit';
  return null;
}

/**
 * Prompt the user, resolving on the first parseable answer OR the timeout.
 * On timeout the decision is `skip` per NFR-Usability-4.
 */
export async function promptApplyTimeout(opts: PromptOptions): Promise<PromptResult> {
  const write = opts.write ?? ((c) => process.stdout.write(c));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS;

  write(
    `\nFile: ${opts.context.file}\n` +
      `  ${opts.context.headingCount} legacy heading(s) to convert.\n` +
      `  [a]pply / [s]kip / [e]dit   (no answer in ${Math.round(timeoutMs / 1000)}s → skip): `,
  );

  let resolved = false;
  return new Promise<PromptResult>((resolve) => {
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      write('\n[timeout → skip]\n');
      resolve({ decision: 'skip', timedOut: true });
    }, timeoutMs);

    void (async () => {
      for await (const line of opts.input) {
        if (resolved) return;
        const decision = parseDecision(line);
        if (decision === null) {
          write(`  unrecognised "${line}" — answer a / s / e: `);
          continue;
        }
        resolved = true;
        clearTimeout(timer);
        resolve({ decision, timedOut: false, rawInput: line });
        return;
      }
      // Input stream ended without a parseable answer — treat as skip.
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ decision: 'skip', timedOut: false });
      }
    })();
  });
}
