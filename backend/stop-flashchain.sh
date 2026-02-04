#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🛑 FlashChain Shutdown Script                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Step 1: Stop Backend (if running)
echo -e "\n${YELLOW}[1/4] Stopping Backend...${NC}"
pkill -f "node app.js" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend stopped${NC}"
else
    echo -e "${YELLOW}✓ Backend not running${NC}"
fi

# Step 2: Stop Fabric Network
echo -e "\n${YELLOW}[2/4] Stopping Hyperledger Fabric Network...${NC}"
cd /home/yasanth-ubuntu-22/fabric-samples/test-network
./network.sh down

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Fabric network stopped${NC}"
else
    echo -e "${RED}✗ Error stopping network${NC}"
fi

# Step 3: Stop Redis (Optional - keeps data)
echo -e "\n${YELLOW}[3/4] Stopping Redis...${NC}"
docker stop redis-cache 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Redis stopped (data preserved)${NC}"
else
    echo -e "${YELLOW}✓ Redis not running${NC}"
fi

# Step 4: Cleanup (Optional)
echo -e "\n${YELLOW}[4/4] Cleanup Options${NC}"
echo -e "${PURPLE}  Do you want to remove ALL data? (y/N)${NC}"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${RED}  Removing Redis container and wallet...${NC}"
    docker rm redis-cache 2>/dev/null
    rm -rf /home/yasanth-ubuntu-22/flashchain/backend/wallet
    echo -e "${GREEN}✓ All data removed${NC}"
else
    echo -e "${GREEN}✓ Data preserved (Redis and wallet intact)${NC}"
fi

echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain Shutdown Complete                               ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  To restart: ./startup-flashchain.sh                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"
