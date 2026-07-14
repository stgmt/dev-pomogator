#!/bin/sh
# Portable pre-Node dispatcher for dev-pomogator hooks.
# The shell owns interpreter discovery so a missing bare `node` never prevents
# a hook from reaching its existing fail-open path.

set -eu

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -eq 0 ]; then
  exit 0
fi

case "$(uname -s 2>/dev/null || printf unknown)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    NODE_BIN=node.exe
    command -v "$NODE_BIN" >/dev/null 2>&1 || NODE_BIN=node
    ;;
  *)
    # node.exe is deliberately never selected on POSIX, even if a Wine shim is
    # visible on PATH.
    NODE_BIN=node
    ;;
esac

report_once() {
  message=$1
  # One recovery diagnostic per Claude session and anchored project. `pwd -P`
  # protects against a nested/UNC shell CWD; CLAUDE_PROJECT_DIR wins when the
  # host provided it. State is advisory: any filesystem failure stays fail-open.
  project=${CLAUDE_PROJECT_DIR:-$(pwd -P 2>/dev/null || pwd)}
  session=${CLAUDE_SESSION_ID:-pid:${PPID:-unknown}}
  key=$(printf '%s\000%s' "$session" "$project" | cksum 2>/dev/null | cut -d ' ' -f 1 || true)
  [ -n "$key" ] || { printf '%s\n' "$message" >&2; return; }
  state_root=${XDG_STATE_HOME:-${HOME:-}/.dev-pomogator}/hook-runtime
  (umask 077 && mkdir -p "$state_root" && mkdir "$state_root/$key") 2>/dev/null && printf '%s\n' "$message" >&2 || true
}

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  report_once '[dev-pomogator] Node runtime is unavailable; hook skipped (fail-open).'
  exit 0
fi

# Enforce the host-BDD boundary before Node starts. Preserve stdin verbatim for
# permitted hooks, because Claude Code sends the event payload on stdin.
PAYLOAD=$(cat)
if printf '%s' "$PAYLOAD" | grep -Eq '(run-bdd\.mjs|cucumber\.js)' && ! printf '%s' "$PAYLOAD" | grep -q 'docker-bdd\.sh'; then
  printf '%s\n' '[dev-pomogator] Host BDD command refused; run it through docker-bdd.sh.' >&2
  exit 2
fi

printf '%s' "$PAYLOAD" | "$NODE_BIN" "$@"
