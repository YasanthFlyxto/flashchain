#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

SCRIPT_DIR="/home/yasanth-ubuntu-22/flashchain"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
FABRIC_DIR="/home/yasanth-ubuntu-22/fabric-samples/test-network"
BACKEND_LOG="$SCRIPT_DIR/backend.log"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         FlashChain Complete Startup Script                   ║${NC}"
echo -e "${BLUE}║    Network + Chaincode + Backend + Frontend                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Step 1: Check/Start Redis
echo -e "\n${YELLOW}[1/6] Starting Redis Cache...${NC}"
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
echo -e "\n${YELLOW}[2/6] Starting Hyperledger Fabric Network...${NC}"
cd "$FABRIC_DIR"

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
        exit 1
    fi
done

# Step 3: Deploy Chaincode
echo -e "\n${YELLOW}[3/6] Deploying FlashChain Chaincode...${NC}"
cd "$FABRIC_DIR"

./network.sh deployCC -ccn basic -ccp "$SCRIPT_DIR/chaincode" -ccl javascript

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Chaincode deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Chaincode deployed${NC}"

# Step 4: Create Admin Wallet
echo -e "\n${YELLOW}[4/6] Creating Admin Wallet...${NC}"
cd "$BACKEND_DIR"

rm -rf wallet/
node enrollAdmin.js

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to enroll admin${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Admin wallet created${NC}"

# Step 5: Create Sample Assets
echo -e "\n${YELLOW}[5/6] Creating Sample Assets...${NC}"
cd "$FABRIC_DIR"

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

echo -e "${PURPLE}  Creating test assets...${NC}"

ORDERER_CA="${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
ORG1_TLS="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
ORG2_TLS="${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

# Note: FlashChain chaincode CreateAsset requires 6 args: id, color, size, owner, appraisedValue, status
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP001","Electronics","100","Carrier-Transit","75000","In-Transit"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP002","Pharmaceuticals","50","Customs-Rotterdam-Transit","45000","In-Transit"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP003","Cold Chain","15","Warehouse","125000","Delivered"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP004","Industrial","200","Manufacturer","32000","Delivered"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP005","Documents","5","Disputed","8000","DISPUTED"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP006","Textiles","300","Retailer","18000","Delivered"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP007","Electronics","80","Carrier-Transit","95000","In-Transit"]}' > /dev/null 2>&1
sleep 1
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" --peerAddresses localhost:10051 --tlsRootCertFiles "$ORG2_TLS" -c '{"function":"CreateAsset","Args":["SHIP008","Pharmaceuticals","25","Warehouse","210000","Delivered"]}' > /dev/null 2>&1
sleep 1

echo -e "${GREEN}✓ Sample assets created (8 shipments)${NC}"

# Step 6: Start Backend + Frontend
echo -e "\n${YELLOW}[6/6] Starting Backend and Frontend...${NC}"

# Start backend in background, log to file
echo -e "${PURPLE}  Starting backend (logging to backend.log)...${NC}"
cd "$BACKEND_DIR"
node app.js > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo -e "${PURPLE}  Waiting for backend to be ready...${NC}"
for i in $(seq 1 15); do
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend ready (PID: $BACKEND_PID)${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}✗ Backend failed to start. Check backend.log for errors.${NC}"
        exit 1
    fi
    sleep 1
done

# Final status
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain Ready!                                          ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  Backend:  http://localhost:4000  (PID: $BACKEND_PID)$(printf '%*s' $((14 - ${#BACKEND_PID})) '')║${NC}"
echo -e "${BLUE}║  Frontend: http://localhost:3000  (starting now...)            ║${NC}"
echo -e "${BLUE}║  Redis:    localhost:6379                                      ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  Backend logs: tail -f $SCRIPT_DIR/backend.log  ║${NC}"
echo -e "${BLUE}║  Stop all:     kill $BACKEND_PID && Ctrl+C                $(printf '%*s' $((14 - ${#BACKEND_PID})) '')║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

# Start frontend in foreground
cd "$FRONTEND_DIR"
npm run dev
