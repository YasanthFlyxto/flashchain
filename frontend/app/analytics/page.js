// app/analytics/page.js
'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, TrendingUp, Target, Zap, CheckCircle2, XCircle, Clock, Activity, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function Analytics() {
  const [accuracy, setAccuracy] = useState(null);
  const [scenarioResults, setScenarioResults] = useState(null);
  const [testingScenario, setTestingScenario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccuracy();
    const interval = setInterval(loadAccuracy, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadAccuracy() {
    try {
      const response = await fetch('http://localhost:4000/api/analytics/accuracy');
      const data = await response.json();
      if (data.success) {
        setAccuracy(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading accuracy:', error);
      setLoading(false);
    }
  }

  async function runScenarioTest(scenario) {
    setTestingScenario(scenario);
    setScenarioResults(null);
    
    try {
      const response = await fetch('http://localhost:4000/api/analytics/scenario-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      
      const data = await response.json();
      if (data.success) {
        setScenarioResults(data);
        await loadAccuracy();
      }
    } catch (error) {
      alert('Test failed: ' + error.message);
    } finally {
      setTestingScenario(null);
    }
  }

  async function resetAnalytics() {
    if (confirm('Reset all analytics tracking?')) {
      try {
        await fetch('http://localhost:4000/api/analytics/reset', { method: 'POST' });
        await loadAccuracy();
        setScenarioResults(null);
        alert('✅ Analytics reset');
      } catch (error) {
        alert('Failed to reset: ' + error.message);
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Activity className="animate-spin mx-auto mb-4 text-gray-700" size={48} />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const scenarios = [
    {
      id: 'checkpoint_proximity',
      name: 'Checkpoint Proximity Test',
      description: 'Tests Rule 1: Assets approaching checkpoints should be pre-cached',
      icon: <Target size={20} className="text-gray-700" />,
      color: 'gray'
    },
    {
      id: 'high_value',
      name: 'High-Value Asset Test',
      description: 'Tests Rule 3: Expensive assets near destination should be pre-cached',
      icon: <Zap size={20} className="text-gray-700" />,
      color: 'gray'
    },
    {
      id: 'multi_access',
      name: 'Multi-Access Pattern Test',
      description: 'Tests Rule 2: Frequently accessed assets should be pre-cached',
      icon: <Activity size={20} className="text-gray-700" />,
      color: 'gray'
    }
  ];

  // Prepare chart data
  const ruleData = accuracy && accuracy.ruleEffectiveness ? 
    Object.entries(accuracy.ruleEffectiveness).map(([rule, stats]) => ({
      name: rule,
      triggered: stats.triggered,
      accessed: stats.accessed,
      wasted: stats.wasted,
      effectiveness: parseFloat(stats.effectiveness)
    })) : [];

  const accuracyPieData = accuracy ? [
    { name: 'Correct Predictions', value: accuracy.accuracy.correctPredictions, color: '#1f2937' },
    { name: 'Wasted Cache', value: accuracy.accuracy.wastedPredictions, color: '#d1d5db' }
  ] : [];

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
                <h1 className="text-2xl font-bold text-gray-900">Pre-Cache Analytics</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Prediction accuracy & rule effectiveness testing
                </p>
              </div>
            </div>

            <button
              onClick={resetAnalytics}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-medium border border-gray-300 text-sm"
            >
              Reset Analytics
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Key Metrics */}
        {accuracy && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded p-5 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Total Predictions</p>
              <p className="text-3xl font-bold text-gray-900">{accuracy.accuracy.totalPredictions}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Correct Predictions</p>
              <p className="text-3xl font-bold text-gray-900">{accuracy.accuracy.correctPredictions}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Accuracy Rate</p>
              <p className="text-3xl font-bold text-gray-900">{accuracy.accuracy.accuracyRate}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Waste Rate</p>
              <p className="text-3xl font-bold text-gray-900">{accuracy.accuracy.wasteRate}</p>
            </div>
          </div>
        )}

        {/* Scenario Testing */}
        <div className="bg-white border border-gray-200 rounded p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={20} className="text-gray-700" />
            <h2 className="text-lg font-bold text-gray-900">Scenario Testing</h2>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Run controlled tests to validate pre-caching rules. Each test creates specific assets, waits for pre-caching, then measures accuracy.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(scenario => (
              <button
                key={scenario.id}
                onClick={() => runScenarioTest(scenario.id)}
                disabled={testingScenario === scenario.id}
                className="p-4 bg-gray-50 border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-100 transition text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  {scenario.icon}
                  <span className="font-bold text-gray-900 text-sm">{scenario.name}</span>
                </div>
                <p className="text-xs text-gray-600 mb-3">{scenario.description}</p>
                {testingScenario === scenario.id ? (
                  <span className="text-xs px-2 py-1 rounded bg-gray-800 text-white font-bold inline-block">
                    Testing...
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 font-medium inline-block">
                    Run Test
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scenario Test Results */}
        {scenarioResults && (
          <div className="bg-white border border-gray-200 rounded p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Test Results: {scenarioResults.scenario.replace(/_/g, ' ').toUpperCase()}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs px-3 py-1 rounded bg-gray-800 text-white font-bold">
                  Accuracy: {scenarioResults.accuracy}
                </span>
                <span className="text-xs px-3 py-1 rounded bg-gray-100 text-gray-700 font-bold border border-gray-300">
                  {scenarioResults.correctPredictions}/{scenarioResults.totalTests} Correct
                </span>
              </div>
            </div>

            {/* Prediction Results */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Prediction Accuracy</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Asset ID</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Expected Pre-Cache</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Actually Pre-Cached</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Result</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {scenarioResults.testResults.map((result, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="px-4 py-3 font-bold text-gray-900">{result.assetId}</td>
                        <td className="px-4 py-3 text-center">
                          {result.expectedPreCache ? (
                            <CheckCircle2 size={18} className="inline text-gray-700" />
                          ) : (
                            <XCircle size={18} className="inline text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.actuallyPreCached ? (
                            <CheckCircle2 size={18} className="inline text-gray-700" />
                          ) : (
                            <XCircle size={18} className="inline text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.correct ? (
                            <span className="text-xs px-2 py-1 rounded bg-gray-900 text-white font-bold">✓ CORRECT</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 font-bold border border-red-300">✗ WRONG</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Latency Comparison */}
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Latency Comparison</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Asset ID</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Pre-Cached?</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Cache Latency</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Blockchain Latency</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Improvement</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {scenarioResults.latencyComparison.map((result, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="px-4 py-3 font-bold text-gray-900">{result.assetId}</td>
                        <td className="px-4 py-3 text-center">
                          {result.wasPreCached ? (
                            <span className="text-xs px-2 py-1 rounded bg-gray-800 text-white font-bold">YES</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 font-medium">NO</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">
                          {result.cacheLatency !== null ? `${result.cacheLatency}ms` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">{result.blockchainLatency}ms</td>
                        <td className="px-4 py-3 text-center">
                          {result.improvement > 0 ? (
                            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 font-bold border border-green-300">
                              +{result.improvement}% faster
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-medium">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        {accuracy && ruleData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rule Effectiveness Chart */}
            <div className="bg-white border border-gray-200 rounded p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Rule Effectiveness</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ruleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Bar dataKey="triggered" fill="#9ca3af" name="Triggered" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="accessed" fill="#1f2937" name="Accessed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Accuracy Pie Chart */}
            {accuracyPieData.length > 0 && accuracyPieData[0].value + accuracyPieData[1].value > 0 && (
              <div className="bg-white border border-gray-200 rounded p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Prediction Distribution</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={accuracyPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={90}
                      dataKey="value"
                    >
                      {accuracyPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Rule Stats Table */}
        {accuracy && accuracy.ruleEffectiveness && (
          <div className="bg-white border border-gray-200 rounded p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Rule Performance Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Rule</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Times Triggered</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Actually Accessed</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Wasted Cache</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Effectiveness</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {Object.entries(accuracy.ruleEffectiveness).map(([rule, stats], idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="px-4 py-3 font-bold text-gray-900">{rule}</td>
                      <td className="px-4 py-3 text-center text-gray-900">{stats.triggered}</td>
                      <td className="px-4 py-3 text-center text-gray-900 font-bold">{stats.accessed}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{stats.wasted}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded font-bold ${
                          parseFloat(stats.effectiveness) >= 70 
                            ? 'bg-gray-900 text-white'
                            : parseFloat(stats.effectiveness) >= 40
                            ? 'bg-gray-300 text-gray-700'
                            : 'bg-red-100 text-red-700 border border-red-300'
                        }`}>
                          {stats.effectiveness}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Data State */}
        {accuracy && accuracy.accuracy.totalPredictions === 0 && !scenarioResults && (
          <div className="bg-white border border-gray-200 rounded p-16 text-center">
            <AlertTriangle size={64} className="mx-auto mb-6 text-gray-400" />
            <h3 className="text-2xl font-bold text-gray-900 mb-3">No Pre-Cache Data Yet</h3>
            <p className="text-gray-600 mb-8">
              Run scenario tests above to validate pre-caching rules and measure accuracy
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
