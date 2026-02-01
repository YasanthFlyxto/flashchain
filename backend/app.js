// app.js - COMPLETE SYNCHRONIZED VERSION
const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const smartCache = require('./middleware/cache');
const { PreCachingRulesEngine } = require('./middleware/cache');

const app = express();
app.use(express.json());
const cors = require('cors');
app.use(cors());

let gateway, network, contract, wallet, ccp;

// Cache mode control
let cacheMode = 'adaptive';
let benchmarkRunning = false;
let benchmarkProgress = 0;
let benchmarkResults = null;

// Initialize Pre-Caching Rules Engine
const preCacheRules = new PreCachingRulesEngine();

// Track access patterns for Rule 2
const accessLog = {};

// Pre-caching activity log
let preCacheActivity = [];

// Enhanced tracking for analytics
let preCacheTracking = {
  predictions: [],
  accesses: [],
  ruleStats: {
    'Rule 1': { triggered: 0, accessed: 0, wasted: 0 },
    'Rule 2': { triggered: 0, accessed: 0, wasted: 0 },
    'Rule 3': { triggered: 0, accessed: 0, wasted: 0 },
    'Rule 4': { triggered: 0, accessed: 0, wasted: 0 }
  }
};

// ========================================
// ✨ SHARED ENRICHMENT FUNCTION (DETERMINISTIC)
// ========================================

function enrichAssetWithLocation(asset) {
  const ownerLower = asset.Owner.toLowerCase();
  const isInTransit = ownerLower.includes('transit') || ownerLower.includes('shipping');
  const isNearCustoms = ownerLower.includes('customs');
  const isDelivered = ownerLower.includes('delivered') || ownerLower.includes('warehouse');
  const isRetailer = ownerLower.includes('retailer');

  // Use asset ID hash to generate DETERMINISTIC distance (same asset = same distance)
  const hash = crypto.createHash('md5').update(asset.ID).digest('hex');
  const seed = parseInt(hash.substring(0, 4), 16);

  let checkpointDistance = 9999;
  let destinationDistance = 9999;
  let nextCheckpoint = null;
  let eta = null;

  if (isInTransit) {
    checkpointDistance = (seed % 26) + 5; // 5-30km (deterministic)
    destinationDistance = ((seed * 2) % 60) + 20;
    nextCheckpoint = 'Customs-Delhi';
    eta = new Date(Date.now() + (checkpointDistance * 3 * 60000)).toISOString();
  } else if (isNearCustoms) {
    checkpointDistance = (seed % 13) + 2; // 2-15km
    destinationDistance = ((seed * 2) % 30) + 10;
    nextCheckpoint = 'Customs-Processing';
    eta = new Date(Date.now() + 30 * 60000).toISOString();
  } else if (isRetailer) {
    checkpointDistance = 9999;
    destinationDistance = ((seed * 3) % 40) + 5;
    nextCheckpoint = null;
    eta = new Date(Date.now() + 60 * 60000).toISOString();
  }

  return {
    ...asset,
    Status: isInTransit ? 'In-Transit' :
      isNearCustoms ? 'Customs-Processing' :
        isDelivered ? 'Delivered' :
          isRetailer ? 'At-Retailer' : 'Warehouse',
    CheckpointDistance: checkpointDistance,
    DestinationDistance: destinationDistance,
    NextCheckpoint: nextCheckpoint,
    ETA: eta,
    CreatedAt: new Date(Date.now() - Math.random() * 86400000).toISOString()
  };
}

// Connect to Hyperledger Fabric
async function connectToFabric() {
  try {
    const ccpPath = path.resolve(__dirname, '..', '..', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
    ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const walletPath = path.join(process.cwd(), 'wallet');
    wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get('admin');
    if (!identity) {
      throw new Error('Admin identity not found. Run enrollAdmin.js first');
    }

    gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: 'admin',
      discovery: { enabled: true, asLocalhost: true }
    });

    network = await gateway.getNetwork('mychannel');
    contract = network.getContract('basic');
    console.log('✅ Connected to Fabric network');
  } catch (error) {
    console.error(`❌ Failed to connect: ${error}`);
    throw error;
  }
}

// ========================================
// PRE-CACHING BACKGROUND WORKER (SYNCHRONIZED)
// ========================================

