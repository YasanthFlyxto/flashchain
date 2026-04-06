// app.js - Policy-Based Pre-Caching System

const express = require('express');
const cors = require('cors');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const smartCache = require('./middleware/cache');
const { PreCachingRulesEngine, PolicyEngine, DEFAULT_POLICIES } = require('./middleware/cache');
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


// Initialize Pre-Caching Rules Engine (used by adaptive tuner / benchmark)
const preCacheRules = new PreCachingRulesEngine();

// Initialize Adaptive Tuner - wired to rules engine + cache
const adaptiveTuner = new AdaptiveTuner(preCacheRules, smartCache);

// Initialize JSON Policy Engine — load from policies.json, fall back to defaults
const POLICIES_FILE = path.join(__dirname, 'policies.json');

function loadPoliciesFromFile() {
  try {
    return JSON.parse(fs.readFileSync(POLICIES_FILE, 'utf8'));
  } catch {
    return DEFAULT_POLICIES;
  }
}

function savePolicies(engine) {
  fs.writeFileSync(POLICIES_FILE, JSON.stringify(engine.getPolicies(), null, 2), 'utf8');
}

const policyEngine = new PolicyEngine(loadPoliciesFromFile());

// Track access patterns for Rule 2 (multi-stakeholder detection)
const accessLog = {};

// Pre-caching activity log
let preCacheActivity = [];

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

// ========================================
// ASSET ENRICHMENT FUNCTION
// ========================================

