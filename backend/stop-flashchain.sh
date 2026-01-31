#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}╔══════════════════════════════════════════════╗${NC}"
echo -e "${RED}║     🛑 FlashChain Shutdown Script           ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════╝${NC}"

# Step 1: Stop Backend Process
echo -e "\n${YELLOW}[1/5] Stopping Backend API...${NC}"
BACKEND_PID=$(lsof -ti:4000)
if [ -z "$BACKEND_PID" ]; then
    echo -e "${YELLOW}✓ Backend not running${NC}"
else
    kill -9 $BACKEND_PID 2>/dev/null
    echo -e "${GREEN}✓ Backend stopped (PID: $BACKEND_PID)${NC}"
fi

# Step 2: Stop Frontend Process (if running)
echo -e "\n${YELLOW}[2/5] Stopping Frontend...${NC}"
FRONTEND_PID=$(lsof -ti:3000)
if [ -z "$FRONTEND_PID" ]; then
    echo -e "${YELLOW}✓ Frontend not running${NC}"
else
    kill -9 $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}✓ Frontend stopped (PID: $FRONTEND_PID)${NC}"
fi

# Step 3: Stop Hyperledger Fabric Network
echo -e "\n${YELLOW}[3/5] Stopping Hyperledger Fabric Network...${NC}"
if docker ps | grep -q peer0.org1.example.com; then
    cd ~/fabric-samples/test-network
    ./network.sh down
    echo -e "${GREEN}✓ Fabric network stopped${NC}"
    echo -e "${GREEN}✓ All containers removed${NC}"
    echo -e "${GREEN}✓ Volumes cleaned${NC}"
else
    echo -e "${YELLOW}✓ Fabric network already stopped${NC}"
fi

# Step 4: Stop Redis (optional - keep running for faster restart)
echo -e "\n${YELLOW}[4/5] Handling Redis Cache...${NC}"
read -p "$(echo -e ${BLUE}Stop Redis? Cache will be cleared. [y/N]: ${NC})" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker stop redis-cache 2>/dev/null
    echo -e "${GREEN}✓ Redis stopped${NC}"
else
    echo -e "${YELLOW}✓ Redis kept running (faster restart)${NC}"
fi

# Step 5: Cleanup Summary
echo -e "\n${YELLOW}[5/5] Cleanup Summary...${NC}"

# Check remaining processes
REMAINING=$(docker ps -q | wc -l)
if [ "$REMAINING" -eq 0 ] || ([ "$REMAINING" -eq 1 ] && docker ps | grep -q redis-cache); then
    echo -e "${GREEN}✓ All FlashChain services stopped${NC}"
else
    echo -e "${YELLOW}⚠ Some Docker containers still running:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}"
fi

# Show disk space freed
echo -e "\n${BLUE}📊 Docker System Status:${NC}"
docker system df

# Final message
echo -e "\n${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  ✅ FlashChain Stopped Successfully                          ║${NC}"
echo -e "${RED}║                                                              ║${NC}"
echo -e "${RED}║  💡 To restart:                                              ║${NC}"
echo -e "${RED}║     ./start.sh                                               ║${NC}"
echo -e "${RED}║                                                              ║${NC}"
echo -e "${RED}║  🧹 To completely remove all data (including Redis cache):   ║${NC}"
echo -e "${RED}║     docker stop redis-cache && docker rm redis-cache         ║${NC}"
echo -e "${RED}║     docker volume prune -f                                   ║${NC}"
echo -e "${RED}║     docker system prune -a -f                                ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
