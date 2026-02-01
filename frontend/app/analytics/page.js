// app/analytics/page.js
'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, TrendingUp, Database, Zap, Play, Loader, RefreshCw, Activity, Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { api } from '../lib/api';

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState(0);
  const [benchmarkResults, setBenchmarkResults] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const [runningComparison, setRunningComparison] = useState(false);

  const [simulationConfig, setSimulationConfig] = useState({
    numQueries: 100,
    mode: 'adaptive',
    preset: 'standard'
  });

  // Real-world benchmark presets
  const benchmarkPresets = {
    standard: {
      name: 'Standard Test',
      description: '100 queries - Quick validation',
      queries: 100,
      eventsPerSec: 100,
      icon: '⚡'
    },
    medium: {
      name: 'Medium Scale',
      description: '500 queries - Realistic load',
      queries: 500,
      eventsPerSec: 500,
      icon: '🔥'
    },
    ikea: {
      name: 'IKEA Scale (Peak)',
      description: '10,593 events/sec - Real-world stress test',
      queries: 1000,
      eventsPerSec: 10593,
      icon: '🏭'
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 3000);
    return () => clearInterval(interval);
  }, []);

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
    if (confirm('⚠️ Reset all statistics and benchmark results?')) {
      try {
        await api.resetStats();
        setBenchmarkResults(null);
        setComparisonResults(null);
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

  // NEW: Run comparison across all 3 modes
  async function runFullComparison() {
    if (runningComparison) return;

    setRunningComparison(true);
    setBenchmarkProgress(0);
    
    const modes = ['disabled', 'simple', 'adaptive'];
    const results = [];

    try {
      for (let i = 0; i < modes.length; i++) {
        const mode = modes[i];
        setBenchmarkProgress(Math.floor((i / modes.length) * 100));
        
        const result = await api.runBenchmark(simulationConfig.numQueries, mode);
        
        if (result.success) {
          results.push({
            mode,
            ...result.results
          });
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setComparisonResults(results);
      setBenchmarkProgress(100);
      
    } catch (error) {
      alert('Comparison failed: ' + error.message);
    } finally {
      setRunningComparison(false);
      await loadStats();
    }
  }

  // Calculate queue time based on IKEA study
  function calculateQueueMetrics(eventsPerSec, tps) {
    const queueTime = eventsPerSec / tps; // seconds
    const eventsQueued = eventsPerSec - tps;
    return { queueTime, eventsQueued };
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Database className="animate-spin mx-auto mb-4 text-gray-700" size={48} />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const hitRateData = [
    { name: 'Cache Hits', value: stats.summary.cacheHits || 0, color: '#1f2937' },
    { name: 'Cache Misses', value: stats.summary.cacheMisses || 0, color: '#d1d5db' }
  ];

  const stakeholderData = Object.entries(stats.byStakeholder || {}).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    hits: data.hits,
    misses: data.misses,
    total: data.hits + data.misses
  }));

  const hasData = stats.summary.totalQueries > 0;

  // IKEA benchmark reference data
  const ikeaMetrics = calculateQueueMetrics(10593, 159);

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
                  <Activity className="text-gray-700" size={28} />
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
                className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 transition font-medium flex items-center gap-2 text-sm"
              >
                <Play size={16} />
                {showSimulation ? 'Hide' : 'Show'} Benchmarks
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-medium border border-gray-300 text-sm"
              >
                <RefreshCw size={16} />
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* IKEA Benchmark Reference Card */}
        <div className="mb-6 bg-white border border-gray-300 rounded p-5">
          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-3 rounded">
              <Database size={32} className="text-gray-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Real-World Benchmark Reference</h3>
              <p className="text-sm text-gray-700 mb-3">
                Based on Linköping University study (2019): IKEA's supply chain generates <span className="font-bold text-gray-900">10,593 events/second</span> during peak times. 
                Traditional blockchain handled only <span className="font-bold text-gray-900">159 TPS</span>.
              </p>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded border border-gray-200">
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wider mb-1">Events/Second</p>
                  <p className="text-lg font-bold text-gray-900">10,593</p>
                </div>
                <div className="bg-gray-50 p-3 rounded border border-gray-200">
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wider mb-1">Blockchain TPS</p>
                  <p className="text-lg font-bold text-gray-900">159</p>
                </div>
                <div className="bg-red-50 p-3 rounded border border-red-200">
                  <p className="text-xs text-red-700 font-medium uppercase tracking-wider mb-1">Queue Time</p>
                  <p className="text-lg font-bold text-red-600">{ikeaMetrics.queueTime.toFixed(0)}s</p>
                </div>
                <div className="bg-red-50 p-3 rounded border border-red-200">
                  <p className="text-xs text-red-700 font-medium uppercase tracking-wider mb-1">Events Queued</p>
                  <p className="text-lg font-bold text-red-600">{ikeaMetrics.eventsQueued.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Simulation Panel */}
        {showSimulation && (
          <div className="mb-8 bg-white rounded border border-gray-300 overflow-hidden">
            <div className="bg-gray-900 px-6 py-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap size={20} />
                Scalability Performance Test
              </h2>
            </div>

            <div className="p-6">
              {/* Preset Selection */}
              <div className="mb-6">
                <label className="text-sm font-bold text-gray-900 mb-3 block uppercase tracking-wider">
                  Select Benchmark Preset
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(benchmarkPresets).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => setSimulationConfig({
                        ...simulationConfig,
                        preset: key,
                        numQueries: preset.queries
                      })}
                      disabled={benchmarkRunning || runningComparison}
                      className={`p-4 rounded border-2 text-left transition ${
                        simulationConfig.preset === key
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                      } disabled:opacity-50`}
                    >
                      <div className="text-2xl mb-2">{preset.icon}</div>
                      <div className="font-bold text-gray-900 mb-1">{preset.name}</div>
                      <div className="text-xs text-gray-600 mb-2">{preset.description}</div>
                      <div className="text-xs font-mono text-gray-700">
                        {preset.queries} queries • {preset.eventsPerSec} events/s
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Test Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-bold text-gray-900 mb-2 block uppercase tracking-wider">
                    Cache Strategy
                  </label>
                  <select
                    value={simulationConfig.mode}
                    onChange={(e) => setSimulationConfig({ ...simulationConfig, mode: e.target.value })}
                    disabled={benchmarkRunning || runningComparison}
                    className="w-full px-4 py-3 text-gray-900 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50"
                  >
                    <option value="disabled">No Cache (Blockchain Only)</option>
                    <option value="simple">Simple Cache (Fixed TTL)</option>
                    <option value="adaptive">Adaptive Pre-Cache (Smart)</option>
                  </select>
                </div>

                <div className="flex items-end gap-3">
                  <button
                    onClick={runSimulation}
                    disabled={benchmarkRunning || runningComparison}
                    className="flex-1 bg-gray-900 text-white px-6 py-3 rounded font-bold hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {benchmarkRunning ? (
                      <>
                        <Loader className="animate-spin" size={18} />
                        Running {benchmarkProgress}%
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        Single Test
                      </>
                    )}
                  </button>

                  <button
                    onClick={runFullComparison}
                    disabled={benchmarkRunning || runningComparison}
                    className="flex-1 bg-gray-800 text-white px-6 py-3 rounded font-bold hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-2 border-gray-900"
                  >
                    {runningComparison ? (
                      <>
                        <Loader className="animate-spin" size={18} />
                        Comparing {benchmarkProgress}%
                      </>
                    ) : (
                      <>
                        <TrendingUp size={18} />
                        Compare All Modes
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {(benchmarkRunning || runningComparison) && (
                <div className="mt-4 mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-bold text-gray-900">Progress</span>
                    <span className="text-gray-700 font-bold">{benchmarkProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gray-900 h-full transition-all duration-300"
                      style={{ width: `${benchmarkProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Single Test Results */}
              {benchmarkResults && !comparisonResults && (
                <div className="mt-6 bg-gray-50 border border-gray-300 rounded p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-900">Test Results</h3>
                    <span className="text-xs bg-gray-900 text-white px-3 py-1 rounded font-bold">
                      {benchmarkResults.mode.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-white rounded p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Queries</div>
                      <div className="text-2xl font-bold text-gray-900">{benchmarkResults.numQueries}</div>
                    </div>
                    <div className="bg-white rounded p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">TPS</div>
                      <div className="text-2xl font-bold text-gray-900">{benchmarkResults.tps}</div>
                    </div>
                    <div className="bg-white rounded p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Avg Latency</div>
                      <div className="text-2xl font-bold text-gray-900">{benchmarkResults.avgLatency}ms</div>
                    </div>
                    <div className="bg-white rounded p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Hit Rate</div>
                      <div className="text-2xl font-bold text-gray-900">{benchmarkResults.cacheHitRate}%</div>
                    </div>
                    <div className="bg-white rounded p-4 text-center border border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1 uppercase tracking-wider">Duration</div>
                      <div className="text-2xl font-bold text-gray-900">{(benchmarkResults.totalTime / 1000).toFixed(1)}s</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Comparison Results */}
              {comparisonResults && (
                <div className="mt-6 space-y-6">
                  <div className="bg-gray-50 border border-gray-300 rounded p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <TrendingUp size={20} />
                      Mode Comparison Results
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border border-gray-300">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Mode</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">TPS</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Avg Latency</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Hit Rate</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Duration</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Performance</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {comparisonResults.map((result, idx) => {
                            const isAdaptive = result.mode === 'adaptive';
                            const isDisabled = result.mode === 'disabled';
                            const baseline = comparisonResults.find(r => r.mode === 'disabled');
                            const improvement = baseline ? (((baseline.avgLatency - result.avgLatency) / baseline.avgLatency) * 100).toFixed(1) : 0;
                            
                            return (
                              <tr key={idx} className={`border-b border-gray-200 ${isAdaptive ? 'bg-gray-50' : ''}`}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {isDisabled && <XCircle size={16} className="text-gray-400" />}
                                    {result.mode === 'simple' && <Clock size={16} className="text-gray-600" />}
                                    {isAdaptive && <Zap size={16} className="text-gray-900" />}
                                    <span className={`font-bold ${isAdaptive ? 'text-gray-900' : 'text-gray-700'}`}>
                                      {result.mode === 'disabled' ? 'No Cache' : result.mode === 'simple' ? 'Simple Cache' : 'Adaptive Pre-Cache'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-gray-900">{result.tps}</td>
                                <td className="px-4 py-3 text-center font-bold text-gray-900">{result.avgLatency}ms</td>
                                <td className="px-4 py-3 text-center font-bold text-gray-900">{result.cacheHitRate}%</td>
                                <td className="px-4 py-3 text-center font-bold text-gray-900">{(result.totalTime / 1000).toFixed(1)}s</td>
                                <td className="px-4 py-3 text-center">
                                  {isDisabled ? (
                                    <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 font-bold">BASELINE</span>
                                  ) : (
                                    <span className={`text-xs px-2 py-1 rounded font-bold ${
                                      isAdaptive ? 'bg-gray-900 text-white' : 'bg-gray-300 text-gray-700'
                                    }`}>
                                      {improvement > 0 ? '+' : ''}{improvement}% faster
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Visualization */}
                  <div className="bg-white border border-gray-300 rounded p-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Latency Comparison Chart</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={comparisonResults.map(r => ({
                        name: r.mode === 'disabled' ? 'No Cache' : r.mode === 'simple' ? 'Simple' : 'Adaptive',
                        latency: parseFloat(r.avgLatency),
                        tps: parseFloat(r.tps)
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" stroke="#6b7280" />
                        <YAxis stroke="#6b7280" />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px'
                          }}
                        />
                        <Bar dataKey="latency" fill="#1f2937" name="Avg Latency (ms)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current Stats Dashboard */}
        {hasData ? (
          <>
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-white border border-gray-200 rounded p-5 text-center">
                <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Cache Hits</p>
                <p className="text-3xl font-bold text-gray-900">{stats.summary.cacheHits}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded p-5 text-center">
                <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Cache Misses</p>
                <p className="text-3xl font-bold text-gray-900">{stats.summary.cacheMisses}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded p-5 text-center">
                <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Hit Rate</p>
                <p className="text-3xl font-bold text-gray-900">{stats.summary.cacheHitRate}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded p-5 text-center">
                <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Total Queries</p>
                <p className="text-3xl font-bold text-gray-900">{stats.summary.totalQueries}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Cache Distribution</h3>
                <ResponsiveContainer width="100%" height={280}>
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
              </div>

              <div className="bg-white border border-gray-200 rounded p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Stakeholder Analysis</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stakeholderData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="hits" fill="#1f2937" name="Cache Hits" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="misses" fill="#9ca3af" name="Cache Misses" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-300 rounded p-16 text-center">
            <Database size={64} className="mx-auto mb-6 text-gray-400" />
            <h3 className="text-2xl font-bold text-gray-900 mb-3">No Activity Yet</h3>
            <p className="text-gray-600 mb-8">
              Start generating performance data to see analytics
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  setShowSimulation(true);
                  setSimulationConfig({ numQueries: 100, mode: 'adaptive', preset: 'standard' });
                }}
                className="px-6 py-3 bg-gray-900 text-white rounded hover:bg-gray-800 transition font-bold flex items-center gap-2"
              >
                <Play size={18} />
                Run Quick Test
              </button>
              <Link
                href="/"
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-bold flex items-center gap-2 border border-gray-300"
              >
                <ArrowLeft size={18} />
                Use Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
