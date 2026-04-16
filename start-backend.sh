#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_DIR="/home/yasanth-ubuntu-22/flashchain/backend"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         FlashChain Backend                       ║${NC}"
echo -e "${BLUE}║  http://localhost:4000  |  Ctrl+C to stop        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}\n"

# Kill any existing backend on port 4000
EXISTING=$(lsof -ti:4000 2>/dev/null)
if [ -n "$EXISTING" ]; then
    echo -e "${YELLOW}Stopping existing backend (PID: $EXISTING)...${NC}"
    kill "$EXISTING" 2>/dev/null
    sleep 1
fi

cd "$BACKEND_DIR"
node app.js
