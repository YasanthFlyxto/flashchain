#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         FlashChain Shutdown Script                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Step 1: Stop Frontend (Next.js dev server)
echo -e "\n${YELLOW}[1/5] Stopping Frontend...${NC}"
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
pkill -f "npm.*dev" 2>/dev/null
pkill -f "startup-flashchain" 2>/dev/null
sleep 1
echo -e "${GREEN}✓ Frontend stopped${NC}"

# Step 2: Stop Backend
echo -e "\n${YELLOW}[2/5] Stopping Backend...${NC}"
pkill -f "node app.js" 2>/dev/null
sleep 1
echo -e "${GREEN}✓ Backend stopped${NC}"

# Step 3: Stop Fabric Network
echo -e "\n${YELLOW}[3/5] Stopping Hyperledger Fabric Network...${NC}"
cd /home/yasanth-ubuntu-22/fabric-samples/test-network
./network.sh down

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Fabric network stopped${NC}"
else
    echo -e "${RED}✗ Error stopping network${NC}"
fi

# Step 4: Stop Redis
echo -e "\n${YELLOW}[4/5] Stopping Redis...${NC}"
docker stop redis-cache 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Redis stopped (data preserved)${NC}"
else
    echo -e "${YELLOW}✓ Redis not running${NC}"
fi

# Step 5: Cleanup (Optional)
echo -e "\n${YELLOW}[5/5] Cleanup Options${NC}"
echo -e "${PURPLE}  Remove ALL data (Redis container, wallet, backend.log)? (y/N)${NC}"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${RED}  Removing Redis container, wallet, and logs...${NC}"
    docker rm redis-cache 2>/dev/null
    rm -rf /home/yasanth-ubuntu-22/flashchain/backend/wallet
    rm -f /home/yasanth-ubuntu-22/flashchain/backend.log
    echo -e "${GREEN}✓ All data removed${NC}"
else
    echo -e "${GREEN}✓ Data preserved (Redis and wallet intact)${NC}"
fi

echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain Shutdown Complete                               ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  To restart: ./startup-flashchain.sh                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"
