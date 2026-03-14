#!/usr/bin/env bash
# Scaffold a test-statusline extension for Claude Code.
# Generates extension directory with render script, wrapper, session hook, and manifest.
# All templates are embedded (heredoc) — this script is standalone.

set -euo pipefail

# --- Parse arguments ---
NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 --name <extension-name>"
      echo ""
      echo "Generates a test-statusline extension skeleton in extensions/<name>/"
      echo ""
      echo "Options:"
      echo "  --name    Extension name (required, e.g. 'my-test-statusline')"
      echo "  --help    Show this help"
      exit 0
      ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "Error: --name is required"
  echo "Usage: $0 --name <extension-name>"
  exit 1
fi

# --- Determine project root ---
# Priority: 1) git root, 2) relative from script location, 3) current directory
if command -v git &>/dev/null && git rev-parse --show-toplevel &>/dev/null; then
  PROJECT_ROOT="$(git rev-parse --show-toplevel)"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Navigate up from scripts/ -> create-test-statusline/ -> skills/ -> plugin-dev/ -> project root
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
fi

# Validate project root looks correct
if [[ ! -f "$PROJECT_ROOT/package.json" ]] && [[ ! -d "$PROJECT_ROOT/.git" ]]; then
  echo "Warning: Could not reliably detect project root (resolved to $PROJECT_ROOT)" >&2
  echo "Run from inside a git repository or set PROJECT_ROOT manually." >&2
fi

EXT_DIR="$PROJECT_ROOT/extensions/$NAME"
TOOLS_DIR="$EXT_DIR/tools/$NAME"

if [[ -d "$EXT_DIR" ]]; then
  echo "Error: Directory already exists: $EXT_DIR"
  exit 1
fi

echo "Creating test-statusline extension: $NAME"
echo "Location: $EXT_DIR"
echo ""

# --- Create directories ---
mkdir -p "$TOOLS_DIR"

# --- Generate package.json ---
cat > "$TOOLS_DIR/package.json" << 'PKGJSON'
{
  "type": "commonjs"
}
PKGJSON

# --- Generate statusline_render.cjs ---
cat > "$TOOLS_DIR/statusline_render.cjs" << 'RENDERCJS'
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

let input = '';
try { input = fs.readFileSync(0, 'utf-8'); } catch (_) {}

let sessionId = '', cwd = '.';
try { const j = JSON.parse(input); sessionId = j.session_id || ''; cwd = j.cwd || '.'; } catch (_) {}
if (!sessionId) sessionId = process.env.TEST_STATUSLINE_SESSION || '';
if (cwd === '.') cwd = process.env.TEST_STATUSLINE_PROJECT || '.';
const prefix = sessionId ? sessionId.substring(0, 8) : '';

function renderIdle() {
  process.stdout.write('\x1b[2m0% [\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591] no test runs\x1b[0m');
  process.exit(0);
}
if (!prefix) renderIdle();

const statusFile = path.join(cwd, '.dev-pomogator', '.test-status', `status.${prefix}.yaml`);
let yaml;
try { yaml = fs.readFileSync(statusFile, 'utf-8'); } catch (_) { renderIdle(); }

