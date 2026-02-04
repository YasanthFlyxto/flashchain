// app/page.jsx - UPDATED WITH TEST LAB LINK
'use client';

import { useState, useEffect } from 'react';
import { Package, TrendingUp, Clock, Database, Zap, ArrowRight, RefreshCw, Trash2, BarChart3, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

export default function Dashboard() {
  const [shipments, setShipments] = useState([]);
  const [stats, setStats] = useState(null);
  const [preCacheActivity, setPreCacheActivity] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [effectiveness, setEffectiveness] = useState(null);
  const [role, setRole] = useState('manufacturer');
  const [lastQuery, setLastQuery] = useState(null);
  const [cacheMode, setCacheMode] = useState('adaptive');
  const [expandedShipment, setExpandedShipment] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [shipmentsRes, statsRes, activityRes, predictionsRes, effectivenessRes, modeRes] = await Promise.all([
        fetch('http://localhost:4000/api/assets'),
        fetch('http://localhost:4000/api/stats'),
        fetch('http://localhost:4000/api/precache/activity'),
        fetch('http://localhost:4000/api/precache/predictions'),
        fetch('http://localhost:4000/api/precache/effectiveness'),
        fetch('http://localhost:4000/api/cache/mode')
      ]);

      const shipmentsData = await shipmentsRes.json();
      const statsData = await statsRes.json();
      const activityData = await activityRes.json();
      const predictionsData = await predictionsRes.json();
      const effectivenessData = await effectivenessRes.json();
      const modeData = await modeRes.json();

      if (shipmentsData.success) setShipments(shipmentsData.data);
      if (statsData.success) setStats(statsData);
      if (activityData.success) setPreCacheActivity(activityData.activity);
      if (predictionsData.success) setPredictions(predictionsData.predictions);
      if (effectivenessData.success) setEffectiveness(effectivenessData.effectiveness);
      setCacheMode(modeData.mode);

    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async function queryShipment(shipmentId) {
    const startTime = Date.now();
    try {
      const response = await fetch(`http://localhost:4000/api/asset/${shipmentId}?stakeholder=${role}`);
      const data = await response.json();
      const latency = Date.now() - startTime;

      setLastQuery({
        shipmentId,
        source: data.source,
        latency,
        timestamp: Date.now(),
        preCached: data.preCached,
        preCacheRule: data.preCacheRule
      });

      await loadData();
    } catch (error) {
      console.error('Error querying shipment:', error);
    }
  }

  async function handleCacheModeChange(newMode) {
    try {
      await fetch('http://localhost:4000/api/cache/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      setCacheMode(newMode);
      await loadData();
    } catch (error) {
      console.error('Error changing cache mode:', error);
    }
  }

  async function handleClearAll() {
    if (!confirm('⚠️ This will clear ALL cache, statistics, and activity logs.\n\nAre you sure you want to continue?')) {
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/api/system/reset', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setStats(null);
        setPreCacheActivity([]);
        setPredictions([]);
        setEffectiveness(null);
        setLastQuery(null);
        setComparisonData(null);

        alert('✅ System Reset Complete!\n\n• All cache cleared\n• Statistics reset\n• Activity logs cleared\n\nYou can now test pre-caching from scratch.');

        await loadData();
      } else {
        alert('❌ Failed to reset system: ' + data.error);
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  }

  async function compareLatency(shipmentId) {
    setLoadingComparison(shipmentId);
    try {
      const response = await fetch(`http://localhost:4000/api/asset/${shipmentId}/compare?stakeholder=${role}`);
      const data = await response.json();

      if (data.success) {
        setComparisonData({
          shipmentId,
          ...data.comparison
        });
        setExpandedShipment(shipmentId);
      }
    } catch (error) {
      console.error('Error comparing latency:', error);
      alert('Failed to compare latency');
    } finally {
      setLoadingComparison(null);
    }
  }

  const roleColors = {
    manufacturer: 'bg-blue-50 text-blue-700 border-blue-200',
    distributor: 'bg-purple-50 text-purple-700 border-purple-200',
    retailer: 'bg-green-50 text-green-700 border-green-200',
    default: 'bg-gray-50 text-gray-700 border-gray-200'
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="text-gray-700" size={28} />
                FlashChain Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Predictive Pre-Caching for Blockchain Supply Chain
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/test-lab"
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition font-medium flex items-center gap-2 text-sm"
              >
                <Sparkles size={16} />
                Test Lab
              </Link>
              <Link
                href="/demo"
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition font-medium flex items-center gap-2 text-sm"
              >
                <Sparkles size={16} />
                Demo Dashboard
              </Link>
              <Link
                href="/analytics"
                className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 transition font-medium flex items-center gap-2 text-sm"
              >
                <BarChart3 size={16} />
                Analytics
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Role:</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="manufacturer">🏭 Manufacturer</option>
                  <option value="distributor">🚚 Distributor</option>
                  <option value="retailer">🏪 Retailer</option>
                  <option value="default">👔 Manager</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Cache:</label>
                <select
                  value={cacheMode}
                  onChange={(e) => handleCacheModeChange(e.target.value)}
                  className="px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="adaptive">Adaptive (Smart)</option>
                  <option value="simple">Simple (Fixed TTL)</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {lastQuery && (
                <div className="flex items-center gap-3 text-sm">
                  <span className={`px-2 py-1 rounded font-medium ${lastQuery.source === 'cache'
                      ? 'bg-gray-100 text-gray-800 border border-gray-300'
                      : 'bg-gray-800 text-white'
                    }`}>
                    {lastQuery.source === 'cache' ? 'CACHE' : 'BLOCKCHAIN'}
                  </span>
                  <span className="text-gray-700">
                    Latency: <span className="font-bold text-gray-900">{lastQuery.latency}ms</span>
                  </span>
                  {lastQuery.preCached && (
                    <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 border border-green-300 font-bold">
                      PRE-CACHED
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={loadData}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition flex items-center gap-2 font-medium border border-gray-300"
              >
                <RefreshCw size={14} />
                Refresh
              </button>

              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded transition flex items-center gap-2 font-bold border border-red-700"
                title="Clear all cache, stats, and activity"
              >
                <Trash2 size={14} />
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column - Shipments */}
          <div className="lg:col-span-2 space-y-6">

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded p-4 text-center">
                  <p className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Cache Hits</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.summary.cacheHits}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded p-4 text-center">
                  <p className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Hit Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.summary.cacheHitRate}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded p-4 text-center">
                  <p className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Pre-Cached</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.summary.totalPreCached}</p>
                </div>
              </div>
            )}

            {/* Shipments List */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Supply Chain Assets</h2>
                <p className="text-sm text-gray-600">Click to query • Compare to see cache vs blockchain latency</p>
              </div>

              <div className="divide-y divide-gray-200">
                {shipments.slice(0, 10).map((shipment) => (
                  <div key={shipment.ID}>
                    <div className="p-4 hover:bg-gray-50 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-gray-900">{shipment.ID}</span>
                            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 border border-gray-300 font-medium">
                              {shipment.Owner}
                            </span>
                            <span className="text-xs text-gray-600">
                              ${parseInt(shipment.AppraisedValue).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => compareLatency(shipment.ID)}
                            disabled={loadingComparison === shipment.ID}
                            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition font-medium border border-gray-300 disabled:opacity-50"
                          >
                            {loadingComparison === shipment.ID ? 'Loading...' : 'Compare'}
                          </button>
                          <button
                            onClick={() => queryShipment(shipment.ID)}
                            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800 transition font-medium flex items-center gap-1"
                          >
                            Query
                            <ArrowRight size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Comparison Modal */}
                    {comparisonData && comparisonData.shipmentId === shipment.ID && expandedShipment === shipment.ID && (
                      <div className="bg-gray-50 border-t border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-gray-900">Latency Comparison</h4>
                          <button
                            onClick={() => setExpandedShipment(null)}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            Close
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div className="bg-white rounded p-3 border border-gray-200">
                            <p className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Cache</p>
                            <p className="text-xl font-bold text-gray-900">
                              {comparisonData.cached.available ? `${comparisonData.cached.latency}ms` : 'N/A'}
                            </p>
                            {comparisonData.cached.preCached && (
                              <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold mt-1 inline-block">
                                PRE-CACHED
                              </span>
                            )}
                          </div>
                          <div className="bg-white rounded p-3 border border-gray-200">
                            <p className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Blockchain</p>
                            <p className="text-xl font-bold text-gray-900">{comparisonData.blockchain.latency}ms</p>
                          </div>
                          <div className="bg-white rounded p-3 border border-gray-200">
                            <p className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Improvement</p>
                            <p className="text-xl font-bold text-green-700">{comparisonData.improvement.percentFaster}</p>
                            <p className="text-xs text-gray-600 mt-1">{comparisonData.improvement.speedupFactor} faster</p>
                          </div>
                        </div>

                        {comparisonData.cached.available && (
                          <div className="bg-green-50 border border-green-200 rounded p-3 text-xs">
                            <p className="font-bold text-green-900 mb-1">✓ Time Saved: {comparisonData.improvement.timeSavedMs}</p>
                            <p className="text-green-700">
                              This asset was {comparisonData.cached.preCached ? 'pre-cached by prediction rules' : 'cached from previous query'}
                              {comparisonData.cached.age && ` (${comparisonData.cached.age}s ago)`}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column - Activity & Predictions */}
          <div className="space-y-6">

            {/* Pre-Cache Effectiveness */}
            {effectiveness && (
              <div className="bg-white border border-gray-200 rounded p-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Pre-Cache Effectiveness</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pre-Cache Hits:</span>
                    <span className="font-bold text-gray-900">{effectiveness.preCacheHits}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Hit Rate:</span>
                    <span className="font-bold text-gray-900">{effectiveness.preCacheRate}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Time Saved:</span>
                    <span className="font-bold text-green-700">{effectiveness.totalTimeSaved}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Predictions */}
            {predictions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Upcoming Events</h3>
                </div>
                <div className="divide-y divide-gray-200">
                  {predictions.map((pred, idx) => (
                    <div key={idx} className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <span className="font-bold text-gray-900 text-sm">{pred.assetId}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${pred.priority === 'high'
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : 'bg-gray-100 text-gray-700 border border-gray-300'
                          }`}>
                          {pred.priority.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{pred.reason}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{pred.rule}</span>
                        <span className="font-medium text-gray-700">{pred.minutesUntil}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Pre-Cache Activity */}
            <div className="bg-white border border-gray-200 rounded">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Recent Activity</h3>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {preCacheActivity.slice(0, 10).map((activity, idx) => (
                  <div key={idx} className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-bold text-gray-900 text-sm">{activity.assetId}</span>
                      <span className="text-xs text-gray-500">
                        {Math.floor((Date.now() - activity.timestamp) / 60000)}m ago
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{activity.reason}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-white font-bold">
                        {activity.rule}
                      </span>
                      <span className="text-xs text-gray-500">TTL: {activity.ttl}s</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
