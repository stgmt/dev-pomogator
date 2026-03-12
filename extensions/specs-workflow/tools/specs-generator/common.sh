#!/usr/bin/env sh

set -eu

SCRIPT_DIR="${SCRIPT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"

run_specs_generator() {
  command_name="$1"
  shift || true

  if ! command -v node >/dev/null 2>&1; then
    echo "node is required to run ${command_name}.sh" >&2
    exit 127
  fi

  exec node "$SCRIPT_DIR/specs-generator-core.mjs" "$command_name" "$@"
}
