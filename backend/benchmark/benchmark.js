// benchmark-complete.js
const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

async function runTest(mode, iterations = 100) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing: ${mode.toUpperCase()} MODE`);
  console.log('='.repeat(50));

  // 1. Setup
  await axios.post(`${BASE_URL}/api/cache/mode`, { mode });
  await axios.post(`${BASE_URL}/api/stats/reset`);
  await sleep(1000);

  // 2. Run queries
  const latencies = [];
  const sources = { cache: 0, blockchain: 0 };

  for (let i = 0; i < iterations; i++) {
    const assetId = `asset${(i % 6) + 1}`;
    const start = Date.now();

    try {
      const res = await axios.get(`${BASE_URL}/api/asset/${assetId}`);
      const latency = Date.now() - start;
      latencies.push(latency);
      sources[res.data.source]++;

      if (i % 20 === 0) {
        console.log(`Progress: ${i}/${iterations} - Last: ${latency}ms (${res.data.source})`);
      }
    } catch (error) {
      console.error(`Query ${i} failed:`, error.message);
    }
  }

  // 3. Get final stats
  const stats = await axios.get(`${BASE_URL}/api/stats`);

  // 4. Calculate metrics
  const sorted = latencies.sort((a, b) => a - b);
  const results = {
    mode,
    iterations,
    latency: {
      mean: mean(latencies).toFixed(2),
      median: sorted[Math.floor(sorted.length / 2)].toFixed(2),
      min: Math.min(...latencies).toFixed(2),
      max: Math.max(...latencies).toFixed(2),
      p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(2)
    },
    sources,
    cacheHitRate: stats.data.summary.cacheHitRate,
    rawLatencies: latencies
  };

  console.log('\n📊 Results:');
  console.log(`   Mean Latency: ${results.latency.mean}ms`);
  console.log(`   Median: ${results.latency.median}ms`);
  console.log(`   P95: ${results.latency.p95}ms`);
  console.log(`   Cache Hits: ${sources.cache}`);
  console.log(`   Blockchain Queries: ${sources.blockchain}`);
  console.log(`   Hit Rate: ${results.cacheHitRate}`);

  return results;
}

async function runAllTests() {
  console.log('🚀 Starting FlashChain Benchmark Suite\n');

  const allResults = {};

  for (const mode of ['disabled', 'simple', 'adaptive']) {
    allResults[mode] = await runTest(mode, 100);
    await sleep(2000); // Cool-down between tests
  }

  // Save results
  fs.writeFileSync('benchmark-results.json', JSON.stringify(allResults, null, 2));

  // Generate comparison table
  console.log('\n\n📈 COMPARISON TABLE');
  console.log('='.repeat(70));
  console.log('Mode        | Mean    | Median  | P95     | Hit Rate | Cache Hits');
  console.log('-'.repeat(70));

  for (const [mode, data] of Object.entries(allResults)) {
    console.log(
      `${mode.padEnd(11)} | ${data.latency.mean.padEnd(7)} | ${data.latency.median.padEnd(7)} | ` +
      `${data.latency.p95.padEnd(7)} | ${data.cacheHitRate.padEnd(8)} | ${data.sources.cache}`
    );
  }

  console.log('='.repeat(70));
  console.log('\n✅ Results saved to benchmark-results.json');
  console.log('   Import to Excel/SPSS for statistical analysis\n');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function mean(arr) { return arr.reduce((a, b) => a + b) / arr.length; }

// Run it
runAllTests().catch(console.error);
