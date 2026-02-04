#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🚀 FlashChain Complete Startup Script                   ║${NC}"
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

# Step 5: Create Sample Assets (Optional)
echo -e "\n${YELLOW}[5/5] Creating Sample Assets...${NC}"
cd /home/yasanth-ubuntu-22/fabric-samples/test-network

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

echo -e "${PURPLE}  Creating test assets...${NC}"

# Asset 1
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel -n basic \
  --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"CreateAsset","Args":["SHIP001","Electronics","100","Distributor-Transit","75000"]}' > /dev/null 2>&1
sleep 2

# Asset 2
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel -n basic \
  --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"CreateAsset","Args":["SHIP002","Pharmaceuticals","50","Customs-Processing","45000"]}' > /dev/null 2>&1
sleep 2

# Asset 3
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel -n basic \
  --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"CreateAsset","Args":["SHIP003","Medical-Equipment","15","Retailer-Delhi","125000"]}' > /dev/null 2>&1

echo -e "${GREEN}✓ Sample assets created${NC}"

# Final Message
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain Setup Complete!                                 ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  🚀 Start Backend:  cd backend && node app.js                  ║${NC}"
echo -e "${BLUE}║  🎨 Start Frontend: cd frontend && npm run dev                 ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  📊 API:      http://localhost:4000                            ║${NC}"
echo -e "${BLUE}║  🌐 Frontend: http://localhost:3000                            ║${NC}"
echo -e "${BLUE}║  🔴 Redis:    localhost:6379                                   ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  🧪 Quick Tests:                                               ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/health                          ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/api/assets                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}Ready to start backend? (Press Enter, or Ctrl+C to exit)${NC}"
read

cd /home/yasanth-ubuntu-22/flashchain/backend
node app.js
