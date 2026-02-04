const express = require('express');
const router = express.Router();
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const redis = require('redis');

let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
    console.log('✅ Redis connected for live demo');
  }
  return redisClient;
}

async function connectToFabric() {
  const ccpPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'fabric-samples',
    'test-network',
    'organizations',
    'peerOrganizations',
    'org1.example.com',
    'connection-org1.json'
  );
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

// Walmart-focused pre-caching rules
const preCachingRules = {
  ruleA: {
    name: 'High-Value In Transit',
    priority: 'HIGH',
    description: 'Electronics pallet worth > $50k and currently in transit',
    cacheDuration: 3600, // seconds
    check: (asset) => {
      const owner = asset.Owner || '';
      const value = parseInt(asset.AppraisedValue || '0', 10);
      return (
        asset.AssetType === 'Electronics' &&
        value > 50000 &&
        owner.includes('Transit')
      );
    }
  },
  ruleB: {
    name: 'Cold-Chain Underway',
    priority: 'HIGH',
    description: 'Cold-chain pharmaceuticals in transit',
    cacheDuration: 1800,
    check: (asset) => {
      const owner = asset.Owner || '';
      return (
        asset.AssetType === 'Pharma' &&
        owner.includes('ColdChain')
      );
    }
  },
  ruleC: {
    name: 'Multi-Stakeholder Handover',
    priority: 'MEDIUM',
    description: 'Shipment touched by DC, carrier, and store within 2 hours',
    cacheDuration: 1200,
    check: (asset) => {
      // For demo, treat Owner containing these hints as multi-stakeholder
      const owner = asset.Owner || '';
      return (
        owner.includes('DC') &&
        owner.includes('Carrier') &&
        owner.includes('Store')
      );
    }
  },
  ruleD: {
    name: 'Static Warehouse Stock (Do Not Cache)',
    priority: 'LOW',
    description: 'Slow-moving stock sitting idle in warehouse',
    cacheDuration: 0,
    check: (asset) => {
      const owner = asset.Owner || '';
      return (
        asset.Status === 'Static' &&
        owner.includes('Warehouse')
      );
    },
    negative: true // overrides positive rules
  }
};

// Map scenario -> Walmart-style asset payload
function buildWalmartAsset(ID, scenario) {
  if (scenario === 'walmart-electronics') {
    return {
      ID,
      Color: 'Electronics',
      Size: '200',
      Owner: 'DC-Transit-HighValue',
      AppraisedValue: '120000',
      AssetType: 'Electronics',
      Status: 'In-Transit'
    };
  }

  if (scenario === 'walmart-pharma') {
    return {
      ID,
      Color: 'Pharma',
      Size: '50',
      Owner: 'ColdChain-Transit-Pharma',
      AppraisedValue: '40000',
      AssetType: 'Pharma',
      Status: 'In-Transit',
      TempRange: '2-8C'
    };
  }

  // Default: static warehouse textiles
  return {
    ID,
    Color: 'Textiles',
    Size: '500',
    Owner: 'Warehouse-Static',
    AppraisedValue: '8000',
    AssetType: 'Textiles',
    Status: 'Static'
  };
}

