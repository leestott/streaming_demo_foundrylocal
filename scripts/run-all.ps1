<#
.SYNOPSIS
    Build and run all Foundry Local streaming validation probes.
.DESCRIPTION
    Detects Foundry Local dynamic port, installs dependencies,
    compiles TypeScript, and runs all three probes.
    Results are written to report.json in the project root.
.PARAMETER Benchmark
    Run the multi-model streaming benchmark instead of the standard probes.
#>
param(
    [switch]$Benchmark
)

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $ProjectDir

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Foundry Local Streaming Validation – run-all   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 0. Detect Foundry Local service ──────────────────────
try {
    $status = foundry service status 2>&1 | Out-String
    Write-Host $status.Trim() -ForegroundColor Gray
    Write-Host ""

    if ($status -match 'https?://[\w.\-]+:(\d+)') {
        $port = $Matches[1]
        Write-Host "🔍  Detected Foundry Local on port $port" -ForegroundColor Green

        if (-not $env:FOUNDRY_BASE_URL) {
            $env:FOUNDRY_BASE_URL = "http://127.0.0.1:$port/v1"
            Write-Host "    Auto-set FOUNDRY_BASE_URL = $env:FOUNDRY_BASE_URL" -ForegroundColor Green
        } else {
            Write-Host "    FOUNDRY_BASE_URL already set: $env:FOUNDRY_BASE_URL" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️   Could not parse port from foundry service status." -ForegroundColor Yellow
        Write-Host "    The tool will auto-detect at runtime." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️   'foundry' CLI not found or service not running." -ForegroundColor Yellow
    Write-Host "    Set FOUNDRY_BASE_URL in .env or start the service." -ForegroundColor Yellow
}
Write-Host ""

# ── 1. Install dependencies ─────────────────────────────
if (-not (Test-Path "node_modules")) {
    Write-Host "📦  Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

# ── 2. Build TypeScript ─────────────────────────────────
Write-Host "🔨  Building TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed" }

# ── 3. Check .env ───────────────────────────────────────
if (-not (Test-Path ".env")) {
    Write-Host "⚠️   No .env file found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "    ➜  Edit .env if needed, then re-run." -ForegroundColor Yellow
}

# ── 4. Run probes or benchmark ───────────────────────────
Write-Host ""
if ($Benchmark) {
    Write-Host "🏁  Running streaming benchmark (all models)..." -ForegroundColor Green
    Write-Host ""
    node dist/benchmark/index.js
    $exitCode = $LASTEXITCODE
    Write-Host ""
    Write-Host "📋  Benchmark report written to benchmark-report.json" -ForegroundColor Cyan
} else {
    Write-Host "🚀  Running all probes..." -ForegroundColor Green
    Write-Host ""
    node dist/index.js
    $exitCode = $LASTEXITCODE
    Write-Host ""
    Write-Host "📋  Report written to report.json" -ForegroundColor Cyan
}

Pop-Location
exit $exitCode
