#!/bin/bash
# Run Caliper benchmark for FlashChain
# Fabric network must be running before executing this script.

cd "$(dirname "$0")"

npx caliper launch manager \
  --caliper-workspace . \
  --caliper-networkconfig network.yaml \
  --caliper-benchconfig benchmark.yaml \
  --caliper-flow-only-test \
  --caliper-fabric-gateway-enabled