// MAIN LIVE ENDPOINT
router.post('/create-and-evaluate', async (req, res) => {
  const evaluationSteps = [];
  const startTime = Date.now();

  try {
    const { scenario = 'walmart-electronics' } = req.body;
    const ID = req.body.ID || `WALMART_${Date.now()}`;

    const asset = buildWalmartAsset(ID, scenario);

    evaluationSteps.push({
      step: 1,
      action: 'Asset Received from Walmart DC',
      status: 'processing',
      data: {
        ID: asset.ID,
        AssetType: asset.AssetType,
        Owner: asset.Owner,
        AppraisedValue: asset.AppraisedValue
      },
      timestamp: Date.now() - startTime
    });

    // Step 2: write to blockchain
    const { gateway, contract } = await connectToFabric();

    const writeStart = Date.now();
    await contract.submitTransaction(
      'CreateAsset',
      asset.ID,
      asset.Color,
      asset.Size,
      asset.Owner,
      asset.AppraisedValue
    );
    const writeLatency = Date.now() - writeStart;

    evaluationSteps.push({
      step: 2,
      action: 'Written to Blockchain (Hyperledger Fabric)',
      status: 'success',
      blockchainWriteLatency: writeLatency,
      timestamp: Date.now() - startTime
    });

    // Step 3: read back canonical version
    const readStart = Date.now();
    const bcResp = await contract.evaluateTransaction('ReadAsset', asset.ID);
    const bcLatency = Date.now() - readStart;
    const bcAsset = JSON.parse(bcResp.toString());

    evaluationSteps.push({
      step: 3,
      action: 'Read Back from Blockchain (Source of Truth)',
      status: 'success',
      blockchainReadLatency: bcLatency,
      data: bcAsset,
      timestamp: Date.now() - startTime
    });

    // Step 4: Rule evaluation
    const ruleResults = [];
    let matchedRule = null;
    let shouldCache = false;
    let cacheDuration = 0;

    for (const [ruleId, rule] of Object.entries(preCachingRules)) {
      const rs = Date.now();
      const matches = rule.check(bcAsset);
      const rLatency = Date.now() - rs;

      ruleResults.push({
        ruleId,
        ruleName: rule.name,
        description: rule.description,
        matches,
        priority: rule.priority,
        evaluationTime: rLatency,
        negative: !!rule.negative
      });

      evaluationSteps.push({
        step: 4 + ruleResults.length,
        action: `Evaluate ${rule.name}`,
        status: matches ? (rule.negative ? 'match-negative' : 'match') : 'no-match',
        ruleDetails: {
          name: rule.name,
          priority: rule.priority,
          result: matches,
          negative: !!rule.negative
        },
        timestamp: Date.now() - startTime
      });

      if (matches && rule.negative) {
        // Negative rule overrides all others
        shouldCache = false;
        matchedRule = rule.name;
        cacheDuration = 0;
        break;
      }

      if (matches && !shouldCache) {
        shouldCache = true;
        matchedRule = rule.name;
        cacheDuration = rule.cacheDuration;
      }
    }

    const client = await getRedisClient();

    if (shouldCache && cacheDuration > 0) {
      evaluationSteps.push({
        step: 10,
        action: 'Decision: PRE-CACHE in Redis',
        status: 'caching',
        reason: `Matched rule: ${matchedRule}`,
        cacheDurationSeconds: cacheDuration,
        timestamp: Date.now() - startTime
      });

      const cacheWriteStart = Date.now();
      await client.setEx(
        `asset:${asset.ID}`,
        cacheDuration,
        JSON.stringify(bcAsset)
      );
      const cacheWriteLatency = Date.now() - cacheWriteStart;

      evaluationSteps.push({
        step: 11,
        action: 'Written to Redis Cache',
        status: 'success',
        cacheWriteLatency,
        timestamp: Date.now() - startTime
      });
    } else {
      evaluationSteps.push({
        step: 10,
        action: 'Decision: KEEP ONLY ON BLOCKCHAIN',
        status: 'skipped',
        reason: matchedRule
          ? `Matched negative rule: ${matchedRule}`
          : 'Did not meet any pre-caching rule',
        timestamp: Date.now() - startTime
      });
    }

    // Benchmark: cache vs blockchain read
    const cacheReadStart = Date.now();
    const cachedData = await client.get(`asset:${asset.ID}`);
    const cacheReadLatency = Date.now() - cacheReadStart;

    const { gateway: gw2, contract: ct2 } = await connectToFabric();
    const bcRead2Start = Date.now();
    await ct2.evaluateTransaction('ReadAsset', asset.ID);
    const bcRead2Latency = Date.now() - bcRead2Start;
    await gw2.disconnect();

    evaluationSteps.push({
      step: 12,
      action: 'Latency Benchmark (Cache vs Blockchain)',
      status: 'complete',
      comparison: {
        cacheLatency: cachedData ? cacheReadLatency : null,
        blockchainLatency: bcRead2Latency,
        speedup: cachedData
          ? (bcRead2Latency / Math.max(cacheReadLatency, 1)).toFixed(1) + 'x'
          : 'N/A'
      },
      timestamp: Date.now() - startTime
    });

    await gateway.disconnect();

    const totalTime = Date.now() - startTime;

    res.json({
      success: true,
      scenario,
      assetId: asset.ID,
      asset: bcAsset,
      decision: shouldCache && cacheDuration > 0 ? 'PRE-CACHED' : 'BLOCKCHAIN_ONLY',
      matchedRule,
      evaluationSteps,
      ruleResults,
      performance: {
        totalProcessingTime: totalTime,
        cacheLatency: cachedData ? cacheReadLatency : null,
        blockchainLatency: bcRead2Latency,
        isCached: !!cachedData
      }
    });
  } catch (err) {
    console.error('Error in live demo:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      evaluationSteps
    });
  }
});

module.exports = router;
