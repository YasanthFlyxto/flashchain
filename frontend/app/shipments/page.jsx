'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { Package, Plus, ArrowRight, RefreshCw, Search, Trash2 } from 'lucide-react';

const CARGO_TYPES = ['Electronics', 'Pharmaceuticals', 'Cold Chain', 'Industrial', 'Documents', 'Textiles'];

const CUSTODIAN_OPTIONS = [
  { label: 'Manufacturer',           value: 'Manufacturer',                  status: 'Delivered'  },
  { label: 'Carrier (In-Transit)',   value: 'Carrier-Transit',               status: 'In-Transit' },
  { label: 'Customs — Rotterdam',    value: 'Customs-Rotterdam-Transit',     status: 'In-Transit' },
  { label: 'Customs — Antwerp',      value: 'Customs-Antwerp-Transit',       status: 'In-Transit' },
  { label: 'Customs — Hamburg',      value: 'Customs-Hamburg-Transit',       status: 'In-Transit' },
  { label: 'Retailer',               value: 'Retailer',                      status: 'Delivered'  },
  { label: 'Warehouse',              value: 'Warehouse',                     status: 'Delivered'  },
  { label: 'Under Dispute',          value: 'Disputed',                      status: 'DISPUTED'   },
];

function formatValue(v) {
  const num = parseFloat(v);
  if (isNaN(num)) return '—';
  return `$${num.toLocaleString()}`;
}

function genShipmentId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 900) + 100;
  return `SHIP-${stamp}-${rand}`;
}

export default function ShipmentsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Create form state
  const [createForm, setCreateForm] = useState({
    shipmentId: genShipmentId(),
    cargoType: 'Electronics',
    weight: '',
    custodian: 'Carrier-Transit',
    value: '',
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  // Transfer form state
  const [transferId, setTransferId] = useState('');
  const [transferCustodian, setTransferCustodian] = useState('Retailer');
  const [transferring, setTransferring] = useState(false);
  const [transferMsg, setTransferMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.getTestlabAssets();
      setAssets(api.mapAssets(res.assets || []));
    } catch { /* backend offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered assets
  const filtered = assets.filter(a => {
    const matchStatus = statusFilter === 'All' || a.Status === statusFilter;
    const matchSearch = !search || a.ID.toLowerCase().includes(search.toLowerCase())
      || (a.CargoType || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.shipmentId || !createForm.value || !createForm.weight) {
      setCreateMsg('Please fill in all fields.');
      return;
    }
    setCreating(true);
    setCreateMsg('');
    try {
      await api.createShipment({
        shipmentId: createForm.shipmentId,
        color:      createForm.cargoType,
        size:       String(createForm.weight),
        owner:      createForm.custodian,
        value:      String(createForm.value),
      });
      setCreateMsg('Shipment registered successfully.');
      setCreateForm({ ...createForm, shipmentId: genShipmentId(), weight: '', value: '' });
      await load();
    } catch {
      setCreateMsg('Failed to register. Check backend connection.');
    } finally { setCreating(false); }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferId) { setTransferMsg('Enter a shipment ID.'); return; }
    setTransferring(true);
    setTransferMsg('');
    try {
      await api.transferShipment(transferId, transferCustodian);
      setTransferMsg(`Custody transferred to ${transferCustodian}.`);
      await load();
    } catch {
      setTransferMsg('Transfer failed. Check the shipment ID and backend connection.');
    } finally { setTransferring(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm(`Delete shipment ${id}? This cannot be undone.`)) return;
    try {
      await api.deleteAsset(id);
      await load();
    } catch { alert('Delete failed.'); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipment Registry</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} shipment{filtered.length !== 1 ? 's' : ''} · Hyperledger Fabric ledger</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left: Registry table */}
        <div className="col-span-3 space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID or cargo type…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
            {['All', 'In-Transit', 'DISPUTED', 'Delivered'].map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`px-3 py-2 text-xs rounded-lg border font-medium transition-colors
                  ${statusFilter === s
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >{s}</button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Shipment ID', 'Cargo Type', 'Route', 'Weight', 'Value', 'Custodian', 'Status', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
                  ) : paginated.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No shipments found.</td></tr>
                  ) : paginated.map(a => (
                    <tr
                      key={a.ID}
                      onClick={() => { setTransferId(a.ID); setSelectedId(a.ID); }}
                      className={`cursor-pointer transition-colors ${selectedId === a.ID ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-3 font-mono text-xs font-medium text-gray-700 whitespace-nowrap">
                        {a.ID.length > 16 ? a.ID.slice(0, 16) + '…' : a.ID}
                      </td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{a.CargoType || '—'}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {a.Origin && a.Destination ? `${a.Origin} → ${a.Destination}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{a.WeightKg ? `${a.WeightKg} kg` : '—'}</td>
                      <td className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">{formatValue(a.AppraisedValue)}</td>
                      <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap max-w-28 truncate">{a.Custodian || '—'}</td>
                      <td className="px-3 py-3"><StatusBadge status={a.Status} /></td>
                      <td className="px-3 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(a.ID); }}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        ><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                    className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">←</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                    className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50">→</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Forms */}
        <div className="col-span-2 space-y-4">
          {/* Register Shipment */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Plus size={16} className="text-cyan-500" />
              <h2 className="font-semibold text-gray-900">Register Shipment</h2>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shipment ID</label>
                <input
                  type="text"
                  value={createForm.shipmentId}
                  onChange={e => setCreateForm({...createForm, shipmentId: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cargo Type</label>
                <select
                  value={createForm.cargoType}
                  onChange={e => setCreateForm({...createForm, cargoType: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white"
                >
                  {CARGO_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg)</label>
                  <input
                    type="number" min="1" placeholder="e.g. 2400"
                    value={createForm.weight}
                    onChange={e => setCreateForm({...createForm, weight: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Value (USD)</label>
                  <input
                    type="number" min="1" placeholder="e.g. 85000"
                    value={createForm.value}
                    onChange={e => setCreateForm({...createForm, value: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Initial Custodian / Stage</label>
                <select
                  value={createForm.custodian}
                  onChange={e => setCreateForm({...createForm, custodian: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white"
                >
                  {CUSTODIAN_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Status: <span className="font-medium text-gray-600">
                    {CUSTODIAN_OPTIONS.find(o => o.value === createForm.custodian)?.status || '—'}
                  </span>
                </p>
              </div>
              {createMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${createMsg.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {createMsg}
                </p>
              )}
              <button
                type="submit" disabled={creating}
                className="w-full py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Registering on blockchain…' : 'Register Shipment'}
              </button>
            </form>
          </div>

          {/* Transfer Custody */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <ArrowRight size={16} className="text-amber-500" />
              <h2 className="font-semibold text-gray-900">Transfer Custody</h2>
            </div>
            <form onSubmit={handleTransfer} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shipment ID</label>
                <input
                  type="text"
                  placeholder="Click a row or enter ID"
                  value={transferId}
                  onChange={e => setTransferId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Custodian</label>
                <select
                  value={transferCustodian}
                  onChange={e => setTransferCustodian(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                >
                  {CUSTODIAN_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {transferMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${transferMsg.includes('transferred') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {transferMsg}
                </p>
              )}
              <button
                type="submit" disabled={transferring}
                className="w-full py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {transferring ? 'Recording transfer…' : 'Transfer Custody'}
              </button>
              <p className="text-xs text-gray-400 text-center">Cache for this shipment will be invalidated on transfer.</p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
