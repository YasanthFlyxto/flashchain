const axios = require('axios');

async function testBlockchainLoad() {
  console.log('\n' + '='.repeat(70));
  console.log('🔬 TEST 2: BLOCKCHAIN QUERY LOAD COMPARISON');
  console.log('='.repeat(70));
  console.log('\nSimulating 1 hour of mixed workload\n');

  const BASE_URL = 'http://localhost:3000';
  
  // Workload: 40% manufacturers, 30% distributors, 30% retailers
  const workload = [
    { role: 'manufacturer', count: 40 },
    { role: 'distributor', count: 30 },
    { role: 'retailer', count: 30 }
  ];

  // TEST SIMPLE CACHE
  console.log('📊 SIMPLE CACHE TEST:');
  await axios.post(`${BASE_URL}/api/stats/reset`);
  await axios.post(`${BASE_URL}/api/cache/mode`, { mode: 'simple' });
  
  let simpleBlockchainHits = 0;
  
  // Simulate queries over 1 hour (compressed to 100 queries)
  for (const w of workload) {
    for (let i = 0; i < w.count; i++) {
      const res = await axios.get(`${BASE_URL}/api/asset/asset1`);
      if (res.data.source === 'blockchain') simpleBlockchainHits++;
    }
  }
  
  const stats1 = await axios.get(`${BASE_URL}/api/stats`);
  console.log(`   Total Queries: 100`);
  console.log(`   Blockchain Hits: ${stats1.data.blockchainQueries}`);
  console.log(`   Cache Hit Rate: ${stats1.data.cacheHitRate}%\n`);

  // TEST ADAPTIVE CACHE
  console.log('🧠 ADAPTIVE CACHE TEST:');
  await axios.post(`${BASE_URL}/api/stats/reset`);
  await axios.post(`${BASE_URL}/api/cache/mode`, { mode: 'adaptive' });
  
  let adaptiveBlockchainHits = 0;
  
  // Same workload with stakeholder context
  for (const w of workload) {
    for (let i = 0; i < w.count; i++) {
      const res = await axios.get(`${BASE_URL}/api/asset/asset1?stakeholder=${w.role}`);
      if (res.data.source === 'blockchain') adaptiveBlockchainHits++;
    }
  }
  
  const stats2 = await axios.get(`${BASE_URL}/api/stats`);
  console.log(`   Total Queries: 100`);
  console.log(`   Blockchain Hits: ${stats2.data.blockchainQueries}`);
  console.log(`   Cache Hit Rate: ${stats2.data.cacheHitRate}%\n`);

  // ANALYSIS
  console.log('='.repeat(70));
  console.log('📈 ANALYSIS');
  console.log('='.repeat(70));
  
  const reduction = ((stats1.data.blockchainQueries - stats2.data.blockchainQueries) / stats1.data.blockchainQueries * 100).toFixed(1);
  
  console.log(`\n   Simple Cache Blockchain Queries:   ${stats1.data.blockchainQueries}`);
  console.log(`   Adaptive Cache Blockchain Queries: ${stats2.data.blockchainQueries}`);
  console.log(`   \n   💰 REDUCTION: ${reduction}% fewer blockchain queries`);
  console.log(`   \n   🎯 This means LOWER costs, LESS network load, BETTER scalability\n`);
}

testBlockchainLoad().catch(console.error);
