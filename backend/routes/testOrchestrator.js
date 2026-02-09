const express = require('express');
const router = express.Router();
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const redis = require('redis');
const crypto = require('crypto');

// Lazy Redis initialization
let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
    console.log('✅ Redis connected for test orchestrator');
  }
  return redisClient;
}

// In-memory store for test session data
const testSessions = new Map();

// Fabric connection helper
async function connectToFabric() {
  
  const ccpPath = path.resolve(__dirname, '..', '..', '..', 'fabric-samples',
    'test-network', 'organizations', 'peerOrganizations',
    'org1.example.com', 'connection-org1.json');

  const ccp = require(ccpPath);

  const walletPath = path.join(process.cwd(), 'wallet');
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  const identity = await wallet.get('admin');
  if (!identity) {
    throw new Error('Admin identity not found in wallet');
  }

  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: 'admin',
    discovery: { enabled: true, asLocalhost: true }
  });

  const network = await gateway.getNetwork('mychannel');
  const contract = network.getContract('basic');

  return { gateway, contract };
}

// CREATE TEST SESSION
router.post('/session/create', async (req, res) => {
  try {
    const sessionId = `TEST_SESSION_${Date.now()}`;
    const { assetCount = 20 } = req.body;

    testSessions.set(sessionId, {
      id: sessionId,
      assets: [],
      status: 'created',
      createdAt: new Date().toISOString(),
      metrics: {
        totalAssets: assetCount,
        cachedAssets: 0,
        blockchainAssets: 0,
        queriesExecuted: 0,
        avgCacheLatency: 0,
        avgBlockchainLatency: 0
      }
    });

    res.json({ sessionId, status: 'created' });
  } catch (error) {
    console.error('Error creating test session:', error);
    res.status(500).json({ error: error.message });
  }
});

// GENERATE TEST ASSETS WITH SPECIFIC RULES
router.post('/session/:sessionId/generate-assets', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { assetCount = 20, ruleDistribution } = req.body;

    const session = testSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { gateway, contract } = await connectToFabric();
    const assets = [];

    // Default distribution: 25% each rule
    const distribution = ruleDistribution || {
      proximityRule: 0.3,
      highValueRule: 0.3,
      multiStakeholderRule: 0.2,
      offPeakRule: 0.2
    };

    for (let i = 0; i < assetCount; i++) {
      const assetId = `DEMO_${sessionId}_${String(i + 1).padStart(3, '0')}`;
      const random = Math.random();
      let ruleTarget = 'none';
      let owner = '';
      let value = 0;

      // Determine which rule this asset should trigger
      if (random < distribution.proximityRule) {
        // Proximity Rule: Owner contains "Transit" or "Approaching"
        ruleTarget = 'proximity';
        owner = 'Customs-Transit-Approaching';
        value = 30000;
      } else if (random < distribution.proximityRule + distribution.highValueRule) {
        // High Value Rule: $50k+
        ruleTarget = 'highValue';
        owner = 'Distributor-Transit';
        value = 75000 + (Math.random() * 50000); // $75k-$125k
      } else if (random < distribution.proximityRule + distribution.highValueRule + distribution.multiStakeholderRule) {
        // Multi-Stakeholder Rule
        ruleTarget = 'multiStakeholder';
        owner = 'Retailer-Delivered';
        value = 40000;
      } else {
        // No rule match - stays in blockchain
        ruleTarget = 'none';
        owner = 'Warehouse-Static';
        value = 15000;
      }

      // Create asset on blockchain using YOUR chaincode format
      // CreateAsset(id, color, size, owner, value)
      await contract.submitTransaction(
        'CreateAsset',
        assetId,
        'TestProduct',
        '100',
        owner,
        Math.floor(value).toString()
      );

      assets.push({
        id: assetId,
        color: 'TestProduct',
        size: 100,
        owner: owner,
        value: Math.floor(value),
        ruleTarget,
        cached: false,
        createdAt: new Date().toISOString()
      });

      console.log(`✅ Created ${assetId} | Rule: ${ruleTarget} | Owner: ${owner}`);
    }

    session.assets = assets;
    session.status = 'assets_created';
    testSessions.set(sessionId, session);

    await gateway.disconnect();

    res.json({
      sessionId,
      assetsCreated: assets.length,
      assets: assets.map(a => ({ id: a.id, ruleTarget: a.ruleTarget, owner: a.owner }))
    });
  } catch (error) {
    console.error('Error generating test assets:', error);
    res.status(500).json({ error: error.message });
  }
});

