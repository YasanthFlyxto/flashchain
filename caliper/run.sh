#!/bin/bash
# Run Caliper benchmark for FlashChain
# Fabric network must be running before executing this script.

cd "$(dirname "$0")"

KEYSTORE_DIR="../../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore"
PRIVATE_KEY=$(ls "$KEYSTORE_DIR"/*_sk 2>/dev/null | head -1)

if [ -z "$PRIVATE_KEY" ]; then
  echo "ERROR: No private key found in $KEYSTORE_DIR"
  echo "Is the Fabric test-network running?"
  exit 1
fi

# Update network.yaml with the current key filename
sed -i "s|keystore/.*_sk|keystore/$(basename "$PRIVATE_KEY")|g" network.yaml

echo "Using key: $(basename "$PRIVATE_KEY")"

npx caliper launch manager \
  --caliper-workspace . \
  --caliper-networkconfig network.yaml \
  --caliper-benchconfig benchmark.yaml \
  --caliper-flow-only-test \
  --caliper-fabric-gateway-enabled
