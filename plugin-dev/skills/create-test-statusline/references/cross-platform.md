# Cross-Platform Patterns

Statusline extensions must work on Windows, macOS, and Linux. Follow these patterns to ensure compatibility.

## CJS Requirement

All scripts executed by Claude Code **MUST** be CommonJS (`.cjs`):

- Claude Code runs statusline commands via `node <script>` — no ESM loader, no tsx
- TypeScript requires transpilation; ESM requires `--experimental-specifier-resolution`
- CJS just works: `node script.cjs` on every platform

```javascript
// CORRECT: CommonJS
const fs = require('node:fs');
const path = require('node:path');
module.exports = { myFunction };

// WRONG: ESM (will fail in statusline context)
import fs from 'node:fs';
export function myFunction() {}
```

Use `.cjs` extension to be explicit. If `package.json` has `"type": "module"`, `.js` files are treated as ESM.

## Portable Paths

**NEVER hardcode home directory paths:**

```javascript
// CORRECT
const os = require('node:os');
const configDir = path.join(os.homedir(), '.dev-pomogator');

// WRONG
const configDir = '/home/user/.dev-pomogator';       // Linux only
const configDir = 'C:\\Users\\user\\.dev-pomogator';  // Windows only
```

**Use path.join for all path construction:**

```javascript
// CORRECT
const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${prefix}.yaml`);

// WRONG (breaks on Windows)
const statusFile = `${cwd}/.dev-pomogator/.test-status/status.${prefix}.yaml`;
```

**Portable statusline command in extension.json:**

```json
{
  "command": "node .dev-pomogator/tools/{name}/statusline_render.cjs"
}
```

Claude Code resolves this relative to the project root on all platforms.

## Base64 Encoding

Use base64 to pass commands through the wrapper script. This avoids shell escaping issues across platforms:

```javascript
// Encode (when configuring wrapper)
const encoded = Buffer.from(command).toString('base64');

// Decode (in wrapper script)
function decodeBase64(value) {
  if (!value) return '';
  // Validate charset
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) return '';
  // Decode and verify round-trip
  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const roundTrip = Buffer.from(decoded, 'utf-8').toString('base64').replace(/=+$/, '');
  return value.replace(/=+$/, '') === roundTrip ? decoded : '';
}
```

**Why round-trip validation:** Detects corrupted or non-base64 input. If round-trip fails, return empty string (safe fallback).

## spawnSync with shell: true

Delegate shell resolution to the OS:

```javascript
const { spawnSync } = require('node:child_process');

const result = spawnSync(command, {
  input: stdinData,
  encoding: 'utf-8',
  shell: true,        // uses cmd.exe on Windows, /bin/sh on Unix
  windowsHide: true,  // suppress cmd.exe window flash on Windows
  timeout: 5000,
});
```

**`windowsHide: true`** prevents the brief cmd.exe window flash that occurs on Windows when spawning processes with `shell: true`. No effect on other platforms.

## Newline Normalization

Windows uses `\r\n`, Unix uses `\n`. Normalize when reading:

```javascript
// When parsing YAML line-by-line
const line = rawLine.replace(/\r$/, '');

// When normalizing command output
function normalizeOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
}
```

**Important for statusline wrapper:** Preserve internal newlines (Claude Code renders each `\n` as a separate statusline row). Only strip `\r` and trailing newlines.

## YAML Field Quoting

Values containing colons or spaces must be quoted:

```yaml
# CORRECT
error_message: "Process died unexpectedly (PID: 1234)"
log_file: ".dev-pomogator/.test-status/test.abc12345.log"

# WRONG (YAML parser may misinterpret)
error_message: Process died unexpectedly (PID: 1234)
```

When writing YAML manually (without a library), always quote string values:

```javascript
const yaml = [
  `version: 2`,
  `session_id: "${sessionId}"`,
  `state: ${state}`,
  `error_message: "${errorMessage.replace(/"/g, '\\"')}"`,
].join('\n');
```

## Portable Temp Files

Use `os.tmpdir()` for temporary files (not `/tmp` which doesn't exist on Windows):

```javascript
const tmpFile = `${statusFile}.tmp.${process.pid}`;
// This works because statusFile is already an absolute path from path.join()
```

## Summary Checklist

- [ ] All scripts are `.cjs` (CommonJS)
- [ ] Paths use `os.homedir()` and `path.join()`
- [ ] Commands encoded with base64 for wrapper
- [ ] `spawnSync` uses `shell: true` and `windowsHide: true`
- [ ] `\r\n` normalized to `\n` when parsing
- [ ] YAML string values are quoted
- [ ] No hardcoded `/home/`, `C:\Users\`, or `/tmp/` paths
