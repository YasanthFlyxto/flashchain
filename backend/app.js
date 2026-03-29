// app.js - Policy-Based Pre-Caching System

const express = require('express');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const smartCache = require('./middleware/cache');
const { PreCachingRulesEngine } = require('./middleware/cache');
const AdaptiveTuner = require('./middleware/adaptiveTuner');

// ========================================
// INDUSTRY PRESETS
// ========================================

const INDUSTRY_PRESETS = {
  'general-logistics': {
    label: 'General Logistics',
    description: 'Standard logistics operations - balanced thresholds for most supply chains',
    rule1: { checkpointDistanceKm: 20, etaMinutes: 60, ttlMinutes: 30 },
    rule2: { accessCountThreshold: 3, minOrganizations: 2, windowHours: 1, ttlHours: 24 },
    rule3: { valueThresholdUsd: 50000, destDistanceKm: 50, ttlMinutes: 45 },
    rule4: { minCheckpointDistanceKm: 200, minDestDistanceKm: 200, maxNormalAccesses: 3 }
  },
  'pharmaceutical': {
    label: 'Pharmaceutical',
    description: 'Temperature-sensitive, high-compliance cargo - wider proximity windows, stricter access detection',
    rule1: { checkpointDistanceKm: 30, etaMinutes: 90, ttlMinutes: 60 },
    rule2: { accessCountThreshold: 2, minOrganizations: 2, windowHours: 1, ttlHours: 48 },
    rule3: { valueThresholdUsd: 10000, destDistanceKm: 100, ttlMinutes: 60 },
    rule4: { minCheckpointDistanceKm: 300, minDestDistanceKm: 300, maxNormalAccesses: 2 }
  },
  'food-beverage': {
    label: 'Food & Beverage',
    description: 'Perishable goods - tight time windows, aggressive caching for freshness compliance',
    rule1: { checkpointDistanceKm: 10, etaMinutes: 30, ttlMinutes: 15 },
    rule2: { accessCountThreshold: 5, minOrganizations: 3, windowHours: 1, ttlHours: 12 },
    rule3: { valueThresholdUsd: 100000, destDistanceKm: 30, ttlMinutes: 30 },
    rule4: { minCheckpointDistanceKm: 150, minDestDistanceKm: 150, maxNormalAccesses: 4 }
  }
};

const app = express();
app.use(cors());
app.use(express.json());

let gateway, network, contract, wallet, ccp;

// Worker control
let workerEnabled = false;
let workerInterval = null;


// Initialize Pre-Caching Rules Engine
const preCacheRules = new PreCachingRulesEngine();

// Initialize Adaptive Tuner - wired to rules engine + cache
const adaptiveTuner = new AdaptiveTuner(preCacheRules, smartCache);

// Track access patterns for Rule 2 (multi-stakeholder detection)
const accessLog = {};

// Pre-caching activity log
let preCacheActivity = [];

// Last evaluation result (for CSV/JSON export)
let lastEvaluationResult = null;

// ========================================
// STATISTICS HELPER
// ========================================

