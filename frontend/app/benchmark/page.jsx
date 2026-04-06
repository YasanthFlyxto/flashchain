'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  Play, CheckCircle, AlertTriangle, Zap,
  Database, Activity, RefreshCw, BarChart2
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
  const [setting, setSetting] = useState(false);
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

    </div>
  );
}
