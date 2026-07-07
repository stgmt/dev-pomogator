// BDD test seam for tools/claude-mem-bootstrap: instead of running the real claude-mem
// installer, record the invocation (argv + the prompt-suppressing env) the hook WOULD have
// run, to the file at $CLAUDE_MEM_RECORD. Lets the suite assert the exact non-interactive
// command without any network. Activated via env CLAUDE_MEM_INSTALL_LAUNCHER.
const fs = require('node:fs');
try {
  const record = {
    argv: process.argv.slice(2),
    env: {
      DO_NOT_TRACK: process.env.DO_NOT_TRACK,
      CI: process.env.CI,
      CLAUDE_MEM_ONLINE_OPTIN: process.env.CLAUDE_MEM_ONLINE_OPTIN,
    },
  };
  fs.writeFileSync(process.env.CLAUDE_MEM_RECORD, JSON.stringify(record));
} catch {
  /* best-effort — never fail the spawn */
}
