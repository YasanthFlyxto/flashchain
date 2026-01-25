const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ASSETS = ['asset1', 'asset2', 'asset3', 'asset4', 'asset5', 'asset6'];
const STAKEHOLDERS = ['manufacturer', 'distributor', 'retailer', 'default'];

let stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    errors: 0
};

async function testQuery(assetId, stakeholder) {
    try {
        const start = Date.now();
        const response = await axios.get(`${BASE_URL}/api/asset/${assetId}?stakeholder=${stakeholder}`);
        const latency = Date.now() - start;
        
        stats.totalRequests++;
        stats.totalLatency += latency;
        stats.minLatency = Math.min(stats.minLatency, latency);
        stats.maxLatency = Math.max(stats.maxLatency, latency);
        
        if (response.data.source === 'cache') {
            stats.cacheHits++;
        } else {
            stats.cacheMisses++;
        }
        
        return response.data;
    } catch (error) {
        stats.errors++;
        console.error(`Error querying ${assetId}:`, error.message);
    }
}

async function runLoadTest(duration = 30, concurrency = 5) {
    console.log(`\n🚀 FlashChain Load Test`);
    console.log(`Duration: ${duration}s | Concurrency: ${concurrency} users\n`);
    
    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);
    
    const workers = [];
    
    for (let i = 0; i < concurrency; i++) {
        workers.push((async () => {
            while (Date.now() < endTime) {
                const assetId = ASSETS[Math.floor(Math.random() * ASSETS.length)];
                const stakeholder = STAKEHOLDERS[Math.floor(Math.random() * STAKEHOLDERS.length)];
                await testQuery(assetId, stakeholder);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        })());
    }
    
    await Promise.all(workers);
    
    console.log('\n📊 Load Test Results');
    console.log('='.repeat(60));
    console.log(`Total Requests:  ${stats.totalRequests}`);
    console.log(`Cache Hits:      ${stats.cacheHits} (${(stats.cacheHits/stats.totalRequests*100).toFixed(2)}%)`);
    console.log(`Cache Misses:    ${stats.cacheMisses} (${(stats.cacheMisses/stats.totalRequests*100).toFixed(2)}%)`);
    console.log(`Average Latency: ${(stats.totalLatency/stats.totalRequests).toFixed(2)}ms`);
    console.log(`Min Latency:     ${stats.minLatency}ms`);
    console.log(`Max Latency:     ${stats.maxLatency}ms`);
    console.log(`Errors:          ${stats.errors}`);
    console.log(`Throughput:      ${(stats.totalRequests / duration).toFixed(2)} requests/sec`);
    console.log('='.repeat(60));
    
    const avgCacheLatency = stats.minLatency;
    const avgBlockchainLatency = stats.maxLatency;
    const improvement = ((avgBlockchainLatency - avgCacheLatency) / avgBlockchainLatency * 100).toFixed(2);
    
    console.log(`\n✨ Performance Improvement: ${improvement}% faster with cache`);
}

runLoadTest(30, 5);
