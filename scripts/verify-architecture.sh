#!/bin/bash
# Compatibility wrapper for callers that still invoke the shell verifier directly.
# The Node verifier is canonical so comment-aware scans behave consistently in CI
# and on local developer machines.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
NODE_BIN="$(command -v node || command -v node.exe)"
SCRIPT_PATH="${ROOT_DIR}/scripts/verify-architecture.cjs"

if [[ "$(basename "${NODE_BIN}")" == "node.exe" ]] && command -v wslpath >/dev/null 2>&1; then
    SCRIPT_PATH="$(wslpath -w "${SCRIPT_PATH}")"
fi

cd "${ROOT_DIR}"
exec "${NODE_BIN}" "${SCRIPT_PATH}"
