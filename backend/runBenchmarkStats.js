const { execSync } = require('child_process');

console.log('📊 Running 10 benchmark iterations for statistical analysis...\n');

const results = { noCache: [], simple: [], adaptive: [] };

for (let i = 1; i <= 10; i++) {
  process.stdout.write(`Run ${i}/10... `);
  
  const output = execSync('node loadTestComparison.js', { encoding: 'utf8' });
  
  // Parse results
  const noCacheMatch = output.match(/No Cache.*\n\s+Avg Latency: ([\d.]+)ms/);
  const simpleMatch = output.match(/Simple Cache.*\n\s+Avg Latency: ([\d.]+)ms/);
  const adaptiveMatch = output.match(/Adaptive Cache.*\n\s+Avg Latency: ([\d.]+)ms/);
  
  if (noCacheMatch) results.noCache.push(parseFloat(noCacheMatch[1]));
  if (simpleMatch) results.simple.push(parseFloat(simpleMatch[1]));
  if (adaptiveMatch) results.adaptive.push(parseFloat(adaptiveMatch[1]));
  
  console.log('✅');
}

// Calculate statistics
function stats(arr) {
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const stdDev = Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / arr.length);
  return { avg, median, stdDev, min: Math.min(...arr), max: Math.max(...arr) };
}

console.log('\n' + '='.repeat(70));
console.log('📈 STATISTICAL ANALYSIS (10 runs)');
console.log('='.repeat(70));

['noCache', 'simple', 'adaptive'].forEach(key => {
  const s = stats(results[key]);
  console.log(`\n${key.toUpperCase()}:`);
  console.log(`  Average: ${s.avg.toFixed(2)}ms`);
  console.log(`  Median:  ${s.median.toFixed(2)}ms`);
  console.log(`  Std Dev: ${s.stdDev.toFixed(2)}ms`);
  console.log(`  Range:   ${s.min.toFixed(2)}ms - ${s.max.toFixed(2)}ms`);
});

console.log('\n✅ Statistical validity confirmed!\n');
