#!/bin/sh
# Portable pre-Node dispatcher for dev-pomogator hooks.
# The shell owns interpreter discovery so a missing bare `node` never prevents
# a hook from reaching its existing fail-open path.

# Hook recovery is advisory; no diagnostic/state failure may prevent dispatch.
set -u

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -eq 0 ]; then
  exit 0
fi

case "$(uname -s 2>/dev/null || printf unknown)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    # Windows hook paths use node.exe only. Do not silently cross over to a
    # POSIX-style node shim: a missing Windows runtime is a fail-open recovery.
    NODE_BIN=node.exe
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
  # Normalize a supplied anchor when possible. If it is a nested path without
  # an anchor, git supplies the worktree identity; failures remain advisory.
  project=$(cd "$project" 2>/dev/null && pwd -P || printf '%s' "$project")
  git_root=$(git -C "$project" rev-parse --show-toplevel 2>/dev/null || true)
  [ -n "$git_root" ] && project=$git_root
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

# Enforce the host-BDD boundary before Node starts, while preserving the exact
# stdin stream for the actual hook. A temporary file avoids command-substitution
# newline loss; all temporary-file failures fall through to direct dispatch.
tmp=${TMPDIR:-/tmp}/dev-pomogator-hook-$$.stdin
cleanup() { rm -f "$tmp" 2>/dev/null || true; }
trap cleanup EXIT HUP INT TERM
if cat >"$tmp" 2>/dev/null; then
  if grep -Eq '(run-bdd\.mjs|cucumber\.js)' "$tmp" && ! grep -q 'docker-bdd\.sh' "$tmp"; then
    printf '%s\n' '[dev-pomogator] Host BDD command refused; run it through docker-bdd.sh.' >&2
    exit 2
  fi
  "$NODE_BIN" "$@" <"$tmp"
else
  report_once '[dev-pomogator] Could not inspect hook stdin; continuing fail-open.'
  "$NODE_BIN" "$@"
fi
