#!/bin/bash
# Run the cucumber (BDD) canonical suite INSIDE Docker/Linux — the REAL test env
# where environment-dependent scenarios actually work (e.g. worktree-setup's
# gh/docker shell-script mocks, which Windows can't honour because it prefers a
# real .exe over a mock script). Persists the result ndjson to the HOST canonical
# path (.dev-pomogator/.last-test-run.ndjson) via the mounted .docker-status dir,
# so the spec-graph coverage reflects the TRUE Docker/Linux result — NOT a host
# run that false-reds Linux-only scenarios. (Closes P27-3: docker-cucumber path.)
#
# Usage:  bash scripts/docker-bdd.sh [extra cucumber args]
#         SKIP_BUILD=1 bash scripts/docker-bdd.sh   (skip rebuild if image current)
set -o pipefail

# ── WSL-only docker routing (shared helper) — docker lives only inside WSL ──
source "$(dirname "$0")/_docker-wsl.sh"
wsl_guard_reexec "scripts/docker-bdd.sh" "$@"

LOG_DIR=".dev-pomogator/.docker-status"
HISTORY_DIR=".dev-pomogator/.test-history"
mkdir -p "$LOG_DIR" "$HISTORY_DIR"
chmod 777 "$HISTORY_DIR" 2>/dev/null || true
RUN_STAMP="$(date +%s)-$$-${RANDOM}"
LOG_FILE="${LOG_DIR}/bdd-run-${RUN_STAMP}.log"

# The result ndjson is written by in-container cucumber into the MOUNTED dir,
# so it appears on the host; then copied to the canonical path the graph reads.
# Use a per-run file as the archive/canonical source: parallel Docker BDD runs share
# .docker-status, and a fixed bdd-last-run.ndjson can be overwritten by another run
# before this process archives it.
OUT_REL=".dev-pomogator/.docker-status/bdd-run-${RUN_STAMP}.ndjson"
LATEST_REL=".dev-pomogator/.docker-status/bdd-last-run.ndjson"
CANONICAL=".dev-pomogator/.last-test-run.ndjson"

SESSION="${TEST_STATUSLINE_SESSION:-}"
# If no SESSION in env, read from host session.env (written by SessionStart hook).
# Do not `source` the file: Windows paths with backslashes are shell escapes
# (e.g. `\r`), which can corrupt TEST_STATUSLINE_PROJECT and abort the script.
if [ -z "$SESSION" ]; then
  SESSION_ENV=".dev-pomogator/.test-status/session.env"
  if [ -f "$SESSION_ENV" ]; then
    SESSION=$(grep -m1 '^TEST_STATUSLINE_SESSION=' "$SESSION_ENV" 2>/dev/null | cut -d= -f2 || true)
  fi
fi
if [ -n "$SESSION" ]; then
  PROJECT_NAME="devpom-bdd-${SESSION}"
else
  PROJECT_NAME="devpom-bdd-$$-${RANDOM}"
fi
export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

cleanup() {
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Docker-specific cucumber config: same paths/import as cucumber.json, but format
# → the mounted dir so the result reaches the host. Generated fresh (gitignored)
# BEFORE the build so COPY . . includes it in the image.
if command -v node >/dev/null 2>&1; then
  node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('cucumber.json','utf8'));c.default.format=['message:${OUT_REL}','progress'];c.default.publishQuiet=true;fs.writeFileSync('cucumber.docker.json',JSON.stringify(c,null,2)+'\n');console.log('[docker-bdd] generated cucumber.docker.json ('+c.default.paths.length+' paths, format -> mounted dir)');"
elif command -v python3 >/dev/null 2>&1; then
  OUT_REL="$OUT_REL" python3 - <<'PY'
import json
import os
out_rel = os.environ['OUT_REL']
with open('cucumber.json', 'r', encoding='utf-8') as f:
    config = json.load(f)
default = config.setdefault('default', {})
default['format'] = [f'message:{out_rel}', 'progress']
default['publishQuiet'] = True
with open('cucumber.docker.json', 'w', encoding='utf-8') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print(f"[docker-bdd] generated cucumber.docker.json ({len(default.get('paths', []))} paths, format -> mounted dir)")
PY
else
  echo "[docker-bdd] ERROR: need node or python3 to generate cucumber.docker.json" >&2
  exit 1
fi

