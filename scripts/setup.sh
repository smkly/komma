#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
header() { echo -e "\n${BOLD}$1${NC}"; }

errors=0

header "Checking prerequisites..."

# Node.js
if command -v node &>/dev/null; then
  node_version=$(node -v | sed 's/v//')
  node_major=$(echo "$node_version" | cut -d. -f1)
  if [ "$node_major" -ge 20 ]; then
    pass "Node.js v$node_version"
  else
    fail "Node.js v$node_version (need v20+)"
    errors=$((errors + 1))
  fi
else
  fail "Node.js not found — install from https://nodejs.org"
  errors=$((errors + 1))
fi

# npm
if command -v npm &>/dev/null; then
  pass "npm $(npm -v)"
else
  fail "npm not found"
  errors=$((errors + 1))
fi

# Git
if command -v git &>/dev/null; then
  pass "Git $(git --version | sed 's/git version //')"
else
  fail "Git not found"
  errors=$((errors + 1))
fi

# Xcode CLI tools (macOS)
if [ "$(uname)" = "Darwin" ]; then
  if xcode-select -p &>/dev/null; then
    pass "Xcode Command Line Tools"
  else
    fail "Xcode Command Line Tools — run: xcode-select --install"
    errors=$((errors + 1))
  fi
fi

# Claude CLI
claude_found=false
for p in "$HOME/.local/bin/claude" /usr/local/bin/claude /opt/homebrew/bin/claude; do
  if [ -x "$p" ]; then
    claude_found=true
    pass "Claude CLI ($p)"
    break
  fi
done
if command -v claude &>/dev/null && [ "$claude_found" = false ]; then
  claude_found=true
  pass "Claude CLI ($(which claude))"
fi
if [ "$claude_found" = false ]; then
  fail "Claude CLI not found — run: npm install -g @anthropic-ai/claude-code"
  errors=$((errors + 1))
fi

# Check if we're in the project root
if [ ! -f "package.json" ]; then
  echo ""
  fail "Not in project root — run this script from the helm directory"
  exit 1
fi

header "Installing dependencies..."

npm install

# Verify native modules built
if [ -d "node_modules/better-sqlite3/build/Release" ]; then
  pass "better-sqlite3 native module compiled"
else
  fail "better-sqlite3 failed to compile — check Xcode CLI tools"
  errors=$((errors + 1))
fi

header "Compiling Electron TypeScript..."

npx tsc -p tsconfig.electron.json
pass "Electron build complete (dist-electron/)"

# Create data directory if needed
mkdir -p data
pass "Data directory ready"

# Summary
echo ""
if [ "$errors" -gt 0 ]; then
  echo -e "${RED}${BOLD}Setup incomplete — $errors issue(s) to fix above.${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}Setup complete!${NC}"
  echo ""
  echo "  Run the app:  npm run electron:dev"
  echo ""
fi
