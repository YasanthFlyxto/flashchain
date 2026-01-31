// app/page.js
'use client';

import { useState, useEffect } from 'react';
import { Package, TrendingUp, Zap, Database, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { api } from './lib/api';

export default function Dashboard() {
  const [role, setRole] = useState('manufacturer');
  const [shipments, setShipments] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    shipmentId: '',
    color: '',
    size: '',
    owner: '',
    value: ''
  });

  const roleConfig = {
    manufacturer: { ttl: '1 hour', color: 'bg-blue-500', icon: '🏭' },
    distributor: { ttl: '30 min', color: 'bg-green-500', icon: '🚚' },
    retailer: { ttl: '15 min', color: 'bg-purple-500', icon: '🏪' },
    default: { ttl: '10 min', color: 'bg-gray-500', icon: '👔' }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadStats, 5000); // Auto-refresh stats
    return () => clearInterval(interval);
  }, [role]);

  async function loadData() {
    setLoading(true);
    try {
      const shipmentsData = await api.getAllShipments(role);
      setShipments(shipmentsData.data);
      setLastQuery(shipmentsData);
      await loadStats();
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

      // Reset form
      setFormData({
        shipmentId: '',
        color: '',
        size: '',
        owner: '',
        value: ''
      });

      // Reload data
      await loadData();
      alert('Shipment created successfully!');
    } catch (error) {
      alert('Error creating shipment: ' + error.message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                🚀 FlashChain
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Context-Aware Smart Caching for Supply Chain Management
              </p>
            </div>

            <Link
              href="/analytics"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
            >
              <TrendingUp size={20} />
              Analytics
            </Link>
          </div>
        </div>
      </header>

      {/* Controls Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            {/* Role Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-gray-700">
                Your Role:
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="px-4 py-2 border-2 border-indigo-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="manufacturer">🏭 Manufacturer</option>
                <option value="distributor">🚚 Distributor</option>
                <option value="retailer">🏪 Retailer</option>
                <option value="default">👔 Supply Chain Manager</option>
              </select>
            </div>

            {/* Performance Indicator */}
            {lastQuery && (
              <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-semibold">LAST QUERY</p>
                  <p className="text-2xl font-bold text-indigo-600">
                    {lastQuery.latency}ms
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${lastQuery.source === 'cache'
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 text-white'
                  }`}>
                  {lastQuery.source.toUpperCase()}
                </div>
              </div>
            )}

            <button
              onClick={loadData}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Shipments List - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Package size={24} />
                Active Shipments
              </h2>

              {loading ? (
                <div className="text-center py-12 text-gray-500">
                  Loading shipments...
                </div>
              ) : shipments.length === 0 ? (
                <div className="text-center py-12">
                  <Package size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No shipments found. Create one to get started!</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {shipments.map((shipment) => (
                    <div
                      key={shipment.ID}
                      className="border-l-4 border-indigo-500 bg-gray-50 p-4 rounded-lg hover:shadow-md transition cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-lg font-bold text-indigo-600">
                          {shipment.ID}
                        </h3>
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          ⚡ {lastQuery?.latency}ms
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600 font-semibold">Product:</span>
                          <span className="ml-2 text-gray-800">{shipment.Color}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 font-semibold">Quantity:</span>
                          <span className="ml-2 text-gray-800">{shipment.Size}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 font-semibold">Owner:</span>
                          <span className="ml-2 text-gray-800">{shipment.Owner}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 font-semibold">Value:</span>
                          <span className="ml-2 text-gray-800">${shipment.AppraisedValue}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - 1/3 width */}
          <div className="space-y-6">

            {/* Create Shipment Form */}
            {role === 'manufacturer' && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  ➕ Create Shipment
                </h2>
                <form onSubmit={handleCreateShipment} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Shipment ID (e.g., SHIP007)"
                    value={formData.shipmentId}
                    onChange={(e) => setFormData({ ...formData, shipmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Product Type (e.g., Electronics)"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Quantity (e.g., 100)"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Value $ (e.g., 50000)"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 transition"
                  >
                    🚀 Create Shipment
                  </button>
                </form>
              </div>
            )}

            {/* Stats Cards */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                📊 Performance Stats
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">
                    {shipments.length}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Total Shipments</div>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    {stats?.summary.cacheHitRate || '0%'}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Cache Hit Rate</div>
                </div>

                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-3xl font-bold text-purple-600">
                    {lastQuery?.latency || '-'}ms
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Avg Latency</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-3xl font-bold text-orange-600">
                    {roleConfig[role].ttl}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">Your Cache TTL</div>
                </div>
              </div>

              {/* Role-specific info */}
              <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{roleConfig[role].icon}</span>
                  <span className="font-semibold text-gray-800">
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  {role === 'manufacturer' && 'Historical data focus - Longest cache duration for stable production data'}
                  {role === 'distributor' && 'Balanced caching - Moderate freshness for logistics tracking'}
                  {role === 'retailer' && 'Real-time focus - Shortest cache for live inventory updates'}
                  {role === 'default' && 'Standard caching - General supply chain monitoring'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