const f = {};
for (const raw of yaml.split('\n')) {
  const line = raw.replace(/\r$/, '');
  if (!line || line.startsWith(' ') || line.startsWith('- ')) continue;
  if (line === 'suites:' || line === 'phases:') break;
  const ci = line.indexOf(':');
  if (ci === -1) continue;
  let v = line.substring(ci + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  f[line.substring(0, ci).trim()] = v;
}
if (f.version !== '2' || !f.state || !f.total) renderIdle();

const state = f.state, total = +f.total || 0, passed = +f.passed || 0;
const failed = +f.failed || 0, running = +f.running || 0, percent = +f.percent || 0;
const ds = Math.floor((+f.duration_ms || 0) / 1000);
const dur = `${Math.floor(ds / 60)}:${String(ds % 60).padStart(2, '0')}`;
const filled = Math.floor(percent * 10 / 100), empty = 10 - filled;
const bar = '\u2593'.repeat(filled) + '\u2591'.repeat(empty);
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', X = '\x1b[0m';
let color = G;
if (total > 0 && failed > 0) color = Math.floor(failed * 100 / total) >= 10 ? R : Y;

let out = '';
switch (state) {
  case 'running':
    out = `${color}${percent}%${X} [${color}${bar}${X}]`;
    if (passed > 0) out += ` ${passed}\u2705`;
    if (failed > 0) out += ` ${failed}\u274C`;
    if (running > 0) out += ` ${running}\u23F3`;
    out += ` ${D}${dur}${X}`;
    break;
  case 'passed': out = `\u2705 ${passed}/${total} ${D}${dur}${X}`; break;
  case 'failed':
    out = failed > 0
      ? `\u274C ${passed}/${total} ${D}(${failed} failed)${X} ${D}${dur}${X}`
      : `\u274C ${passed}/${total} ${D}${dur}${X}`;
    break;
  case 'error': out = `\u274C ${R}ERR${X} ${f.error_message || 'unknown error'}`; break;
  default: renderIdle();
}
process.stdout.write(out);
RENDERCJS

# --- Generate test_runner_wrapper.cjs ---
cat > "$TOOLS_DIR/test_runner_wrapper.cjs" << 'WRAPPERCJS'
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const fwIdx = args.indexOf('--framework');
const sepIdx = args.indexOf('--');
const framework = fwIdx !== -1 && fwIdx + 1 < args.length ? args[fwIdx + 1] : 'unknown';
const testCmd = sepIdx !== -1 ? args.slice(sepIdx + 1).join(' ') : '';
if (!testCmd) { process.stderr.write('Usage: node wrapper.cjs --framework <name> -- <cmd>\n'); process.exit(1); }

const prefix = (process.env.TEST_STATUSLINE_SESSION || '').substring(0, 8);
const projDir = process.env.TEST_STATUSLINE_PROJECT || process.cwd();
const statusDir = path.join(projDir, '.dev-pomogator', '.test-status');
fs.mkdirSync(statusDir, { recursive: true });
const sf = path.join(statusDir, `status.${prefix || process.pid}.yaml`);
const lf = path.join(statusDir, `test.${prefix || process.pid}.log`);

const st = { version:2, session_id:process.env.TEST_STATUSLINE_SESSION||'', pid:process.pid,
  started_at:new Date().toISOString(), updated_at:'', state:'running', framework,
  total:0, passed:0, failed:0, skipped:0, running:0, percent:0, duration_ms:0,
  error_message:'', log_file:lf };

function toYaml(o) {
  return Object.entries(o).filter(([,v])=>typeof v!=='object'||v===null)
    .map(([k,v])=>typeof v==='string'?`${k}: "${v.replace(/"/g,'\\"')}"` :`${k}: ${v}`).join('\n')+'\n';
}
function write() {
  st.updated_at=new Date().toISOString();
  st.duration_ms=Date.now()-new Date(st.started_at).getTime();
  const tmp=`${sf}.tmp.${process.pid}`;
  try { fs.writeFileSync(tmp,toYaml(st),'utf-8'); fs.renameSync(tmp,sf); }
  catch(_) { try{fs.unlinkSync(tmp);}catch(_){} }
}
write();
const r = spawnSync(testCmd, { encoding:'utf-8', shell:true, windowsHide:true, stdio:['inherit','pipe','inherit'], timeout:600000 });
if (r.stdout) { process.stdout.write(r.stdout); try{fs.writeFileSync(lf,r.stdout,'utf-8');}catch(_){} }
st.state = (r.status ?? 1) === 0 ? 'passed' : 'failed';
st.percent = 100; st.running = 0;
if ((r.status ?? 1) !== 0 && !st.error_message) st.error_message = `Exit code ${r.status}`;
write();
process.exit(r.status ?? 1);
WRAPPERCJS

# --- Generate session_start_hook.cjs ---
cat > "$TOOLS_DIR/session_start_hook.cjs" << 'HOOKCJS'
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    if (!raw.trim()) { process.stdout.write('{}'); return; }
    const input = JSON.parse(raw);
    const sid = input.session_id || '';
    const cwd = input.cwd || process.cwd();
    if (!sid) { process.stdout.write('{}'); return; }
    const prefix = sid.substring(0, 8);
    const statusDir = path.join(cwd, '.dev-pomogator', '.test-status');
    fs.mkdirSync(statusDir, { recursive: true });
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      fs.appendFileSync(envFile, `TEST_STATUSLINE_SESSION=${prefix}\nTEST_STATUSLINE_PROJECT=${cwd}\n`, 'utf-8');
    }
  } catch (e) {
    process.stderr.write(`[TEST-STATUSLINE] Hook error: ${e}\n`);
  }
  process.stdout.write('{}');
});
HOOKCJS

# --- Generate extension.json ---
cat > "$EXT_DIR/extension.json" << EXTJSON
{
  "name": "$NAME",
  "version": "1.0.0",
  "description": "Test runner progress display in Claude Code statusline",
  "platforms": ["claude"],
  "category": "automation",
  "files": { "claude": [] },
  "tools": { "$NAME": "tools/$NAME" },
  "toolFiles": {
    "$NAME": [
      ".dev-pomogator/tools/$NAME/statusline_render.cjs",
      ".dev-pomogator/tools/$NAME/test_runner_wrapper.cjs",
      ".dev-pomogator/tools/$NAME/session_start_hook.cjs",
      ".dev-pomogator/tools/$NAME/package.json"
    ]
  },
  "hooks": {
    "claude": {
      "SessionStart": "node .dev-pomogator/tools/$NAME/session_start_hook.cjs"
    }
  },
  "statusLine": {
    "claude": {
      "type": "command",
      "command": "node .dev-pomogator/tools/$NAME/statusline_render.cjs"
    }
  }
}
EXTJSON

echo ""
echo "Extension created successfully!"
echo ""
echo "Generated files:"
echo "  $EXT_DIR/extension.json"
echo "  $TOOLS_DIR/statusline_render.cjs"
echo "  $TOOLS_DIR/test_runner_wrapper.cjs"
echo "  $TOOLS_DIR/session_start_hook.cjs"
echo "  $TOOLS_DIR/package.json"
echo ""
echo "Next steps:"
echo "  1. Edit statusline_render.cjs to customize the progress bar appearance"
echo "  2. Add a framework adapter for real-time test progress (see SKILL.md Step 5)"
echo "  3. For statusline coexistence, add statusline_wrapper.cjs (see SKILL.md Step 7)"
echo "  4. Install: npm run build && node dist/index.cjs --claude --all"
echo "  5. Test: restart Claude Code session and run tests"
