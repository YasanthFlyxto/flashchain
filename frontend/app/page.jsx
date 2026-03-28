'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from './lib/api';
import KPICard from './components/KPICard';
import StatusBadge from './components/StatusBadge';
import {
  Package, Activity, Zap, Database,
  RefreshCw, Clock, AlertTriangle, TrendingUp
} from 'lucide-react';

function formatValue(v) {
  if (!v) return '$0';
  const num = parseFloat(v);
  if (isNaN(num)) return `$${v}`;
  return `$${num.toLocaleString()}`;
}

function timeAgo(isoString) {
  if (!isoString) return '-';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [workerEnabled, setWorkerEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      const [assetRes, statsRes, activityRes, workerRes] = await Promise.all([
        api.getTestlabAssets().catch(() => ({ assets: [] })),
        api.getStats().catch(() => ({ summary: {} })),
        api.getPreCacheActivity().catch(() => ({ activity: [] })),
        api.getWorkerStatus().catch(() => ({ workerEnabled: false })),
      ]);
      setAssets(assetRes.assets || []);
      setStats(statsRes.summary || {});
      setActivity((activityRes.activity || []).slice(0, 20));
      setWorkerEnabled(workerRes.workerEnabled || false);
      setLastRefresh(new Date());
    } catch {
      // backend not connected yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const toggleWorker = async () => {
    try {
      const res = await api.toggleWorker(!workerEnabled);
      setWorkerEnabled(res.workerEnabled);
    } catch { /* ignore */ }
  };

  const mapped = api.mapAssets(assets);
  const activeShipments = mapped.filter(a => a.Status === 'In-Transit' || a.Status === 'DISPUTED');
  const disputedCount = mapped.filter(a => a.Status === 'DISPUTED').length;
  const preCachedCount = mapped.filter(a => a.cachedStatus?.isPreCached).length;
  const hitRate = stats?.cacheHitRate ?? '-';
  const recent = activeShipments.slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString()}`
              : 'Connecting to backend…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleWorker}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors
              ${workerEnabled
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
          >
            <span className={`w-2 h-2 rounded-full ${workerEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
            Pre-Cache Worker {workerEnabled ? 'Active' : 'Paused'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Total Shipments"
          value={loading ? '…' : mapped.length}
          sub={`${activeShipments.length} active`}
          icon={Package}
          accent="cyan"
        />
        <KPICard
          label="In Transit"
          value={loading ? '…' : activeShipments.length - disputedCount}
          sub={disputedCount > 0 ? `${disputedCount} disputed` : 'No disputes'}
          icon={Activity}
          accent={disputedCount > 0 ? 'red' : 'amber'}
        />
   
        <KPICard
          label="Pre-Cached"
          value={loading ? '…' : preCachedCount}
          sub="shipments in Redis"
          icon={Database}
          accent="cyan"
        />
      </div>

      {/* Main content: table + activity feed */}
      <div className="grid grid-cols-3 gap-6">
        {/* Active Shipments Table */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Active Shipments</h2>
            <a href="/shipments" className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">
              View all →
            </a>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading shipments…</div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No active shipments.{' '}
              <a href="/shipments" className="text-cyan-600 hover:underline">Register one →</a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Shipment ID', 'Cargo Type', 'Route', 'Value', 'Status', 'Cache'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recent.map(a => (
                    <tr key={a.ID} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 font-medium">
                        {a.ID.length > 14 ? a.ID.slice(0, 14) + '…' : a.ID}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.CargoType || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {a.Origin && a.Destination ? `${a.Origin} → ${a.Destination}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{formatValue(a.AppraisedValue)}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.Status} /></td>
                      <td className="px-4 py-3">
                        {a.cachedStatus?.isPreCached
                          ? <span className="text-xs bg-cyan-100 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full font-medium">CACHED</span>
                          : <span className="text-xs bg-gray-100 text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">COLD</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Live Activity Feed */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Pre-Cache Activity</h2>
            <a href="/cache" className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">
              Details →
            </a>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-80">
            {activity.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <Clock size={24} className="mx-auto mb-2 text-gray-300" />
                No activity yet. Enable the pre-cache worker.
              </div>
            ) : (
              activity.map((ev, i) => (
                <div key={i} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0 mt-1.5" />
                      <span className="font-mono text-xs text-gray-700 truncate font-medium">
                        {ev.assetId?.slice(0, 14) || '-'}
                      </span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                      ev.priority === 'HIGH'   ? 'bg-red-100 text-red-600' :
                      ev.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
                                                 'bg-gray-100 text-gray-500'
                    }`}>{ev.priority || '-'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 ml-3.5 truncate">{ev.ruleName || ev.rule || '-'}</p>
                  <p className="text-xs text-gray-400 mt-0.5 ml-3.5">{timeAgo(ev.timestamp)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Performance summary bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp size={16} className="text-cyan-500" />
          <span className="font-semibold text-gray-700">FlashChain Cache Performance</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Cache latency:</span>
          <span className="font-semibold text-cyan-600 ml-1">~2ms</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Blockchain latency:</span>
          <span className="font-semibold text-gray-700 ml-1">~50ms</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Latency reduction:</span>
          <span className="font-semibold text-green-600 ml-1">96%</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <AlertTriangle size={12} />
          Policy-based pre-caching · Hyperledger Fabric + Redis
        </div>
      </div>
    </div>
  );
}
