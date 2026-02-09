#  FlashChain Quick Start Guide

## Prerequisites
- Ubuntu 22.04
- Docker & Docker Compose
- Node.js 18+
- Hyperledger Fabric 2.5

---

## 🔧 ONE-TIME SETUP

### 1. Start Infrastructure
```bash
# Start Fabric network
cd ~/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca

# Deploy chaincode
./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-javascript -ccl javascript

# Start Redis
docker run -d --name redis-cache -p 6379:6379 redis:latest

#Create Test Assets

cd ~/fabric-samples/test-network

# Set environment
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Create assets (WITH BOTH ORG1 AND ORG2 ENDORSEMENT!)
for i in {1..6}; do
  peer chaincode invoke -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    -C mychannel -n basic \
    --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
    -c "{\"function\":\"CreateAsset\",\"Args\":[\"asset$i\",\"color$i\",\"$((i*5))\",\"Owner$i\",\"$((i*100))\"]}"
  sleep 2
done

# Verify
peer chaincode query -C mychannel -n basic -c '{"Args":["GetAllAssets"]}'

# Start FlashChain Backend
cd ~/flashchain/backend
npm install
node server.js

# DAILY RESTART (After Reboot)
# 1. Stop everything
cd ~/fabric-samples/test-network
./network.sh down
docker stop redis-cache

# 2. Restart (follow ONE-TIME SETUP above)
