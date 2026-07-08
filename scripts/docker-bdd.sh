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
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/bdd-run-$(date +%s).log"

# The result ndjson is written by in-container cucumber into the MOUNTED dir,
# so it appears on the host; then copied to the canonical path the graph reads.
OUT_REL=".dev-pomogator/.docker-status/bdd-last-run.ndjson"
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
# Windows/WSL bind mounts can let shell `touch` create a file while Node's
# formatter open(create) fails with ENOENT; pre-create/truncate the target.
: > "$OUT_REL"
# .specs/ is dockerignored (kept out of the image so the census banner doesn't
# bake in — see .dockerignore). The .feature files live there, so we mount it at
# runtime. But it must be WRITABLE, not :ro — a few scenarios (create-specs
# SBDE001_02/04) scaffold INTO the project .specs/ (spec-status -Path requires it,
# not tmpdir-isolatable). So mount a WRITABLE COPY: scaffold writes land in the
# copy, the real host .specs/ is untouched (no parallel-session interference),
# and worktree's Linux shell-mocks work because we're in the Linux container.
SPECS_RW=".dev-pomogator/.tmp/specs-docker-rw"
rm -rf "$SPECS_RW" 2>/dev/null || true
mkdir -p "$(dirname "$SPECS_RW")"
cp -r .specs "$SPECS_RW"
echo "[docker-bdd] mounted a writable .specs copy ($SPECS_RW) — real .specs/ untouched"
SESSION_ARGS=()
if [ -n "$SESSION" ]; then
  SESSION_ARGS+=(-e "TEST_STATUSLINE_SESSION=$SESSION")
fi

docker compose -f docker-compose.test.yml run --rm -T \
  --entrypoint node \
  -e PYTHONUNBUFFERED=1 \
  "${SESSION_ARGS[@]}" \
  -v "$(pwd)/${SPECS_RW}:/home/testuser/app/.specs" \
  test --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js -c cucumber.docker.json "$@" 2>&1 | tee -a "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
rm -rf "$SPECS_RW" 2>/dev/null || true

# Persist the Docker result to the host canonical path the spec-graph reads.
# CLOBBER-SAFE (H1 / FR-52a): only a FULL run (no extra cucumber args) may write the
# canonical. A filtered/partial run ("$@" non-empty, e.g. --name/--tags/<path>) leaves
# the canonical untouched — its partial/skipped ndjson must NOT poison the spec-graph
# census. Its result still lands in $OUT_REL for inspection. No `shift` runs above, so
# "$#" here is the original argc.
if [ "$#" -gt 0 ]; then
  echo "[docker-bdd] filtered run ($*) — result in $OUT_REL ONLY; canonical NOT updated (clobber-safe)"
elif [ -s "$OUT_REL" ]; then
  cp "$OUT_REL" "$CANONICAL"
  echo "[docker-bdd] Canonical ndjson updated from the Docker/Linux run -> $CANONICAL"
else
  echo "[docker-bdd] WARN: no ndjson produced ($OUT_REL empty/missing) — canonical NOT updated"
fi
exit $STATUS
