// app.js - Policy-Based Pre-Caching System

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

// Worker control
let workerEnabled = false;
let workerInterval = null;


// Initialize Pre-Caching Rules Engine
const preCacheRules = new PreCachingRulesEngine();

// Track access patterns for Rule 2 (multi-stakeholder detection)
const accessLog = {};

// Pre-caching activity log
let preCacheActivity = [];

// ========================================
// ASSET ENRICHMENT FUNCTION
// ========================================

function enrichAssetWithLocation(asset) {
  const ownerLower = asset.Owner.toLowerCase();

  // Determine status (only 3 statuses)
  const isDisputed = ownerLower.includes('dispute') || ownerLower.includes('contested');
  const isInTransit = ownerLower.includes('transit') || ownerLower.includes('shipping');
  // Everything else is Delivered (final state)

  const isTestAsset = asset.ID.startsWith('TEST_') ||
    asset.ID.startsWith('JOURNEY_') ||
    asset.ID.startsWith('BENCH_') ||
    asset.ID.startsWith('DEMO_');

  let checkpointDistance = 9999;
  let destinationDistance = 9999;
  let nextCheckpoint = null;
  let eta = null;
  let checkpointRequiresDocs = false;

  if (isTestAsset) {
    // Controlled distances for test assets
    if (ownerLower.includes('approaching') || ownerLower.includes('checkpoint')) {
      checkpointDistance = 10;
      destinationDistance = 30;
      nextCheckpoint = 'Customs-Delhi';
      eta = new Date(Date.now() + 30 * 60000).toISOString();
      checkpointRequiresDocs = true;
    } else if (ownerLower.includes('neardestination')) {
      checkpointDistance = 9999;
      destinationDistance = 15;
      nextCheckpoint = null;
      eta = new Date(Date.now() + 30 * 60000).toISOString();
      checkpointRequiresDocs = false;
    } else if (ownerLower.includes('delivered') || ownerLower.includes('warehouse') || ownerLower.includes('static')) {
      checkpointDistance = 9999;
      destinationDistance = 9999;
      nextCheckpoint = null;
      eta = null;
      checkpointRequiresDocs = false;
    } else if (ownerLower.includes('highway') || ownerLower.includes('midjourney')) {
      checkpointDistance = 250;
      destinationDistance = 300;
      nextCheckpoint = null;
      eta = null;
      checkpointRequiresDocs = false;
    } else if (isInTransit) {
      checkpointDistance = 12;
      destinationDistance = 40;
      nextCheckpoint = 'Customs-Processing';
      eta = new Date(Date.now() + 36 * 60000).toISOString();
      checkpointRequiresDocs = true;
    }
  } else {
    // Real assets use deterministic hash-based distances
    const hash = crypto.createHash('md5').update(asset.ID).digest('hex');
    const seed = parseInt(hash.substring(0, 4), 16);

    if (isInTransit && !isDisputed) {
      checkpointDistance = (seed % 26) + 5;
      destinationDistance = ((seed * 2) % 60) + 20;
      nextCheckpoint = 'Customs-Delhi';
      eta = new Date(Date.now() + (checkpointDistance * 3 * 60000)).toISOString();
      checkpointRequiresDocs = true;
    }
  }

  // Simple 3-status logic
  let status = 'Delivered'; // Default
  if (isDisputed) {
    status = 'DISPUTED';
  } else if (isInTransit) {
    status = 'In-Transit';
  }

  return {
    ...asset,
    Status: status,
    CheckpointDistance: checkpointDistance,
    DestinationDistance: destinationDistance,
    NextCheckpoint: nextCheckpoint,
    ETA: eta,
    CheckpointRequiresDocs: checkpointRequiresDocs,
    CreatedAt: new Date(Date.now() - Math.random() * 86400000).toISOString()
  };
}


// ========================================
// FABRIC CONNECTION
// ========================================

async function connectToFabric() {
  try {
    const ccpPath = path.resolve(__dirname, '..', '..', 'fabric-samples', 'test-network',
      'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
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
    console.log('[Fabric] Connected to network successfully');
  } catch (error) {
    console.error('[Fabric] Connection failed:', error.message);
    throw error;
  }
}

// ========================================
// POLICY-BASED BACKGROUND PRE-CACHE WORKER
// ========================================

async function getShipmentsByStatus(statusFilter) {
  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(result.toString());

    return allAssets.filter(asset => {
      const enriched = enrichAssetWithLocation(asset);
      if (Array.isArray(statusFilter)) {
        return statusFilter.includes(enriched.Status);
      }
      return enriched.Status === statusFilter;
    });
  } catch (error) {
    console.error('[Worker] Error fetching shipments:', error.message);
    return [];
  }
}

