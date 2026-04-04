#!/bin/bash
# scripts/setup.sh
# First-run setup script for Linux and macOS.
# Run with : bash scripts/setup.sh

set -e

echo ""
echo "polybridge-mcp setup"
echo "===================="
echo ""

# Check Node.js version.
if ! command -v node &>/dev/null; then
  echo "Node.js is not installed. Please install Node.js >= 20 from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Node.js >= 20 is required. Current version : $(node -v)"
  exit 1
fi

echo "Node.js $(node -v) detected."

# Install dependencies.
echo ""
echo "Installing npm dependencies..."
npm install

# Copy config file if it does not exist.
if [ ! -f "polybridge-mcp.config.json" ]; then
  cp polybridge-mcp.config.example.json polybridge-mcp.config.json
  echo ""
  echo "Config file created : polybridge-mcp.config.json"
  echo "Edit it to enable the bridges you want to use."
else
  echo ""
  echo "Config file already exists : polybridge-mcp.config.json"
fi

# Create workspace directory.
mkdir -p workspace
echo "Workspace directory ready : ./workspace"

# Build TypeScript.
echo ""
echo "Compiling TypeScript..."
npm run build

echo ""
echo "Setup complete. Start the server with :"
echo "  npm run dev    (development mode with PTL logs)"
echo "  npm start      (production mode)"
echo ""
