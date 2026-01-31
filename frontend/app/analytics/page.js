// app/analytics/page.js
'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, TrendingUp, Database, Zap, Play, Loader, RefreshCw, Activity } from 'lucide-react';
import Link from 'next/link';
import { api } from '../lib/api';

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [benchmarkResults, setBenchmarkResults] = useState(null);
  const [showSimulation, setShowSimulation] = useState(false);

  const [simulationConfig, setSimulationConfig] = useState({
    numQueries: 100,
    mode: 'adaptive'
  });

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll benchmark status while running
  useEffect(() => {
    if (benchmarkRunning) {
      const interval = setInterval(async () => {
        const status = await api.getBenchmarkStatus();
        setBenchmarkProgress(status.progress);
        if (!status.running) {
          setBenchmarkRunning(false);
          await loadStats();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [benchmarkRunning]);

  async function loadStats() {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async function handleReset() {
    if (confirm('Reset all statistics?')) {
      try {
        await api.resetStats();
        setBenchmarkResults(null);
        await loadStats();
      } catch (error) {
        console.error('Error resetting stats:', error);
      }
    }
  }

  async function runSimulation() {
    if (benchmarkRunning) return;

    setBenchmarkRunning(true);
    setBenchmarkProgress(0);

    try {
      const result = await api.runBenchmark(
        simulationConfig.numQueries,
        simulationConfig.mode
      );

      if (result.success) {
        setBenchmarkResults(result.results);
        await loadStats();
      }
    } catch (error) {
      console.error('Simulation failed:', error);
      alert('Simulation failed: ' + error.message);
    } finally {
      setBenchmarkRunning(false);
    }
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Database className="animate-spin mx-auto mb-4 text-indigo-600" size={48} />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const hitRateData = [
    { name: 'Cache Hits', value: stats.summary.cacheHits || 0, color: '#10b981' },
    { name: 'Cache Misses', value: stats.summary.cacheMisses || 0, color: '#ef4444' }
  ];

  const stakeholderData = Object.entries(stats.byStakeholder || {}).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    hits: data.hits,
    misses: data.misses,
    total: data.hits + data.misses
  }));

  const hasData = stats.summary.totalQueries > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b-4 border-indigo-500">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-indigo-600 hover:text-indigo-800 transition">
                <ArrowLeft size={28} />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="text-indigo-600" size={32} />
                  Performance Analytics
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Real-time caching performance & scalability validation
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSimulation(!showSimulation)}
                className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-indigo-700 transition font-semibold flex items-center gap-2"
              >
                <Play size={18} />
                {showSimulation ? 'Hide' : 'Run'} Simulation
              </button>
              <button
                onClick={handleReset}
                className="px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-semibold"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Simulation Panel (Collapsible) */}
        {showSimulation && (
          <div className="mb-8 bg-white rounded-xl shadow-lg border-2 border-indigo-200 overflow-hidden animate-slideDown">
            <div className="bg-black to-purple-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Scalability Performance Test
              </h2>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Number of Queries
                  </label>
                  <select
                    value={simulationConfig.numQueries}
                    onChange={(e) => setSimulationConfig({ ...simulationConfig, numQueries: parseInt(e.target.value) })}
                    disabled={benchmarkRunning}
                    className="w-full px-4 py-3 text-black rounded-lg border-2 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-50 transition"
                  >
                    <option value={50}>50 queries (Quick)</option>
                    <option value={100}>100 queries</option>
                    <option value={500}>500 queries</option>
                    <option value={1000}>1000 queries (Full Test)</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Cache Strategy
                  </label>
                  <select
                    value={simulationConfig.mode}
                    onChange={(e) => setSimulationConfig({ ...simulationConfig, mode: e.target.value })}
                    disabled={benchmarkRunning}
                    className="w-full px-4 text-black py-3 rounded-lg border-2 border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-50 transition"
                  >
                    <option value="disabled">No Cache (Baseline)</option>
                    <option value="simple">Simple Cache</option>
                    <option value="adaptive">Adaptive Cache (Recommended)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={runSimulation}
                    disabled={benchmarkRunning}
                    className="w-full bg-black text-white px-6 py-3 rounded-lg font-bold hover:from-grey-600 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                  >
                    {benchmarkRunning ? (
                      <>
                        <Loader className="animate-spin" size={20} />
                        Running {benchmarkProgress}%
                      </>
                    ) : (
                      <>
                        <Play size={20} />
                        Execute Test
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {benchmarkRunning && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-gray-700">Progress</span>
                    <span className="text-indigo-600 font-bold">{benchmarkProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300"
                      style={{ width: `${benchmarkProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Simulation Results */}
              {benchmarkResults && (
                <div className="mt-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      Test Results
                    </h3>
                    <span className="text-xs bg-green-600 text-white px-3 py-1 rounded-full font-bold">
                      COMPLETED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-white rounded-lg p-4 text-center border border-green-200">
                      <div className="text-xs text-gray-600 font-semibold mb-1">Queries</div>
                      <div className="text-2xl font-bold text-gray-800">{benchmarkResults.numQueries}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center border border-green-200">
                      <div className="text-xs text-gray-600 font-semibold mb-1">TPS</div>
                      <div className="text-2xl font-bold text-indigo-600">{benchmarkResults.tps}</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center border border-green-200">
                      <div className="text-xs text-gray-600 font-semibold mb-1">Avg Latency</div>
                      <div className="text-2xl font-bold text-purple-600">{benchmarkResults.avgLatency}ms</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center border border-green-200">
                      <div className="text-xs text-gray-600 font-semibold mb-1">Hit Rate</div>
                      <div className="text-2xl font-bold text-green-600">{benchmarkResults.cacheHitRate}%</div>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center border border-green-200">
                      <div className="text-xs text-gray-600 font-semibold mb-1">Duration</div>
                      <div className="text-2xl font-bold text-orange-600">{(benchmarkResults.totalTime / 1000).toFixed(1)}s</div>
                    </div>
                  </div>


                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Analytics Dashboard */}
        {hasData ? (
          <>
            {/* Summary Cards */}
            {stats && (
              <div className="grid grid-cols-3 gap-4 bg-gray-50 px-4 py-3 mb-8 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-semibold">CACHE HITS</p>
                  <p className="text-xl font-bold text-green-600">
                    {stats.summary.cacheHits}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-semibold">CACHE MISSES</p>
                  <p className="text-xl font-bold text-red-600">
                    {stats.summary.cacheMisses}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-semibold">HIT RATE</p>
                  <p className="text-xl font-bold text-indigo-600">
                    {stats.summary.cacheHitRate}
                  </p>
                </div>
              </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Pie Chart */}
              <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">
                    Cache Distribution
                  </h2>
                  <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold">
                    Live Data
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={hitRateData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {hitRateData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <p className="text-center text-sm text-gray-600 mt-4">
                  {parseFloat(stats.summary.cacheHitRate) > 80
                    ? '🎯 Excellent cache performance'
                    : '⚠️ Consider optimization'
                  }
                </p>
              </div>

              {/* Bar Chart */}
              <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">
                    Stakeholder Analysis
                  </h2>
                  <span className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-semibold">
                    Context-Aware
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stakeholderData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #667eea',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="hits" fill="#667eea" name="Cache Hits" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="misses" fill="#f093fb" name="Cache Misses" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-sm text-gray-600 mt-4">
                  🧠 Adaptive TTL per stakeholder type
                </p>
              </div>
            </div>


          </>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-xl shadow-lg p-16 text-center">
            <Database size={80} className="mx-auto mb-6 text-gray-300" />
            <h3 className="text-3xl font-bold text-gray-700 mb-3">No Activity Yet</h3>
            <p className="text-gray-500 mb-8 text-lg">
              Start generating performance data to see analytics
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  setShowSimulation(true);
                  setSimulationConfig({ numQueries: 100, mode: 'adaptive' });
                }}
                className="px-8 py-4 bg-black text-white rounded-lg hover:bg-gray-600 transition font-bold shadow-lg flex items-center gap-2"
              >
                <Play size={20} />
                Run Quick Test
              </button>
              <Link
                href="/"
                className="px-8 py-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-bold flex items-center gap-2"
              >
                <ArrowLeft size={20} />
                Use Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
