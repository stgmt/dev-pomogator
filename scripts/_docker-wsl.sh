#!/bin/bash
# Shared WSL docker routing helper — sourced by docker-bdd.sh (and any docker-* script).
# Docker lives only inside WSL here (no Docker Desktop on the Windows host). Two jobs:
#
#   1) DOCKER_HOST → the daemon's TCP endpoint. In this WSL the unix socket /run/docker.sock is created
#      under a STALE group (GID 1001 ≠ the docker group 989) on every boot → "permission denied" each
#      session. The daemon ALSO listens on tcp://127.0.0.1:2375 (localhost-only, already enabled in
#      docker.service ExecStart) — that transport has NO socket-group dependency and needs NO sudo.
#      Default to it; respect an explicit DOCKER_HOST. (FR-8, 2026-06-25 — the permanent, root-free fix.)
#
#   2) wsl_guard_reexec <script> [args...]: if docker is unreachable on the host but works inside WSL,
#      re-exec the SAME <script> INSIDE WSL from the same /mnt/<drive> path, so relative compose
#      bind-mounts resolve through the Windows worktree (statusline-YAML / persistent log land in the
#      same files). DEV_POMOGATOR_WSL_SHIM guards against recursion; WSLENV forwards the needed vars.

export DOCKER_HOST="${DOCKER_HOST:-tcp://127.0.0.1:2375}"

wsl_guard_reexec() {
  local script="$1"; shift
  [ -n "${DEV_POMOGATOR_WSL_SHIM:-}" ] && return 0                                   # already inside WSL — no recursion
  docker info >/dev/null 2>&1 && return 0                                            # docker reachable here — no shim
  command -v wsl.exe >/dev/null 2>&1 || return 0                                     # no WSL — fail downstream clearly
  # Reachability via the TCP endpoint (the unix socket fails on the group mismatch).
  wsl.exe -e bash -lc "DOCKER_HOST='${DOCKER_HOST}' docker info" >/dev/null 2>&1 || return 0
  local win_pwd; win_pwd=$(pwd -W 2>/dev/null || pwd)
  case "$win_pwd" in
    [A-Za-z]:/*)
      echo "[docker-wsl] docker недоступен на хосте — выполняю '$script' внутри WSL (--cd $win_pwd)"
      export DEV_POMOGATOR_WSL_SHIM=1
      export WSLENV="${WSLENV:+$WSLENV:}DEV_POMOGATOR_WSL_SHIM/u:DOCKER_HOST/u:TEST_STATUSLINE_SESSION/u:SKIP_BUILD/u:SKIP_BUILD_CHECK/u"
      exec wsl.exe --cd "$win_pwd" -e bash "$script" "$@"
      ;;
    *)
      echo "[docker-wsl] WARN: WSL docker найден, но pwd -W дал не-Windows путь '$win_pwd' — продолжаю на хосте"
      ;;
  esac
}
