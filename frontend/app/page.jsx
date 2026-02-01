// app/page.js
'use client';

import { useState, useEffect } from 'react';
import { Package, TrendingUp, RefreshCw, Activity, Trash2, Eye, Zap, Clock, Target } from 'lucide-react';
import Link from 'next/link';
import { api } from './lib/api';

export default function Dashboard() {
  const [role, setRole] = useState('manufacturer');
  const [shipments, setShipments] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [preCacheActivity, setPreCacheActivity] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [cacheMode, setCacheMode] = useState('adaptive');
  const [simulationLoading, setSimulationLoading] = useState(null);

  const [formData, setFormData] = useState({
    shipmentId: '',
    color: '',
    size: '',
    owner: '',
    value: ''
  });

  const roleConfig = {
    manufacturer: { ttl: '1 hour', icon: '🏭' },
    distributor: { ttl: '30 min', icon: '🚚' },
    retailer: { ttl: '15 min', icon: '🏪' },
    default: { ttl: '10 min', icon: '👔' }
  };

  useEffect(() => {
    loadData();
    loadCacheMode();
    const interval = setInterval(() => {
      loadStats();
      loadPreCacheActivity();
      loadPredictions();
    }, 5000);
    return () => clearInterval(interval);
  }, [role]);

  async function loadData() {
    setLoading(true);
    try {
      const shipmentsData = await api.getAllShipments(role);
      setShipments(shipmentsData.data);
      setLastQuery(shipmentsData);
      await loadStats();
      await loadPreCacheActivity();
      await loadPredictions();
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }

  async function loadStats() {
    try {
      const statsData = await api.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async function loadPreCacheActivity() {
    try {
      const response = await fetch('http://localhost:4000/api/precache/activity');
      const data = await response.json();
      if (data.success) {
        setPreCacheActivity(data.activity.slice(0, 10));
      }
    } catch (error) {
      console.error('Error loading pre-cache activity:', error);
    }
  }

  async function loadPredictions() {
    try {
      const response = await fetch('http://localhost:4000/api/precache/predictions');
      const data = await response.json();
      if (data.success) {
        setPredictions(data.predictions);
      }
    } catch (error) {
      console.error('Error loading predictions:', error);
    }
  }

  async function loadCacheMode() {
    try {
      const response = await fetch('http://localhost:4000/api/cache/mode');
      const data = await response.json();
      setCacheMode(data.mode);
    } catch (error) {
      console.error('Error loading cache mode:', error);
    }
  }

  async function handleManualPreCache(assetId) {
    try {
      const response = await fetch(`http://localhost:4000/api/precache/trigger/${assetId}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success && data.cached) {
        alert(`✅ Pre-cached ${assetId}\n\nRule: ${data.evaluation.triggeredRule}\nReason: ${data.evaluation.reason}`);
        await loadPreCacheActivity();
        await loadStats();
      } else {
        alert(`❌ Could not pre-cache ${assetId}\n\n${data.message}`);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async function handleSimulateScenario(scenario) {
    setSimulationLoading(scenario);
    try {
      const response = await fetch('http://localhost:4000/api/simulate/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Simulated: ${data.message}`);
        setTimeout(async () => {
          await loadData();
          await loadPreCacheActivity();
        }, 2000);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setSimulationLoading(null);
    }
  }

  async function handleCreateShipment(e) {
    e.preventDefault();
    try {
      await api.createShipment({
        shipmentId: formData.shipmentId,
        color: formData.color,
        size: formData.size,
        owner: formData.owner || role,
        value: formData.value
      });

      setFormData({
        shipmentId: '',
        color: '',
        size: '',
        owner: '',
        value: ''
      });

      await loadData();
      alert('✅ Shipment created successfully');
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  }

  async function handleDeleteShipment(assetId) {
    if (!confirm(`Delete ${assetId}?`)) return;

    try {
      const response = await fetch(`http://localhost:4000/api/asset/${assetId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ Asset deleted');
        await loadData();
      } else {
        alert('❌ Failed: ' + data.error);
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  }

  async function handleCacheModeChange(newMode) {
    try {
      await api.setCacheMode(newMode);
      setCacheMode(newMode);
      alert(`✅ Cache mode: ${newMode.toUpperCase()}`);
      await loadData();
    } catch (error) {
      alert('❌ Failed: ' + error.message);
    }
  }

  function getTimeSince(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function formatTimeUntil(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">FlashChain</h1>
              <p className="text-sm text-gray-700 mt-0.5">
                Predictive Pre-Caching for Supply Chain
              </p>
            </div>

            <Link
              href="/analytics"
              className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 transition flex items-center gap-2 text-sm font-medium"
            >
              <TrendingUp size={16} />
              Analytics
            </Link>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="bg-white border-b border-gray-300">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-900">Role:</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value="manufacturer">🏭 Manufacturer</option>
                <option value="distributor">🚚 Distributor</option>
                <option value="retailer">🏪 Retailer</option>
                <option value="default">👔 Manager</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-900">Cache:</label>
              <select
                value={cacheMode}
                onChange={(e) => handleCacheModeChange(e.target.value)}
                className="px-3 py-1.5 text-sm text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value="adaptive">Adaptive (Smart)</option>
                <option value="simple">Simple (Fixed TTL)</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            {lastQuery && (
              <div className="flex items-center gap-3 text-sm">
                <span className={`px-2 py-1 rounded font-medium ${
                  lastQuery.source === 'cache'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {lastQuery.source === 'cache' ? 'CACHE' : 'BLOCKCHAIN'}
                </span>
                <span className="text-gray-900">
                  Latency: <span className="font-bold">{lastQuery.latency}ms</span>
                </span>
              </div>
            )}

            <button
              onClick={loadData}
              className="px-3 py-1.5 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded transition flex items-center gap-2 font-medium"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Interactive Pre-Cache Simulator */}
        {cacheMode === 'adaptive' && (
          <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={24} className="text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">Interactive Pre-Cache Simulator</h2>
              <span className="text-xs px-2 py-1 rounded bg-purple-600 text-white font-bold">DEMO MODE</span>
            </div>
            
            <p className="text-sm text-gray-700 mb-4">
              Simulate real-world scenarios to see pre-caching in action
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => handleSimulateScenario('approaching_checkpoint')}
                disabled={simulationLoading === 'approaching_checkpoint'}
                className="p-4 bg-white border-2 border-purple-300 rounded-lg hover:border-purple-500 transition text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Target size={20} className="text-purple-600" />
                  <span className="font-bold text-gray-900">Approaching Checkpoint</span>
                </div>
                <p className="text-xs text-gray-700 mb-3">
                  Simulate shipment entering 20km checkpoint zone
                </p>
                <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800 font-medium">
                  Triggers Rule 1
                </span>
              </button>

              <button
                onClick={() => handleSimulateScenario('high_value_transit')}
                disabled={simulationLoading === 'high_value_transit'}
                className="p-4 bg-white border-2 border-green-300 rounded-lg hover:border-green-500 transition text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Package size={20} className="text-green-600" />
                  <span className="font-bold text-gray-900">High-Value In-Transit</span>
                </div>
                <p className="text-xs text-gray-700 mb-3">
                  Simulate $50k+ shipment near destination
                </p>
                <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 font-medium">
                  Triggers Rule 3
                </span>
              </button>

              <button
                onClick={() => handleSimulateScenario('multi_access')}
                disabled={simulationLoading === 'multi_access'}
                className="p-4 bg-white border-2 border-blue-300 rounded-lg hover:border-blue-500 transition text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={20} className="text-blue-600" />
                  <span className="font-bold text-gray-900">Multi-Stakeholder Access</span>
                </div>
                <p className="text-xs text-gray-700 mb-3">
                  Simulate 3+ different roles accessing same asset
                </p>
                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 font-medium">
                  Triggers Rule 2
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column - Predictions & Activity */}
          <div className="space-y-6">
            
            {/* Predicted Events */}
            {cacheMode === 'adaptive' && (
              <div className="bg-white border border-gray-300 rounded">
                <div className="px-4 py-3 border-b border-gray-300 flex justify-between items-center">
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Clock size={18} />
                    Predicted Events
                  </h3>
                  <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800 font-bold">
                    {predictions.length} UPCOMING
                  </span>
                </div>
                
                <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                  {predictions.length === 0 ? (
                    <div className="text-center py-4 text-sm text-gray-700">
                      No predicted events
                    </div>
                  ) : (
                    predictions.map((pred, index) => (
                      <div 
                        key={index}
                        className={`p-3 border-2 rounded ${
                          pred.priority === 'high' 
                            ? 'border-red-300 bg-red-50' 
                            : 'border-yellow-300 bg-yellow-50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-gray-900 text-sm">{pred.assetId}</span>
                          <span className={`text-xs px-2 py-1 rounded font-bold ${
                            pred.minutesUntil < 5 
                              ? 'bg-red-600 text-white' 
                              : pred.minutesUntil < 15
                              ? 'bg-yellow-600 text-white'
                              : 'bg-gray-600 text-white'
                          }`}>
                            ⏱️ {pred.minutesUntil}m
                          </span>
                        </div>
                        
                        <div className="text-xs text-gray-900 mb-2">{pred.event}</div>
                        <div className="text-xs text-gray-700 mb-3">{pred.reason}</div>
                        
                        <div className="flex gap-2">
                          <span className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-900 font-medium">
                            ${pred.assetValue.toLocaleString()}
                          </span>
                          {pred.willTrigger && (
                            <span className="text-xs px-2 py-1 rounded bg-green-600 text-white font-bold">
                              WILL AUTO-CACHE
                            </span>
                          )}
                        </div>
                        
                        <button
                          onClick={() => handleManualPreCache(pred.assetId)}
                          className="w-full mt-3 px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition font-bold"
                        >
                          PRE-CACHE NOW
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {cacheMode === 'adaptive' && (
              <div className="bg-white border border-gray-300 rounded">
                <div className="px-4 py-3 border-b border-gray-300 flex justify-between items-center">
                  <h3 className="text-base font-bold text-gray-900">Recent Activity</h3>
                  <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 font-bold">
                    {preCacheActivity.length} EVENTS
                  </span>
                </div>
                
                <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                  {preCacheActivity.length === 0 ? (
                    <div className="text-center py-4 text-sm text-gray-700">
                      No activity yet
                    </div>
                  ) : (
                    preCacheActivity.map((activity, index) => (
                      <div 
                        key={index}
                        className="p-3 bg-gray-50 border border-gray-300 rounded text-sm"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-gray-900">{activity.assetId}</span>
                          <span className="text-gray-700 text-xs">{getTimeSince(activity.timestamp)}</span>
                        </div>
                        <div className="text-gray-900 mb-2 text-xs">{activity.reason}</div>
                        <div className="flex gap-1 flex-wrap">
                          <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800 font-medium">
                            {activity.rule}
                          </span>
                          {activity.manual && (
                            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 font-bold">
                              MANUAL
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Create Form */}
            {role === 'manufacturer' && (
              <div className="bg-white border border-gray-300 rounded">
                <div className="px-4 py-3 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">Create Shipment</h2>
                </div>
                <form onSubmit={handleCreateShipment} className="p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Shipment ID"
                    value={formData.shipmentId}
                    onChange={(e) => setFormData({ ...formData, shipmentId: e.target.value })}
                    className="w-full text-sm text-gray-900 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Product Type"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full text-sm text-gray-900 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full text-sm text-gray-900 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Value ($)"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="w-full text-sm text-gray-900 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full text-sm bg-gray-900 text-white py-2.5 rounded font-bold hover:bg-gray-800 transition"
                  >
                    Create Shipment
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Middle/Right - Shipments & Stats */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Shipments Table */}
            <div className="bg-white border border-gray-300 rounded">
              <div className="px-4 py-3 border-b border-gray-300 flex justify-between items-center">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Package size={18} />
                  Active Shipments ({shipments.length})
                </h2>
                <span className="text-sm text-gray-700 font-medium">TTL: {roleConfig[role]?.ttl}</span>
              </div>

              {loading ? (
                <div className="text-center py-12 text-sm text-gray-700">
                  Loading...
                </div>
              ) : shipments.length === 0 ? (
                <div className="text-center py-12">
                  <Package size={32} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-700">No shipments found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100 border-b border-gray-300">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-900">ID</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-900">Product</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-900">Owner</th>
                        <th className="px-4 py-3 text-left text-sm font-bold text-gray-900">Value</th>
                        <th className="px-4 py-3 text-right text-sm font-bold text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {shipments.map((shipment) => (
                        <tr key={shipment.ID} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-gray-900 text-sm">{shipment.ID}</td>
                          <td className="px-4 py-3 text-gray-900 text-sm">{shipment.Color}</td>
                          <td className="px-4 py-3 text-gray-900 text-sm">{shipment.Owner}</td>
                          <td className="px-4 py-3 text-gray-900 font-bold text-sm">${shipment.AppraisedValue}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    const details = await api.getShipment(shipment.ID, role);
                                    setSelectedShipment(details);
                                  } catch (error) {
                                    alert('Error: ' + error.message);
                                  }
                                }}
                                className="px-3 py-1.5 text-xs text-gray-900 bg-gray-100 hover:bg-gray-200 rounded transition flex items-center gap-1 font-medium"
                              >
                                <Eye size={12} />
                                View
                              </button>
                              {cacheMode === 'adaptive' && (
                                <button
                                  onClick={() => handleManualPreCache(shipment.ID)}
                                  className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded transition flex items-center gap-1 font-medium"
                                >
                                  <Zap size={12} />
                                  Pre-Cache
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteShipment(shipment.ID)}
                                className="px-3 py-1.5 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded transition flex items-center gap-1 font-medium"
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Stats */}
            {stats && (
              <div className="bg-white border border-gray-300 rounded">
                <div className="px-4 py-3 border-b border-gray-300">
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Activity size={18} />
                    Cache Performance
                  </h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-700 font-medium mb-1">Total Queries</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.summary.totalQueries}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-700 font-medium mb-1">Cache Hits</p>
                      <p className="text-2xl font-bold text-green-600">{stats.summary.cacheHits}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-700 font-medium mb-1">Pre-Cached</p>
                      <p className="text-2xl font-bold text-purple-600">{stats.summary.totalPreCached || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-700 font-medium mb-1">Hit Rate</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.summary.cacheHitRate}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal - Keep existing modal code */}
      {selectedShipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300 flex justify-between items-center bg-gray-900 text-white">
              <div>
                <h2 className="text-xl font-bold">{selectedShipment.data.ID}</h2>
                <div className="flex gap-2 mt-2">
                  <span className={`text-xs px-2 py-1 rounded font-bold ${
                    selectedShipment.source === 'cache' ? 'bg-green-600' : 'bg-blue-600'
                  }`}>
                    {selectedShipment.source === 'cache' ? 'CACHE' : 'BLOCKCHAIN'}
                  </span>
                  {selectedShipment.preCached && (
                    <span className="text-xs px-2 py-1 rounded font-bold bg-purple-600">
                      PRE-CACHED
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedShipment(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded w-8 h-8 flex items-center justify-center text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-700 font-medium mb-1">Owner</div>
                  <div className="font-bold text-gray-900">{selectedShipment.data.Owner}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-700 font-medium mb-1">Value</div>
                  <div className="font-bold text-gray-900">${selectedShipment.data.AppraisedValue}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-700 font-medium mb-1">Latency</div>
                  <div className="font-bold text-gray-900">{selectedShipment.latency}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-700 font-medium mb-1">TTL</div>
                  <div className="font-bold text-gray-900">{selectedShipment.ttl ? `${selectedShipment.ttl}s` : 'N/A'}</div>
                </div>
              </div>

              {selectedShipment.hash && (
                <div className="bg-gray-50 border border-gray-300 rounded p-4">
                  <div className="text-sm font-bold text-gray-900 mb-2">Data Integrity (SHA-256)</div>
                  <div className="text-xs font-mono text-gray-900 bg-white p-3 rounded border border-gray-300 break-all">
                    {selectedShipment.hash}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-300 pt-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Transfer Ownership</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const newOwner = e.target.newOwner.value;
                    try {
                      await api.transferShipment(selectedShipment.data.ID, newOwner);
                      alert('✅ Transferred successfully');
                      setSelectedShipment(null);
                      await loadData();
                    } catch (error) {
                      alert('❌ Failed: ' + error.message);
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    name="newOwner"
                    placeholder="New owner name"
                    required
                    className="flex-1 text-sm text-gray-900 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded font-bold hover:bg-gray-800"
                  >
                    Transfer
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
