'use client';

import { useState, useEffect } from 'react';

export default function DemoPage() {
  const [sessionId, setSessionId] = useState(null);
  const [assets, setAssets] = useState([]);
  const [cacheStatus, setCacheStatus] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [isWorkerRunning, setIsWorkerRunning] = useState(false);
  const [testProgress, setTestProgress] = useState('idle');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [singleQueryResult, setSingleQueryResult] = useState(null);

  const API_BASE = 'http://localhost:4000/api';

  // Create new test session
  const createSession = async () => {
    try {
      setTestProgress('creating');
      const response = await fetch(`${API_BASE}/test-orchestrator/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetCount: 20 })
      });
      const data = await response.json();
      setSessionId(data.sessionId);
      setTestProgress('ready');
    } catch (error) {
      console.error('Error creating session:', error);
      setTestProgress('error');
    }
  };

  // Generate test assets
  const generateAssets = async () => {
    try {
      setTestProgress('generating');
      const response = await fetch(
        `${API_BASE}/test-orchestrator/session/${sessionId}/generate-assets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetCount: 20,
            ruleDistribution: {
              proximityRule: 0.3,
              highValueRule: 0.3,
              multiStakeholderRule: 0.2,
              offPeakRule: 0.2
            }
          })
        }
      );
      const data = await response.json();
      setAssets(data.assets || []); // ← Add || [] here
      setTestProgress('assets-created');
    } catch (error) {
      console.error('Error generating assets:', error);
      setTestProgress('error');
    }
  };


  // Trigger pre-cache worker
  const triggerWorker = async () => {
    try {
      setIsWorkerRunning(true);
      await fetch(`${API_BASE}/testlab/trigger-worker`, { method: 'POST' });

      // Wait for worker to complete
      setTimeout(() => {
        checkCacheStatus();
        setIsWorkerRunning(false);
      }, 3000);
    } catch (error) {
      console.error('Error triggering worker:', error);
      setIsWorkerRunning(false);
    }
  };

  // Check which assets are in cache
  const checkCacheStatus = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/test-orchestrator/session/${sessionId}/cache-status`
      );
      const data = await response.json();
      setCacheStatus(data.assets);
    } catch (error) {
      console.error('Error checking cache status:', error);
    }
  };

  // Query single asset
  const querySingleAsset = async (assetId) => {
    try {
      setSingleQueryResult(null);
      const response = await fetch(
        `${API_BASE}/test-orchestrator/session/${sessionId}/query-single`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId })
        }
      );
      const data = await response.json();
      setSingleQueryResult(data);
      setSelectedAsset(assetId);
    } catch (error) {
      console.error('Error querying asset:', error);
    }
  };

  // Run bulk query test
  const runBulkTest = async () => {
    try {
      setTestProgress('bulk-testing');
      const response = await fetch(
        `${API_BASE}/test-orchestrator/session/${sessionId}/query-bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iterations: 50 })
        }
      );
      const data = await response.json();
      setMetrics(data);
      setTestProgress('completed');
    } catch (error) {
      console.error('Error running bulk test:', error);
      setTestProgress('error');
    }
  };

  // Auto-refresh cache status
  useEffect(() => {
    if (sessionId && testProgress === 'assets-created') {
      const interval = setInterval(checkCacheStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [sessionId, testProgress]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🎯 FlashChain Real-Time Demo
          </h1>
          <p className="text-blue-200">
            Visual demonstration of predictive pre-caching architecture
          </p>
        </div>

        {/* Control Panel */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">Control Panel</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={createSession}
              disabled={sessionId || testProgress === 'creating'}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white rounded-lg font-semibold transition"
            >
              {testProgress === 'creating' ? 'Creating...' : '1. Create Test Session'}
            </button>

            <button
              onClick={generateAssets}
              disabled={!sessionId || assets?.length > 0 || testProgress === 'generating'}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white rounded-lg font-semibold transition"
            >
              {testProgress === 'generating' ? 'Generating...' : '2. Generate Test Assets'}
            </button>

            <button
              onClick={triggerWorker}
              disabled={!assets?.length || isWorkerRunning}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white rounded-lg font-semibold transition"
            >
              {isWorkerRunning ? '⏳ Worker Running...' : '3. Run Pre-Cache Worker'}
            </button>

            <button
              onClick={runBulkTest}
              disabled={cacheStatus.length === 0 || testProgress === 'bulk-testing'}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-500 text-white rounded-lg font-semibold transition"
            >
              {testProgress === 'bulk-testing' ? 'Testing...' : '4. Run Bulk Test (1000 queries)'}
            </button>
          </div>

          {sessionId && (
            <div className="mt-4 text-sm text-blue-200">
              Session ID: <span className="font-mono">{sessionId}</span>
            </div>
          )}
        </div>

        {/* Asset Visualization Grid */}
        {cacheStatus.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">
              Asset Distribution (Cache vs Blockchain)
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-green-500/20 border-2 border-green-500 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-400">
                  {cacheStatus.filter(a => a.inCache).length}
                </div>
                <div className="text-green-200">Assets in Cache (Pre-Cached)</div>
              </div>

              <div className="bg-blue-500/20 border-2 border-blue-500 rounded-lg p-4">
                <div className="text-3xl font-bold text-blue-400">
                  {cacheStatus.filter(a => !a.inCache).length}
                </div>
                <div className="text-blue-200">Assets in Blockchain Only</div>
              </div>
            </div>

            {/* Asset Cards Grid */}
            <div className="grid grid-cols-4 gap-4">
              {cacheStatus.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => querySingleAsset(asset.id)}
                  className={`
                    p-4 rounded-lg border-2 cursor-pointer transition-all hover:scale-105
                    ${asset.inCache
                      ? 'bg-green-500/20 border-green-500'
                      : 'bg-blue-500/20 border-blue-500'}
                    ${selectedAsset === asset.id ? 'ring-4 ring-yellow-400' : ''}
                  `}
                >
                  <div className="text-xs font-mono text-white/70 mb-2">
                    {asset.id.substring(0, 15)}...
                  </div>
                  <div className={`text-sm font-semibold ${asset.inCache ? 'text-green-300' : 'text-blue-300'}`}>
                    {asset.location.toUpperCase()}
                  </div>
                  {asset.ruleTarget !== 'none' && (
                    <div className="text-xs text-white/60 mt-2">
                      Rule: {asset.ruleTarget}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single Query Result */}
        {singleQueryResult && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Query Result</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-1">Asset ID</div>
                <div className="text-lg font-mono text-white">{singleQueryResult.assetId}</div>
              </div>

              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-1">Source</div>
                <div className={`text-lg font-bold ${singleQueryResult.source === 'cache' ? 'text-green-400' : 'text-blue-400'
                  }`}>
                  {singleQueryResult.source.toUpperCase()}
                </div>
              </div>

              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-1">Latency</div>
                <div className="text-lg font-bold text-yellow-400">{singleQueryResult.latency}ms</div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Test Results */}
        {metrics && (
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">
              📊 Bulk Query Performance (1000+ Queries)
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-black/20 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-1">Total Queries</div>
                <div className="text-2xl font-bold text-white">{metrics.totalQueries}</div>
              </div>

              <div className="bg-green-500/20 rounded-lg p-4">
                <div className="text-sm text-green-200 mb-1">Cache Hits</div>
                <div className="text-2xl font-bold text-green-400">{metrics.cacheHits}</div>
              </div>

              <div className="bg-blue-500/20 rounded-lg p-4">
                <div className="text-sm text-blue-200 mb-1">Blockchain Queries</div>
                <div className="text-2xl font-bold text-blue-400">{metrics.blockchainQueries}</div>
              </div>

              <div className="bg-yellow-500/20 rounded-lg p-4">
                <div className="text-sm text-yellow-200 mb-1">Improvement</div>
                <div className="text-2xl font-bold text-yellow-400">{metrics.improvementPercentage}%</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-black/30 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-2">Avg Cache Latency</div>
                <div className="text-3xl font-bold text-green-400">
                  {metrics.avgCacheLatency.toFixed(2)}ms
                </div>
              </div>

              <div className="bg-black/30 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-2">Avg Blockchain Latency</div>
                <div className="text-3xl font-bold text-blue-400">
                  {metrics.avgBlockchainLatency.toFixed(2)}ms
                </div>
              </div>

              <div className="bg-black/30 rounded-lg p-4">
                <div className="text-sm text-white/60 mb-2">Speed Improvement</div>
                <div className="text-3xl font-bold text-yellow-400">
                  {(metrics.avgBlockchainLatency / metrics.avgCacheLatency).toFixed(1)}x faster
                </div>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div className="mt-6">
              <div className="text-sm text-white/60 mb-2">Latency Comparison</div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-green-300">Cache</span>
                    <span className="text-green-400">{metrics.avgCacheLatency.toFixed(2)}ms</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-8">
                    <div
                      className="bg-gradient-to-r from-green-500 to-green-400 h-8 rounded-full flex items-center justify-end pr-3"
                      style={{ width: `${(metrics.avgCacheLatency / metrics.avgBlockchainLatency) * 100}%` }}
                    >
                      <span className="text-xs font-bold text-white">FAST</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-blue-300">Blockchain</span>
                    <span className="text-blue-400">{metrics.avgBlockchainLatency.toFixed(2)}ms</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-8">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-400 h-8 rounded-full flex items-center justify-end pr-3"
                      style={{ width: '100%' }}
                    >
                      <span className="text-xs font-bold text-white">SLOW</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!sessionId && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 text-center">
            <p className="text-blue-200 text-lg">
              👆 Click "Create Test Session" to begin the demonstration
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
