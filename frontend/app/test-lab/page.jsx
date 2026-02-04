// app/test-lab/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Zap, RefreshCw, Trash2, Play, CheckCircle2, XCircle, Clock, AlertTriangle, Sparkles, Target, Package } from 'lucide-react';
import Link from 'next/link';

export default function TestLab() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingScenario, setLoadingScenario] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadAssets();
    
    if (autoRefresh) {
      const interval = setInterval(loadAssets, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  async function loadAssets() {
    try {
      const response = await fetch('http://localhost:4000/api/testlab/assets');
      const data = await response.json();
      
      if (data.success) {
        setAssets(data.assets);
        setLastUpdate(new Date());
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading assets:', error);
      setLoading(false);
    }
  }

  async function loadScenario(scenario) {
    setLoadingScenario(scenario);
    
    try {
      const response = await fetch(`http://localhost:4000/api/testlab/load-scenario/${scenario}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Loaded: ${data.scenario}\n\nCreated ${data.assetsCreated} assets:\n${data.assetIds.join(', ')}`);
        await loadAssets();
      }
    } catch (error) {
      alert('Failed to load scenario: ' + error.message);
    } finally {
      setLoadingScenario(null);
    }
  }

  async function clearTestAssets() {
    if (!confirm('⚠️ Delete all TEST_ and JOURNEY_ assets from blockchain?\n\nThis cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/api/testlab/clear-test-assets', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Deleted ${data.deleted} test assets`);
        await loadAssets();
      }
    } catch (error) {
      alert('Failed to clear test assets: ' + error.message);
    }
  }

  async function triggerWorker() {
    try {
      const response = await fetch('http://localhost:4000/api/testlab/trigger-worker', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ Pre-cache worker triggered!\n\nWait 2 seconds and refresh to see results.');
        setTimeout(loadAssets, 2000);
      }
    } catch (error) {
      alert('Failed to trigger worker: ' + error.message);
    }
  }

  const scenarios = [
    {
      id: 'perfect-checkpoint',
      name: '⚡ Perfect Checkpoint Test',
      description: '3 assets: 2 approaching checkpoints, 1 static',
      expected: '100% accuracy for Rule 1',
      color: 'bg-blue-50 border-blue-200 hover:border-blue-400'
    },
    {
      id: 'high-value-suite',
      name: '💎 High-Value Asset Suite',
      description: '3 assets with varying values and distances',
      expected: 'Tests Rule 3 effectiveness',
      color: 'bg-purple-50 border-purple-200 hover:border-purple-400'
    },
    {
      id: 'supply-chain-journey',
      name: '🌍 Supply Chain Journey',
      description: '5 assets at different supply chain stages',
      expected: 'Comprehensive multi-rule test',
      color: 'bg-green-50 border-green-200 hover:border-green-400'
    }
  ];

  // Separate assets by type
  const testAssets = assets.filter(a => a.isTestAsset);
  const realAssets = assets.filter(a => !a.isTestAsset);

  // Count stats
  const willPreCache = assets.filter(a => a.willPreCache).length;
  const currentlyPreCached = assets.filter(a => a.cachedStatus?.isPreCached).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Sparkles className="animate-spin mx-auto mb-4 text-gray-700" size={48} />
          <p className="text-gray-600">Loading Test Lab...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-700 hover:text-gray-900 transition">
                <ArrowLeft size={24} />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="text-gray-700" size={28} />
                  Pre-Cache Test Lab
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Visual testing environment for pre-caching rules and predictions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-300">
                <Clock size={14} />
                Last update: {lastUpdate?.toLocaleTimeString() || 'Never'}
              </div>
              
              <label className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 px-3 py-2 rounded border border-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>

              <button
                onClick={loadAssets}
                className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 transition font-medium text-sm flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded p-5 text-center">
            <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Total Assets</p>
            <p className="text-3xl font-bold text-gray-900">{assets.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded p-5 text-center">
            <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Will Pre-Cache</p>
            <p className="text-3xl font-bold text-gray-900">{willPreCache}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded p-5 text-center">
            <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Currently Cached</p>
            <p className="text-3xl font-bold text-gray-900">{currentlyPreCached}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded p-5 text-center">
            <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Test Assets</p>
            <p className="text-3xl font-bold text-gray-900">{testAssets.length}</p>
          </div>
        </div>

        {/* Scenario Templates */}
        <div className="bg-white border border-gray-200 rounded p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} className="text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900">Scenario Templates</h2>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Load pre-configured test scenarios to validate pre-caching rules. Each scenario creates assets with specific characteristics.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(scenario => (
              <button
                key={scenario.id}
                onClick={() => loadScenario(scenario.id)}
                disabled={loadingScenario === scenario.id}
                className={`p-5 ${scenario.color} border-2 rounded text-left transition disabled:opacity-50`}
              >
                <div className="font-bold text-gray-900 mb-2 text-sm">{scenario.name}</div>
                <p className="text-xs text-gray-600 mb-3">{scenario.description}</p>
                <p className="text-xs text-gray-500 mb-3">Expected: {scenario.expected}</p>
                {loadingScenario === scenario.id ? (
                  <span className="text-xs px-3 py-1 rounded bg-gray-800 text-white font-bold inline-block">
                    Loading...
                  </span>
                ) : (
                  <span className="text-xs px-3 py-1 rounded bg-gray-200 text-gray-700 font-medium inline-block">
                    Load Scenario
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={20} className="text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900">Quick Actions</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={triggerWorker}
              className="px-4 py-3 bg-gray-900 text-white rounded hover:bg-gray-800 transition font-medium text-sm flex items-center justify-center gap-2"
            >
              <Play size={16} />
              Trigger Worker Now
            </button>

            <Link
              href="/analytics"
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition font-medium text-sm flex items-center justify-center gap-2 border border-gray-300"
            >
              <Target size={16} />
              Run Analytics Tests
            </Link>

            <button
              onClick={loadAssets}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition font-medium text-sm flex items-center justify-center gap-2 border border-gray-300"
            >
              <RefreshCw size={16} />
              Refresh Status
            </button>

            <button
              onClick={clearTestAssets}
              className="px-4 py-3 bg-red-600 text-white rounded hover:bg-red-700 transition font-medium text-sm flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              Clear Test Assets
            </button>
          </div>
        </div>

        {/* Test Assets Monitor */}
        {testAssets.length > 0 && (
          <div className="bg-white border border-gray-200 rounded">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Test Assets Monitor</h3>
              <p className="text-xs text-gray-600 mt-1">Assets created for testing scenarios</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Asset ID</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Owner/Status</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Distance</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Value</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Will Pre-Cache</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Currently Cached</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Rule</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {testAssets.map((asset, idx) => (
                    <tr key={idx} className={asset.willPreCache ? 'bg-green-50' : ''}>
                      <td className="px-4 py-3 font-bold text-gray-900">{asset.ID}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="text-xs">{asset.Owner}</div>
                        <div className="text-xs text-gray-500 mt-1">{asset.Status}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded font-bold ${
                          asset.CheckpointDistance < 20 
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {asset.CheckpointDistance === 9999 ? 'N/A' : `${asset.CheckpointDistance}km`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-900 font-medium">
                        ${parseInt(asset.AppraisedValue).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {asset.willPreCache ? (
                          <CheckCircle2 size={20} className="inline text-green-600" />
                        ) : (
                          <XCircle size={20} className="inline text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {asset.cachedStatus?.isPreCached ? (
                          <div className="flex flex-col items-center">
                            <CheckCircle2 size={20} className="text-gray-900" />
                            <span className="text-xs text-gray-500 mt-1">{asset.cachedStatus.age}s ago</span>
                          </div>
                        ) : (
                          <XCircle size={20} className="inline text-gray-300" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {asset.triggeredRule ? (
                          <div>
                            <span className="text-xs px-2 py-1 rounded bg-gray-800 text-white font-bold">
                              {asset.triggeredRule}
                            </span>
                            <p className="text-xs text-gray-500 mt-1">{asset.ruleReason}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Real Assets Monitor */}
        {realAssets.length > 0 && (
          <div className="bg-white border border-gray-200 rounded">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Real Supply Chain Assets</h3>
              <p className="text-xs text-gray-600 mt-1">Production assets with deterministic enrichment</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Asset ID</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Owner/Status</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Distance</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Value</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Will Pre-Cache</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Currently Cached</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Rule</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {realAssets.slice(0, 10).map((asset, idx) => (
                    <tr key={idx} className={asset.willPreCache ? 'bg-blue-50' : ''}>
                      <td className="px-4 py-3 font-bold text-gray-900">{asset.ID}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="text-xs">{asset.Owner}</div>
                        <div className="text-xs text-gray-500 mt-1">{asset.Status}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded font-bold ${
                          asset.CheckpointDistance < 20 
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {asset.CheckpointDistance === 9999 ? 'N/A' : `${asset.CheckpointDistance}km`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-900 font-medium">
                        ${parseInt(asset.AppraisedValue).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {asset.willPreCache ? (
                          <div className="flex flex-col items-center">
                            <Zap size={20} className="text-yellow-500" />
                            <span className="text-xs text-gray-600 mt-1 font-bold">Pending</span>
                          </div>
                        ) : (
                          <XCircle size={20} className="inline text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {asset.cachedStatus?.isPreCached ? (
                          <div className="flex flex-col items-center">
                            <CheckCircle2 size={20} className="text-gray-900" />
                            <span className="text-xs text-gray-500 mt-1">{asset.cachedStatus.age}s ago</span>
                          </div>
                        ) : (
                          <XCircle size={20} className="inline text-gray-300" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {asset.triggeredRule ? (
                          <div>
                            <span className="text-xs px-2 py-1 rounded bg-gray-800 text-white font-bold">
                              {asset.triggeredRule}
                            </span>
                            <p className="text-xs text-gray-500 mt-1">{asset.ruleReason}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No rules match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Assets State */}
        {assets.length === 0 && (
          <div className="bg-white border border-gray-200 rounded p-16 text-center">
            <Package size={64} className="mx-auto mb-6 text-gray-400" />
            <h3 className="text-2xl font-bold text-gray-900 mb-3">No Assets Found</h3>
            <p className="text-gray-600 mb-8">
              Load a scenario template above to create test assets and see pre-caching in action
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="bg-gray-100 border border-gray-300 rounded p-4">
          <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wider">Legend</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="text-gray-700">Will be pre-cached</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-yellow-500" />
              <span className="text-gray-700">Pending worker cycle</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-gray-900" />
              <span className="text-gray-700">Currently cached</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-gray-400" />
              <span className="text-gray-700">No cache/no rules</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
