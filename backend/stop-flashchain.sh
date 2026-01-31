#!/bin/bash
echo "🛑 Stopping FlashChain..."
cd ~/fabric-samples/test-network
./network.sh down
docker stop redis-cache
echo "✅ All services stopped"
