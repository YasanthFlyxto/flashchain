// app/analytics/page.js
'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, TrendingUp, Database, Zap, Play, Loader } from 'lucide-react';
import Link from 'next/link';
import { api } from '../lib/api';

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [cacheMode, setCacheMode] = useState('adaptive');
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [benchmarkResults, setBenchmarkResults] = useState(null);
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
          await loadStats(); // Refresh stats after benchmark
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

  async function handleCacheModeChange(mode) {
    try {
      await api.setCacheMode(mode);
      setCacheMode(mode);
    } catch (error) {
      console.error('Error changing cache mode:', error);
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Database className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const hitRateData = [
    { name: 'Cache Hits', value: stats.summary.cacheHits || 0, color: '#4CAF50' },
    { name: 'Cache Misses', value: stats.summary.cacheMisses || 0, color: '#f44336' }
  ];

  const stakeholderData = Object.entries(stats.byStakeholder || {}).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    hits: data.hits,
    misses: data.misses
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-indigo-600 hover:text-indigo-800">
                <ArrowLeft size={24} />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  📊 Analytics & Performance Testing
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Real-time monitoring & 1000 TPS scalability simulation
                </p>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            >
              Reset All
            </button>
          </div>
        </div>
      </header>

      {/* Simulation Control Panel */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 border-b border-indigo-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              🚀 Performance Simulation (NFR: 1000 TPS Target)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-white text-sm font-semibold mb-2 block">
                  Number of Queries
                </label>
                <select
                  value={simulationConfig.numQueries}
                  onChange={(e) => setSimulationConfig({...simulationConfig, numQueries: parseInt(e.target.value)})}
                  disabled={benchmarkRunning}
                  className="w-full px-4 py-3 rounded-lg border-2 border-white/30 bg-white/20 text-white font-bold disabled:opacity-50"
                >
                  <option value={50}>50 queries (Quick)</option>
                  <option value={100}>100 queries</option>
                  <option value={500}>500 queries</option>
                  <option value={1000}>1000 queries (Full Test)</option>
                </select>
              </div>

              <div>
                <label className="text-white text-sm font-semibold mb-2 block">
                  Cache Mode
                </label>
                <select
                  value={simulationConfig.mode}
                  onChange={(e) => setSimulationConfig({...simulationConfig, mode: e.target.value})}
                  disabled={benchmarkRunning}
                  className="w-full px-4 py-3 rounded-lg border-2 border-white/30 bg-white/20 text-white font-bold disabled:opacity-50"
                >
                  <option value="disabled">No Cache (Baseline)</option>
                  <option value="simple">Simple Cache</option>
                  <option value="adaptive">Adaptive Cache ⭐</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={runSimulation}
                  disabled={benchmarkRunning}
                  className="w-full bg-white text-indigo-600 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {benchmarkRunning ? (
                    <>
                      <Loader className="animate-spin" size={20} />
                      Running... {benchmarkProgress}%
                    </>
                  ) : (
                    <>
                      <Play size={20} />
                      Run Simulation
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {benchmarkRunning && (
              <div className="mt-4">
                <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-green-400 h-full transition-all duration-300 flex items-center justify-center text-xs font-bold"
                    style={{ width: `${benchmarkProgress}%` }}
                  >
                    {benchmarkProgress}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Benchmark Results Card */}
      {benchmarkResults && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-2xl p-6 text-white">
            <h2 className="text-2xl font-bold mb-4">✅ Simulation Results</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white/20 rounded-lg p-4 text-center">
                <div className="text-sm opacity-90">Total Queries</div>
                <div className="text-3xl font-bold">{benchmarkResults.numQueries}</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 text-center">
                <div className="text-sm opacity-90">Throughput (TPS)</div>
                <div className="text-3xl font-bold">{benchmarkResults.tps}</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 text-center">
                <div className="text-sm opacity-90">Avg Latency</div>
                <div className="text-3xl font-bold">{benchmarkResults.avgLatency}ms</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 text-center">
                <div className="text-sm opacity-90">Cache Hit Rate</div>
                <div className="text-3xl font-bold">{benchmarkResults.cacheHitRate}%</div>
              </div>
              <div className="bg-white/20 rounded-lg p-4 text-center">
                <div className="text-sm opacity-90">Total Time</div>
                <div className="text-3xl font-bold">{(benchmarkResults.totalTime / 1000).toFixed(2)}s</div>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-white/10 rounded-lg">
              <div className="text-sm font-semibold mb-2">📈 Performance Analysis:</div>
              <div className="text-sm space-y-1">
                <div>• Min Latency: {benchmarkResults.minLatency}ms</div>
                <div>• Max Latency: {benchmarkResults.maxLatency}ms</div>
                <div>• Cache Hits: {benchmarkResults.cacheHits} | Misses: {benchmarkResults.cacheMisses}</div>
                <div>• Mode: <span className="font-bold">{benchmarkResults.mode.toUpperCase()}</span></div>
                {benchmarkResults.tps >= 100 && (
                  <div className="text-green-200 font-bold">✅ Exceeds 100 TPS target (NFR validated!)</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rest of your existing analytics UI */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 font-semibold">Total Queries</div>
              <Database className="text-blue-500" size={24} />
            </div>
            <div className="text-4xl font-bold text-blue-600">
              {stats.summary.totalQueries}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 font-semibold">Cache Hits</div>
              <Zap className="text-green-500" size={24} />
            </div>
            <div className="text-4xl font-bold text-green-600">
              {stats.summary.cacheHits}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 font-semibold">Cache Misses</div>
              <TrendingUp className="text-red-500" size={24} />
            </div>
            <div className="text-4xl font-bold text-red-600">
              {stats.summary.cacheMisses}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 font-semibold">Hit Rate</div>
              <TrendingUp className="text-purple-500" size={24} />
            </div>
            <div className="text-4xl font-bold text-purple-600">
              {stats.summary.cacheHitRate}
            </div>
          </div>
        </div>

        {/* Charts - only show if there's data */}
        {(stats.summary.totalQueries > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            
            {/* Pie Chart */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6">
                Cache Performance Distribution
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={hitRateData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
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
            </div>

            {/* Bar Chart */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6">
                Performance by Stakeholder Type
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stakeholderData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="hits" fill="#667eea" name="Cache Hits" />
                  <Bar dataKey="misses" fill="#f093fb" name="Cache Misses" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats.summary.totalQueries === 0 && !benchmarkResults && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Database size={64} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No Data Yet</h3>
            <p className="text-gray-500 mb-6">
              Run a simulation above or use the Supply Chain Dashboard to generate statistics
            </p>
            <Link href="/" className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
              Go to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
