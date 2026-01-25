const express = require('express');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const smartCache = require('./middleware/cache');

const app = express();
app.use(express.json());

let gateway, network, contract;

async function connectToFabric() {
    try {
        const ccpPath = path.resolve(__dirname, 'config', 'connection-org1.json');
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
        network = await gateway.getNetwork('supplychainchannel');
        contract = network.getContract('basic');
        console.log('✅ Connected to Fabric network');
    } catch (error) {
        console.error(`❌ Failed to connect: ${error}`);
        throw error;
    }
}

app.get('/api/asset/:id', async (req, res) => {
    const startTime = Date.now();
    const assetId = req.params.id;
    const stakeholderType = req.query.stakeholder || 'default';
    const cacheKey = `asset:${assetId}`;

    try {
        // Check if cache is disabled
        if (cacheMode !== 'disabled') {
            const cached = await smartCache.get(cacheKey);
            if (cached) {
                const latency = Date.now() - startTime;
                return res.json({
                    success: true,
                    source: 'cache',
                    latency: `${latency}ms`,
                    data: cached,
                    stakeholder: stakeholderType,
                    cacheMode: cacheMode // Show which mode is active
                });
            }
        }

        // Query blockchain
        const result = await contract.evaluateTransaction('ReadAsset', assetId);
        const assetData = JSON.parse(result.toString());

        // Cache only if not disabled
        if (cacheMode !== 'disabled') {
            // Set cache mode before caching
            smartCache.setMode(cacheMode);
            await smartCache.cacheWithContext(cacheKey, assetData, { stakeholderType });
        }

        const latency = Date.now() - startTime;
        return res.json({
            success: true,
            source: 'blockchain',
            latency: `${latency}ms`,
            data: assetData,
            stakeholder: stakeholderType,
            cacheMode: cacheMode
        });

    } catch (error) {
        console.error(`Query failed: ${error}`);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.put('/api/asset/:id', async (req, res) => {
    const startTime = Date.now();
    const assetId = req.params.id;
    const { newOwner } = req.body;

    try {
        await contract.submitTransaction('TransferAsset', assetId, newOwner);
        await smartCache.invalidate(`asset:${assetId}`);

        const latency = Date.now() - startTime;
        res.json({
            success: true,
            latency: `${latency}ms`,
            message: `Asset ${assetId} transferred and cache invalidated`
        });
    } catch (error) {
        console.error(`Update failed: ${error}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Statistics endpoint - Shows cache effectiveness by stakeholder
app.get('/api/stats', async (req, res) => {
    try {
        const stats = smartCache.getStats();

        // Calculate aggregate metrics
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

// Reset statistics endpoint (for testing)
app.post('/api/stats/reset', (req, res) => {
    smartCache.resetStats();
    res.json({ success: true, message: 'Statistics reset' });
});

// Batch query endpoint - For scalability testing
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
                    return { assetId, data: cached, source: 'cache' };
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


async function startServer() {
    try {
        await smartCache.connect();
        await connectToFabric();
        const PORT = 3000;
        app.listen(PORT, () => {
            console.log(`🚀 FlashChain API running on http://localhost:${PORT}`);
            console.log(`📊 Test: http://localhost:${PORT}/api/asset/SHIP0`);
        });
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

// Cache mode control (for testing)
let cacheMode = 'adaptive'; // 'adaptive' | 'simple' | 'disabled'

app.post('/api/cache/mode', (req, res) => {
    const { mode } = req.body;

    if (!['adaptive', 'simple', 'disabled'].includes(mode)) {
        return res.status(400).json({
            success: false,
            error: 'Mode must be: adaptive, simple, or disabled'
        });
    }

    cacheMode = mode;
    console.log(`🔄 Cache mode changed to: ${mode}`);

    res.json({
        success: true,
        mode: cacheMode,
        message: `Cache mode set to ${mode}`
    });
});

app.post('/api/cache/disable', (req, res) => {
    cacheMode = 'disabled';
    console.log('🔄 Cache disabled for testing');
    res.json({ success: true, mode: 'disabled' });
});

app.get('/api/cache/mode', (req, res) => {
    res.json({ mode: cacheMode });
});


startServer();
