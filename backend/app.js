const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const smartCache = require('./middleware/cache');

const app = express();
app.use(express.json());

const cors = require('cors');
app.use(cors());

let gateway, network, contract;

// Cache mode control
let cacheMode = 'adaptive'; // 'adaptive' | 'simple' | 'disabled'
let benchmarkRunning = false;
let benchmarkProgress = 0;
let benchmarkResults = null;

async function connectToFabric() {
    try {
        const ccpPath = path.resolve(__dirname, '..', '..', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
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

// Get single asset with caching
app.get('/api/asset/:id', async (req, res) => {
    const startTime = Date.now();
    const assetId = req.params.id;
    const stakeholderType = req.query.stakeholder || 'default';
    const cacheKey = `asset:${assetId}`;

    try {
        if (cacheMode !== 'disabled') {
            const cached = await smartCache.get(cacheKey);
            if (cached) {
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
                    hash: cached.hash ? cached.hash.substring(0, 16) + '...' : 'N/A'
                });
            }

            smartCache.trackMiss(stakeholderType);
        }

        // Query blockchain
        const result = await contract.evaluateTransaction('ReadAsset', assetId);
        const assetData = JSON.parse(result.toString());

        let appliedTTL = 0;

        // ✅ FIX: Always generate hash (even if cache disabled)
        const dataHash = smartCache.generateHash(assetData);

        // Only cache if not disabled
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
            hash: dataHash.substring(0, 16) + '...'  // ✅ Now always shows hash
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
                uptime: `${Math.floor(process.uptime())}s`
            },
            byStakeholder: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset statistics
app.post('/api/stats/reset', async (req, res) => {
    smartCache.resetStats();
    await smartCache.flushAll();
    res.json({ success: true, message: 'Statistics and cache reset' });
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
app.post('/api/cache/mode', (req, res) => {
    const { mode } = req.body;

    if (!['adaptive', 'simple', 'disabled'].includes(mode)) {
        return res.status(400).json({
            success: false,
            error: 'Mode must be: adaptive, simple, or disabled'
        });
    }

    cacheMode = mode;
    smartCache.setMode(mode);
    smartCache.flushAll();
    console.log(`🔄 Cache mode changed to: ${mode}`);

    res.json({
        success: true,
        mode: cacheMode,
        message: `Cache mode set to ${mode}`
    });
});

app.get('/api/cache/mode', (req, res) => {
    res.json({ mode: cacheMode });
});

// Benchmark simulation
// Find this in app.js (around line 310-360)
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

    // Set mode and reset stats
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

    // ✅ FIX: Get REAL assets from blockchain
    let assetIds;
    try {
        const allAssetsResult = await contract.evaluateTransaction('GetAllAssets');
        const allAssets = JSON.parse(allAssetsResult.toString());
        assetIds = allAssets.map(asset => asset.ID);

        if (assetIds.length === 0) {
            benchmarkRunning = false;
            return res.status(400).json({
                success: false,
                error: 'No assets found in blockchain. Create some shipments first!'
            });
        }

        console.log(`📦 Using ${assetIds.length} real assets: ${assetIds.join(', ')}`);
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
            const assetId = assetIds[i % assetIds.length];  // ✅ Use real asset IDs
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

            // Query blockchain
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
                console.error(`Query ${i} failed for ${assetId}:`, error.message);
                // Don't fail entire benchmark, just skip this query
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



// Get benchmark results
app.get('/api/benchmark/results', (req, res) => {
    if (!benchmarkResults) {
        return res.json({
            success: false,
            message: 'No benchmark results available. Run a simulation first.'
        });
    }

    res.json({
        success: true,
        results: benchmarkResults
    });
});

// Benchmark status
app.get('/api/benchmark/status', (req, res) => {
    res.json({
        running: benchmarkRunning,
        progress: benchmarkProgress
    });
});

async function startServer() {
    try {
        await smartCache.connect();
        await connectToFabric();
        const PORT = 4000;
        app.listen(PORT, () => {
            console.log(`🚀 FlashChain API running on http://localhost:${PORT}`);
            console.log(`📊 Test: http://localhost:${PORT}/api/asset/SHIP0`);
        });
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

startServer();
