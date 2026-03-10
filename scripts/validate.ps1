$ErrorActionPreference = "Stop"

Write-Host "==> Linting..."
bun run lint
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "==> Type checking..."
bunx --bun tsc -b
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "==> Running tests..."
bun run test
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "==> All checks passed."
