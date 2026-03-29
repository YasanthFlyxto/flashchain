'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  Play, CheckCircle, AlertTriangle, Zap,
  Database, TrendingDown, Activity, RefreshCw, BarChart2, Download
} from 'lucide-react';

const CONCURRENCY_LEVELS = [1, 5, 10, 20, 50, 100, 200];

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, colour = 'gray' }) {
  const colours = {
    cyan: 'bg-cyan-50  border-cyan-100  text-cyan-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    navy: 'bg-blue-50  border-blue-100  text-blue-800',
    red: 'bg-red-50   border-red-100   text-red-700',
    gray: 'bg-gray-50  border-gray-100  text-gray-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colours[colour]}`}>
      <p className="text-xs uppercase tracking-wide font-semibold opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 mt-0.5">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function RunButton({ onClick, loading, label, loadingLabel }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                 bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50
                 disabled:cursor-not-allowed transition-colors"
    >
      {loading
        ? <><RefreshCw size={15} className="animate-spin" />{loadingLabel}</>
        : <><Play size={15} />{label}</>
      }
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function ConcTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const blockchain = payload.find(p => p.dataKey === 'blockchain')?.value;
  const cache = payload.find(p => p.dataKey === 'cache')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label} concurrent {label === '1' ? 'query' : 'queries'}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}ms</span></p>
      ))}
      {blockchain && cache && (
        <p className="text-gray-500 mt-1 border-t pt-1">
          Speedup: <span className="font-bold text-green-600">{(blockchain / cache).toFixed(0)}×</span>
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
  const [loading, setLoading] = useState(false);
  const [setting, setSetting] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  const [setupLog, setSetupLog] = useState([]);

  // Concurrent load benchmark state
  const [concResults, setConcResults] = useState([]);
  const [concRunning, setConcRunning] = useState(false);
  const [concProgress, setConcProgress] = useState(null);
  const [concError, setConcError] = useState(null);
  const [customVal, setCustomVal] = useState('');
  const [customRunning, setCustomRunning] = useState(false);

  // Sustained benchmark state
  const [sustainedTps, setSustainedTps] = useState(50);
  const [sustainedDuration, setSustainedDuration] = useState(10);
  const [fabricLoading, setFabricLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [sustainedError, setSustainedError] = useState(null);
  const [fabricResults, setFabricResults] = useState(null);
  const [cacheResults, setCacheResults] = useState(null);

  // Formal evaluation state
  const [evalTrials, setEvalTrials] = useState(5);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState(null);
  const [evalError, setEvalError] = useState(null);

  const runEvaluation = async () => {
    setEvalLoading(true);
    setEvalError(null);
    setEvalResult(null);
    try {
      const data = await api.runEvaluation(evalTrials);
      setEvalResult(data);
    } catch (err) {
      setEvalError(err.response?.data?.error || err.message);
    } finally {
      setEvalLoading(false);
    }
  };

  // ── Concurrent load benchmark ─────────────────────────────────────────────
  const runConcBenchmark = async () => {
    setConcRunning(true);
    setConcResults([]);
    setConcError(null);
    const collected = [];
    for (const level of CONCURRENCY_LEVELS) {
      setConcProgress(`Testing ${level} concurrent quer${level === 1 ? 'y' : 'ies'}…`);
      try {
        const r = await api.runBenchmark(level);
        if (r.success) {
          collected.push({
            concurrency: level,
            label: String(level),
            blockchain: r.blockchain.avg,
            cache: r.cache.avg,
            speedup: parseFloat((r.blockchain.avg / r.cache.avg).toFixed(1)),
          });
          setConcResults([...collected]);
        }
      } catch (e) {
        setConcError('Benchmark failed: ' + (e?.response?.data?.error || e.message));
        break;
      }
    }
    setConcProgress(null);
    setConcRunning(false);
  };

  const runCustomConc = async () => {
    const level = parseInt(customVal);
    if (!level || level < 1 || level > 2000) return;
    setCustomRunning(true);
    setConcError(null);
    try {
      const r = await api.runBenchmark(level);
      if (r.success) {
        const point = {
          concurrency: level, label: String(level),
          blockchain: r.blockchain.avg, cache: r.cache.avg,
          speedup: parseFloat((r.blockchain.avg / r.cache.avg).toFixed(1)),
        };
        setConcResults(prev => {
          const filtered = prev.filter(p => p.concurrency !== level);
          return [...filtered, point].sort((a, b) => a.concurrency - b.concurrency);
        });
      }
    } catch (e) {
      setConcError('Custom test failed: ' + (e?.response?.data?.error || e.message));
    }
    setCustomRunning(false);
  };

  // ── Setup pharma shipments ────────────────────────────────────────────────
  const handleSetup = async () => {
    setSetting(true);
    setError(null);
    try {
      const data = await api.setupPharma();
      setSetupLog(data.results || []);
      setSetupDone(true);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSetting(false);
    }
  };

  // ── Run full simulation ───────────────────────────────────────────────────
  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await api.runSimulation();
      setResults(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Sustained rate benchmark ──────────────────────────────────────────────
  const handleFabricTest = async () => {
    setFabricLoading(true);
    setSustainedError(null);
    setFabricResults(null);
    try {
      const data = await api.runSustainedBenchmark(sustainedTps, sustainedDuration, 'fabric');
      setFabricResults(data.blockchain);
    } catch (e) {
      setSustainedError(e.response?.data?.error || e.message);
    } finally {
      setFabricLoading(false);
    }
  };

  const handleCacheTest = async () => {
    setCacheLoading(true);
    setSustainedError(null);
    setCacheResults(null);
    try {
      const data = await api.runSustainedBenchmark(sustainedTps, sustainedDuration, 'cache');
      setCacheResults(data.cache);
    } catch (e) {
      setSustainedError(e.response?.data?.error || e.message);
    } finally {
      setCacheLoading(false);
    }
  };

  // ── Derived chart data ────────────────────────────────────────────────────

  // Section 1: 3-way comparison - average latency per round
  const comparisonData = results
    ? results.comparison.noCache.map((nc, i) => ({
      round: `R${nc.round}`,
      'No Cache': nc.avgLatencyMs,
      'Naive': results.comparison.naive[i]?.avgLatencyMs,
      'Smart': results.comparison.smart[i]?.avgLatencyMs,
    }))
    : [];

  // Section 1: blockchain calls per round
  const blockchainCallsData = results
    ? results.comparison.noCache.map((nc, i) => ({
      round: `R${nc.round}`,
      'No Cache': nc.blockchainCalls,
      'Naive': results.comparison.naive[i]?.blockchainCalls,
      'Smart': results.comparison.smart[i]?.blockchainCalls,
    }))
    : [];

  // Section 2: hit rate - static vs adaptive over 10 rounds
  const hitRateData = results
    ? results.adaptive.staticRounds.map((s, i) => ({
      round: `R${s.round}`,
      Static: parseFloat((s.hitRate * 100).toFixed(1)),
      Adaptive: parseFloat((results.adaptive.adaptiveRounds[i]?.hitRate * 100).toFixed(1)),
    }))
    : [];

  // Section 2: blockchain calls per round - static vs adaptive
  const bcCallsAdaptiveData = results
    ? results.adaptive.staticRounds.map((s, i) => ({
      round: `R${s.round}`,
      Static: s.blockchainCalls,
      Adaptive: results.adaptive.adaptiveRounds[i]?.blockchainCalls,
    }))
    : [];

  // Section 2: threshold drift - Rule 1 checkpointDistanceKm over rounds
  const thresholdDriftData = results
    ? results.adaptive.adaptiveRounds.map(r => ({
      round: `R${r.round}`,
      'Rule 1 Distance (km)': r.currentThresholds?.rule1_checkpointDistanceKm,
      'Rule 3 Dest (km)': r.currentThresholds?.rule3_destDistanceKm,
    }))
    : [];

  // Summary numbers
  const smartAvgLatency = results
    ? (results.comparison.smart.reduce((s, r) => s + r.avgLatencyMs, 0) / results.comparison.smart.length).toFixed(1)
    : '-';
  const noCacheAvgLatency = results
    ? (results.comparison.noCache.reduce((s, r) => s + r.avgLatencyMs, 0) / results.comparison.noCache.length).toFixed(1)
    : '-';
  const latencyReduction = results
    ? Math.round((1 - smartAvgLatency / noCacheAvgLatency) * 100)
    : '-';

  const totalStaticBC = results ? results.adaptive.staticRounds.reduce((s, r) => s + r.blockchainCalls, 0) : '-';
  const totalAdaptiveBC = results ? results.adaptive.adaptiveRounds.reduce((s, r) => s + r.blockchainCalls, 0) : '-';
  const bcSaved = results ? Math.round((1 - totalAdaptiveBC / totalStaticBC) * 100) : '-';

  const disruptionRound = results?.adaptive?.disruptionRound ?? null;
  const roundsToRecover = results && disruptionRound
    ? (() => {
      const postDisruption = results.adaptive.adaptiveRounds.filter(r => r.round > disruptionRound);
      const recoveryRound = postDisruption.find(r => r.hitRate >= 0.70);
      return recoveryRound ? recoveryRound.round - disruptionRound : null;
    })()
    : null;

  const allAdjustments = results
    ? results.adaptive.adaptiveRounds.flatMap(r =>
      (r.thresholdAdjustments || []).map(a => ({ ...a, round: r.round }))
    )
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-10">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Benchmark Suite</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pharmaceutical supply chain simulation - evaluating context-aware caching effectiveness and adaptive policy tuning.
        </p>
      </div>

      {/* ── STEP 0: Setup ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <SectionHeader
          icon={Database}
          title="Step 1 - Setup Pharma Shipments"
          subtitle="Creates 6 controlled pharmaceutical shipments on the Fabric ledger. Each is positioned to trigger a specific policy rule."
        />

        <div className="flex items-center gap-4 mb-4">
          <RunButton
            onClick={handleSetup}
            loading={setting}
            label="Setup Shipments"
            loadingLabel="Creating..."
          />
          {setupDone && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle size={15} /> Shipments ready
            </span>
          )}
        </div>

        {setupLog.length > 0 && (
          <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 divide-y divide-gray-100">
            {setupLog.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-mono font-medium text-gray-700">{s.id}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === 'created' ? 'bg-green-100 text-green-700' :
                    s.status === 'already_exists' ? 'bg-blue-100  text-blue-700' :
                      'bg-red-100   text-red-700'
                  }`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Concurrent Load Benchmark ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <SectionHeader
            icon={BarChart2}
            title="Concurrent Load Benchmark"
            subtitle="Fires N simultaneous queries via Promise.all - shows how Fabric latency climbs under burst load while Redis stays flat."
          />
          <button
            onClick={runConcBenchmark}
            disabled={concRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors shrink-0"
            style={{ backgroundColor: concRunning ? '#94a3b8' : '#06b6d4' }}
          >
            {concRunning
              ? <><Activity size={15} className="animate-pulse" />{concProgress || 'Running…'}</>
              : <><Zap size={15} />{concResults.length > 0 ? 'Re-run' : 'Run Benchmark'}</>
            }
          </button>
        </div>

        {concError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            <AlertTriangle size={16} /> {concError}
          </div>
        )}

        {/* Summary stats */}
        {concResults.length > 0 && !concRunning && (() => {
          const last = concResults[concResults.length - 1];
          return (
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Peak Speedup" value={`${last.speedup}×`} sub={`at ${last.concurrency} concurrent queries`} colour="green" />
              <StatBox label="Fabric Avg (peak)" value={`${last.blockchain}ms`} sub="direct blockchain query" colour="navy" />
              <StatBox label="Redis Avg (peak)" value={`${last.cache}ms`} sub="cache hit" colour="cyan" />
            </div>
          );
        })()}

        {/* Custom concurrency */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-800">Test a custom load level</p>
            <p className="text-xs text-gray-400 mt-0.5">Add a single data point at any concurrency (1–2000).</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={2000} placeholder="e.g. 500"
              value={customVal}
              onChange={e => setCustomVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runCustomConc()}
              disabled={concRunning || customRunning}
              className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <span className="text-sm text-gray-400">concurrent</span>
            <button
              onClick={runCustomConc}
              disabled={concRunning || customRunning || !customVal}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: (concRunning || customRunning || !customVal) ? '#94a3b8' : '#1e3a5f' }}
            >
              {customRunning ? 'Running…' : 'Add Point'}
            </button>
          </div>
        </div>

        {/* Chart */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Response Time vs Concurrent Load</p>
          <p className="text-xs text-gray-400 mb-4">Average latency (ms) as concurrent queries increase</p>
          {concResults.length === 0 && !concRunning ? (
            <div className="h-52 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Zap size={28} className="opacity-30" />
              <p className="text-sm">Press <strong>Run Benchmark</strong> to start</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={concResults} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" label={{ value: 'Concurrent Queries', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#9ca3af' }} tick={{ fontSize: 12 }} height={40} />
                <YAxis unit="ms" tick={{ fontSize: 12 }} label={{ value: 'Avg Response (ms)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9ca3af' }} width={65} />
                <Tooltip content={<ConcTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="blockchain" name="Fabric (Blockchain)" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 5, fill: '#1e3a5f' }} activeDot={{ r: 7 }} />
                <Line type="monotone" dataKey="cache" name="Redis (Cache)" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 5, fill: '#06b6d4' }} activeDot={{ r: 7 }} />
                {concResults.length > 0 && <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '100ms threshold', position: 'right', fontSize: 10, fill: '#f59e0b' }} />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Results table */}
        {concResults.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Concurrent</th>
                  <th className="px-5 py-3 text-right">Redis (Cache)</th>
                  <th className="px-5 py-3 text-right">Fabric (Blockchain)</th>
                  <th className="px-5 py-3 text-right">Speedup</th>
                  <th className="px-5 py-3 text-right">Saved / Query</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {concResults.map(r => (
                  <tr key={r.concurrency} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.concurrency} quer{r.concurrency > 1 ? 'ies' : 'y'}</td>
                    <td className="px-5 py-3 text-right font-mono text-cyan-600">{r.cache}ms</td>
                    <td className="px-5 py-3 text-right font-mono text-blue-900">{r.blockchain}ms</td>
                    <td className="px-5 py-3 text-right font-bold text-green-600">{r.speedup}×</td>
                    <td className="px-5 py-3 text-right text-gray-500">{(r.blockchain - r.cache).toFixed(1)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── STEP 1: Run simulation ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <SectionHeader
          icon={Play}
          title="Step 2 - Run Simulation"
          subtitle="Runs the full benchmark. Takes ~60–90 seconds. Do not refresh."
        />

        <RunButton
          onClick={handleSimulate}
          loading={loading}
          label="Run Full Simulation"
          loadingLabel="Simulating - please wait..."
        />

        {loading && (
          <p className="mt-3 text-sm text-gray-500 animate-pulse">
            Running 3-way comparison + 8-round self-healing simulation...
          </p>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── RESULTS ───────────────────────────────────────────────────────── */}
      {results && (
        <>
          {/* ── Section 1: 3-way latency comparison ──────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <SectionHeader
              icon={Zap}
              title="Experiment 1 - Cache Effectiveness"
              subtitle="Same workload in 3 modes: no cache, naive cache (fixed TTL), smart cache (policy rules). Smart pre-caches before demand arrives - naive only caches reactively."
            />

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox
                label="Smart Avg Latency"
                value={`${smartAvgLatency}ms`}
                sub="with policy pre-caching"
                colour="cyan"
              />
              <StatBox
                label="Blockchain Avg Latency"
                value={`${noCacheAvgLatency}ms`}
                sub="direct Fabric queries"
                colour="navy"
              />
              <StatBox
                label="Latency Reduction"
                value={`${latencyReduction}%`}
                sub="smart vs no-cache"
                colour="green"
              />
              <StatBox
                label="Smart Blockchain Calls"
                value={results.comparison.smart.reduce((s, r) => s + r.blockchainCalls, 0)}
                sub={`vs ${results.comparison.noCache.reduce((s, r) => s + r.blockchainCalls, 0)} (no-cache)`}
                colour="gray"
              />
            </div>

            {/* Latency chart */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Average Query Latency per Round (ms)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={comparisonData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="round" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="ms" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="No Cache" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Naive" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Smart" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Blockchain calls chart */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Blockchain Calls per Round</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={blockchainCallsData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="round" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="No Cache" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Naive" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Smart" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Section 2: Adaptive simulation ───────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <SectionHeader
              icon={Activity}
              title="Experiment 2 - Adaptive Self-Healing"
              subtitle="Normal operation (R1–R3) → misconfiguration injected (R4) → adaptive self-heals (R5–R8) vs static degradation. The adaptive tuner detects the recall drop and recovers; static rules stay degraded."
            />

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox
                label="Static Blockchain Calls"
                value={totalStaticBC}
                sub="over 8 rounds"
                colour="navy"
              />
              <StatBox
                label="Adaptive Blockchain Calls"
                value={totalAdaptiveBC}
                sub="over 8 rounds"
                colour="cyan"
              />
              <StatBox
                label="Blockchain Load Reduction"
                value={`${bcSaved}%`}
                sub="adaptive vs static"
                colour="green"
              />
              <StatBox
                label="Rounds to Recover"
                value={roundsToRecover !== null ? `${roundsToRecover}` : '-'}
                sub={`adaptive ≥70% hit rate after R${disruptionRound}`}
                colour="gray"
              />
            </div>

            {/* Hit rate chart */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Cache Hit Rate per Round (%)</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={hitRateData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="round" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {disruptionRound && (
                    <ReferenceLine
                      x={`R${disruptionRound}`}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Misconfiguration', position: 'top', fontSize: 10, fill: '#ef4444' }}
                    />
                  )}
                  <Line type="monotone" dataKey="Static" stroke="#94a3b8" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Adaptive" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Blockchain calls: static vs adaptive */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Blockchain Calls per Round - Static vs Adaptive</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bcCallsAdaptiveData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="round" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Static" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Adaptive" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Threshold drift chart */}
            {thresholdDriftData.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Rule Threshold Drift over Rounds</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={thresholdDriftData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="round" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="km" />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {disruptionRound && (
                      <ReferenceLine
                        x={`R${disruptionRound}`}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: 'Config reset', position: 'top', fontSize: 10, fill: '#ef4444' }}
                      />
                    )}
                    <Line type="monotone" dataKey="Rule 1 Distance (km)" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Rule 3 Dest (km)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 mt-1">
                  Thresholds stable (R1–R3), drop at misconfiguration (R4), then widen as tuner detects low recall and self-heals.
                </p>
              </div>
            )}

            {/* Adjustment log */}
            {allAdjustments.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Threshold Adjustment Log</p>
                <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 text-sm overflow-hidden">
                  <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <span>Round</span>
                    <span>Rule</span>
                    <span>Parameter</span>
                    <span>Change</span>
                    <span>Reason</span>
                  </div>
                  {allAdjustments.map((a, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2 px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50">
                      <span className="font-mono font-semibold">R{a.round}</span>
                      <span className="font-medium">{a.rule}</span>
                      <span className="font-mono text-gray-500">{a.param}</span>
                      <span className={a.direction === 'increased' ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                        {a.from} → {a.to}
                        <span className="ml-1 text-gray-400">({a.direction === 'increased' ? '↑' : '↓'})</span>
                      </span>
                      <span className="text-gray-500 truncate" title={a.reason}>{a.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allAdjustments.length === 0 && results && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm text-gray-500 text-center">
                No threshold adjustments made - rules were well-calibrated for this workload.
              </div>
            )}
          </div>

          {/* ── Section 3: Per-round detail table ────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <SectionHeader
              icon={TrendingDown}
              title="Round-by-Round Detail"
              subtitle="R1–R3 normal, R4 misconfiguration injected, R5–R8 adaptive recovery vs static degradation."
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="py-2 pr-4">Round</th>
                    <th className="py-2 pr-4">Static Hit Rate</th>
                    <th className="py-2 pr-4">Adaptive Hit Rate</th>
                    <th className="py-2 pr-4">Static BC Calls</th>
                    <th className="py-2 pr-4">Adaptive BC Calls</th>
                    <th className="py-2">Adjustments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.adaptive.staticRounds.map((s, i) => {
                    const a = results.adaptive.adaptiveRounds[i];
                    const isDisruption = s.round === disruptionRound;
                    return (
                      <tr key={s.round} className={isDisruption ? 'bg-red-50' : ''}>
                        <td className="py-2 pr-4 font-mono font-semibold text-gray-700">
                          R{s.round}
                          {isDisruption && (
                            <span className="ml-2 text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">misconfig</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-gray-600">{(s.hitRate * 100).toFixed(0)}%</td>
                        <td className={`py-2 pr-4 font-semibold ${a?.hitRate > s.hitRate ? 'text-cyan-600' : 'text-gray-600'
                          }`}>
                          {(a?.hitRate * 100).toFixed(0)}%
                          {a?.hitRate > s.hitRate && ' ↑'}
                        </td>
                        <td className="py-2 pr-4 text-gray-600">{s.blockchainCalls}</td>
                        <td className={`py-2 pr-4 font-semibold ${a?.blockchainCalls < s.blockchainCalls ? 'text-cyan-600' : 'text-gray-600'
                          }`}>
                          {a?.blockchainCalls}
                          {a?.blockchainCalls < s.blockchainCalls && ' ↓'}
                        </td>
                        <td className="py-2 text-xs text-gray-500">
                          {(a?.thresholdAdjustments?.length || 0) > 0
                            ? <span className="text-cyan-600 font-semibold">{a.thresholdAdjustments.length} adj.</span>
                            : '-'
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Caliper-Like Sustained Rate Test ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <SectionHeader
          icon={Activity}
          title="Caliper-Like Sustained Rate Test"
          subtitle="Fires queries at a fixed TPS rate continuously - new queries fire on schedule regardless of whether previous ones finished. Models real-world automated systems under sustained load."
        />

        {/* Controls */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Target TPS</label>
            <input
              type="number" min={10} max={500} step={10}
              value={sustainedTps}
              onChange={e => setSustainedTps(Number(e.target.value))}
              className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Duration (s)</label>
            <input
              type="number" min={5} max={60} step={5}
              value={sustainedDuration}
              onChange={e => setSustainedDuration(Number(e.target.value))}
              className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFabricTest}
              disabled={fabricLoading || cacheLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {fabricLoading ? <><RefreshCw size={14} className="animate-spin" />Running Fabric...</> : <><Play size={14} />Test Fabric</>}
            </button>
            <button
              onClick={handleCacheTest}
              disabled={fabricLoading || cacheLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cacheLoading ? <><RefreshCw size={14} className="animate-spin" />Running Redis...</> : <><Play size={14} />Test Redis</>}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Run each test separately - {sustainedTps * sustainedDuration} total queries at {sustainedTps} queries/sec for {sustainedDuration}s
        </p>

        {sustainedError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{sustainedError}</span>
          </div>
        )}

        {/* Results */}
        <div className="grid grid-cols-2 gap-4">
          {/* Fabric */}
          <div className={`rounded-xl border p-4 ${fabricResults ? 'border-gray-200 bg-gray-50' : 'border-dashed border-gray-200 bg-gray-50/50'}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fabric (Direct)</p>
            {fabricLoading && <p className="text-sm text-gray-400 animate-pulse">Running {sustainedTps} TPS for {sustainedDuration}s...</p>}
            {fabricResults && (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Avg</span><span className="font-bold text-gray-800">{fabricResults.avg}ms</span></div>
                <div className="flex justify-between"><span className="text-gray-500">p50</span><span className="font-semibold text-gray-700">{fabricResults.p50}ms</span></div>
                <div className="flex justify-between"><span className="text-gray-500">p95</span><span className="font-semibold text-amber-600">{fabricResults.p95}ms</span></div>
                <div className="flex justify-between"><span className="text-gray-500">p99</span><span className="font-semibold text-red-600">{fabricResults.p99}ms</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Max</span><span className="font-semibold text-red-700">{fabricResults.max}ms</span></div>
              </div>
            )}
            {!fabricResults && !fabricLoading && <p className="text-xs text-gray-400">Click "Test Fabric" to run</p>}
          </div>

          {/* Redis */}
          <div className={`rounded-xl border p-4 ${cacheResults ? 'border-cyan-100 bg-cyan-50' : 'border-dashed border-cyan-100 bg-cyan-50/50'}`}>
            <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wide mb-3">Redis Cache</p>
            {cacheLoading && <p className="text-sm text-cyan-400 animate-pulse">Running {sustainedTps} TPS for {sustainedDuration}s...</p>}
            {cacheResults && (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-cyan-700">Avg</span><span className="font-bold text-cyan-800">{cacheResults.avg}ms</span></div>
                <div className="flex justify-between"><span className="text-cyan-700">p50</span><span className="font-semibold text-cyan-700">{cacheResults.p50}ms</span></div>
                <div className="flex justify-between"><span className="text-cyan-700">p95</span><span className="font-semibold text-cyan-700">{cacheResults.p95}ms</span></div>
                <div className="flex justify-between"><span className="text-cyan-700">p99</span><span className="font-semibold text-cyan-700">{cacheResults.p99}ms</span></div>
                <div className="flex justify-between"><span className="text-cyan-700">Max</span><span className="font-semibold text-cyan-700">{cacheResults.max}ms</span></div>
              </div>
            )}
            {!cacheResults && !cacheLoading && <p className="text-xs text-cyan-400">Click "Test Redis" to run</p>}
          </div>
        </div>

        {/* Summary - only shown when both results available */}
        {fabricResults && cacheResults && (
          <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700 font-semibold">
            Redis is {Math.round((1 - cacheResults.avg / fabricResults.avg) * 100)}% faster on average ·
            p99 reduction: {fabricResults.p99}ms → {cacheResults.p99}ms
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 - FORMAL EVALUATION (multi-trial with statistics)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <SectionHeader
          icon={BarChart2}
          title="Formal Evaluation"
          subtitle="Multi-trial 3-way comparison with mean ± stddev ± 95% CI - for thesis tables"
        />

        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm text-gray-600">Trials:</label>
          <input
            type="number"
            min={1}
            max={10}
            value={evalTrials}
            onChange={e => setEvalTrials(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <RunButton
            onClick={runEvaluation}
            loading={evalLoading}
            label="Run Evaluation"
            loadingLabel={`Running ${evalTrials} trials...`}
          />
          {evalResult && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => api.exportResultsCsv()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gray-700 text-white hover:bg-gray-800 transition-colors"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={() => api.exportResultsJson()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download size={13} /> JSON
              </button>
            </div>
          )}
        </div>

        {evalError && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 mb-4">
            <AlertTriangle size={14} className="inline mr-1" /> {evalError}
          </div>
        )}

        {evalLoading && (
          <div className="text-sm text-cyan-600 animate-pulse">
            Running {evalTrials}-trial evaluation... Each trial runs 3 strategies × 3 rounds. This may take a few minutes.
          </div>
        )}

        {evalResult && evalResult.summary && (
          <div className="space-y-4">
            {/* Summary table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-700">Strategy</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Mean Latency (ms)</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700">± StdDev</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700">95% CI</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700">Hit Rate</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-700">BC Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'No-Cache', lat: evalResult.summary.noCacheLatency, hr: null, bc: evalResult.summary.noCacheBcCalls, colour: 'text-red-700' },
                    { label: 'Naive (5min TTL)', lat: evalResult.summary.naiveLatency, hr: evalResult.summary.naiveHitRate, bc: evalResult.summary.naiveBcCalls, colour: 'text-amber-700' },
                    { label: 'Smart (Policy)', lat: evalResult.summary.smartLatency, hr: evalResult.summary.smartHitRate, bc: evalResult.summary.smartBcCalls, colour: 'text-cyan-700' },
                  ].map(row => (
                    <tr key={row.label} className="border-t border-gray-100">
                      <td className={`px-4 py-2.5 font-semibold ${row.colour}`}>{row.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{row.lat.mean}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">{row.lat.stddev}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">±{row.lat.ci95}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{row.hr ? `${(row.hr.mean * 100).toFixed(1)}%` : '0%'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{row.bc.mean}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Headline stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Speedup Factor" value={`${evalResult.summary.speedupFactor}×`} colour="green" />
              <StatBox label="Latency Reduction" value={`${evalResult.summary.latencyReductionPct}%`} colour="cyan" />
              <StatBox label="Trials" value={evalResult.trials} sub="independent runs" colour="navy" />
            </div>

            {/* Per-trial details (collapsible) */}
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
                View per-trial raw data ({evalResult.trials} trials × 3 rounds)
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Trial</th>
                      <th className="px-3 py-2 text-left">Round</th>
                      <th className="px-3 py-2 text-right">No-Cache (ms)</th>
                      <th className="px-3 py-2 text-right">Naive (ms)</th>
                      <th className="px-3 py-2 text-right">Smart (ms)</th>
                      <th className="px-3 py-2 text-right">Smart Hit Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalResult.perTrial.map((trial, ti) =>
                      trial.noCache.map((nc, ri) => (
                        <tr key={`${ti}-${ri}`} className="border-t border-gray-50">
                          <td className="px-3 py-1.5">{ti + 1}</td>
                          <td className="px-3 py-1.5">{ri + 1}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{nc.avgLatencyMs}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{trial.naive[ri].avgLatencyMs}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{trial.smart[ri].avgLatencyMs}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{(trial.smart[ri].hitRate * 100).toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </div>

    </div>
  );
}
