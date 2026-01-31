#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🚀 FlashChain Startup Script            ║${NC}"
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"

# Step 1: Check/Start Redis
echo -e "\n${YELLOW}[1/6] Checking Redis...${NC}"
if docker ps | grep -q redis-cache; then
    echo -e "${GREEN}✓ Redis already running${NC}"
else
    echo -e "${YELLOW}Starting Redis...${NC}"
    docker start redis-cache 2>/dev/null || docker run -d --name redis-cache -p 6379:6379 redis:latest
    sleep 2
    echo -e "${GREEN}✓ Redis started${NC}"
fi

# Step 2: Check Fabric Network
echo -e "\n${YELLOW}[2/6] Checking Fabric Network...${NC}"
if docker ps | grep -q peer0.org1.example.com; then
    echo -e "${GREEN}✓ Fabric network already running${NC}"
    FABRIC_RUNNING=true
else
    echo -e "${YELLOW}Starting Fabric network (this takes ~30 seconds)...${NC}"
    cd ~/fabric-samples/test-network
    ./network.sh down > /dev/null 2>&1
    ./network.sh up createChannel -c mychannel -ca
    FABRIC_RUNNING=false
fi

# Step 3: Deploy Chaincode (if network was just started)
if [ "$FABRIC_RUNNING" = false ]; then
    echo -e "\n${YELLOW}[3/6] Deploying chaincode...${NC}"
    cd ~/fabric-samples/test-network
    ./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-javascript -ccl javascript
    echo -e "${GREEN}✓ Chaincode deployed${NC}"
    
    # CRITICAL: Recreate wallet after network restart
    echo -e "\n${YELLOW}[4/6] Creating fresh admin wallet...${NC}"
    cd ~/flashchain/backend
    rm -rf wallet/
    node enrollAdmin.js
    echo -e "${GREEN}✓ Admin wallet created${NC}"
else
    echo -e "\n${YELLOW}[3/6] Chaincode already deployed${NC}"
    
    # Check wallet exists
    echo -e "\n${YELLOW}[4/6] Checking wallet...${NC}"
    cd ~/flashchain/backend
    if [ -f "wallet/admin.id" ]; then
        echo -e "${GREEN}✓ Admin wallet exists${NC}"
    else
        echo -e "${YELLOW}Wallet missing, creating...${NC}"
        rm -rf wallet/
        node enrollAdmin.js
        echo -e "${GREEN}✓ Admin wallet created${NC}"
    fi
fi

# Step 5: Create Test Assets
echo -e "\n${YELLOW}[5/6] Verifying blockchain assets...${NC}"
cd ~/fabric-samples/test-network
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

ASSET_COUNT=$(peer chaincode query -C mychannel -n basic -c '{"Args":["GetAllAssets"]}' 2>/dev/null | jq '. | length' 2>/dev/null || echo "0")

if [ "$ASSET_COUNT" -ge 6 ]; then
    echo -e "${GREEN}✓ Found $ASSET_COUNT assets${NC}"
else
    echo -e "${YELLOW}Creating 6 test assets (this takes ~15 seconds)...${NC}"
    for i in {1..6}; do
        peer chaincode invoke -o localhost:7050 \
          --ordererTLSHostnameOverride orderer.example.com \
          --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
          -C mychannel -n basic \
          --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
          --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
          -c "{\"function\":\"CreateAsset\",\"Args\":[\"asset$i\",\"color$i\",\"$((i*5))\",\"Owner$i\",\"$((i*100))\"]}" > /dev/null 2>&1
        sleep 2
    done
    echo -e "${GREEN}✓ Assets created${NC}"
fi

# Step 6: Start Backend
echo -e "\n${YELLOW}[6/6] Starting FlashChain Backend...${NC}"
cd ~/flashchain/backend
echo -e "${GREEN}✓ Backend starting on http://localhost:3000${NC}\n"
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain is ready!                     ║${NC}"
echo -e "${BLUE}║  📊 Test: curl http://localhost:3000/health ║${NC}"
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}\n"

node app.js
