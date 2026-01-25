const axios = require('axios');

// TEST 1: No caching (direct blockchain)
async function testNoCaching() {
  // Disable cache temporarily
  await axios.post('http://localhost:3000/api/cache/disable');
  
  let totalLatency = 0;
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    await axios.get(`http://localhost:3000/api/asset/asset1?nocache=true`);
    totalLatency += (Date.now() - start);
  }
  
  return {
    avgLatency: totalLatency / 100,
    scenario: 'No Cache (Baseline)'
  };
}

// TEST 2: Simple caching (fixed 600s TTL for everyone)
async function testSimpleCaching() {
  await axios.post('http://localhost:3000/api/cache/mode', { mode: 'simple' });
  
  let totalLatency = 0;
  let hits = 0;
  
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    const res = await axios.get(`http://localhost:3000/api/asset/asset1`);
    if (res.data.source === 'cache') hits++;
    totalLatency += (Date.now() - start);
  }
  
  return {
    avgLatency: totalLatency / 100,
    cacheHitRate: (hits / 100) * 100,
    scenario: 'Simple Cache (Fixed TTL)'
  };
}

// TEST 3: Your adaptive caching
async function testAdaptiveCaching() {
  await axios.post('http://localhost:3000/api/cache/mode', { mode: 'adaptive' });
  
  let totalLatency = 0;
  let hits = 0;
  
  // Test with different stakeholders
  const stakeholders = ['manufacturer', 'distributor', 'retailer'];
  
  for (let i = 0; i < 100; i++) {
    const stakeholder = stakeholders[i % 3];
    const start = Date.now();
    const res = await axios.get(`http://localhost:3000/api/asset/asset1?stakeholder=${stakeholder}`);
    if (res.data.source === 'cache') hits++;
    totalLatency += (Date.now() - start);
  }
  
  return {
    avgLatency: totalLatency / 100,
    cacheHitRate: (hits / 100) * 100,
    scenario: 'Adaptive Cache (Your Novel Approach)'
  };
}

async function runComparison() {
  console.log('\n📊 FLASHCHAIN BENCHMARKING COMPARISON\n');
  console.log('='.repeat(70));
  
  const baseline = await testNoCaching();
  console.log(`\n✅ ${baseline.scenario}`);
  console.log(`   Avg Latency: ${baseline.avgLatency.toFixed(2)}ms`);
  
  const simple = await testSimpleCaching();
  console.log(`\n✅ ${simple.scenario}`);
  console.log(`   Avg Latency: ${simple.avgLatency.toFixed(2)}ms`);
  console.log(`   Cache Hit Rate: ${simple.cacheHitRate.toFixed(2)}%`);
  console.log(`   vs Baseline: ${((1 - simple.avgLatency/baseline.avgLatency) * 100).toFixed(2)}% faster`);
  
  const adaptive = await testAdaptiveCaching();
  console.log(`\n✅ ${adaptive.scenario}`);
  console.log(`   Avg Latency: ${adaptive.avgLatency.toFixed(2)}ms`);
  console.log(`   Cache Hit Rate: ${adaptive.cacheHitRate.toFixed(2)}%`);
  console.log(`   vs Baseline: ${((1 - adaptive.avgLatency/baseline.avgLatency) * 100).toFixed(2)}% faster`);
  console.log(`   vs Simple Cache: ${((1 - adaptive.avgLatency/simple.avgLatency) * 100).toFixed(2)}% faster`);
  
  console.log('\n' + '='.repeat(70));
  console.log('\n🎯 RESEARCH VALIDATION:');
  console.log(`   Adaptive caching provides ${((simple.avgLatency - adaptive.avgLatency) / simple.avgLatency * 100).toFixed(2)}% additional improvement`);
  console.log(`   over simple fixed-TTL caching.\n`);
}

runComparison();