async function runBackgroundPrecacheWorker() {
  const startTime = Date.now();
  const result = {
    processed: 0,
    preCached: 0,
    skipped: 0,
    errors: 0,
    activities: [],
    inTransitCount: 0,
    disputedCount: 0,
    alreadyCached: 0  // ← Add this counter
  };

  try {
    console.log('[Worker] Starting policy-based pre-cache scan');

    const inTransitShipments = await getShipmentsByStatus('In-Transit');
    const disputedShipments = await getShipmentsByStatus('DISPUTED');

    result.inTransitCount = inTransitShipments.length;
    result.disputedCount = disputedShipments.length;

    console.log(`[Worker] Found ${result.inTransitCount} IN_TRANSIT, ${result.disputedCount} DISPUTED shipments`);

    const candidates = [
      ...inTransitShipments.map(a => ({ asset: a, policy: 'IN_TRANSIT' })),
      ...disputedShipments.map(a => ({ asset: a, policy: 'DISPUTED' }))
    ];

    for (const entry of candidates) {
      const { asset, policy } = entry;

      try {
        const enriched = enrichAssetWithLocation(asset);
        const assetId = enriched.ID;
        const assetAccessLog = accessLog[assetId] || [];

        // Evaluate rules
        let evaluation = preCacheRules.evaluatePreCachingRules(enriched, assetAccessLog);

        // Policy override: DISPUTED shipments always pre-cache
        if (policy === 'DISPUTED' && !evaluation.shouldPreCache) {
          evaluation = {
            shouldPreCache: true,
            triggeredRule: 'Policy 01',
            ruleName: 'Disputed Shipment (Always Pre-Cache)',
            ttl: 24 * 60 * 60,
            reason: 'Shipment is under dispute - policy requires full pre-cache',
            policyTag: 'DISPUTED',
            priority: 'HIGH'
          };
        }

        if (!evaluation.shouldPreCache) {
          result.skipped++;
          continue;
        }

        // ✅ CHECK IF ALREADY CACHED BEFORE WRITING
        const cacheKey = `asset:${assetId}`;
        const existingCache = await smartCache.get(cacheKey);

        if (existingCache && existingCache.preCached) {
          result.alreadyCached++;
          console.log(`[Worker] Skipped ${assetId} - already pre-cached`);
          continue; // Skip - already in cache
        }

        // Write to Redis (only if not already cached)
        await smartCache.cacheWithContext(cacheKey, enriched, {
          preCached: true,
          ttl: evaluation.ttl
        });

        const activity = {
          assetId,
          policy,
          rule: evaluation.triggeredRule,
          ruleName: evaluation.ruleName,
          reason: evaluation.reason,
          ttl: evaluation.ttl,
          timestamp: Date.now(),
          assetValue: enriched.AppraisedValue,
          status: enriched.Status,
          checkpointDistance: enriched.CheckpointDistance,
          destinationDistance: enriched.DestinationDistance,
          priority: evaluation.priority,
          manual: false
        };

        preCacheActivity.unshift(activity);
        if (preCacheActivity.length > 100) {
          preCacheActivity = preCacheActivity.slice(0, 100);
        }

        result.preCached++;
        result.activities.push(activity);
        result.processed++;

      } catch (error) {
        console.error(`[Worker] Error processing ${asset.ID}:`, error.message);
        result.errors++;
      }
    }

    result.durationMs = Date.now() - startTime;
    console.log(`[Worker] Scan complete: ${result.preCached} pre-cached, ${result.alreadyCached} already cached, ${result.skipped} skipped (${result.durationMs}ms)`);

  } catch (error) {
    console.error('[Worker] Background worker error:', error.message);
  }

  return result;
}


// Start/stop worker control
function startPreCachingWorker() {
  console.log('[Worker] Background worker started (2-minute interval)');

  // Run worker function with enabled check
  const workerTask = async () => {
    if (workerEnabled) {
      await runBackgroundPrecacheWorker();
    } else {
      console.log('[Worker] Skipped (paused)');
    }
  };

  workerInterval = setInterval(workerTask, 5000); // Every 5 secs 
  setTimeout(workerTask, 5000); // First run after 5 seconds
}

function stopPreCachingWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[Worker] Background worker stopped');
  }
}


// Manual trigger endpoint
app.post('/api/precache/run-worker-once', async (req, res) => {
  try {
    console.log('[API] Manual worker trigger received');
    const result = await runBackgroundPrecacheWorker();
    res.json({ success: true, result });
  } catch (error) {
    console.error('[API] Worker trigger failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// API ENDPOINTS
// ========================================

// Get single asset with caching
app.get('/api/asset/:id', async (req, res) => {
  const startTime = Date.now();
  const assetId = req.params.id;
  const stakeholderType = req.query.stakeholder || 'default';
  const cacheKey = `asset:${assetId}`;

  try {
    // Track access for Rule 2
    if (!accessLog[assetId]) {
      accessLog[assetId] = [];
    }
    accessLog[assetId].push({
      stakeholder: stakeholderType,
      timestamp: Date.now()
    });

    // Keep only last 24 hours
    accessLog[assetId] = accessLog[assetId].filter(
      a => a.timestamp > Date.now() - 86400000
    );

    // Check cache
    const cached = await smartCache.get(cacheKey);
    if (cached) {
      const latency = Date.now() - startTime;
      return res.json({
        success: true,
        source: 'cache',
        latency: `${latency}ms`,
        data: cached.data,
        preCached: cached.preCached || false,
        cacheAge: Math.floor((Date.now() - cached.cachedAt) / 1000)
      });
    }

    // Cache miss - query blockchain
    const result = await contract.evaluateTransaction('ReadAsset', assetId);
    const assetData = JSON.parse(result.toString());

    // Cache for future (on-demand caching)
    await smartCache.cacheWithContext(cacheKey, assetData, {
      preCached: false,
      ttl: 300 // 5 minutes default for on-demand
    });

    const latency = Date.now() - startTime;
    return res.json({
      success: true,
      source: 'blockchain',
      latency: `${latency}ms`,
      data: assetData,
      preCached: false
    });

  } catch (error) {
    console.error('[API] Query failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all assets
app.get('/api/assets', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const assets = JSON.parse(result.toString());

    const latency = Date.now() - startTime;
    res.json({
      success: true,
      source: 'blockchain',
      latency,
      data: assets
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create shipment
// Create shipment
// Create shipment
app.post('/api/shipment/create', async (req, res) => {
  try {
    const { shipmentId, color, size, owner, value } = req.body;

    // Determine proper Status format
    let status = 'Delivered';
    if (owner.includes('Disputed')) {
      status = 'DISPUTED';
    } else if (owner.includes('Transit')) {
      status = 'In-Transit';
    } else if (owner.includes('Delivered')) {
      status = 'Delivered';
    }

    await contract.submitTransaction(
      'CreateAsset',
      shipmentId,
      color,
      size,
      owner,
      value,
      status
    );

    res.json({
      success: true,
      assetId: shipmentId,
      status: status,
      message: 'Shipment created successfully'
    });

  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});




// Transfer shipment
app.post('/api/shipment/transfer', async (req, res) => {
  const { shipmentId, newOwner } = req.body;

  try {
    await contract.submitTransaction('TransferAsset', shipmentId, newOwner);
    await smartCache.invalidate(`asset:${shipmentId}`);

    res.json({
      success: true,
      message: `Asset ${shipmentId} transferred and cache invalidated`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete asset
app.delete('/api/asset/:id', async (req, res) => {
  const assetId = req.params.id;

  try {
    await contract.submitTransaction('DeleteAsset', assetId);
    await smartCache.invalidate(`asset:${assetId}`);

    res.json({
      success: true,
      message: `Asset ${assetId} deleted and cache invalidated`
    });
  } catch (error) {
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
    const totalQueries = stats.hits + stats.misses;
    const cacheHitRate = totalQueries > 0
      ? ((stats.hits / totalQueries) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      summary: {
        totalQueries,
        cacheHits: stats.hits,
        cacheMisses: stats.misses,
        cacheHitRate: `${cacheHitRate}%`,
        preCachedWrites: stats.preCachedWrites,
        totalPreCached: preCacheActivity.length,
        uptime: `${Math.floor(process.uptime())}s`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pre-caching activity log - now reads from Redis
app.get('/api/precache/activity', async (req, res) => {
  try {
    // Get all cached asset keys from Redis using the new method
    const keys = await smartCache.getAllAssetKeys();

    const activities = [];

    for (const key of keys) {
      const cached = await smartCache.get(key);

      // Only include pre-cached items (not on-demand cached)
      if (cached && cached.preCached) {
        const assetId = key.replace('asset:', '');

        activities.push({
          assetId,
          policy: cached.data.Status === 'DISPUTED' ? 'DISPUTED' : 'IN_TRANSIT',
          rule: cached.triggeredRule || 'Unknown',
          ruleName: cached.ruleName || 'Pre-cached',
          reason: cached.reason || 'Hot asset pre-cached',
          ttl: cached.ttl || 3600,
          timestamp: cached.cachedAt,
          assetValue: cached.data.AppraisedValue,
          status: cached.data.Status,
          checkpointDistance: cached.data.CheckpointDistance || 0,
          destinationDistance: cached.data.DestinationDistance || 0,
          priority: cached.priority || 'MEDIUM',
          manual: false,
          age: Math.floor((Date.now() - cached.cachedAt) / 1000)
        });
      }
    }

    // Sort by timestamp (newest first)
    activities.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      activity: activities,
      totalPreCached: activities.length
    });

  } catch (error) {
    console.error('[API] Error fetching activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



// Reset statistics
app.post('/api/stats/reset', async (req, res) => {
  smartCache.resetStats();
  await smartCache.flushAll();
  preCacheActivity = [];
  res.json({ success: true, message: 'Statistics and cache reset' });
});

// Compare cache vs blockchain latency
app.get('/api/asset/:id/compare', async (req, res) => {
  const assetId = req.params.id;

  try {
    const cacheKey = `asset:${assetId}`;

    // Measure cache lookup time with high precision
    const cacheStart = performance.now();
    const cached = await smartCache.get(cacheKey);
    const cacheLookupTime = performance.now() - cacheStart;

    // Measure blockchain query time with high precision
    const blockchainStart = performance.now();
    const result = await contract.evaluateTransaction('ReadAsset', assetId);
    const assetData = JSON.parse(result.toString());
    const pureBlockchainLatency = performance.now() - blockchainStart;

    // Only report cache latency if it was a HIT, otherwise null
    const pureCacheLatency = cached ? cacheLookupTime : null;

    const savings = cached ? pureBlockchainLatency - pureCacheLatency : 0;
    const improvement = cached ? ((savings / pureBlockchainLatency) * 100).toFixed(1) : 0;
    const speedup = cached && pureCacheLatency > 0 ? (pureBlockchainLatency / pureCacheLatency).toFixed(1) : 0;

    res.json({
      success: true,
      assetId,
      comparison: {
        cached: {
          available: !!cached,
          latency: pureCacheLatency, // ← Now has decimal precision
          latencyMs: pureCacheLatency ? `${pureCacheLatency.toFixed(2)}ms` : 'N/A',
          preCached: cached?.preCached || false,
          age: cached ? Math.floor((Date.now() - cached.cachedAt) / 1000) : null
        },
        blockchain: {
          latency: pureBlockchainLatency, // ← Now has decimal precision
          latencyMs: `${pureBlockchainLatency.toFixed(2)}ms`
        },
        improvement: {
          timeSaved: savings,
          timeSavedMs: `${savings.toFixed(2)}ms`,
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



// Get testlab assets with enrichment
app.get('/api/testlab/assets', async (req, res) => {
  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(result.toString());

    const enrichedAssets = allAssets.map(asset => {
      const enriched = enrichAssetWithLocation(asset);
      const assetAccessLog = accessLog[asset.ID] || [];
      const evaluation = preCacheRules.evaluatePreCachingRules(enriched, assetAccessLog);

      return {
        ...enriched,
        isTestAsset: asset.ID.startsWith('TEST_') ||
          asset.ID.startsWith('JOURNEY_') ||
          asset.ID.startsWith('BENCH_') ||
          asset.ID.startsWith('DEMO_'),
        willPreCache: evaluation.shouldPreCache,
        triggeredRule: evaluation.triggeredRule,
        ruleReason: evaluation.reason,
        priority: evaluation.priority || 'none'
      };
    });

    // Check cache status
    for (const asset of enrichedAssets) {
      const cacheKey = `asset:${asset.ID}`;
      const cached = await smartCache.get(cacheKey);
      asset.cachedStatus = cached ? {
        isPreCached: cached.preCached === true,
        cachedAt: cached.cachedAt,
        age: Math.floor((Date.now() - cached.cachedAt) / 1000)
      } : null;
    }

    res.json({
      success: true,
      assets: enrichedAssets,
      timestamp: Date.now()
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// System reset
app.post('/api/system/reset', async (req, res) => {
  try {
    await smartCache.flushAll();
    smartCache.resetStats();
    preCacheActivity = [];
    Object.keys(accessLog).forEach(key => delete accessLog[key]);

    console.log('[System] Complete reset executed');

    res.json({
      success: true,
      message: 'All cache, statistics, and activity logs cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all test/benchmark assets from blockchain
app.post('/api/system/clear-test-assets', async (req, res) => {
  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(result.toString());

    let deleted = 0;
    let errors = 0;

    for (const asset of allAssets) {
      // Only delete test/benchmark assets, keep real ones
      if (
        asset.ID.startsWith('TEST_') ||
        asset.ID.startsWith('BENCH_') ||
        asset.ID.startsWith('DEMO_') ||
        asset.ID.startsWith('JOURNEY_') ||
        asset.ID.startsWith('LIVE_') ||
        asset.ID.startsWith('WALMART_') ||
        asset.ID.startsWith('CUSTOM_') ||
        asset.ID.startsWith('SHIP') ||
        asset.ID.startsWith('asset')
      ) {
        try {
          await contract.submitTransaction('DeleteAsset', asset.ID);
          deleted++;
        } catch (err) {
          console.error(`[Cleanup] Failed to delete ${asset.ID}:`, err.message);
          errors++;
        }
      }
    }

    console.log(`[Cleanup] Deleted ${deleted} test assets, ${errors} errors`);

    res.json({
      success: true,
      deleted,
      errors,
      message: `Cleaned up ${deleted} test/benchmark assets`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear ALL assets (use with caution)
app.post('/api/system/clear-all-assets', async (req, res) => {
  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const allAssets = JSON.parse(result.toString());

    let deleted = 0;

    for (const asset of allAssets) {
      try {
        await contract.submitTransaction('DeleteAsset', asset.ID);
        deleted++;
      } catch (err) {
        console.error(`[Cleanup] Failed to delete ${asset.ID}:`, err.message);
      }
    }

    console.log(`[Cleanup] Deleted all ${deleted} assets`);

    res.json({
      success: true,
      deleted,
      message: `Deleted all ${deleted} assets from blockchain`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle worker on/off
app.post('/api/worker/toggle', (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'enabled must be boolean'
    });
  }

  workerEnabled = enabled;
  console.log(`[Worker] ${enabled ? 'RESUMED' : 'PAUSED'}`);

  res.json({
    success: true,
    workerEnabled,
    message: `Worker ${enabled ? 'resumed' : 'paused'}`
  });
});

app.get('/api/worker/status', (req, res) => {
  res.json({
    success: true,
    workerEnabled,
    uptime: Math.floor(process.uptime())
  });
});

// Get asset counts
// Get asset counts (hot vs cold)
// Get asset counts (hot vs cold)
app.get('/api/assets/count', async (req, res) => {
  try {
    const result = await contract.evaluateTransaction('GetAllAssets');
    const assets = JSON.parse(result.toString());

    let total = assets.length;
    let hot = 0;
    let cold = 0;

    for (const asset of assets) {
      const parsedAsset = typeof asset === 'string' ? JSON.parse(asset) : asset;

      // Count by Status field - works for ALL shipments (BENCH_, CUSTOM_, etc.)
      if (parsedAsset.Status === 'In-Transit' || parsedAsset.Status === 'DISPUTED') {
        hot++;
      } else if (parsedAsset.Status === 'Delivered') {
        cold++;
      } else {
        // Any other status counts as cold
        cold++;
      }
    }

    res.json({
      success: true,
      total,
      hot,
      cold
    });

  } catch (error) {
    console.error('Error getting asset counts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});





// ========================================
// START SERVER
// ========================================

async function startServer() {
  try {
    await smartCache.connect();
    await connectToFabric();

    startPreCachingWorker();

    const PORT = 4000;
    app.listen(PORT, () => {
      console.log(`[Server] FlashChain API running on http://localhost:${PORT}`);
      console.log(`[Server] Dashboard: http://localhost:3000`);
      console.log(`[Worker] Pre-caching worker active`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

startServer();