function calcStats(arr) {
  const n = arr.length;
  if (n === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((s, v) => s + v, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const ci95 = 1.96 * (stddev / Math.sqrt(n));
  return {
    avg: parseFloat(avg.toFixed(2)),
    stddev: parseFloat(stddev.toFixed(2)),
    ci95: parseFloat(ci95.toFixed(2)),
    p50: parseFloat((sorted[Math.floor(n * 0.50)] ?? sorted[n - 1]).toFixed(2)),
    p95: parseFloat((sorted[Math.floor(n * 0.95)] ?? sorted[n - 1]).toFixed(2)),
    p99: parseFloat((sorted[Math.floor(n * 0.99)] ?? sorted[n - 1]).toFixed(2)),
    min: parseFloat(sorted[0].toFixed(2)),
    max: parseFloat(sorted[n - 1].toFixed(2)),
    count: n,
  };
}

// Helper: compute mean +/- stddev +/- ci95 across an array of numbers
function meanStd(arr) {
  const n = arr.length;
  if (n === 0) return null;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const ci95 = 1.96 * (std / Math.sqrt(n));
  return {
    mean: parseFloat(mean.toFixed(3)),
    stddev: parseFloat(std.toFixed(3)),
    ci95: parseFloat(ci95.toFixed(3)),
    n
  };
}

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
    asset.ID.startsWith('DEMO_') ||
    asset.ID.startsWith('PHARMA_');

  let checkpointDistance = 9999;
  let destinationDistance = 9999;
  let nextCheckpoint = null;
  let eta = null;
  let checkpointRequiresDocs = false;

  // Deterministic display metadata for all assets (derived from ID hash)
  const ORIGINS = ['Mumbai', 'Singapore', 'Shanghai', 'Dubai', 'Los Angeles', 'Hamburg'];
  const DESTINATIONS = ['Rotterdam', 'Antwerp', 'New York', 'Sydney', 'London', 'Frankfurt'];
  const CONSIGNEES = ['Unilever Europe', 'IKEA Logistics', 'Pfizer Supply', 'Samsung Distribution', 'Amazon EU'];
  const _hash = crypto.createHash('md5').update(asset.ID).digest('hex');
  const _seed = parseInt(_hash.substring(0, 4), 16);
  const origin = ORIGINS[_seed % ORIGINS.length];
  const destination = DESTINATIONS[(_seed * 3 + 1) % DESTINATIONS.length];
  const consignee = CONSIGNEES[(_seed * 7 + 2) % CONSIGNEES.length];

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
    Origin: origin,
    Destination: destination,
    Consignee: consignee,
    CheckpointDistance: checkpointDistance,
    DestinationDistance: destinationDistance,
    NextCheckpoint: nextCheckpoint,
    ETA: eta,
    CheckpointRequiresDocs: checkpointRequiresDocs,
    CreatedAt: new Date().toISOString()
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
    alreadyCached: 0
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

        // Inform adaptive tuner that this asset was pre-cached by this rule
        adaptiveTuner.recordPreCache(assetId, evaluation.triggeredRule, evaluation.ttl);

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
  console.log('[Worker] Background worker started (5-second interval)');

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

    // Inform adaptive tuner that this asset was queried
    adaptiveTuner.recordQuery(assetId);

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
app.get('/api/assets', async (_req, res) => {
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
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get statistics
app.get('/api/stats', async (_req, res) => {
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

// Get pre-caching activity log - reads live from Redis
app.get('/api/precache/activity', async (_req, res) => {
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
app.post('/api/stats/reset', async (_req, res) => {
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

// Get testlab assets with enrichment and pre-caching evaluation
app.get('/api/testlab/assets', async (_req, res) => {
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
app.post('/api/system/reset', async (_req, res) => {
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
app.post('/api/system/clear-test-assets', async (_req, res) => {
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
app.post('/api/system/clear-all-assets', async (_req, res) => {
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

app.get('/api/worker/status', (_req, res) => {
  res.json({
    success: true,
    workerEnabled,
    uptime: Math.floor(process.uptime())
  });
});

// ========================================
// RULES CONFIGURATION ENDPOINTS
// ========================================

// Get current rule configuration and available presets
app.get('/api/rules', (_req, res) => {
  res.json({
    success: true,
    config: preCacheRules.getConfig(),
    presets: INDUSTRY_PRESETS
  });
});

// Apply an industry preset or a custom config
app.post('/api/rules', (req, res) => {
  const { preset, config } = req.body;

  if (preset) {
    const presetData = INDUSTRY_PRESETS[preset];
    if (!presetData) {
      return res.status(400).json({
        success: false,
        error: `Unknown preset '${preset}'. Available: ${Object.keys(INDUSTRY_PRESETS).join(', ')}`
      });
    }
    preCacheRules.updateConfig(presetData);
    return res.json({
      success: true,
      message: `Applied '${presetData.label}' preset`,
      config: preCacheRules.getConfig()
    });
  }

  if (config) {
    preCacheRules.updateConfig(config);
    return res.json({
      success: true,
      message: 'Rule configuration updated',
      config: preCacheRules.getConfig()
    });
  }

  return res.status(400).json({ success: false, error: 'Provide a preset name or a config object' });
});

// Reset rules to system defaults
app.post('/api/rules/reset', (_req, res) => {
  preCacheRules.resetConfig();
  res.json({
    success: true,
    message: 'Rules reset to General Logistics defaults',
    config: preCacheRules.getConfig()
  });
});

// Get asset counts (hot vs cold)
app.get('/api/assets/count', async (_req, res) => {
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

// ========================================
// ADAPTIVE TUNER ENDPOINTS
// ========================================

// Get full adaptive tuner history - per-round precision/recall, adjustments, threshold drift
app.get('/api/adaptive/history', (_req, res) => {
  res.json({
    success: true,
    history: adaptiveTuner.getHistory(),
    currentThresholds: adaptiveTuner.getCurrentThresholds(),
    frequencyEMA: adaptiveTuner.getFrequencyEMA()
  });
});

// Reset adaptive tuner state (for clean simulation runs)
app.post('/api/adaptive/reset', (_req, res) => {
  adaptiveTuner.reset();
  preCacheRules.resetConfig();
  res.json({ success: true, message: 'Adaptive tuner and rule thresholds reset to defaults' });
});

// Manually trigger end-of-round evaluation (used by simulation)
app.post('/api/adaptive/end-round', async (_req, res) => {
  try {
    const summary = await adaptiveTuner.endRound();
    adaptiveTuner.startRound();
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// BENCHMARK ENDPOINT
// ========================================

// Single random asset query - fetches one random asset from blockchain then cache, returns raw latency.
app.post('/api/benchmark/single', async (_req, res) => {
  try {
    const allResult = await contract.evaluateTransaction('GetAllAssets');
    const assets = JSON.parse(allResult.toString());
    if (assets.length === 0) return res.status(400).json({ success: false, error: 'No assets on ledger.' });

    // Pick a random asset
    const asset = assets[Math.floor(Math.random() * assets.length)];
    const assetId = asset.ID;
    const cacheKey = `asset:${assetId}`;

    // Ensure it's cached
    const existing = await smartCache.get(cacheKey);
    if (!existing) {
      const rawData = JSON.parse((await contract.evaluateTransaction('ReadAsset', assetId)).toString());
      await smartCache.cacheWithContext(cacheKey, rawData, {
        preCached: true, ttl: 3600, triggeredRule: 0,
        ruleName: 'Benchmark', reason: 'Single query warm-up', priority: 'HIGH'
      });
    }

    // Measure single blockchain query
    const t1 = performance.now();
    await contract.evaluateTransaction('ReadAsset', assetId);
    const blockchainMs = parseFloat((performance.now() - t1).toFixed(2));

    // Measure single cache query
    const t2 = performance.now();
    await smartCache.get(cacheKey);
    const cacheMs = parseFloat((performance.now() - t2).toFixed(2));

    res.json({ success: true, assetId, blockchainMs, cacheMs, speedup: parseFloat((blockchainMs / cacheMs).toFixed(1)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fires N concurrent queries to both blockchain and Redis cache, returns real latency stats.
// Used by the Benchmark page to show how response time degrades under concurrent load.
app.post('/api/benchmark/run', async (req, res) => {
  const { concurrency = 10 } = req.body;
  try {
    // Pick first available asset
    const allResult = await contract.evaluateTransaction('GetAllAssets');
    const assets = JSON.parse(allResult.toString());
    if (assets.length === 0) {
      return res.status(400).json({ success: false, error: 'No assets on ledger. Register shipments first.' });
    }
    const assetId = assets[0].ID;
    const cacheKey = `asset:${assetId}`;

    // Warm the cache so cache hits are guaranteed
    const rawData = JSON.parse((await contract.evaluateTransaction('ReadAsset', assetId)).toString());
    await smartCache.cacheWithContext(cacheKey, rawData, {
      preCached: true, ttl: 3600, triggeredRule: 0,
      ruleName: 'Benchmark', reason: 'Benchmark warm-up', priority: 'HIGH'
    });

    // Fire N truly concurrent blockchain reads so the graph shows real peer contention
    // growing with load. gRPC multiplexes over a small connection pool so this is safe.
    const blockchainLatencies = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const t = performance.now();
        await contract.evaluateTransaction('ReadAsset', assetId);
        return parseFloat((performance.now() - t).toFixed(2));
      })
    );

    // Fire N concurrent cache reads (Redis is fast enough for full concurrency)
    const cacheLatencies = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const t = performance.now();
        await smartCache.get(cacheKey);
        return parseFloat((performance.now() - t).toFixed(2));
      })
    );

    res.json({
      success: true,
      concurrency,
      assetId,
      blockchain: calcStats(blockchainLatencies),
      cache: calcStats(cacheLatencies),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// CALIPER-LIKE SUSTAINED RATE BENCHMARK
// ========================================
//
// Unlike /api/benchmark/run which fires a single burst of N queries,
// this endpoint sustains a fixed query rate (TPS) for a set duration.
// New queries fire on schedule regardless of whether previous ones finished -
// exactly how Caliper and real-world automated systems behave.
// This creates genuine backpressure on Fabric when throughput < send rate.

app.post('/api/benchmark/sustained', async (req, res) => {
  const { tps = 50, durationSeconds = 10 } = req.body;

  try {
    const allResult = await contract.evaluateTransaction('GetAllAssets');
    const assets = JSON.parse(allResult.toString());
    if (assets.length === 0) {
      return res.status(400).json({ success: false, error: 'No assets on ledger.' });
    }
    const assetId = assets[0].ID;
    const cacheKey = `asset:${assetId}`;

    // Warm cache
    const rawData = JSON.parse((await contract.evaluateTransaction('ReadAsset', assetId)).toString());
    await smartCache.cacheWithContext(cacheKey, rawData, {
      preCached: true, ttl: 3600, triggeredRule: 0,
      ruleName: 'Benchmark', reason: 'Sustained benchmark warm-up', priority: 'HIGH'
    });

    const intervalMs = 1000 / tps;
    const totalQueries = tps * durationSeconds;
    const target = req.body.target || 'both'; // 'fabric', 'cache', or 'both'

    // Helper: run one target at sustained rate using setInterval.
    // setInterval fires one query per tick - no upfront timer registration,
    // so the event loop is never overwhelmed regardless of duration.
    const runTarget = (fn) => new Promise(resolve => {
      const results = [];
      let fired = 0;
      const interval = setInterval(async () => {
        if (fired >= totalQueries) { clearInterval(interval); return; }
        fired++;
        const t = performance.now();
        try { await fn(); } catch (_) { }
        results.push(parseFloat((performance.now() - t).toFixed(2)));
        if (results.length === totalQueries) resolve(results);
      }, intervalMs);
    });

    // Run Fabric and Redis separately so they don't compete for the event loop
    const blockchainLatencies = (target === 'fabric' || target === 'both')
      ? await runTarget(() => contract.evaluateTransaction('ReadAsset', assetId))
      : null;

    const cacheLatencies = (target === 'cache' || target === 'both')
      ? await runTarget(() => smartCache.get(cacheKey))
      : null;

    res.json({
      success: true,
      tps,
      durationSeconds,
      totalQueries,
      target,
      assetId,
      blockchain: blockchainLatencies ? calcStats(blockchainLatencies) : null,
      cache: cacheLatencies ? calcStats(cacheLatencies) : null
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// PHARMA SIMULATION SETUP
// ========================================

// Creates 6 controlled pharmaceutical shipments on the ledger.
// Owner keywords drive deterministic enrichment in enrichAssetWithLocation():
//   - "Transit-Approaching-Checkpoint" → checkpointDistance=10, Rule 1 fires
//   - "Transit-NearDestination"        → destinationDistance=15, Rule 3 fires
//   - "Transit-MidJourney"             → distance=250-300, Rule 4 excludes
//   - "Disputed"                       → dispute override fires
app.post('/api/benchmark/setup-pharma', async (_req, res) => {
  const pharmaShipments = [
    { id: 'PHARMA_01', color: 'Vaccines', size: '500', owner: 'Pfizer-Transit-Approaching-Checkpoint', appraisedValue: '85000' },
    { id: 'PHARMA_02', color: 'Antibiotics', size: '200', owner: 'Roche-Transit-NearDestination', appraisedValue: '72000' },
    { id: 'PHARMA_03', color: 'Insulin', size: '150', owner: 'AstraZeneca-Transit-MidJourney', appraisedValue: '45000' },
    { id: 'PHARMA_04', color: 'Vaccines', size: '800', owner: 'Novartis-Disputed-Transit', appraisedValue: '95000' },
    { id: 'PHARMA_05', color: 'Syringes', size: '1000', owner: 'GSK-Transit-Approaching-Checkpoint', appraisedValue: '62000' },
    { id: 'PHARMA_06', color: 'Diagnostics', size: '300', owner: 'Moderna-Transit-NearDestination', appraisedValue: '78000' },
  ];

  const results = [];
  for (const s of pharmaShipments) {
    try {
      // Check if exists first
      try {
        await contract.evaluateTransaction('ReadAsset', s.id);
        results.push({ id: s.id, status: 'already_exists' });
        continue;
      } catch (_) {
        // Doesn't exist - create it
      }
      const st = s.owner.includes('Disputed') ? 'DISPUTED' : s.owner.includes('Transit') ? 'In-Transit' : 'Delivered';
      await contract.submitTransaction('CreateAsset', s.id, s.color, s.size, s.owner, s.appraisedValue, st);
      results.push({ id: s.id, status: 'created' });
    } catch (err) {
      results.push({ id: s.id, status: 'error', error: err.message });
    }
  }

  res.json({ success: true, results });
});

// Updates PHARMA_03 to simulate a mid-journey customs hold (query spike event)
app.post('/api/benchmark/trigger-disruption', async (_req, res) => {
  try {
    await contract.submitTransaction('UpdateAsset', 'PHARMA_03', 'Insulin', '150',
      'AstraZeneca-Transit-Approaching-Checkpoint', '45000');
    // Invalidate cache so next query reflects new state
    await smartCache.invalidate('asset:PHARMA_03');
    res.json({ success: true, message: 'PHARMA_03 moved to checkpoint proximity - disruption active' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reverts PHARMA_03 back to mid-journey state
app.post('/api/benchmark/revert-disruption', async (_req, res) => {
  try {
    await contract.submitTransaction('UpdateAsset', 'PHARMA_03', 'Insulin', '150',
      'AstraZeneca-Transit-MidJourney', '45000');
    await smartCache.invalidate('asset:PHARMA_03');
    res.json({ success: true, message: 'PHARMA_03 reverted to mid-journey' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// BENCHMARK SIMULATION - 3-WAY COMPARISON
// ========================================

// Runs the full benchmark simulation:
//   - 3-way comparison: no-cache vs naive vs smart (one pass)
//   - 10-round adaptive simulation: static rules vs adaptive tuner (second pass)
//
// Each round: 3 agents query 6 pharma shipments via /api/asset/:id path
// (so access logs populate and Rule 2 can fire).
// Disruption injected at round 4 - PHARMA_03 switches to checkpoint proximity.
//
// Returns: { comparison, adaptive }

app.post('/api/benchmark/simulate', async (_req, res) => {
  const PHARMA_IDS = ['PHARMA_01', 'PHARMA_02', 'PHARMA_03', 'PHARMA_04', 'PHARMA_05', 'PHARMA_06'];
  const AGENTS = [
    { name: 'Regulatory System', stakeholder: 'regulatory', targets: ['PHARMA_01', 'PHARMA_04', 'PHARMA_05'] },
    { name: 'Hospital Inventory', stakeholder: 'hospital', targets: ['PHARMA_02', 'PHARMA_06', 'PHARMA_04'] },
    { name: 'Cold Chain Monitor', stakeholder: 'coldchain', targets: ['PHARMA_01', 'PHARMA_02', 'PHARMA_03', 'PHARMA_05', 'PHARMA_06'] },
  ];
  // ── Helper: query one asset, return { source, latencyMs }
  const queryAsset = async (assetId, stakeholder) => {
    const t = performance.now();
    const cacheKey = `asset:${assetId}`;

    // Update access log (same as /api/asset/:id)
    if (!accessLog[assetId]) accessLog[assetId] = [];
    accessLog[assetId].push({ stakeholder, timestamp: Date.now() });
    accessLog[assetId] = accessLog[assetId].filter(a => a.timestamp > Date.now() - 86400000);
    adaptiveTuner.recordQuery(assetId);

    const cached = await smartCache.get(cacheKey);
    if (cached) {
      return { source: 'cache', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
    }

    await contract.evaluateTransaction('ReadAsset', assetId);
    return { source: 'blockchain', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
  };

  // ── Helper: query one asset bypassing cache entirely (no-cache mode)
  const queryBlockchainDirect = async (assetId) => {
    const t = performance.now();
    await contract.evaluateTransaction('ReadAsset', assetId);
    return parseFloat((performance.now() - t).toFixed(2));
  };

  // ── Helper: query one asset with naive cache (fixed 5-min TTL, no rules)
  const queryNaive = async (assetId) => {
    const t = performance.now();
    const cacheKey = `naive:${assetId}`;
    const cached = await smartCache.get(cacheKey);
    if (cached) {
      return { source: 'cache', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
    }
    const raw = await contract.evaluateTransaction('ReadAsset', assetId);
    const data = JSON.parse(raw.toString());
    await smartCache.cacheWithContext(cacheKey, data, { preCached: false, ttl: 300 });
    return { source: 'blockchain', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
  };

  try {
    // Ensure pharma shipments exist
    for (const id of PHARMA_IDS) {
      try { await contract.evaluateTransaction('ReadAsset', id); }
      catch (_) {
        return res.status(400).json({
          success: false,
          error: `Pharma shipments not found. Run /api/benchmark/setup-pharma first.`
        });
      }
    }

    // ════════════════════════════════════════════════════════
    // PART 1: 3-WAY COMPARISON (single pass, 3 rounds each)
    // No-cache vs Naive vs Smart - same workload, 3 rounds
    // ════════════════════════════════════════════════════════

    const comparison = { noCache: [], naive: [], smart: [] };

    // Flush everything for clean start
    await smartCache.flushAll();
    smartCache.resetStats();

    for (let round = 1; round <= 3; round++) {
      // ── No-cache round
      const noCacheRound = { round, hits: 0, misses: 0, blockchainCalls: 0, avgLatencyMs: 0 };
      const noCacheLatencies = [];
      for (const agent of AGENTS) {
        for (const id of agent.targets) {
          const latency = await queryBlockchainDirect(id);
          noCacheLatencies.push(latency);
          noCacheRound.blockchainCalls++;
          noCacheRound.misses++;
        }
      }
      noCacheRound.avgLatencyMs = parseFloat(
        (noCacheLatencies.reduce((a, b) => a + b, 0) / noCacheLatencies.length).toFixed(2)
      );
      comparison.noCache.push(noCacheRound);

      // ── Naive-cache round (uses naive: prefix keys)
      const naiveRound = { round, hits: 0, misses: 0, blockchainCalls: 0, avgLatencyMs: 0 };
      const naiveLatencies = [];
      for (const agent of AGENTS) {
        for (const id of agent.targets) {
          const result = await queryNaive(id);
          naiveLatencies.push(result.latencyMs);
          if (result.source === 'cache') naiveRound.hits++;
          else { naiveRound.misses++; naiveRound.blockchainCalls++; }
        }
      }
      naiveRound.avgLatencyMs = parseFloat(
        (naiveLatencies.reduce((a, b) => a + b, 0) / naiveLatencies.length).toFixed(2)
      );
      comparison.naive.push(naiveRound);

      // ── Smart-cache round (pre-cache worker runs first)
      if (round === 1) {
        // Run worker once to pre-cache based on rules
        adaptiveTuner.startRound();
        await runBackgroundPrecacheWorker();
      }
      const smartRound = { round, hits: 0, misses: 0, blockchainCalls: 0, avgLatencyMs: 0 };
      const smartLatencies = [];
      for (const agent of AGENTS) {
        for (const id of agent.targets) {
          const result = await queryAsset(id, agent.stakeholder);
          smartLatencies.push(result.latencyMs);
          if (result.source === 'cache') smartRound.hits++;
          else { smartRound.misses++; smartRound.blockchainCalls++; }
        }
      }
      smartRound.avgLatencyMs = parseFloat(
        (smartLatencies.reduce((a, b) => a + b, 0) / smartLatencies.length).toFixed(2)
      );
      comparison.smart.push(smartRound);
    }

    // Clean naive cache keys
    for (const id of PHARMA_IDS) {
      await smartCache.invalidate(`naive:${id}`);
    }

    // ════════════════════════════════════════════════════════
    // PART 2: SELF-HEALING BENCHMARK (8 rounds)
    // Static rules vs Adaptive tuner
    //
    // R1-R3: Normal operation with good thresholds (~91% hit rate)
    // R4:    Misconfiguration injected - thresholds tightened for both passes
    // R5-R8: Adaptive detects recall drop, widens thresholds, recovers
    //        Static stays degraded - no self-healing
    // ════════════════════════════════════════════════════════

    const savedConfig = JSON.parse(JSON.stringify(preCacheRules.getConfig()));
    const ROUNDS = 8;
    const DISRUPTION_ROUND = 4;

    const GOOD_CONFIG = {
      rule1: { checkpointDistanceKm: 20, etaMinutes: 60, ttlMinutes: 30, enabled: true },
      rule2: { accessCountThreshold: 3, minOrganizations: 2, windowHours: 1, ttlHours: 24, enabled: true },
      rule3: { valueThresholdUsd: 50000, destDistanceKm: 50, ttlMinutes: 45, enabled: true },
      rule4: { minCheckpointDistanceKm: 200, minDestDistanceKm: 200, maxNormalAccesses: 3, enabled: true }
    };

    const TIGHT_CONFIG = {
      rule1: { checkpointDistanceKm: 5, etaMinutes: 60, ttlMinutes: 30, enabled: true },
      rule2: { accessCountThreshold: 5, minOrganizations: 2, windowHours: 1, ttlHours: 24, enabled: true },
      rule3: { valueThresholdUsd: 50000, destDistanceKm: 8, ttlMinutes: 45, enabled: true },
      rule4: { minCheckpointDistanceKm: 200, minDestDistanceKm: 200, maxNormalAccesses: 3, enabled: true }
    };

    // ── Helper: run one simulation pass (static or adaptive)
    const runSimulationPass = async (mode) => {
      adaptiveTuner.reset();
      preCacheRules.updateConfig(JSON.parse(JSON.stringify(GOOD_CONFIG))); // start healthy
      await smartCache.flushAll();
      smartCache.resetStats();
      for (const id of PHARMA_IDS) { accessLog[id] = []; }

      const rounds = [];
      for (let round = 1; round <= ROUNDS; round++) {
        // Inject misconfiguration at disruption round for both passes
        if (round === DISRUPTION_ROUND) {
          preCacheRules.updateConfig(JSON.parse(JSON.stringify(TIGHT_CONFIG)));
        }

        adaptiveTuner.startRound();
        await smartCache.flushAll();
        for (const id of PHARMA_IDS) { accessLog[id] = []; }
        await runBackgroundPrecacheWorker();

        const roundStats = { round, hits: 0, misses: 0, blockchainCalls: 0, totalQueries: 0, avgLatencyMs: 0 };
        const latencies = [];
        for (const agent of AGENTS) {
          for (const id of agent.targets) {
            const result = await queryAsset(id, agent.stakeholder);
            latencies.push(result.latencyMs);
            roundStats.totalQueries++;
            if (result.source === 'cache') roundStats.hits++;
            else { roundStats.misses++; roundStats.blockchainCalls++; }
          }
        }
        roundStats.hitRate = parseFloat((roundStats.hits / roundStats.totalQueries).toFixed(3));
        roundStats.avgLatencyMs = parseFloat(
          (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)
        );

        if (mode === 'adaptive') {
          const tuningSummary = await adaptiveTuner.endRound();
          roundStats.thresholdAdjustments = tuningSummary.thresholdAdjustments;
          roundStats.ttlAdjustments = tuningSummary.ttlAdjustments;
          roundStats.currentThresholds = tuningSummary.currentThresholds;
        } else {
          roundStats.thresholdAdjustments = [];
          roundStats.ttlAdjustments = [];
          roundStats.currentThresholds = {
            rule1_checkpointDistanceKm: preCacheRules.config.rule1.checkpointDistanceKm,
            rule2_accessCountThreshold: preCacheRules.config.rule2.accessCountThreshold,
            rule3_valueThresholdUsd: preCacheRules.config.rule3.valueThresholdUsd,
            rule3_destDistanceKm: preCacheRules.config.rule3.destDistanceKm
          };
        }

        rounds.push(roundStats);
      }
      return rounds;
    };

    // Run both passes
    const staticRounds = await runSimulationPass('static');
    const adaptiveRounds = await runSimulationPass('adaptive');

    // Restore original config
    preCacheRules.updateConfig(savedConfig);

    res.json({
      success: true,
      comparison,
      adaptive: {
        staticRounds,
        adaptiveRounds,
        disruptionRound: DISRUPTION_ROUND,
        adjustmentLog: adaptiveTuner.getHistory()
      }
    });

  } catch (error) {
    console.error('[Simulate] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// MULTI-TRIAL EVALUATION (academic rigour)
// ========================================
// Runs the 3-way comparison N times independently,
// then aggregates with mean +/- stddev +/- 95% CI.

app.post('/api/benchmark/evaluate', async (req, res) => {
  const { trials = 5 } = req.body;
  const clampedTrials = Math.max(1, Math.min(trials, 10));

  const PHARMA_IDS = ['PHARMA_01', 'PHARMA_02', 'PHARMA_03', 'PHARMA_04', 'PHARMA_05', 'PHARMA_06'];
  const AGENTS = [
    { name: 'Regulatory System', stakeholder: 'regulatory', targets: ['PHARMA_01', 'PHARMA_04', 'PHARMA_05'] },
    { name: 'Hospital Inventory', stakeholder: 'hospital', targets: ['PHARMA_02', 'PHARMA_06', 'PHARMA_04'] },
    { name: 'Cold Chain Monitor', stakeholder: 'coldchain', targets: ['PHARMA_01', 'PHARMA_02', 'PHARMA_03', 'PHARMA_05', 'PHARMA_06'] },
  ];

  const queryBlockchainDirect = async (assetId) => {
    const t = performance.now();
    await contract.evaluateTransaction('ReadAsset', assetId);
    return parseFloat((performance.now() - t).toFixed(2));
  };

  const queryNaive = async (assetId) => {
    const t = performance.now();
    const cacheKey = `naive:${assetId}`;
    const cached = await smartCache.get(cacheKey);
    if (cached) return { source: 'cache', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
    const raw = await contract.evaluateTransaction('ReadAsset', assetId);
    const data = JSON.parse(raw.toString());
    await smartCache.cacheWithContext(cacheKey, data, { preCached: false, ttl: 300 });
    return { source: 'blockchain', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
  };

  const queryAssetSmart = async (assetId, stakeholder) => {
    const t = performance.now();
    const cacheKey = `asset:${assetId}`;
    if (!accessLog[assetId]) accessLog[assetId] = [];
    accessLog[assetId].push({ stakeholder, timestamp: Date.now() });
    accessLog[assetId] = accessLog[assetId].filter(a => a.timestamp > Date.now() - 86400000);
    const cached = await smartCache.get(cacheKey);
    if (cached) return { source: 'cache', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
    await contract.evaluateTransaction('ReadAsset', assetId);
    return { source: 'blockchain', latencyMs: parseFloat((performance.now() - t).toFixed(2)) };
  };

  try {
    // Ensure pharma shipments exist
    for (const id of PHARMA_IDS) {
      try { await contract.evaluateTransaction('ReadAsset', id); }
      catch (_) {
        return res.status(400).json({
          success: false,
          error: 'Pharma shipments not found. Run /api/benchmark/setup-pharma first.'
        });
      }
    }

    const perTrial = [];

    for (let t = 0; t < clampedTrials; t++) {
      // Full reset between trials
      await smartCache.flushAll();
      smartCache.resetStats();
      for (const id of PHARMA_IDS) { accessLog[id] = []; }

      const trialData = { noCache: [], naive: [], smart: [] };

      for (let round = 1; round <= 3; round++) {
        // ── No-cache
        const noCacheLatencies = [];
        for (const agent of AGENTS) {
          for (const id of agent.targets) {
            noCacheLatencies.push(await queryBlockchainDirect(id));
          }
        }

        // ── Naive (flush naive keys each round for independence)
        for (const id of PHARMA_IDS) { await smartCache.invalidate(`naive:${id}`); }
        const naiveRound = { hits: 0, misses: 0, latencies: [] };
        for (const agent of AGENTS) {
          for (const id of agent.targets) {
            const r = await queryNaive(id);
            naiveRound.latencies.push(r.latencyMs);
            if (r.source === 'cache') naiveRound.hits++; else naiveRound.misses++;
          }
        }

        // ── Smart (run pre-cache worker before first round)
        if (round === 1) {
          await smartCache.flushAll();
          smartCache.resetStats();
          for (const id of PHARMA_IDS) { accessLog[id] = []; }
          await runBackgroundPrecacheWorker();
        }
        const smartRound = { hits: 0, misses: 0, latencies: [] };
        for (const agent of AGENTS) {
          for (const id of agent.targets) {
            const r = await queryAssetSmart(id, agent.stakeholder);
            smartRound.latencies.push(r.latencyMs);
            if (r.source === 'cache') smartRound.hits++; else smartRound.misses++;
          }
        }

        const nq = noCacheLatencies.length;
        trialData.noCache.push({
          round,
          avgLatencyMs: parseFloat((noCacheLatencies.reduce((a, b) => a + b, 0) / nq).toFixed(2)),
          blockchainCalls: nq,
          hitRate: 0
        });
        trialData.naive.push({
          round,
          avgLatencyMs: parseFloat((naiveRound.latencies.reduce((a, b) => a + b, 0) / naiveRound.latencies.length).toFixed(2)),
          blockchainCalls: naiveRound.misses,
          hitRate: parseFloat((naiveRound.hits / (naiveRound.hits + naiveRound.misses)).toFixed(3))
        });
        trialData.smart.push({
          round,
          avgLatencyMs: parseFloat((smartRound.latencies.reduce((a, b) => a + b, 0) / smartRound.latencies.length).toFixed(2)),
          blockchainCalls: smartRound.misses,
          hitRate: parseFloat((smartRound.hits / (smartRound.hits + smartRound.misses)).toFixed(3))
        });
      }

      // Clean naive keys
      for (const id of PHARMA_IDS) { await smartCache.invalidate(`naive:${id}`); }
      perTrial.push(trialData);
    }

    // ── Aggregate across trials ──
    const avgAcrossRounds = (trial, strategy) =>
      trial[strategy].reduce((s, r) => s + r.avgLatencyMs, 0) / trial[strategy].length;
    const hitRateAcrossRounds = (trial, strategy) =>
      trial[strategy].reduce((s, r) => s + r.hitRate, 0) / trial[strategy].length;
    const bcCallsAcrossRounds = (trial, strategy) =>
      trial[strategy].reduce((s, r) => s + r.blockchainCalls, 0);

    const summary = {
      noCacheLatency: meanStd(perTrial.map(t => avgAcrossRounds(t, 'noCache'))),
      naiveLatency: meanStd(perTrial.map(t => avgAcrossRounds(t, 'naive'))),
      smartLatency: meanStd(perTrial.map(t => avgAcrossRounds(t, 'smart'))),
      naiveHitRate: meanStd(perTrial.map(t => hitRateAcrossRounds(t, 'naive'))),
      smartHitRate: meanStd(perTrial.map(t => hitRateAcrossRounds(t, 'smart'))),
      naiveBcCalls: meanStd(perTrial.map(t => bcCallsAcrossRounds(t, 'naive'))),
      smartBcCalls: meanStd(perTrial.map(t => bcCallsAcrossRounds(t, 'smart'))),
      noCacheBcCalls: meanStd(perTrial.map(t => bcCallsAcrossRounds(t, 'noCache'))),
    };

    // Compute speedup
    if (summary.noCacheLatency && summary.smartLatency && summary.smartLatency.mean > 0) {
      summary.speedupFactor = parseFloat((summary.noCacheLatency.mean / summary.smartLatency.mean).toFixed(1));
      summary.latencyReductionPct = parseFloat(
        (((summary.noCacheLatency.mean - summary.smartLatency.mean) / summary.noCacheLatency.mean) * 100).toFixed(1)
      );
    }

    lastEvaluationResult = { summary, perTrial, trials: clampedTrials, timestamp: new Date().toISOString() };

    res.json({ success: true, ...lastEvaluationResult });

  } catch (error) {
    console.error('[Evaluate] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// EVALUATION EXPORT (CSV / JSON)
// ========================================

app.get('/api/benchmark/export', (req, res) => {
  if (!lastEvaluationResult) {
    return res.status(404).json({ success: false, error: 'No evaluation results. Run POST /api/benchmark/evaluate first.' });
  }

  const format = req.query.format || 'csv';

  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename="flashchain-evaluation.json"');
    res.setHeader('Content-Type', 'application/json');
    return res.json(lastEvaluationResult);
  }

  // CSV export
  const lines = [];
  const s = lastEvaluationResult.summary;

  lines.push(`FlashChain Evaluation Results - ${lastEvaluationResult.timestamp} - ${lastEvaluationResult.trials} trials`);
  lines.push('');

  // Summary table
  lines.push('Strategy,Mean Latency (ms),StdDev (ms),95% CI (ms),Mean Hit Rate,Mean Blockchain Calls');
  lines.push(`No-Cache,${s.noCacheLatency.mean},${s.noCacheLatency.stddev},±${s.noCacheLatency.ci95},0,${s.noCacheBcCalls.mean}`);
  lines.push(`Naive (5min TTL),${s.naiveLatency.mean},${s.naiveLatency.stddev},±${s.naiveLatency.ci95},${s.naiveHitRate.mean},${s.naiveBcCalls.mean}`);
  lines.push(`Smart (Policy),${s.smartLatency.mean},${s.smartLatency.stddev},±${s.smartLatency.ci95},${s.smartHitRate.mean},${s.smartBcCalls.mean}`);
  lines.push('');
  lines.push(`Speedup Factor (No-Cache / Smart),${s.speedupFactor || 'N/A'}`);
  lines.push(`Latency Reduction %,${s.latencyReductionPct || 'N/A'}`);
  lines.push('');

  // Per-trial detail
  lines.push('Trial,Round,NoCache_AvgMs,Naive_AvgMs,Smart_AvgMs,Naive_HitRate,Smart_HitRate');
  lastEvaluationResult.perTrial.forEach((trial, ti) => {
    for (let ri = 0; ri < trial.noCache.length; ri++) {
      lines.push(`${ti + 1},${ri + 1},${trial.noCache[ri].avgLatencyMs},${trial.naive[ri].avgLatencyMs},${trial.smart[ri].avgLatencyMs},${trial.naive[ri].hitRate},${trial.smart[ri].hitRate}`);
    }
  });

  res.setHeader('Content-Disposition', 'attachment; filename="flashchain-evaluation.csv"');
  res.setHeader('Content-Type', 'text/csv');
  res.send(lines.join('\n'));
});

// ========================================
// ADAPTIVE TUNER DEMO - 3 STEP EXPLAINER
// ========================================
//
// Step 1: /api/tuner-demo/reset  - set deliberately tight thresholds, flush cache
// Step 2: /api/tuner-demo/measure - run worker + queries, return hit rate + thresholds
// Step 3: /api/tuner-demo/tune   - run endRound(), return what changed and why
//
// Frontend calls these in sequence with a button per step.
// Shows: bad config → 0% hit rate → tuner detects → fixes thresholds → hit rate improves.

const TUNER_DEMO_IDS = ['PHARMA_01', 'PHARMA_02', 'PHARMA_03', 'PHARMA_04', 'PHARMA_05', 'PHARMA_06'];
const TUNER_DEMO_AGENTS = [
  { stakeholder: 'regulatory', targets: ['PHARMA_01', 'PHARMA_04', 'PHARMA_05'] },
  { stakeholder: 'hospital', targets: ['PHARMA_02', 'PHARMA_06', 'PHARMA_04'] },
  { stakeholder: 'coldchain', targets: ['PHARMA_01', 'PHARMA_02', 'PHARMA_03', 'PHARMA_05', 'PHARMA_06'] },
];
const TUNER_DEMO_TIGHT_CONFIG = {
  rule1: { checkpointDistanceKm: 5, etaMinutes: 60, ttlMinutes: 30, enabled: true },
  rule2: { accessCountThreshold: 10, minOrganizations: 2, windowHours: 1, ttlHours: 24, enabled: true },
  rule3: { valueThresholdUsd: 50000, destDistanceKm: 8, ttlMinutes: 45, enabled: true },
  rule4: { minCheckpointDistanceKm: 200, minDestDistanceKm: 200, maxNormalAccesses: 3, enabled: true }
};

// Step 1 - reset to tight (bad) thresholds
app.post('/api/tuner-demo/reset', async (_req, res) => {
  try {
    adaptiveTuner.reset();
    preCacheRules.updateConfig(JSON.parse(JSON.stringify(TUNER_DEMO_TIGHT_CONFIG)));
    await smartCache.flushAll();
    for (const id of TUNER_DEMO_IDS) { accessLog[id] = []; }

    res.json({
      success: true,
      message: 'Thresholds set to tight (misconfigured) values. Cache cleared.',
      thresholds: adaptiveTuner.getCurrentThresholds()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 2 - run worker + queries, measure hit rate
app.post('/api/tuner-demo/measure', async (_req, res) => {
  try {
    // Start a fresh tuner round
    adaptiveTuner.startRound();

    // Run worker - pre-caches based on current (tight) thresholds
    await runBackgroundPrecacheWorker();

    // Agents query
    let hits = 0, misses = 0, totalQueries = 0;
    const details = [];

    for (const agent of TUNER_DEMO_AGENTS) {
      for (const id of agent.targets) {
        const cacheKey = `asset:${id}`;
        if (!accessLog[id]) accessLog[id] = [];
        accessLog[id].push({ stakeholder: agent.stakeholder, timestamp: Date.now() });
        adaptiveTuner.recordQuery(id);

        const cached = await smartCache.get(cacheKey);
        const source = cached ? 'cache' : 'blockchain';
        if (source === 'cache') hits++; else misses++;
        totalQueries++;

        if (!details.find(d => d.id === id)) {
          details.push({ id, source, preCached: !!cached });
        }
      }
    }

    const hitRate = parseFloat((hits / totalQueries).toFixed(3));

    res.json({
      success: true,
      hitRate,
      hitRatePct: Math.round(hitRate * 100),
      hits,
      misses,
      totalQueries,
      thresholds: adaptiveTuner.getCurrentThresholds(),
      assetDetails: details
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 3 - run tuner, return adjustments, then measure again
app.post('/api/tuner-demo/tune', async (_req, res) => {
  try {
    // Run the tuner - adjusts thresholds based on precision/recall
    const tuningSummary = await adaptiveTuner.endRound();

    // Now measure again with new thresholds
    await smartCache.flushAll();
    for (const id of TUNER_DEMO_IDS) { accessLog[id] = []; }
    adaptiveTuner.startRound();
    await runBackgroundPrecacheWorker();

    let hits = 0, misses = 0, totalQueries = 0;
    const details = [];

    for (const agent of TUNER_DEMO_AGENTS) {
      for (const id of agent.targets) {
        const cacheKey = `asset:${id}`;
        if (!accessLog[id]) accessLog[id] = [];
        accessLog[id].push({ stakeholder: agent.stakeholder, timestamp: Date.now() });
        adaptiveTuner.recordQuery(id);

        const cached = await smartCache.get(cacheKey);
        const source = cached ? 'cache' : 'blockchain';
        if (source === 'cache') hits++; else misses++;
        totalQueries++;

        if (!details.find(d => d.id === id)) {
          details.push({ id, source, preCached: !!cached });
        }
      }
    }

    const hitRate = parseFloat((hits / totalQueries).toFixed(3));

    res.json({
      success: true,
      adjustments: tuningSummary.thresholdAdjustments,
      recall: tuningSummary.recall,
      rulePrecision: tuningSummary.rulePrecision,
      newThresholds: adaptiveTuner.getCurrentThresholds(),
      afterHitRate: hitRate,
      afterHitRatePct: Math.round(hitRate * 100),
      hits,
      misses,
      totalQueries,
      assetDetails: details
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

startServer();

process.on('SIGINT', () => {
  console.log('[Server] Shutting down gracefully...');
  stopPreCachingWorker();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Server] Shutting down gracefully...');
  stopPreCachingWorker();
  process.exit(0);
});
