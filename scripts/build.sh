#!/usr/bin/env bash
set -euo pipefail
# want-a-init is plain ESM JavaScript; no compilation required.
# This script exists for tooling that expects a build step.
test -f lib/index.js
test -f lib/index.d.ts
echo "want-a-init: no build required, lib is up to date"
