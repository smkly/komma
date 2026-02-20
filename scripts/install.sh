#!/bin/bash
# curl -fsSL https://raw.githubusercontent.com/0xSmick/helm/main/scripts/install.sh | bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}Helm — AI Document Editor${NC}"
echo ""

# Check prerequisites
missing=0

if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js not found${NC} — install from https://nodejs.org (v20+)"
  missing=1
elif [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]; then
  echo -e "${RED}✗ Node.js $(node -v) too old${NC} — need v20+"
  missing=1
fi

if ! command -v git &>/dev/null; then
  echo -e "${RED}✗ Git not found${NC}"
  missing=1
fi

if [ "$missing" -eq 1 ]; then
  echo ""
  echo "Install missing prerequisites and try again."
  exit 1
fi

# Check for Claude CLI (warn but don't block)
claude_found=false
for p in "$HOME/.local/bin/claude" /usr/local/bin/claude /opt/homebrew/bin/claude; do
  [ -x "$p" ] && claude_found=true && break
done
command -v claude &>/dev/null && claude_found=true

if [ "$claude_found" = false ]; then
  echo -e "${YELLOW}! Claude CLI not found — AI features won't work without it${NC}"
  echo "  Install later: npm install -g @anthropic-ai/claude-code"
  echo ""
fi

# Clone
INSTALL_DIR="${HELM_DIR:-$HOME/Developer/helm}"

if [ -d "$INSTALL_DIR" ]; then
  echo "Directory $INSTALL_DIR already exists."
  echo -n "Pull latest? [Y/n] "
  read -r reply
  if [ "$reply" != "n" ] && [ "$reply" != "N" ]; then
    cd "$INSTALL_DIR"
    git pull
  else
    cd "$INSTALL_DIR"
  fi
else
  echo "Cloning to $INSTALL_DIR..."
  git clone https://github.com/0xSmick/helm.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install
echo "Installing dependencies..."
npm install

# Compile Electron
echo "Compiling Electron..."
npx tsc -p tsconfig.electron.json

# Create data dir
mkdir -p data

echo ""
echo -e "${GREEN}${BOLD}Helm installed!${NC}"
echo ""
echo "  cd $INSTALL_DIR"
echo "  npm run electron:dev"
echo ""
if [ "$claude_found" = false ]; then
  echo -e "${YELLOW}Remember to install Claude CLI for AI features:${NC}"
  echo "  npm install -g @anthropic-ai/claude-code && claude"
  echo ""
fi
