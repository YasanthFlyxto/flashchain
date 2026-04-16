'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { RefreshCw, Play, Pause } from 'lucide-react';

function timeAgo(isoString) {
  if (!isoString) return '-';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function PriorityBadge({ priority }) {
  const cls = priority === 'HIGH'   ? 'bg-red-100 text-red-700 border-red-200' :
              priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                      'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{priority || '-'}</span>
  );
}

export default function CacheIntelligencePage() {
  const [activity, setActivity] = useState([]);
  const [assets, setAssets] = useState([]);
  const [workerEnabled, setWorkerEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [activityRes, assetsRes, workerRes] = await Promise.all([
        api.getPreCacheActivity().catch(() => ({ activity: [] })),
        api.getTestlabAssets().catch(() => ({ assets: [] })),
        api.getWorkerStatus().catch(() => ({ workerEnabled: false })),
      ]);
      setActivity(activityRes.activity || []);
      setAssets(assetsRes.assets || []);
      setWorkerEnabled(workerRes.workerEnabled || false);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  const toggleWorker = async () => {
    try {
      const res = await api.toggleWorker(!workerEnabled);
      setWorkerEnabled(res.workerEnabled);
    } catch {}
  };

  const runWorker = async () => {
    setRunning(true);
    try {
      await api.runWorkerOnce();
      await load();
    } catch {}
    finally { setRunning(false); }
  };

  const cachedAssets = assets.filter(a => a.cachedStatus?.isPreCached);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cache Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time FlashChain pre-caching performance · Redis + Hyperledger Fabric</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runWorker} disabled={running}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
          >
            <Play size={14} />
            {running ? 'Running…' : 'Run Worker Now'}
          </button>
          <button
            onClick={toggleWorker}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors
              ${workerEnabled
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
          >
            {workerEnabled ? <Pause size={14} /> : <Play size={14} />}
            Auto Worker {workerEnabled ? 'On' : 'Off'}
          </button>
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Pre-Cached Shipments */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pre-Cached Shipments</h2>
          <p className="text-xs text-gray-400 mt-0.5">{cachedAssets.length} in Redis</p>
        </div>
        <div className="overflow-y-auto max-h-64 divide-y divide-gray-50">
          {cachedAssets.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No shipments currently cached.</div>
          ) : (
            cachedAssets.map(a => (
              <div key={a.ID} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-gray-700 truncate">{a.ID.slice(0, 16)}</span>
                  <PriorityBadge priority={a.cachedStatus?.priority} />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500">{a.triggeredRule || '-'}</span>
                  <span className="text-xs text-cyan-600 font-medium">
                    {a.cachedStatus?.age != null ? `${Math.round(a.cachedStatus.age)}s old` : '-'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pre-Cache Activity Log</h2>
          <p className="text-xs text-gray-400 mt-0.5">All policy-triggered pre-cache events</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Time', 'Shipment ID', 'Cargo Type', 'Rule Triggered', 'Reason', 'Priority', 'TTL'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activity.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No activity. Enable the worker or click &quot;Run Worker Now&quot;.
                </td></tr>
              ) : (
                activity.slice(0, 50).map((ev, i) => {
                  const asset = assets.find(a => a.ID === ev.assetId);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{timeAgo(ev.timestamp)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {ev.assetId?.slice(0, 16) || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {asset?.CargoType || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{ev.ruleName || ev.rule || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-48 truncate">{ev.reason || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><PriorityBadge priority={ev.priority} /></td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {ev.ttl ? `${Math.round(ev.ttl / 60)}min` : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