# Base image
if ! docker image inspect dev-pomogator-test-base:local >/dev/null 2>&1; then
  echo "[docker-bdd] Base image not found, building (one-time, 3-5 min)..."
  DOCKER_BUILDKIT=1 docker build -f Dockerfile.test.base -t dev-pomogator-test-base:local . 2>&1 | tail -20 || { echo "[docker-bdd] base build failed"; exit 1; }
fi

# App image — MUST rebuild to pick up current step-defs/.feature/cucumber.docker.json (COPY . .)
if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "[docker-bdd] Building app image (picks up current step-defs + cucumber.docker.json)..."
  CACHEBUST=$(date +%s) DOCKER_BUILDKIT=1 docker compose -f docker-compose.test.yml build 2>&1 | tail -20 || { echo "[docker-bdd] app build failed"; exit 1; }
fi

# Run cucumber in-container. Override the entrypoint (default CMD runs the vitest
# wrapper, which can't run cucumber) — same trick the --tui path uses for pytest.
echo "[docker-bdd] Running cucumber in Docker/Linux → $LOG_FILE"
# .specs/ is dockerignored (kept out of the image so the census banner doesn't
# bake in — see .dockerignore). The .feature files live there, so we mount it at
# runtime. But it must be WRITABLE, not :ro — a few scenarios (create-specs
# SBDE001_02/04) scaffold INTO the project .specs/ (spec-status -Path requires it,
# not tmpdir-isolatable). So mount a WRITABLE COPY: scaffold writes land in the
# copy, the real host .specs/ is untouched (no parallel-session interference),
# and worktree's Linux shell-mocks work because we're in the Linux container.
SPECS_RW=".dev-pomogator/.tmp/specs-docker-rw-${PROJECT_NAME}"
rm -rf "$SPECS_RW" 2>/dev/null || true
mkdir -p "$SPECS_RW"
cp -R .specs/. "$SPECS_RW"/
echo "[docker-bdd] mounted a writable .specs copy ($SPECS_RW) — real .specs/ untouched"
SESSION_ARGS=()
if [ -n "$SESSION" ]; then
  SESSION_ARGS+=(-e "TEST_STATUSLINE_SESSION=$SESSION")
fi

