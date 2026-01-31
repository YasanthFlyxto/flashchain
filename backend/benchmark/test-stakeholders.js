const axios = require('axios');

async function test() {
  for (const stakeholder of ['manufacturer', 'distributor', 'retailer']) {
    const res = await axios.get(`http://localhost:3000/api/asset/asset1?stakeholder=${stakeholder}`);
    console.log(`${stakeholder}: TTL=${res.data.ttl}s, Latency=${res.data.latency}`);
  }
}
test();
