#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# run-all.sh – Build and run all Foundry Local streaming
# validation probes in sequence.
#
# Usage:
#   bash scripts/run-all.sh              # standard probes
#   bash scripts/run-all.sh --benchmark  # multi-model benchmark
# ──────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BENCHMARK=false
for arg in "$@"; do
  case "$arg" in
    --benchmark|-b) BENCHMARK=true ;;
  esac
done

cd "$PROJECT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Foundry Local Streaming Validation – run-all   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 0. Detect Foundry Local service ──────────────────────
if command -v foundry &>/dev/null; then
  echo "🔍  Detecting Foundry Local service..."
  STATUS_OUTPUT=$(foundry service status 2>&1 || true)
  echo "    $STATUS_OUTPUT"
  echo ""

  PORT=$(echo "$STATUS_OUTPUT" | grep -oP 'https?://[\w.\-]+:\K\d+' | head -1 || true)
  if [ -n "$PORT" ]; then
    echo "✔  Detected Foundry Local on port $PORT"
    if [ -z "${FOUNDRY_BASE_URL:-}" ]; then
      export FOUNDRY_BASE_URL="http://127.0.0.1:${PORT}/v1"
      echo "    Auto-set FOUNDRY_BASE_URL=$FOUNDRY_BASE_URL"
    else
      echo "    FOUNDRY_BASE_URL already set: $FOUNDRY_BASE_URL"
    fi
  else
    echo "⚠️   Could not parse port. The tool will auto-detect at runtime."
  fi
  echo ""
else
  echo "⚠️   'foundry' CLI not found. Set FOUNDRY_BASE_URL in .env."
  echo ""
fi

# ── 1. Install dependencies ─────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦  Installing dependencies..."
  npm install
fi

# ── 2. Build TypeScript ─────────────────────────────────
echo "🔨  Building TypeScript..."
npm run build

# ── 3. Check .env ───────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "⚠️   No .env file found. Copying from .env.example..."
  cp .env.example .env
  echo "    ➜  Edit .env if needed, then re-run."
fi

# ── 4. Run probes or benchmark ───────────────────────────
echo ""
if [ "$BENCHMARK" = true ]; then
  echo "🏁  Running streaming benchmark (all models)..."
  echo ""
  node dist/benchmark/index.js
  echo ""
  echo "📋  Benchmark report written to benchmark-report.json"
else
  echo "🚀  Running all probes..."
  echo ""
  node dist/index.js
  echo ""
  echo "📋  Report written to report.json"
fi
