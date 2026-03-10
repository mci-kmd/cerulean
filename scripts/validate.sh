#!/usr/bin/env bash
set -euo pipefail

echo "==> Linting..."
bun run lint

echo "==> Type checking..."
bunx --bun tsc -b

echo "==> Running tests..."
bun run test

echo "==> All checks passed."
