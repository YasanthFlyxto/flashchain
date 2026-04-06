#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      FlashChain Complete Startup Script                   ║${NC}"
echo -e "${BLUE}║     Network + Chaincode + Backend                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Step 1: Check/Start Redis
echo -e "\n${YELLOW}[1/5] Starting Redis Cache...${NC}"
if docker ps | grep -q redis-cache; then
    echo -e "${GREEN}✓ Redis already running${NC}"
else
    docker start redis-cache 2>/dev/null || docker run -d --name redis-cache -p 6379:6379 redis:latest
    sleep 2
fi

if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis connection verified${NC}"
else
    echo -e "${RED}✗ Redis failed to start${NC}"
    exit 1
fi

# Step 2: Start Fabric Network with CA
echo -e "\n${YELLOW}[2/5] Starting Hyperledger Fabric Network...${NC}"
cd /home/yasanth-ubuntu-22/fabric-samples/test-network

# Always restart to ensure clean state
echo -e "${PURPLE}  Stopping any existing network...${NC}"
./network.sh down > /dev/null 2>&1

echo -e "${PURPLE}  Starting network with CA and CouchDB (takes ~60s)...${NC}"
./network.sh up createChannel -c mychannel -ca -s couchdb

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to start Fabric network${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Network started${NC}"

# Verify containers
sleep 5
echo -e "\n${PURPLE}  Verifying containers...${NC}"
REQUIRED=("peer0.org1.example.com" "peer0.org2.example.com" "orderer.example.com" "ca_org1" "ca_org2" "ca_orderer")
for container in "${REQUIRED[@]}"; do
    if docker ps | grep -q "$container"; then
        echo -e "${GREEN}    ✓ $container${NC}"
    else
        echo -e "${RED}    ✗ $container NOT RUNNING${NC}"
        echo -e "${YELLOW}    Run: docker ps -a | grep $container${NC}"
        exit 1
    fi
done

# Step 3: Deploy Chaincode
echo -e "\n${YELLOW}[3/5] Deploying FlashChain Chaincode...${NC}"
cd /home/yasanth-ubuntu-22/fabric-samples/test-network

./network.sh deployCC -ccn basic -ccp /home/yasanth-ubuntu-22/flashchain/chaincode -ccl javascript

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Chaincode deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Chaincode deployed${NC}"

# Step 4: Create Admin Wallet
echo -e "\n${YELLOW}[4/5] Creating Admin Wallet...${NC}"
cd /home/yasanth-ubuntu-22/flashchain/backend

rm -rf wallet/
node enrollAdmin.js

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to enroll admin${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Admin wallet created${NC}"

# Step 5: Ready
echo -e "\n${YELLOW}[5/5] Ledger ready${NC}"
echo -e "${GREEN}Clean ledger - register shipments via the UI${NC}"

# Final Message
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain Setup Complete!                                 ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║   Start Backend:  cd backend && node app.js                  ║${NC}"
echo -e "${BLUE}║   Start Frontend: cd frontend && npm run dev                 ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  API:      http://localhost:4000                            ║${NC}"
echo -e "${BLUE}║  Frontend: http://localhost:3000                            ║${NC}"
echo -e "${BLUE}║  Redis:    localhost:6379                                   ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║    Quick Tests:                                               ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/health                          ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/api/assets                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}Ready to start backend? (Press Enter, or Ctrl+C to exit)${NC}"
read

cd /home/yasanth-ubuntu-22/flashchain/backend
node app.js