async function preCachingWorker() {
  if (cacheMode !== 'adaptive') {
    return;
  }

  try {
    console.log('🔮 Pre-Caching Worker: Evaluating rules...');

    const result = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(result.toString());

    // ✅ Use shared enrichment function
    const enrichedAssets = allAssets.map(asset => enrichAssetWithLocation(asset));

    // Evaluate rules on enriched assets
    for (const asset of enrichedAssets) {
      const assetAccessLog = accessLog[asset.ID] || [];
      const evaluation = preCacheRules.evaluatePreCachingRules(asset, assetAccessLog);

      if (evaluation.shouldPreCache) {
        const cacheKey = `asset:${asset.ID}`;
        
        await smartCache.cacheWithContext(cacheKey, asset, {
          stakeholderType: 'system',
          preCached: true,
          ttl: evaluation.ttl || 1800
        });

        console.log(`✅ PRE-CACHED: ${asset.ID} | Rule: ${evaluation.triggeredRule} | Distance: ${asset.CheckpointDistance}km | TTL: ${evaluation.ttl}s`);

        // Track prediction
        const prediction = {
          assetId: asset.ID,
          rule: evaluation.triggeredRule,
          reason: evaluation.reason,
          timestamp: Date.now(),
          accessed: false,
          ttl: evaluation.ttl,
          checkpointDistance: asset.CheckpointDistance
        };
        
        preCacheTracking.predictions.push(prediction);
        
        // Update rule stats
        if (preCacheTracking.ruleStats[evaluation.triggeredRule]) {
          preCacheTracking.ruleStats[evaluation.triggeredRule].triggered++;
        }

        // Log activity
        preCacheActivity.unshift({
          assetId: asset.ID,
          rule: evaluation.triggeredRule,
          reason: evaluation.reason,
          ttl: evaluation.ttl,
          timestamp: Date.now(),
          assetValue: asset.AppraisedValue,
          status: asset.Status,
          checkpointDistance: asset.CheckpointDistance,
          stakeholders: evaluation.stakeholders,
          manual: false
        });

        if (preCacheActivity.length > 50) {
          preCacheActivity = preCacheActivity.slice(0, 50);
        }
      }
    }

    // Clean up old predictions
    const oneHourAgo = Date.now() - 3600000;
    preCacheTracking.predictions = preCacheTracking.predictions.filter(p => p.timestamp > oneHourAgo);

    console.log('🔮 Pre-Caching Worker: Cycle complete\n');

  } catch (error) {
    console.error('❌ Pre-Caching Worker Error:', error.message);
  }
}

function startPreCachingWorker() {
  console.log('🔮 Pre-Caching Worker: Started');
  setInterval(preCachingWorker, 120000); // Every 2 minutes
  setTimeout(preCachingWorker, 5000); // Run after 5 seconds
}

// ========================================
// API ENDPOINTS
// ========================================