// CHECK CACHE STATUS (Which assets moved to cache)
router.get('/session/:sessionId/cache-status', async (req, res) => {
  try {
    const client = await getRedisClient();

    const { sessionId } = req.params;
    const session = testSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const cacheStatus = [];

    for (const asset of session.assets) {
      const cacheKey = `asset:${asset.id}`;
      const cachedData = await client.get(cacheKey);

      cacheStatus.push({
        id: asset.id,
        ruleTarget: asset.ruleTarget,
        owner: asset.owner,
        inCache: !!cachedData,
        location: cachedData ? 'cache' : 'blockchain'
      });
    }

    const cachedCount = cacheStatus.filter(a => a.inCache).length;

    res.json({
      sessionId,
      totalAssets: session.assets.length,
      cachedAssets: cachedCount,
      blockchainOnlyAssets: session.assets.length - cachedCount,
      assets: cacheStatus
    });
  } catch (error) {
    console.error('Error checking cache status:', error);
    res.status(500).json({ error: error.message });
  }
});

// SINGLE QUERY TEST (with latency measurement)
router.post('/session/:sessionId/query-single', async (req, res) => {
  try {
    const client = await getRedisClient();

    const { sessionId } = req.params;
    const { assetId } = req.body;

    const session = testSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check cache first
    const cacheKey = `asset:${assetId}`;
    const cacheStartTime = Date.now();
    const cachedData = await client.get(cacheKey);

    if (cachedData) {
      const cacheLatency = Date.now() - cacheStartTime;
      return res.json({
        assetId,
        source: 'cache',
        latency: cacheLatency,
        data: JSON.parse(cachedData)
      });
    }

    // Query from blockchain
    const { gateway, contract } = await connectToFabric();
    const blockchainStartTime = Date.now();
    const result = await contract.evaluateTransaction('ReadAsset', assetId);
    const blockchainLatency = Date.now() - blockchainStartTime;
    const assetData = JSON.parse(result.toString());

    await gateway.disconnect();

    res.json({
      assetId,
      source: 'blockchain',
      latency: blockchainLatency,
      data: assetData
    });
  } catch (error) {
    console.error('Error querying asset:', error);
    res.status(500).json({ error: error.message });
  }
});

// BULK QUERY TEST (1000+ queries)
router.post('/session/:sessionId/query-bulk', async (req, res) => {
  try {
    const client = await getRedisClient();

    const { sessionId } = req.params;
    const { iterations = 50 } = req.body;

    const session = testSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const results = {
      totalQueries: 0,
      cacheHits: 0,
      blockchainQueries: 0,
      cacheLatencies: [],
      blockchainLatencies: [],
      avgCacheLatency: 0,
      avgBlockchainLatency: 0,
      improvementPercentage: 0
    };

    const { gateway, contract } = await connectToFabric();

    // Query each asset multiple times
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (const asset of session.assets) {
        const cacheKey = `asset:${asset.id}`;
        const startTime = Date.now();
        const cachedData = await client.get(cacheKey);

        if (cachedData) {
          const latency = Date.now() - startTime;
          results.cacheHits++;
          results.cacheLatencies.push(latency);
        } else {
          const bcStartTime = Date.now();
          await contract.evaluateTransaction('ReadAsset', asset.id);
          const latency = Date.now() - bcStartTime;
          results.blockchainQueries++;
          results.blockchainLatencies.push(latency);
        }

        results.totalQueries++;
      }
    }

    await gateway.disconnect();

    // Calculate averages
    if (results.cacheLatencies.length > 0) {
      results.avgCacheLatency =
        results.cacheLatencies.reduce((a, b) => a + b, 0) / results.cacheLatencies.length;
    }

    if (results.blockchainLatencies.length > 0) {
      results.avgBlockchainLatency =
        results.blockchainLatencies.reduce((a, b) => a + b, 0) / results.blockchainLatencies.length;
    }

    // Calculate improvement
    if (results.avgBlockchainLatency > 0) {
      results.improvementPercentage =
        ((results.avgBlockchainLatency - results.avgCacheLatency) / results.avgBlockchainLatency * 100).toFixed(2);
    }

    // Update session metrics
    session.metrics = results;
    testSessions.set(sessionId, session);

    res.json(results);
  } catch (error) {
    console.error('Error in bulk query test:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET SESSION STATUS
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = testSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

module.exports = router;
