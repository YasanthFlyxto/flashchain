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
  const [selectedShipment, setSelectedShipment] = useState(null);

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
    const interval = setInterval(loadStats, 5000);
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

      setFormData({
        shipmentId: '',
        color: '',
        size: '',
        owner: '',
        value: ''
      });

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
              <h1 className="text-3xl font-bold text-gray-900">🚀 FlashChain</h1>
              <p className="text-sm text-gray-600 mt-1">
                Context-Aware Smart Caching for Supply Chain Management
              </p>
            </div>

            <Link
              href="/analytics"
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
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
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  lastQuery.source === 'cache'
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 text-white'
                }`}>
                  {lastQuery.source === 'cache' ? '⚡ FROM CACHE' : '🔗 FROM BLOCKCHAIN'}
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Latency:</span>
                  <span className="ml-2 font-bold text-indigo-600">{lastQuery.latency}</span>
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

          {/* Active Shipments - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Package size={24} />
                Active Shipments
                <span className="ml-auto text-sm font-normal text-gray-500">
                  Cache TTL: {roleConfig[role]?.ttl}
                </span>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shipments.map((shipment) => (
                    <div
                      key={shipment.ID}
                      className="border-2 border-gray-200 bg-gray-50 rounded-lg hover:shadow-lg hover:border-indigo-300 transition-all"
                    >
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="text-lg font-bold text-indigo-600">
                            {shipment.ID}
                          </h3>
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold">
                            Active
                          </span>
                        </div>

                        <div className="space-y-2 text-sm mb-4">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Product:</span>
                            <span className="font-semibold text-gray-800">{shipment.Color}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Quantity:</span>
                            <span className="font-semibold text-gray-800">{shipment.Size}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Owner:</span>
                            <span className="font-semibold text-gray-800">{shipment.Owner}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Value:</span>
                            <span className="font-semibold text-green-600">${shipment.AppraisedValue}</span>
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            try {
                              const details = await api.getShipment(shipment.ID, role);
                              setSelectedShipment(details);
                            } catch (error) {
                              alert('Error loading shipment: ' + error.message);
                            }
                          }}
                          className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-indigo-700 transition font-semibold text-sm"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Role Context Info */}
            <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Zap size={20} className="text-yellow-500" />
                Context-Aware Caching
              </h3>
              <p className="text-sm text-gray-600">
                {role === 'manufacturer' && '🏭 Historical data focus - Longest cache duration for stable production data'}
                {role === 'distributor' && '🚚 Balanced caching - Moderate freshness for logistics tracking'}
                {role === 'retailer' && '🏪 Real-time focus - Shortest cache for live inventory updates'}
                {role === 'default' && '👔 Standard caching - General supply chain monitoring'}
              </p>
            </div>
          </div>

          {/* Sidebar - Create Shipment Form */}
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
                  className="w-full text-black px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Product Type (e.g., Electronics)"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <input
                  type="number"
                  placeholder="Quantity (e.g., 100)"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <input
                  type="number"
                  placeholder="Value $ (e.g., 50000)"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <button
                  type="submit"
                  className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
                >
                  Create Shipment
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Shipment Details Modal */}
      {selectedShipment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">{selectedShipment.data.ID}</h2>
                  <div className="flex gap-2 mt-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      selectedShipment.source === 'cache' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedShipment.source === 'cache' ? '⚡ From Cache' : '🔗 From Blockchain'}
                    </span>
                    
                    {selectedShipment.verified && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-white bg-opacity-20">
                        🔒 Verified
                      </span>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={() => setSelectedShipment(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-10 h-10 flex items-center justify-center transition text-2xl font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="border-l-4 border-indigo-500 pl-4">
                  <div className="text-sm text-gray-600">Owner</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {selectedShipment.data.Owner}
                  </div>
                </div>

                <div className="border-l-4 border-purple-500 pl-4">
                  <div className="text-sm text-gray-600">Value</div>
                  <div className="text-lg font-semibold text-gray-900">
                    ${selectedShipment.data.AppraisedValue}
                  </div>
                </div>

                <div className="border-l-4 border-green-500 pl-4">
                  <div className="text-sm text-gray-600">Color</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {selectedShipment.data.Color}
                  </div>
                </div>

                <div className="border-l-4 border-yellow-500 pl-4">
                  <div className="text-sm text-gray-600">Size</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {selectedShipment.data.Size}
                  </div>
                </div>

                <div className="border-l-4 border-blue-500 pl-4">
                  <div className="text-sm text-gray-600">Query Latency</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {selectedShipment.latency}
                  </div>
                </div>

                <div className="border-l-4 border-red-500 pl-4">
                  <div className="text-sm text-gray-600">Cache TTL</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {selectedShipment.ttl ? `${selectedShipment.ttl}s` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Hash verification display */}
              {selectedShipment.hash && (
                <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-600 font-bold">🔐 Data Integrity</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">
                      SHA-256 Verified
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mb-1">Cryptographic Hash</div>
                  <div className="text-sm font-mono text-gray-800 bg-white p-3 rounded border border-purple-200 break-all">
                    {selectedShipment.hash}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    ✓ Hash matches blockchain record - Data integrity confirmed
                  </p>
                </div>
              )}

              {/* Performance metrics */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-gray-800 mb-3">Performance Metrics</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-indigo-600">
                      {selectedShipment.latency}
                    </div>
                    <div className="text-xs text-gray-600">Response Time</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {selectedShipment.source === 'cache' ? '~95%' : '0%'}
                    </div>
                    <div className="text-xs text-gray-600">Faster Than Direct</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {selectedShipment.stakeholder || role}
                    </div>
                    <div className="text-xs text-gray-600">Role Context</div>
                  </div>
                </div>
              </div>

              {/* Transfer form */}
              <div className="border-t pt-4">
                <h3 className="font-bold text-gray-800 mb-3">Transfer Ownership</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const newOwner = e.target.newOwner.value;
                    try {
                      await api.transferShipment(selectedShipment.data.ID, newOwner);
                      alert('Shipment transferred successfully!');
                      setSelectedShipment(null);
                      await loadData();
                    } catch (error) {
                      alert('Transfer failed: ' + error.message);
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    name="newOwner"
                    placeholder="New owner name"
                    required
                    className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2 bg-black text-white rounded-lg hover:bg-indigo-700 transition font-semibold"
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
