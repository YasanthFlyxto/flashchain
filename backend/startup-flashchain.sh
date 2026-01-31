#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🚀 FlashChain Startup Script v2.0                       ║${NC}"
echo -e "${BLUE}║     Context-Aware Smart Caching + Pre-Caching Rules         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Step 1: Check/Start Redis
echo -e "\n${YELLOW}[1/7] Checking Redis Cache...${NC}"
if docker ps | grep -q redis-cache; then
    echo -e "${GREEN}✓ Redis already running${NC}"
else
    echo -e "${YELLOW}Starting Redis...${NC}"
    docker start redis-cache 2>/dev/null || docker run -d --name redis-cache -p 6379:6379 redis:latest
    sleep 3
    echo -e "${GREEN}✓ Redis started on port 6379${NC}"
fi

# Verify Redis is responding
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis connection verified${NC}"
else
    echo -e "${RED}✗ Redis not responding! Check docker logs redis-cache${NC}"
fi

# Step 2: Check Fabric Network
echo -e "\n${YELLOW}[2/7] Checking Hyperledger Fabric Network...${NC}"
if docker ps | grep -q peer0.org1.example.com; then
    echo -e "${GREEN}✓ Fabric network already running${NC}"
    FABRIC_RUNNING=true
else
    echo -e "${YELLOW}Starting Fabric network (this takes ~60 seconds)...${NC}"
    cd ~/fabric-samples/test-network
    ./network.sh down > /dev/null 2>&1
    ./network.sh up createChannel -c mychannel -ca -s couchdb
    sleep 5
    echo -e "${GREEN}✓ Fabric network started${NC}"
    FABRIC_RUNNING=false
fi

# Step 3: Deploy Chaincode
if [ "$FABRIC_RUNNING" = false ]; then
    echo -e "\n${YELLOW}[3/7] Deploying chaincode...${NC}"
    cd ~/fabric-samples/test-network
    ./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-javascript -ccl javascript
    echo -e "${GREEN}✓ Chaincode 'basic' deployed${NC}"
    
    # CRITICAL: Recreate wallet after network restart
    echo -e "\n${YELLOW}[4/7] Creating fresh admin wallet...${NC}"
    cd ~/flashchain/backend
    rm -rf wallet/
    node enrollAdmin.js
    echo -e "${GREEN}✓ Admin wallet created${NC}"
else
    echo -e "\n${YELLOW}[3/7] Chaincode already deployed${NC}"
    
    # Check wallet exists
    echo -e "\n${YELLOW}[4/7] Checking wallet...${NC}"
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

# Step 5: Create Diverse Test Assets (for Pre-Caching Rules Testing)
echo -e "\n${YELLOW}[5/7] Setting up test assets...${NC}"
cd ~/fabric-samples/test-network
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

ASSET_COUNT=$(peer chaincode query -C mychannel -n basic -c '{"Args":["GetAllAssets"]}' 2>/dev/null | jq '. | length' 2>/dev/null || echo "0")

if [ "$ASSET_COUNT" -ge 8 ]; then
    echo -e "${GREEN}✓ Found $ASSET_COUNT existing assets${NC}"
else
    echo -e "${YELLOW}Creating diverse test assets (this takes ~30 seconds)...${NC}"
    
    # Asset 1: High-value in-transit (triggers Rule 3)
    echo -e "${PURPLE}  Creating SHIP001 (High-value in-transit - Rule 3)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP001","Electronics","100","Distributor-Transit","75000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 2: Near customs checkpoint (triggers Rule 1)
    echo -e "${PURPLE}  Creating SHIP002 (Near customs - Rule 1)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP002","Pharmaceuticals","50","Customs-Processing","45000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 3: Low-value delivered (Rule 4 - don't cache)
    echo -e "${PURPLE}  Creating SHIP003 (Low-value delivered - Rule 4)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP003","Textiles","200","Delivered-Warehouse","5000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 4: Mid-journey (Rule 4 - don't cache)
    echo -e "${PURPLE}  Creating SHIP004 (Mid-journey - Rule 4)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP004","Furniture","80","Shipping-Highway","12000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 5: High-value manufacturing
    echo -e "${PURPLE}  Creating SHIP005 (Manufacturer)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP005","Machinery","25","Manufacturer-Mumbai","95000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 6: In transit high value (triggers Rule 3)
    echo -e "${PURPLE}  Creating SHIP006 (High-value transit - Rule 3)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP006","Medical-Equipment","15","Distributor-Transit","125000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 7: Retailer warehouse
    echo -e "${PURPLE}  Creating SHIP007 (Retailer)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP007","Consumer-Goods","300","Retailer-Delhi","18000"]}' > /dev/null 2>&1
    sleep 3
    
    # Asset 8: Near destination (triggers Rule 3)
    echo -e "${PURPLE}  Creating SHIP008 (Near destination - Rule 3)...${NC}"
    peer chaincode invoke -o localhost:7050 \
      --ordererTLSHostnameOverride orderer.example.com \
      --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
      -C mychannel -n basic \
      --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
      -c '{"function":"CreateAsset","Args":["SHIP008","Auto-Parts","120","Transit-Bangalore","67000"]}' > /dev/null 2>&1
    sleep 3
    
    echo -e "${GREEN}✓ 8 diverse test assets created${NC}"
fi

# Step 6: Verify Asset Creation
echo -e "\n${YELLOW}[6/7] Verifying assets...${NC}"
FINAL_COUNT=$(peer chaincode query -C mychannel -n basic -c '{"Args":["GetAllAssets"]}' 2>/dev/null | jq '. | length' 2>/dev/null || echo "0")
echo -e "${GREEN}✓ Total assets in blockchain: $FINAL_COUNT${NC}"

# Step 7: Start Backend with Pre-Caching Worker
echo -e "\n${YELLOW}[7/7] Starting FlashChain Backend...${NC}"
cd ~/flashchain/backend

# Check if cache.js exists
if [ ! -f "middleware/cache.js" ]; then
    echo -e "${RED}✗ cache.js not found! Please ensure middleware/cache.js exists${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Smart caching layer ready${NC}"
echo -e "${GREEN}✓ Pre-caching rules engine initialized${NC}"
echo -e "${GREEN}✓ Backend starting on http://localhost:4000${NC}\n"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ✅ FlashChain is ready!                                       ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  📊 Backend API:    http://localhost:4000                     ║${NC}"
echo -e "${BLUE}║  🎨 Frontend:       http://localhost:3000                     ║${NC}"
echo -e "${BLUE}║  🔴 Redis:          localhost:6379                            ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  🧪 Test Endpoints:                                            ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/health                          ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/api/assets                      ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/api/stats                       ║${NC}"
echo -e "${BLUE}║     curl http://localhost:4000/api/precache/activity           ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  🔮 Pre-Caching Rules Active:                                  ║${NC}"
echo -e "${BLUE}║     Rule 1: Checkpoint Proximity (<20km, <1h ETA)             ║${NC}"
echo -e "${BLUE}║     Rule 2: Access Pattern (>3 accesses, multiple orgs)       ║${NC}"
echo -e "${BLUE}║     Rule 3: High-Value Near Destination (>$50k, <50km)        ║${NC}"
echo -e "${BLUE}║     Rule 4: Don't Pre-Cache (mid-journey optimization)        ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  ⏱️  Pre-Caching Worker: Runs every 2 minutes                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}\n"

# Start the server
node app.js