function enrichAssetWithLocation(asset) {
  const ownerLower = asset.Custodian.toLowerCase();

  // Determine status (only 3 statuses)
  const isDisputed = ownerLower.includes('dispute') || ownerLower.includes('contested');
  const isInTransit = ownerLower.includes('transit') || ownerLower.includes('shipping');
  // Everything else is Delivered (final state)

  const isTestAsset = asset.ID.startsWith('TEST_') ||
    asset.ID.startsWith('JOURNEY_') ||
    asset.ID.startsWith('BENCH_') ||
    asset.ID.startsWith('DEMO_') ||
    asset.ID.startsWith('PHARMA_') ||
    asset.ID.startsWith('SHIP');


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
    const result = await contract.evaluateTransaction('GetAllShipments');
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

        // Evaluate using JSON policy engine
        let evaluation = policyEngine.evaluate(enriched, assetAccessLog);

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
          assetValue: enriched.ValueUSD,
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
    const result = await contract.evaluateTransaction('GetShipment', assetId);
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
    const result = await contract.evaluateTransaction('GetAllShipments');
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
    const { shipmentId, cargoType, weightKg, custodian, valueUSD } = req.body;

    let status = 'Delivered';
    if (custodian.includes('Disputed')) {
      status = 'DISPUTED';
    } else if (custodian.includes('Transit')) {
      status = 'In-Transit';
    }

    await contract.submitTransaction(
      'RegisterShipment',
      shipmentId,
      cargoType,
      String(weightKg),
      custodian,
      String(valueUSD),
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
  const { shipmentId, newCustodian } = req.body;

  try {
    await contract.submitTransaction('TransferCustody', shipmentId, newCustodian);
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
    await contract.submitTransaction('DeleteShipment', assetId);
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
          assetValue: cached.data.ValueUSD,
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
    const result = await contract.evaluateTransaction('GetShipment', assetId);
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
    const result = await contract.evaluateTransaction('GetAllShipments');
    const allAssets = JSON.parse(result.toString());

    const enrichedAssets = allAssets.map(asset => {
      const enriched = enrichAssetWithLocation(asset);
      const assetAccessLog = accessLog[asset.ID] || [];
      const evaluation = policyEngine.evaluate(enriched, assetAccessLog);

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
    const result = await contract.evaluateTransaction('GetAllShipments');
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
          await contract.submitTransaction('DeleteShipment', asset.ID);
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
    const result = await contract.evaluateTransaction('GetAllShipments');
    const allAssets = JSON.parse(result.toString());

    let deleted = 0;

    for (const asset of allAssets) {
      try {
        await contract.submitTransaction('DeleteShipment', asset.ID);
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

// ========================================
// POLICY ENGINE CRUD ENDPOINTS
// ========================================

// List all policies + available fields
app.get('/api/policies', (_req, res) => {
  res.json({
    success: true,
    policies: policyEngine.getPolicies(),
    fields: Object.entries(PolicyEngine.FIELD_TYPES).map(([field, type]) => ({ field, type })),
    operators: {
      string: ['equals', 'notEquals', 'contains'],
      number: ['lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'equals'],
    },
  });
});

// Add a new policy
app.post('/api/policies', (req, res) => {
  const { name, conditions, logic, ttlMinutes, priority } = req.body;
  if (!name || !conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return res.status(400).json({ success: false, error: 'name and conditions[] are required' });
  }
  const id = 'policy_' + Date.now();
  policyEngine.addPolicy({ id, name, enabled: true, conditions, logic: logic || 'AND', ttlMinutes: ttlMinutes || 30, priority: priority || 'MEDIUM' });
  savePolicies(policyEngine);
  res.json({ success: true, policies: policyEngine.getPolicies() });
});

// Update a policy (patch fields)
app.patch('/api/policies/:id', (req, res) => {
  const ok = policyEngine.updatePolicy(req.params.id, req.body);
  if (!ok) return res.status(404).json({ success: false, error: 'Policy not found' });
  savePolicies(policyEngine);
  res.json({ success: true, policies: policyEngine.getPolicies() });
});

// Delete a policy
app.delete('/api/policies/:id', (req, res) => {
  const ok = policyEngine.removePolicy(req.params.id);
  if (!ok) return res.status(404).json({ success: false, error: 'Policy not found' });
  savePolicies(policyEngine);
  res.json({ success: true, policies: policyEngine.getPolicies() });
});

// Reset to defaults
app.post('/api/policies/reset', (_req, res) => {
  policyEngine.resetToDefaults();
  savePolicies(policyEngine);
  res.json({ success: true, policies: policyEngine.getPolicies() });
});

// Get asset counts (hot vs cold)
app.get('/api/assets/count', async (_req, res) => {
  try {
    const result = await contract.evaluateTransaction('GetAllShipments');
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

// Fires N concurrent queries to both blockchain and Redis cache, returns real latency stats.
// Used by the Benchmark page to show how response time degrades under concurrent load.
app.post('/api/benchmark/run', async (req, res) => {
  const { concurrency = 10 } = req.body;
  try {
    // Pick first available asset
    const allResult = await contract.evaluateTransaction('GetAllShipments');
    const assets = JSON.parse(allResult.toString());
    if (assets.length === 0) {
      return res.status(400).json({ success: false, error: 'No assets on ledger. Register shipments first.' });
    }
    const assetId = assets[0].ID;
    const cacheKey = `asset:${assetId}`;

    // Warm the cache so cache hits are guaranteed
    const rawData = JSON.parse((await contract.evaluateTransaction('GetShipment', assetId)).toString());
    await smartCache.cacheWithContext(cacheKey, rawData, {
      preCached: true, ttl: 3600, triggeredRule: 0,
      ruleName: 'Benchmark', reason: 'Benchmark warm-up', priority: 'HIGH'
    });

    // Fire N truly concurrent blockchain reads so the graph shows real peer contention
    // growing with load. gRPC multiplexes over a small connection pool so this is safe.
    const blockchainLatencies = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const t = performance.now();
        await contract.evaluateTransaction('GetShipment', assetId);
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
    const allResult = await contract.evaluateTransaction('GetAllShipments');
    const assets = JSON.parse(allResult.toString());
    if (assets.length === 0) {
      return res.status(400).json({ success: false, error: 'No assets on ledger.' });
    }
    const assetId = assets[0].ID;
    const cacheKey = `asset:${assetId}`;

    // Warm cache
    const rawData = JSON.parse((await contract.evaluateTransaction('GetShipment', assetId)).toString());
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
      ? await runTarget(() => contract.evaluateTransaction('GetShipment', assetId))
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
    { id: 'PHARMA_01', cargoType: 'Vaccines',     weightKg: '500',  custodian: 'Pfizer-Transit-Approaching-Checkpoint',  valueUSD: '85000' },
    { id: 'PHARMA_02', cargoType: 'Antibiotics',  weightKg: '200',  custodian: 'Roche-Transit-NearDestination',          valueUSD: '72000' },
    { id: 'PHARMA_03', cargoType: 'Insulin',      weightKg: '150',  custodian: 'AstraZeneca-Transit-MidJourney',         valueUSD: '45000' },
    { id: 'PHARMA_04', cargoType: 'Vaccines',     weightKg: '800',  custodian: 'Novartis-Disputed-Transit',              valueUSD: '95000' },
    { id: 'PHARMA_05', cargoType: 'Syringes',     weightKg: '1000', custodian: 'GSK-Transit-Approaching-Checkpoint',     valueUSD: '62000' },
    { id: 'PHARMA_06', cargoType: 'Diagnostics',  weightKg: '300',  custodian: 'Moderna-Transit-NearDestination',        valueUSD: '78000' },
  ];

  const results = [];
  for (const s of pharmaShipments) {
    try {
      // Check if exists first
      try {
        await contract.evaluateTransaction('GetShipment', s.id);
        results.push({ id: s.id, status: 'already_exists' });
        continue;
      } catch (_) {
        // Doesn't exist - create it
      }
      const st = s.custodian.includes('Disputed') ? 'DISPUTED' : s.custodian.includes('Transit') ? 'In-Transit' : 'Delivered';
      await contract.submitTransaction('RegisterShipment', s.id, s.cargoType, s.weightKg, s.custodian, s.valueUSD, st);
      results.push({ id: s.id, status: 'created' });
    } catch (err) {
      results.push({ id: s.id, status: 'error', error: err.message });
    }
  }

  res.json({ success: true, results });
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
