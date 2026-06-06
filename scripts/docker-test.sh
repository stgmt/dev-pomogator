#!/bin/bash
# Docker test runner with session isolation
# Generates unique COMPOSE_PROJECT_NAME to prevent container conflicts
# when multiple Claude Code sessions run tests simultaneously.

set -o pipefail

# ── WSL shim: docker живёт только внутри WSL (нет Docker Desktop на хосте) ──
# Если docker-демон недостижим с хоста, но wsl.exe предлагает рабочий — пере-
# запускаем ЭТОТ ЖЕ скрипт внутри WSL из того же репо через /mnt/<диск>.
# Относительные bind-mounts compose (./.dev-pomogator/.docker-status, ./reports)
# резолвятся против /mnt/c/... и пишут СКВОЗЬ маунт в Windows-worktree —
# statusline-YAML и persistent log оказываются в тех же файлах, /run-tests и
# TUI не замечают разницы. Guard-переменная исключает рекурсию; WSLENV
# пробрасывает session/skip-build внутрь WSL.
if [ -z "${DEV_POMOGATOR_WSL_SHIM:-}" ] && ! docker info >/dev/null 2>&1; then
  if command -v wsl.exe >/dev/null 2>&1 && wsl.exe -e docker info >/dev/null 2>&1; then
    # --cd принимает ТОЛЬКО Windows-форму пути (C:/...); Linux-форма (/mnt/c/...)
    # даёт Wsl/ERROR_PATH_NOT_FOUND. pwd -W в Git Bash выдаёт ровно C:/...
    WIN_PWD=$(pwd -W 2>/dev/null || pwd)
    case "$WIN_PWD" in
      [A-Za-z]:/*)
        echo "[docker-test] docker недоступен на хосте — выполняю сьют внутри WSL (--cd $WIN_PWD)"
        export DEV_POMOGATOR_WSL_SHIM=1
        export WSLENV="${WSLENV:+$WSLENV:}DEV_POMOGATOR_WSL_SHIM/u:TEST_STATUSLINE_SESSION/u:SKIP_BUILD/u:SKIP_BUILD_CHECK/u"
        exec wsl.exe --cd "$WIN_PWD" -e bash scripts/docker-test.sh "$@"
        ;;
      *)
        echo "[docker-test] WARN: WSL docker найден, но pwd -W дал не-Windows путь '$WIN_PWD' — продолжаю на хосте (упадёт ниже с внятной ошибкой)"
        ;;
    esac
  fi
fi

# Persistent log: defense-in-depth against silent output loss in long-running
# background Bash tasks (see .specs/fix-bg-output-loss/RESEARCH.md). The log
# file survives harness capture drops, docker compose -T buffering, and
# Git-Bash pipe races.
LOG_DIR=".dev-pomogator/.docker-status"
LOG_FILE="${LOG_DIR}/test-run-$(date +%s).log"
mkdir -p "$LOG_DIR"

SESSION="${TEST_STATUSLINE_SESSION:-}"
# If no SESSION in env, read from host session.env (written by SessionStart hook)
if [ -z "$SESSION" ]; then
  SESSION_ENV=".dev-pomogator/.test-status/session.env"
  if [ -f "$SESSION_ENV" ]; then
    SESSION=$(grep -m1 '^TEST_STATUSLINE_SESSION=' "$SESSION_ENV" 2>/dev/null | cut -d= -f2 || true)
  fi
fi

if [ -n "$SESSION" ]; then
  PROJECT_NAME="devpom-test-${SESSION}"
else
  PROJECT_NAME="devpom-test-$$-${RANDOM}"
fi

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

cleanup() {
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Pre-flight: kill orphaned devpom-test containers from previous runs
# (exec replaces bash → old trap is lost → containers linger)
for cid in $(docker ps -q --filter "name=devpom-test-" 2>/dev/null); do
  echo "[docker-test] Killing orphaned container: $(docker inspect --format '{{.Name}}' "$cid" 2>/dev/null)"
  docker stop "$cid" 2>/dev/null || true
  docker rm "$cid" 2>/dev/null || true
done

# Auto-build base image if it doesn't exist
if ! docker image inspect dev-pomogator-test-base:local >/dev/null 2>&1; then
  echo "[docker-test] Base image not found, building (this takes 3-5 min, one-time)..."
  if ! DOCKER_BUILDKIT=1 docker build -f Dockerfile.test.base -t dev-pomogator-test-base:local . 2>&1 | tail -20; then
    echo "[docker-test] ERROR: Base image build failed"
    exit 1
  fi
fi

# Build app image (fast: only COPY + npm install + build)
# Skip build with SKIP_BUILD=1 when image is already current
# CACHEBUST uses epoch seconds to invalidate COPY layer cache on every build
if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "[docker-test] Building app image..."
  if ! CACHEBUST=$(date +%s) DOCKER_BUILDKIT=1 docker compose -f docker-compose.test.yml build 2>&1 | tail -20; then
    echo "[docker-test] ERROR: App image build failed"
    exit 1
  fi
fi

# -T disables pseudo-TTY for pipe compatibility.
# PYTHONUNBUFFERED + NODE_DISABLE_COLORS force Node/Python unbuffered output.
SESSION_ARGS=()
if [ -n "$SESSION" ]; then
  SESSION_ARGS+=(-e "TEST_STATUSLINE_SESSION=$SESSION")
fi

# No exec — keep bash alive so trap cleanup fires on SIGTERM/EXIT.
# Dockerfile CMD already includes wrapper (test_runner_wrapper.cjs).
# Custom args override CMD, so vitest runs directly — wrapper YAML comes
# from the Dockerfile CMD path only (full test suite).
echo "[docker-test] Log: $LOG_FILE"
docker compose -f docker-compose.test.yml run --rm -T \
  -e PYTHONUNBUFFERED=1 \
  "${SESSION_ARGS[@]}" \
  test "$@" 2>&1 | tee -a "$LOG_FILE"
