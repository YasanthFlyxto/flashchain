// app/analytics/page.jsx - COMPLETE ANALYTICS
'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Target, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Play, BarChart3, Zap, Clock, Package, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function Analytics() {
  const [accuracy, setAccuracy] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [runningTest, setRunningTest] = useState(null);
  const [testHistory, setTestHistory] = useState([]);

  useEffect(() => {
    loadAccuracy();
  }, []);

  async function loadAccuracy() {
    try {
      const response = await fetch('http://localhost:4000/api/analytics/accuracy');
      const data = await response.json();

      if (data.success) {
        setAccuracy(data);
      }
    } catch (error) {
      console.error('Error loading accuracy:', error);
    }
  }

  async function runScenarioTest(scenario) {
    setRunningTest(scenario);
    setTestResults(null);

    try {
      const response = await fetch('http://localhost:4000/api/analytics/scenario-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });

      const data = await response.json();

      if (data.success) {
        setTestResults(data);

        // Add to history
        const historyEntry = {
          scenario,
          accuracy: data.accuracy,
          timestamp: Date.now(),
          correctPredictions: data.correctPredictions,
          totalTests: data.totalTests
        };

        setTestHistory(prev => [historyEntry, ...prev].slice(0, 10));
      } else {
        alert('Test failed: ' + data.error);
      }
    } catch (error) {
      alert('Test failed: ' + error.message);
    } finally {
      setRunningTest(null);
      await loadAccuracy();
    }
  }

  const scenarios = [
    {
      id: 'checkpoint_proximity',
      name: 'Checkpoint Proximity Test',
      description: 'Tests Rule 1: Assets approaching checkpoints within 20km',
      icon: '📍',
      color: 'bg-blue-50 border-blue-200'
    },
    {
      id: 'high_value',
      name: 'High-Value Asset Test',
      description: 'Tests Rule 3: High-value assets (>$50k) near destination',
      icon: '💎',
      color: 'bg-purple-50 border-purple-200'
    },
    {
      id: 'multi_access',
      name: 'Multi-Access Pattern Test',
      description: 'Tests Rule 2: Assets accessed by multiple stakeholders',
      icon: '🔄',
      color: 'bg-green-50 border-green-200'
    }
  ];

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
                  <BarChart3 className="text-gray-700" size={28} />
                  Pre-Cache Analytics
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Rule effectiveness and prediction accuracy testing
                </p>
              </div>
            </div>

            <Link
              href="/test-lab"
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition font-medium flex items-center gap-2 text-sm"
            >
              <Sparkles size={16} />
              Open Test Lab
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Overall Accuracy Metrics */}
        {accuracy && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded p-6 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Total Predictions</p>
              <p className="text-4xl font-bold text-gray-900">{accuracy.accuracy.totalPredictions}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-6 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Correct Predictions</p>
              <p className="text-4xl font-bold text-green-700">{accuracy.accuracy.correctPredictions}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-6 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Accuracy Rate</p>
              <p className="text-4xl font-bold text-gray-900">{accuracy.accuracy.accuracyRate}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-6 text-center">
              <p className="text-xs text-gray-600 font-bold mb-2 uppercase tracking-wider">Waste Rate</p>
              <p className="text-4xl font-bold text-orange-600">{accuracy.accuracy.wasteRate}</p>
            </div>
          </div>
        )}

        {/* Rule Effectiveness */}
        {accuracy && (
          <div className="bg-white border border-gray-200 rounded">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Rule Effectiveness</h2>
              <p className="text-sm text-gray-600 mt-1">Performance breakdown by pre-caching rule</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Rule</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Triggered</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Accessed</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Wasted</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Effectiveness</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(accuracy.ruleEffectiveness).map(([rule, stats]) => (
                    <tr key={rule}>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{rule}</td>
                      <td className="px-6 py-4 text-center text-sm text-gray-900">{stats.triggered}</td>
                      <td className="px-6 py-4 text-center text-sm text-green-700 font-bold">{stats.accessed}</td>
                      <td className="px-6 py-4 text-center text-sm text-orange-600 font-bold">{stats.wasted}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-sm font-bold px-3 py-1 rounded ${parseFloat(stats.effectiveness) >= 70
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : parseFloat(stats.effectiveness) >= 40
                              ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
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

        {/* Scenario Tests */}
        <div className="bg-white border border-gray-200 rounded">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Scenario-Based Tests</h2>
            <p className="text-sm text-gray-600 mt-1">
              Run controlled tests to validate specific pre-caching rules
            </p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {scenarios.map(scenario => (
                <button
                  key={scenario.id}
                  onClick={() => runScenarioTest(scenario.id)}
                  disabled={runningTest === scenario.id}
                  className={`${scenario.color} border-2 rounded p-5 text-left hover:border-gray-400 transition disabled:opacity-50`}
                >
                  <div className="text-3xl mb-3">{scenario.icon}</div>
                  <h3 className="font-bold text-gray-900 mb-2 text-sm">{scenario.name}</h3>
                  <p className="text-xs text-gray-600 mb-4">{scenario.description}</p>

                  {runningTest === scenario.id ? (
                    <div className="flex items-center gap-2 text-xs text-gray-700">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-700 border-t-transparent"></div>
                      Running test...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                      <Play size={14} />
                      Run Test
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Test Results */}
        {testResults && (
          <div className="bg-white border border-gray-200 rounded">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Test Results</h2>
                  <p className="text-sm text-gray-600 mt-1">Scenario: {testResults.scenario}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-gray-900">{testResults.accuracy}</p>
                  <p className="text-xs text-gray-600 mt-1 uppercase tracking-wider">Accuracy</p>
                </div>
              </div>
            </div>

            {/* Asset Results */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Asset ID</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Expected Pre-Cache</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Actually Pre-Cached</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Result</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">Rule</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {testResults.testResults.map((result, idx) => (
                    <tr key={idx} className={result.correct ? 'bg-green-50' : 'bg-red-50'}>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{result.assetId}</td>
                      <td className="px-6 py-4 text-center">
                        {result.expectedPreCache ? (
                          <CheckCircle2 size={20} className="inline text-gray-700" />
                        ) : (
                          <XCircle size={20} className="inline text-gray-400" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {result.actuallyPreCached ? (
                          <CheckCircle2 size={20} className="inline text-green-700" />
                        ) : (
                          <XCircle size={20} className="inline text-gray-400" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {result.correct ? (
                          <span className="px-3 py-1 rounded text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                            ✓ CORRECT
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-300">
                            ✗ INCORRECT
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {result.rule || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Latency Comparison */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Latency Comparison</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {testResults.latencyComparison.map((latency, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded p-4">
                    <p className="text-xs text-gray-600 font-bold mb-2">{latency.assetId}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cache:</span>
                        <span className="font-bold text-gray-900">
                          {latency.cacheLatency ? `${latency.cacheLatency}ms` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Blockchain:</span>
                        <span className="font-bold text-gray-900">{latency.blockchainLatency}ms</span>
                      </div>
                      {latency.improvement > 0 && (
                        <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                          <span className="text-gray-600">Improvement:</span>
                          <span className="font-bold text-green-700">{latency.improvement}%</span>
                        </div>
                      )}
                      {latency.wasPreCached && (
                        <div className="pt-2">
                          <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 font-bold">
                            PRE-CACHED
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Test History */}
        {testHistory.length > 0 && (
          <div className="bg-white border border-gray-200 rounded">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Test History</h2>
              <p className="text-sm text-gray-600 mt-1">Recent test executions</p>
            </div>

            <div className="divide-y divide-gray-200">
              {testHistory.map((entry, idx) => (
                <div key={idx} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900 text-sm mb-1">
                      {entry.scenario.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </p>
                    <p className="text-xs text-gray-600">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{entry.accuracy}</p>
                    <p className="text-xs text-gray-600">{entry.correctPredictions}/{entry.totalTests} correct</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded p-6">
          <div className="flex items-start gap-3">
            <Target className="text-blue-700 mt-0.5" size={20} />
            <div>
              <h3 className="font-bold text-blue-900 mb-2">How Testing Works</h3>
              <p className="text-sm text-blue-800 mb-3">
                Each scenario creates test assets with specific characteristics, triggers the pre-cache worker,
                and validates that the correct assets were pre-cached based on the rules.
              </p>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Checkpoint Proximity:</strong> Assets within 20km trigger Rule 1</li>
                <li>• <strong>High-Value:</strong> Assets &gt;$50k near destination trigger Rule 3</li>
                <li>• <strong>Multi-Access:</strong> Assets accessed by 3+ stakeholders trigger Rule 2</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
