// benchmark-stakeholder.js
const axios = require('axios');

async function stakeholderTest() {
  await axios.post('http://localhost:3000/api/cache/mode', {mode: 'adaptive'});
  await axios.post('http://localhost:3000/api/stats/reset');
  
  console.log('\n🏭 MANUFACTURER (should get long TTL - 3600s):');
  for (let i = 0; i < 5; i++) {
    const res = await axios.get('http://localhost:3000/api/asset/asset1?stakeholder=manufacturer');
    console.log(`  Query ${i+1}: ${res.data.latency} | TTL: ${res.data.ttl}s | Source: ${res.data.source}`);
  }
  
  await axios.post('http://localhost:3000/api/stats/reset');
  
  console.log('\n🏪 RETAILER (should get short TTL - 900s):');
  for (let i = 0; i < 5; i++) {
    const res = await axios.get('http://localhost:3000/api/asset/asset1?stakeholder=retailer');
    console.log(`  Query ${i+1}: ${res.data.latency} | TTL: ${res.data.ttl}s | Source: ${res.data.source}`);
  }
}

stakeholderTest();