HAS_EXPLICIT_CONFIG=0
EXPLICIT_CONFIG_PATH=""
ARGS=("$@")
for ((i=0; i<${#ARGS[@]}; i++)); do
  arg="${ARGS[$i]}"
  case "$arg" in
    -c|--config)
      HAS_EXPLICIT_CONFIG=1
      EXPLICIT_CONFIG_PATH="${ARGS[$((i+1))]:-}"
      ;;
    --config=*)
      HAS_EXPLICIT_CONFIG=1
      EXPLICIT_CONFIG_PATH="${arg#--config=}"
      ;;
  esac
done
CUCUMBER_ARGS=()
if [ "$HAS_EXPLICIT_CONFIG" = "1" ]; then
  CUCUMBER_ARGS=("$@")
else
  CUCUMBER_ARGS=(-c cucumber.docker.json "$@")
fi

RESULT_REL="$OUT_REL"
if [ -n "$EXPLICIT_CONFIG_PATH" ] && [ -f "$EXPLICIT_CONFIG_PATH" ]; then
  if command -v node >/dev/null 2>&1; then
    parsed=$(node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const f=(c.default&&c.default.format)||[];const m=f.find(x=>typeof x==='string'&&x.startsWith('message:')); if(m) process.stdout.write(m.slice(8));" "$EXPLICIT_CONFIG_PATH" 2>/dev/null || true)
    [ -n "$parsed" ] && RESULT_REL="$parsed"
  elif command -v python3 >/dev/null 2>&1; then
    parsed=$(python3 - "$EXPLICIT_CONFIG_PATH" <<'PY' 2>/dev/null || true
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    cfg = json.load(f)
for item in cfg.get('default', {}).get('format', []):
    if isinstance(item, str) and item.startswith('message:'):
        print(item[len('message:'):], end='')
        break
PY
)
    [ -n "$parsed" ] && RESULT_REL="$parsed"
  fi
fi
# Windows/WSL bind mounts can let shell `touch` create a file while Node's
# formatter open(create) fails with ENOENT; pre-create/truncate the target.
mkdir -p "$(dirname "$RESULT_REL")"
: > "$RESULT_REL"

# ...but the file is pre-created by the HOST, under the HOST's uid, while the container writes
# it as `testuser` (uid 1001). When those uids differ — a root shell in WSL, a CI runner, any
# host uid != 1001 — the formatter fails with EACCES and the BDD suite does not run AT ALL.
# The bind mount carries host permissions verbatim, so the only fix on this side is to make the
# pre-created target writable by whoever the container turns out to be.
chmod a+rw "$RESULT_REL" 2>/dev/null || true
chmod a+rwx "$(dirname "$RESULT_REL")" 2>/dev/null || true

CONFIG_MOUNT_ARGS=()
if [ -n "$EXPLICIT_CONFIG_PATH" ] && [ -f "$EXPLICIT_CONFIG_PATH" ] && [[ "$EXPLICIT_CONFIG_PATH" == .dev-pomogator/.tmp/* ]]; then
  config_dir=$(dirname "$EXPLICIT_CONFIG_PATH")
  CONFIG_MOUNT_ARGS+=(-v "$(pwd)/${config_dir}:/home/testuser/app/${config_dir}")
fi

# Route the in-container run through scripts/run-bdd.mjs (not raw cucumber.js), so every
# sanctioned BDD path shares the same runtime entry and FR-52 clobber safety stays
# centralized. docker-bdd.sh still owns the Docker-mounted output path and the final
# full-run-only copy to the host canonical below.
docker compose -f docker-compose.test.yml run --rm -T \
  --entrypoint node \
  -e PYTHONUNBUFFERED=1 \
  -e RUN_BDD_HISTORY_EXTERNAL=1 \
  "${SESSION_ARGS[@]}" \
  "${CONFIG_MOUNT_ARGS[@]}" \
  -v "$(pwd)/cucumber.docker.json:/home/testuser/app/cucumber.docker.json:ro" \
  -v "$(pwd)/${SPECS_RW}:/home/testuser/app/.specs" \
  test scripts/run-bdd.mjs "${CUCUMBER_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
rm -rf "$SPECS_RW" 2>/dev/null || true

archive_history() {
  local source="$1"
  local kind="$2"
  if [ ! -s "$source" ]; then
    return 0
  fi
  mkdir -p "$HISTORY_DIR"
  local history_tool epoch chunk scenarios duration stats
  if command -v python3 >/dev/null 2>&1; then
    history_tool="python3"
  elif command -v node >/dev/null 2>&1; then
    history_tool="node"
  else
    echo "[docker-bdd] WARN: history archive skipped (need python3 or node)" >&2
    return 0
  fi

  if [ "$history_tool" = "python3" ]; then
    epoch=$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)
  else
    epoch=$(node -e "console.log(Date.now())")
  fi

  chunk="run-${epoch}-${kind}.ndjson"
  cp "$source" "$HISTORY_DIR/$chunk" || { echo "[docker-bdd] WARN: history archive skipped (copy failed: $source -> $HISTORY_DIR/$chunk)" >&2; return 0; }
  if command -v node >/dev/null 2>&1; then
    node scripts/bdd-overlay.mjs "$source" --run-id "$epoch" --source "docker-bdd:$kind" --trace-file "$HISTORY_DIR/$chunk" || echo "[docker-bdd] WARN: scenario overlay skipped" >&2
  else
    # WSL hosts on this project may have Docker but no host Node. Reuse the freshly-built
    # test image so sanctioned Docker BDD runs still append the FR-56 overlay on every path.
    COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose -f docker-compose.test.yml run --rm -T --no-deps \
      --entrypoint node \
      -v "$(pwd)/.dev-pomogator:/home/testuser/app/.dev-pomogator" \
      test scripts/bdd-overlay.mjs "$source" --run-id "$epoch" --source "docker-bdd:$kind" --trace-file "$HISTORY_DIR/$chunk" \
      || echo "[docker-bdd] WARN: scenario overlay skipped" >&2
  fi

  if [ "$history_tool" = "python3" ]; then
    stats=$(python3 - "$source" <<'PY'
import json
import sys
started = None
finished = None
scenarios = 0
with open(sys.argv[1], encoding='utf-8') as f:
    for line in f:
        if not line.strip():
            continue
        try:
            env = json.loads(line)
        except Exception:
            continue
        if env.get('testRunStarted', {}).get('timestamp'):
            started = env['testRunStarted']['timestamp']
        if env.get('testRunFinished', {}).get('timestamp'):
            finished = env['testRunFinished']['timestamp']
        if env.get('testCaseFinished') is not None:
            scenarios += 1

def to_ms(ts):
    return ts['seconds'] * 1000 + round(ts.get('nanos', 0) / 1_000_000)

duration = to_ms(finished) - to_ms(started) if started and finished else None
print(f"{scenarios}\t{'' if duration is None else duration}")
PY
)
  else
    stats=$(node - "$source" <<'JS'
const fs = require('fs');
let started = null;
let finished = null;
let scenarios = 0;
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const env = JSON.parse(line);
    if (env.testRunStarted?.timestamp) started = env.testRunStarted.timestamp;
    if (env.testRunFinished?.timestamp) finished = env.testRunFinished.timestamp;
    if (env.testCaseFinished) scenarios += 1;
  } catch {}
}
const toMs = (t) => t.seconds * 1000 + Math.round((t.nanos || 0) / 1e6);
const duration = started && finished ? toMs(finished) - toMs(started) : '';
console.log(`${scenarios}\t${duration}`);
JS
)
  fi
  IFS=$'\t' read -r scenarios duration <<< "$stats"
  scenarios=${scenarios:-0}

  if [ "$history_tool" = "python3" ]; then
    python3 - "$HISTORY_DIR" "$chunk" "$kind" "$epoch" "$scenarios" "$duration" "$STATUS" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

dir_, chunk, kind, epoch, scenarios, duration, status = sys.argv[1:]
epoch_i = int(epoch)
entry = {
    'ts': datetime.fromtimestamp(epoch_i / 1000, tz=timezone.utc).isoformat().replace('+00:00', 'Z'),
    'epoch': epoch_i,
    'kind': kind,
    'scenarios': int(scenarios),
    'durationMs': None if duration == '' else int(duration),
    'exit': int(status),
    'file': chunk,
}
with open(os.path.join(dir_, 'index.ndjson'), 'a', encoding='utf-8') as f:
    f.write(json.dumps(entry, separators=(',', ':')) + '\n')
chunks = sorted(f for f in os.listdir(dir_) if f.startswith('run-') and f.endswith('.ndjson'))
for old in chunks[:-30]:
    try:
        os.unlink(os.path.join(dir_, old))
    except OSError:
        pass
PY
  else
    node - "$HISTORY_DIR" "$chunk" "$kind" "$epoch" "$scenarios" "$duration" "$STATUS" <<'JS'
const fs = require('fs');
const path = require('path');
const [dir, chunk, kind, epoch, scenarios, duration, status] = process.argv.slice(2);
const entry = {
  ts: new Date(Number(epoch)).toISOString(),
  epoch: Number(epoch),
  kind,
  scenarios: Number(scenarios),
  durationMs: duration === '' ? null : Number(duration),
  exit: Number(status),
  file: chunk,
};
fs.appendFileSync(path.join(dir, 'index.ndjson'), JSON.stringify(entry) + '\n');
const chunks = fs.readdirSync(dir).filter((f) => f.startsWith('run-') && f.endsWith('.ndjson')).sort();
for (const old of chunks.slice(0, -30)) {
  try {
    fs.unlinkSync(path.join(dir, old));
  } catch {}
}
JS
  fi
  echo "[docker-bdd] archived $kind run -> $HISTORY_DIR/$chunk (${scenarios} scenarios, ${duration:-?}ms)"
}

# Persist the Docker result to the host canonical path the spec-graph reads.
# CLOBBER-SAFE (H1 / FR-52a): only a FULL run (no extra cucumber args) may write the
# canonical. A filtered/partial run ("$@" non-empty, e.g. --name/--tags/<path>) leaves
# the canonical untouched — its partial/skipped ndjson must NOT poison the spec-graph
# census. Its result still lands in $OUT_REL for inspection. No `shift` runs above, so
# "$#" here is the original argc.
if [ -s "$RESULT_REL" ] && [ "$RESULT_REL" != "$LATEST_REL" ]; then
  cp "$RESULT_REL" "$LATEST_REL"
fi

if [ "$#" -gt 0 ]; then
  archive_history "$RESULT_REL" "filtered"
  echo "[docker-bdd] filtered run ($*) — result in $RESULT_REL ONLY; canonical NOT updated (clobber-safe)"
elif [ -s "$RESULT_REL" ]; then
  cp "$RESULT_REL" "$CANONICAL"
  archive_history "$CANONICAL" "full"
  echo "[docker-bdd] Canonical ndjson updated from the Docker/Linux run -> $CANONICAL"
else
  echo "[docker-bdd] WARN: no ndjson produced ($OUT_REL empty/missing) — canonical NOT updated"
fi
exit $STATUS