// Get single asset with caching (ENHANCED TRACKING)
app.get('/api/asset/:id', async (req, res) => {
  const startTime = Date.now();
  const assetId = req.params.id;
  const stakeholderType = req.query.stakeholder || 'default';
  const cacheKey = `asset:${assetId}`;

  try {
    // Track access pattern
    if (!accessLog[assetId]) {
      accessLog[assetId] = [];
    }
    accessLog[assetId].push({
      stakeholder: stakeholderType,
      timestamp: Date.now()
    });

    accessLog[assetId] = accessLog[assetId].filter(
      a => a.timestamp > Date.now() - 86400000
    );

    // Track this access
    preCacheTracking.accesses.push({
      assetId,
      timestamp: Date.now(),
      stakeholder: stakeholderType
    });

    let wasPreCached = false;
    let preCacheRule = null;

    if (cacheMode !== 'disabled') {
      const cached = await smartCache.get(cacheKey);
      if (cached) {
        wasPreCached = cached.preCached || false;
        
        // If it was pre-cached, mark the prediction as successful
        if (wasPreCached) {
          const prediction = preCacheTracking.predictions.find(p => p.assetId === assetId && !p.accessed);
          if (prediction) {
            prediction.accessed = true;
            prediction.accessedAt = Date.now();
            preCacheRule = prediction.rule;
            
            // Update rule stats
            if (preCacheTracking.ruleStats[prediction.rule]) {
              preCacheTracking.ruleStats[prediction.rule].accessed++;
            }
          }
        }
        
        const latency = Date.now() - startTime;
        return res.json({
          success: true,
          source: 'cache',
          latency: `${latency}ms`,
          data: cached.data,
          ttl: cached.ttl,
          stakeholder: stakeholderType,
          cacheMode: cacheMode,
          verified: true,
          preCached: wasPreCached,
          preCacheRule: preCacheRule,
          hash: cached.hash ? cached.hash.substring(0, 16) + '...' : 'N/A'
        });
      }

      smartCache.trackMiss(stakeholderType);
    }

    const result = await contract.evaluateTransaction('ReadAsset', assetId);
    const assetData = JSON.parse(result.toString());

    let appliedTTL = 0;
    const dataHash = smartCache.generateHash(assetData);

    if (cacheMode !== 'disabled') {
      smartCache.setMode(cacheMode);
      await smartCache.cacheWithContext(cacheKey, assetData, { stakeholderType });
      appliedTTL = smartCache.calculateAdaptiveTTL(assetData, stakeholderType);
    }

    const latency = Date.now() - startTime;
    return res.json({
      success: true,
      source: 'blockchain',
      latency: `${latency}ms`,
      data: assetData,
      ttl: appliedTTL,
      stakeholder: stakeholderType,
      cacheMode: cacheMode,
      verified: true,
      preCached: false,
      preCacheRule: null,
      hash: dataHash.substring(0, 16) + '...'
    });

  } catch (error) {
    console.error(`Query failed: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all assets
app.get('/api/assets', async (req, res) => {
  const startTime = Date.now();
  const stakeholder = req.query.stakeholder || 'default';

  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const assets = JSON.parse(result.toString());

    const latency = Date.now() - startTime;
    res.json({
      success: true,
      source: 'blockchain',
      latency: latency,
      data: assets,
      stakeholder
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create shipment
app.post('/api/shipment/create', async (req, res) => {
  const startTime = Date.now();
  const { shipmentId, color, size, owner, value } = req.body;

  try {
    await contract.submitTransaction(
      'CreateAsset',
      shipmentId,
      color,
      size,
      owner || 'Manufacturer',
      value
    );

    const latency = Date.now() - startTime;
    res.json({
      success: true,
      message: `Shipment ${shipmentId} created`,
      latency: latency
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transfer shipment
app.post('/api/shipment/transfer', async (req, res) => {
  const startTime = Date.now();
  const { shipmentId, newOwner } = req.body;

  try {
    await contract.submitTransaction('TransferAsset', shipmentId, newOwner);
    await smartCache.invalidate(`asset:${shipmentId}`);

    const latency = Date.now() - startTime;
    res.json({
      success: true,
      latency: `${latency}ms`,
      message: `Asset ${shipmentId} transferred and cache invalidated`
    });
  } catch (error) {
    console.error(`Transfer failed: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete asset
app.delete('/api/asset/:id', async (req, res) => {
  const startTime = Date.now();
  const assetId = req.params.id;

  try {
    await contract.submitTransaction('DeleteAsset', assetId);
    await smartCache.invalidate(`asset:${assetId}`);

    const latency = Date.now() - startTime;
    res.json({
      success: true,
      latency: `${latency}ms`,
      message: `Asset ${assetId} deleted and cache invalidated`
    });
  } catch (error) {
    console.error(`Delete failed: ${error}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = smartCache.getStats();
    let totalHits = 0;
    let totalMisses = 0;

    Object.values(stats).forEach(s => {
      totalHits += s.hits;
      totalMisses += s.misses;
    });

    const totalQueries = totalHits + totalMisses;
    const cacheHitRate = totalQueries > 0
      ? ((totalHits / totalQueries) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      summary: {
        totalQueries,
        cacheHits: totalHits,
        cacheMisses: totalMisses,
        cacheHitRate: `${cacheHitRate}%`,
        totalPreCached: preCacheActivity.length,
        uptime: `${Math.floor(process.uptime())}s`
      },
      byStakeholder: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pre-caching activity log
app.get('/api/precache/activity', (req, res) => {
  res.json({
    success: true,
    activity: preCacheActivity,
    totalPreCached: preCacheActivity.length
  });
});

// Reset statistics
app.post('/api/stats/reset', async (req, res) => {
  smartCache.resetStats();
  await smartCache.flushAll();
  preCacheActivity = [];
  res.json({ success: true, message: 'Statistics, cache, and pre-cache activity reset' });
});

// Batch query endpoint
app.post('/api/assets/batch', async (req, res) => {
  const startTime = Date.now();
  const { assetIds, stakeholder = 'default' } = req.body;

  if (!assetIds || !Array.isArray(assetIds)) {
    return res.status(400).json({
      success: false,
      error: 'assetIds array required'
    });
  }

  try {
    const results = await Promise.all(
      assetIds.map(async (assetId) => {
        const cacheKey = `asset:${assetId}`;
        const cached = await smartCache.get(cacheKey);

        if (cached) {
          return { assetId, data: cached.data, source: 'cache' };
        }

        try {
          const result = await contract.evaluateTransaction('ReadAsset', assetId);
          const assetData = JSON.parse(result.toString());
          await smartCache.cacheWithContext(cacheKey, assetData, { stakeholderType: stakeholder });
          return { assetId, data: assetData, source: 'blockchain' };
        } catch (error) {
          return { assetId, error: error.message, source: 'error' };
        }
      })
    );

    const latency = Date.now() - startTime;
    const cacheHits = results.filter(r => r.source === 'cache').length;
    const errors = results.filter(r => r.source === 'error').length;

    res.json({
      success: true,
      totalAssets: assetIds.length,
      cacheHits,
      cacheMisses: assetIds.length - cacheHits - errors,
      errors,
      latency: `${latency}ms`,
      avgLatencyPerAsset: `${(latency / assetIds.length).toFixed(2)}ms`,
      results
    });
  } catch (error) {
    console.error('Batch query failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cache mode control
app.post('/api/cache/mode', async (req, res) => {
  const { mode } = req.body;

  if (!['adaptive', 'simple', 'disabled'].includes(mode)) {
    return res.status(400).json({
      success: false,
      error: 'Mode must be: adaptive, simple, or disabled'
    });
  }

  cacheMode = mode;
  smartCache.setMode(mode);
  await smartCache.flushAll();
  console.log(`🔄 Cache mode changed to: ${mode}`);

  res.json({
    success: true,
    mode: cacheMode,
    message: `Cache mode set to ${mode}. Pre-caching worker ${mode === 'adaptive' ? 'ACTIVE' : 'DISABLED'}`
  });
});

app.get('/api/cache/mode', (req, res) => {
  res.json({ mode: cacheMode });
});

// Benchmark simulation
app.post('/api/benchmark/simulate', async (req, res) => {
  const { numQueries = 100, mode = 'adaptive' } = req.body;

  if (benchmarkRunning) {
    return res.status(429).json({
      success: false,
      error: 'Benchmark already running'
    });
  }

  benchmarkRunning = true;
  benchmarkProgress = 0;

  console.log(`🏁 Starting benchmark: ${numQueries} queries in ${mode} mode`);

  cacheMode = mode;
  smartCache.setMode(mode);
  smartCache.resetStats();
  await smartCache.flushAll();

  const results = {
    mode,
    numQueries,
    startTime: Date.now(),
    latencies: [],
    cacheHits: 0,
    cacheMisses: 0
  };

  let assetIds;
  try {
    const allAssetsResult = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(allAssetsResult.toString());
    assetIds = allAssets.map(asset => asset.ID);

    if (assetIds.length === 0) {
      benchmarkRunning = false;
      return res.status(400).json({
        success: false,
        error: 'No assets found in blockchain'
      });
    }

    console.log(`📦 Using ${assetIds.length} real assets`);
  } catch (error) {
    benchmarkRunning = false;
    return res.status(500).json({
      success: false,
      error: `Failed to fetch assets: ${error.message}`
    });
  }

  const stakeholders = ['manufacturer', 'distributor', 'retailer', 'default'];

  try {
    for (let i = 0; i < numQueries; i++) {
      const assetId = assetIds[i % assetIds.length];
      const stakeholder = stakeholders[i % stakeholders.length];
      const cacheKey = `asset:${assetId}`;

      const queryStart = Date.now();

      if (cacheMode !== 'disabled') {
        const cached = await smartCache.get(cacheKey);
        if (cached) {
          results.cacheHits++;
          results.latencies.push(Date.now() - queryStart);
          benchmarkProgress = ((i + 1) / numQueries * 100).toFixed(0);
          continue;
        }

        smartCache.trackMiss(stakeholder);
      }

      try {
        const result = await contract.evaluateTransaction('ReadAsset', assetId);
        const assetData = JSON.parse(result.toString());

        if (cacheMode !== 'disabled') {
          await smartCache.cacheWithContext(cacheKey, assetData, { stakeholderType: stakeholder });
        }

        results.cacheMisses++;
        results.latencies.push(Date.now() - queryStart);
        benchmarkProgress = ((i + 1) / numQueries * 100).toFixed(0);
      } catch (error) {
        console.error(`Query ${i} failed:`, error.message);
      }
    }

    results.endTime = Date.now();
    results.totalTime = results.endTime - results.startTime;
    results.avgLatency = (results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length).toFixed(2);
    results.minLatency = Math.min(...results.latencies);
    results.maxLatency = Math.max(...results.latencies);
    results.tps = (numQueries / (results.totalTime / 1000)).toFixed(2);
    results.cacheHitRate = ((results.cacheHits / numQueries) * 100).toFixed(2);

    benchmarkResults = results;
    benchmarkRunning = false;
    benchmarkProgress = 100;

    console.log(`✅ Benchmark complete: ${results.tps} TPS, ${results.cacheHitRate}% hit rate`);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Benchmark failed:', error);
    benchmarkRunning = false;
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/benchmark/results', (req, res) => {
  if (!benchmarkResults) {
    return res.json({
      success: false,
      message: 'No benchmark results available'
    });
  }

  res.json({
    success: true,
    results: benchmarkResults
  });
});

app.get('/api/benchmark/status', (req, res) => {
  res.json({
    running: benchmarkRunning,
    progress: benchmarkProgress
  });
});

// ✅ SYNCHRONIZED: Get predictions using same enrichment logic
app.get('/api/precache/predictions', async (req, res) => {
  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(result.toString());

    // ✅ Use shared enrichment function
    const enrichedAssets = allAssets.map(asset => enrichAssetWithLocation(asset));

    const predictions = [];
    const now = Date.now();

    for (const asset of enrichedAssets) {
      const checkpointDistance = asset.CheckpointDistance;
      const isInTransit = asset.Status.includes('Transit');
      const value = parseInt(asset.AppraisedValue);

      // Rule 1: Checkpoint Proximity
      if (isInTransit && checkpointDistance < 20) {
        const minutesUntilCheckpoint = Math.floor(checkpointDistance * 3);
        predictions.push({
          assetId: asset.ID,
          event: 'Approaching Checkpoint',
          timeUntil: minutesUntilCheckpoint * 60 * 1000,
          minutesUntil: minutesUntilCheckpoint,
          reason: `${asset.ID} will reach checkpoint in ${minutesUntilCheckpoint} minutes (${checkpointDistance}km away)`,
          rule: 'Rule 1: Checkpoint Proximity',
          checkpointDistance: checkpointDistance,
          eta: new Date(now + minutesUntilCheckpoint * 60000).toISOString(),
          assetValue: asset.AppraisedValue,
          willTrigger: true,
          priority: checkpointDistance < 10 ? 'high' : 'medium'
        });
      }

      // Rule 3: High-Value Near Destination
      if (value > 50000 && asset.DestinationDistance < 50) {
        const minutesUntilAccess = Math.floor(asset.DestinationDistance * 2);
        predictions.push({
          assetId: asset.ID,
          event: 'High-Value Near Destination',
          timeUntil: minutesUntilAccess * 60 * 1000,
          minutesUntil: minutesUntilAccess,
          reason: `High-value asset ($${(value / 1000).toFixed(0)}k) approaching destination (${asset.DestinationDistance}km away)`,
          rule: 'Rule 3: High-Value Asset',
          checkpointDistance: asset.DestinationDistance,
          assetValue: asset.AppraisedValue,
          willTrigger: true,
          priority: 'high'
        });
      }
    }

    predictions.sort((a, b) => a.timeUntil - b.timeUntil);

    res.json({
      success: true,
      predictions: predictions.slice(0, 8),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual pre-cache trigger
app.post('/api/precache/trigger/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;

    const result = await contract.evaluateTransaction('ReadAsset', assetId);
    const asset = JSON.parse(result.toString());

    // ✅ Use shared enrichment function
    const enrichedAsset = enrichAssetWithLocation(asset);

    const assetAccessLog = accessLog[assetId] || [];
    const evaluation = preCacheRules.evaluatePreCachingRules(enrichedAsset, assetAccessLog);

    if (evaluation.shouldPreCache) {
      const cacheKey = `asset:${assetId}`;
      
      await smartCache.cacheWithContext(cacheKey, enrichedAsset, {
        stakeholderType: 'system',
        preCached: true,
        ttl: evaluation.ttl || 1800
      });

      const activity = {
        assetId,
        rule: evaluation.triggeredRule,
        reason: evaluation.reason,
        ttl: evaluation.ttl,
        timestamp: Date.now(),
        assetValue: asset.AppraisedValue,
        status: enrichedAsset.Status,
        checkpointDistance: enrichedAsset.CheckpointDistance,
        stakeholders: evaluation.stakeholders,
        manual: true
      };

      preCacheActivity.unshift(activity);
      if (preCacheActivity.length > 50) preCacheActivity = preCacheActivity.slice(0, 50);

      console.log(`✅ MANUAL PRE-CACHE: ${assetId} | Rule: ${evaluation.triggeredRule}`);

      res.json({
        success: true,
        cached: true,
        evaluation,
        activity,
        message: `Successfully pre-cached ${assetId}`
      });

    } else {
      res.json({
        success: true,
        cached: false,
        evaluation,
        message: `Asset ${assetId} does not meet pre-cache criteria`
      });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compare cache vs blockchain latency
app.get('/api/asset/:id/compare', async (req, res) => {
  const assetId = req.params.id;
  const stakeholder = req.query.stakeholder || 'default';
  
  try {
    // 1. Query from cache
    const cacheKey = `asset:${assetId}`;
    const cacheStart = Date.now();
    const cached = await smartCache.get(cacheKey);
    const cacheLatency = Date.now() - cacheStart;
    
    // 2. Query from blockchain
    const blockchainStart = Date.now();
    const result = await contract.evaluateTransaction('ReadAsset', assetId);
    const assetData = JSON.parse(result.toString());
    const blockchainLatency = Date.now() - blockchainStart;
    
    // Calculate savings
    const savings = cached ? blockchainLatency - cacheLatency : 0;
    const improvement = cached ? ((savings / blockchainLatency) * 100).toFixed(1) : 0;
    const speedup = cached ? (blockchainLatency / cacheLatency).toFixed(1) : 0;
    
    res.json({
      success: true,
      assetId,
      comparison: {
        cached: {
          available: !!cached,
          latency: cacheLatency,
          latencyMs: `${cacheLatency}ms`,
          source: cached ? 'cache' : 'not-cached',
          preCached: cached?.preCached || false,
          age: cached ? Math.floor((Date.now() - cached.cachedAt) / 1000) : null
        },
        blockchain: {
          latency: blockchainLatency,
          latencyMs: `${blockchainLatency}ms`,
          source: 'blockchain'
        },
        improvement: {
          timeSaved: savings,
          timeSavedMs: `${savings}ms`,
          percentFaster: `${improvement}%`,
          speedupFactor: `${speedup}x`
        }
      },
      data: assetData
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get aggregate pre-cache effectiveness metrics
app.get('/api/precache/effectiveness', (req, res) => {
  try {
    const stats = smartCache.getStats();
    
    let preCacheHits = 0;
    let regularCacheHits = 0;
    let cacheMisses = 0;
    
    Object.values(stats).forEach(s => {
      preCacheHits += s.preCached || 0;
      regularCacheHits += (s.hits - (s.preCached || 0));
      cacheMisses += s.misses;
    });
    
    const totalQueries = preCacheHits + regularCacheHits + cacheMisses;
    const preCacheRate = totalQueries > 0 
      ? ((preCacheHits / totalQueries) * 100).toFixed(1) 
      : 0;
    
    // Estimated time savings
    const avgCacheLatency = 5;
    const avgBlockchainLatency = 280;
    const timeSavedPreCached = preCacheHits * (avgBlockchainLatency - avgCacheLatency);
    const timeSavedRegular = regularCacheHits * (avgBlockchainLatency - avgCacheLatency);
    
    res.json({
      success: true,
      effectiveness: {
        preCacheHits,
        regularCacheHits,
        cacheMisses,
        totalQueries,
        preCacheRate: `${preCacheRate}%`,
        avgLatencyPreCached: `${avgCacheLatency}ms`,
        avgLatencyRegular: `${avgCacheLatency}ms`,
        avgLatencyBlockchain: `${avgBlockchainLatency}ms`,
        timeSavedPreCached: `${(timeSavedPreCached / 1000).toFixed(2)}s`,
        timeSavedRegular: `${(timeSavedRegular / 1000).toFixed(2)}s`,
        totalTimeSaved: `${((timeSavedPreCached + timeSavedRegular) / 1000).toFixed(2)}s`
      },
      byStakeholder: stats
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// ANALYTICS ENDPOINTS
// ========================================

// Get pre-cache accuracy metrics
app.get('/api/analytics/accuracy', (req, res) => {
  try {
    const predictions = preCacheTracking.predictions;
    const totalPredictions = predictions.length;
    const accessedPredictions = predictions.filter(p => p.accessed).length;
    const wastedPredictions = predictions.filter(p => !p.accessed && (Date.now() - p.timestamp > 600000)).length;
    
    const accuracy = totalPredictions > 0 
      ? ((accessedPredictions / totalPredictions) * 100).toFixed(1)
      : 0;
    
    const wasteRate = totalPredictions > 0
      ? ((wastedPredictions / totalPredictions) * 100).toFixed(1)
      : 0;

    // Calculate rule effectiveness
    const ruleEffectiveness = {};
    Object.entries(preCacheTracking.ruleStats).forEach(([rule, stats]) => {
      const total = stats.triggered;
      const successful = stats.accessed;
      const wasted = stats.triggered - stats.accessed;
      const effectiveness = total > 0 ? ((successful / total) * 100).toFixed(1) : 0;
      
      ruleEffectiveness[rule] = {
        triggered: total,
        accessed: successful,
        wasted: wasted,
        effectiveness: `${effectiveness}%`
      };
    });

    res.json({
      success: true,
      accuracy: {
        totalPredictions,
        correctPredictions: accessedPredictions,
        wastedPredictions,
        accuracyRate: `${accuracy}%`,
        wasteRate: `${wasteRate}%`
      },
      ruleEffectiveness,
      recentPredictions: predictions.slice(-10).reverse()
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ FIXED: Scenario-based benchmark with proper boolean comparison
app.post('/api/analytics/scenario-test', async (req, res) => {
  const { scenario } = req.body;
  
  try {
    let testAssets = [];
    let expectedPreCache = [];
    
    // Define test scenarios
    switch (scenario) {
      case 'checkpoint_proximity':
        testAssets = [
          { id: 'TEST_CP001', owner: 'Customs-Transit-Approaching', value: 30000 },
          { id: 'TEST_CP002', owner: 'Distributor-Transit-Checkpoint', value: 45000 },
          { id: 'TEST_CP003', owner: 'Warehouse-Static', value: 25000 }
        ];
        expectedPreCache = ['TEST_CP001', 'TEST_CP002'];
        break;
        
      case 'high_value':
        testAssets = [
          { id: 'TEST_HV001', owner: 'Retailer-NearDestination', value: 75000 },
          { id: 'TEST_HV002', owner: 'Distributor-Transit', value: 90000 },
          { id: 'TEST_HV003', owner: 'Manufacturer', value: 15000 }
        ];
        expectedPreCache = ['TEST_HV001', 'TEST_HV002'];
        break;
        
      case 'multi_access':
        testAssets = [
          { id: 'TEST_MA001', owner: 'Distributor', value: 40000 }
        ];
        accessLog['TEST_MA001'] = [
          { stakeholder: 'manufacturer', timestamp: Date.now() - 500000 },
          { stakeholder: 'distributor', timestamp: Date.now() - 300000 },
          { stakeholder: 'retailer', timestamp: Date.now() - 100000 },
          { stakeholder: 'customs', timestamp: Date.now() - 50000 }
        ];
        expectedPreCache = ['TEST_MA001'];
        break;
        
      default:
        return res.status(400).json({ success: false, error: 'Unknown scenario' });
    }
    
    // Create or update test assets
    for (const asset of testAssets) {
      try {
        await contract.submitTransaction(
          'CreateAsset',
          asset.id,
          'TestProduct',
          '100',
          asset.owner,
          asset.value.toString()
        );
        console.log(`✅ Created test asset: ${asset.id}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`ℹ️  Test asset ${asset.id} already exists - updating`);
          try {
            await contract.submitTransaction(
              'UpdateAsset',
              asset.id,
              'TestProduct',
              '100',
              asset.owner,
              asset.value.toString()
            );
          } catch (updateError) {
            console.log(`⚠️  Could not update ${asset.id}`);
          }
        }
      }
    }
    
    // Clear cache for test assets
    for (const asset of testAssets) {
      await smartCache.invalidate(`asset:${asset.id}`);
    }
    console.log('🧹 Cleared cache for test assets');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Trigger pre-cache worker
    await preCachingWorker();
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ✅ FIXED: Check which assets were pre-cached with proper boolean comparison
    const results = [];
    for (const asset of testAssets) {
      const cacheKey = `asset:${asset.id}`;
      const cached = await smartCache.get(cacheKey);
      
      // ✅ Ensure wasPreCached is always a boolean
      const wasPreCached = cached ? (cached.preCached === true) : false;
      const expected = expectedPreCache.includes(asset.id);
      
      results.push({
        assetId: asset.id,
        expectedPreCache: expected,
        actuallyPreCached: wasPreCached,
        correct: expected === wasPreCached, // Now this works correctly!
        rule: cached?.data?.preCacheRule || null
      });
    }
    
    // Measure latency
    const latencyResults = [];
    for (const asset of testAssets) {
      const cacheKey = `asset:${asset.id}`;
      
      const cacheStart = Date.now();
      const cached = await smartCache.get(cacheKey);
      const cacheLatency = Date.now() - cacheStart;
      
      const blockchainStart = Date.now();
      await contract.evaluateTransaction('ReadAsset', asset.id);
      const blockchainLatency = Date.now() - blockchainStart;
      
      latencyResults.push({
        assetId: asset.id,
        cacheLatency: cached ? cacheLatency : null,
        blockchainLatency,
        improvement: cached ? ((blockchainLatency - cacheLatency) / blockchainLatency * 100).toFixed(1) : 0,
        wasPreCached: cached ? (cached.preCached === true) : false
      });
    }
    
    const correctPredictions = results.filter(r => r.correct).length;
    const accuracy = (correctPredictions / results.length * 100).toFixed(1);
    
    res.json({
      success: true,
      scenario,
      testResults: results,
      latencyComparison: latencyResults,
      accuracy: `${accuracy}%`,
      correctPredictions,
      totalTests: results.length
    });
    
  } catch (error) {
    console.error('Scenario test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset analytics tracking
app.post('/api/analytics/reset', async (req, res) => {
  try {
    preCacheTracking = {
      predictions: [],
      accesses: [],
      ruleStats: {
        'Rule 1': { triggered: 0, accessed: 0, wasted: 0 },
        'Rule 2': { triggered: 0, accessed: 0, wasted: 0 },
        'Rule 3': { triggered: 0, accessed: 0, wasted: 0 },
        'Rule 4': { triggered: 0, accessed: 0, wasted: 0 }
      }
    };
    
    res.json({
      success: true,
      message: 'Analytics tracking reset'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear everything
app.post('/api/system/reset', async (req, res) => {
  try {
    await smartCache.flushAll();
    smartCache.resetStats();
    preCacheActivity = [];
    Object.keys(accessLog).forEach(key => delete accessLog[key]);
    
    preCacheTracking = {
      predictions: [],
      accesses: [],
      ruleStats: {
        'Rule 1': { triggered: 0, accessed: 0, wasted: 0 },
        'Rule 2': { triggered: 0, accessed: 0, wasted: 0 },
        'Rule 3': { triggered: 0, accessed: 0, wasted: 0 },
        'Rule 4': { triggered: 0, accessed: 0, wasted: 0 }
      }
    };
    
    console.log('🧹 SYSTEM RESET: All cache and stats cleared');
    
    res.json({
      success: true,
      message: 'All cache, statistics, and activity logs cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simulate event
app.post('/api/simulate/event', async (req, res) => {
  try {
    const { scenario } = req.body;

    let assetId, updates;

    switch (scenario) {
      case 'approaching_checkpoint':
        assetId = 'SHIP004';
        updates = { Owner: 'Customs-Approaching' };
        break;
      case 'high_value_transit':
        assetId = 'SHIP006';
        updates = { Owner: 'Distributor-Transit-Express' };
        break;
      case 'multi_access':
        assetId = 'SHIP001';
        accessLog[assetId] = accessLog[assetId] || [];
        accessLog[assetId].push(
          { role: 'manufacturer', timestamp: Date.now() - 600000 },
          { role: 'distributor', timestamp: Date.now() - 300000 },
          { role: 'retailer', timestamp: Date.now() - 100000 }
        );
        break;
      default:
        return res.status(400).json({ success: false, error: 'Unknown scenario' });
    }

    if (updates) {
      const asset = JSON.parse((await contract.evaluateTransaction('ReadAsset', assetId)).toString());

      await contract.submitTransaction(
        'UpdateAsset',
        assetId,
        asset.Color,
        asset.Size.toString(),
        updates.Owner || asset.Owner,
        asset.AppraisedValue.toString()
      );
    }

    setTimeout(() => preCachingWorker(), 500);

    res.json({
      success: true,
      scenario,
      assetId,
      message: `Simulated ${scenario} for ${assetId}. Pre-cache worker triggered.`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
async function startServer() {
  try {
    await smartCache.connect();
    await connectToFabric();

    startPreCachingWorker();

    const PORT = 4000;
    app.listen(PORT, () => {
      console.log(`🚀 FlashChain API running on http://localhost:${PORT}`);
      console.log(`📊 Test: http://localhost:${PORT}/api/assets`);
      console.log(`🔮 Pre-Caching Worker: Active (deterministic enrichment)`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

startServer();
