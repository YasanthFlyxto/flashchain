'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import {
  Settings2, Plus, Trash2, ToggleLeft, ToggleRight,
  RotateCcw, Save, X, ChevronDown, ChevronUp
} from 'lucide-react';

const PRIORITY_COLOURS = {
  HIGH:   'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW:    'bg-gray-100 text-gray-600 border-gray-200',
};

const LOGIC_COLOURS = {
  AND: 'bg-blue-50 text-blue-700',
  OR:  'bg-purple-50 text-purple-700',
};

// ── Condition row inside the add/edit modal ──────────────────────────────────
function ConditionRow({ condition, fields, index, onChange, onRemove }) {
  const fieldMeta = fields.find(f => f.field === condition.field) || fields[0];
  const isNumber = fieldMeta?.type === 'number';

  const operators = isNumber
    ? ['lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'equals']
    : ['equals', 'notEquals', 'contains'];

  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
      <select
        value={condition.field}
        onChange={e => onChange(index, 'field', e.target.value)}
        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-300"
      >
        {fields.map(f => <option key={f.field} value={f.field}>{f.field}</option>)}
      </select>

      <select
        value={condition.operator}
        onChange={e => onChange(index, 'operator', e.target.value)}
        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-300"
      >
        {operators.map(op => <option key={op} value={op}>{op}</option>)}
      </select>

      <input
        type={isNumber ? 'number' : 'text'}
        value={condition.value}
        onChange={e => onChange(index, 'value', isNumber ? Number(e.target.value) : e.target.value)}
        placeholder="value"
        className="w-24 text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-300"
      />

      <button onClick={() => onRemove(index)} className="text-gray-300 hover:text-red-400 ml-auto">
        <X size={14} />
      </button>
    </div>
  );
}

// ── Add / Edit modal ─────────────────────────────────────────────────────────
function PolicyModal({ initial, fields, onSave, onClose }) {
  const blank = { name: '', conditions: [{ field: fields[0]?.field || '', operator: 'equals', value: '' }], logic: 'AND', ttlMinutes: 30, priority: 'MEDIUM' };
  const [form, setForm] = useState(initial || blank);

  const updateCondition = (i, key, val) => {
    const conds = form.conditions.map((c, idx) => idx === i ? { ...c, [key]: val } : c);
    // reset operator when field type changes
    if (key === 'field') {
      const meta = fields.find(f => f.field === val);
      const isNum = meta?.type === 'number';
      conds[i].operator = isNum ? 'lessThan' : 'equals';
      conds[i].value = '';
    }
    setForm({ ...form, conditions: conds });
  };

  const addCondition = () => setForm({
    ...form,
    conditions: [...form.conditions, { field: fields[0]?.field || '', operator: 'equals', value: '' }]
  });

  const removeCondition = i => setForm({ ...form, conditions: form.conditions.filter((_, idx) => idx !== i) });

  const valid = form.name.trim() && form.conditions.length > 0 && form.conditions.every(c => c.value !== '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit Policy' : 'New Policy'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Policy Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Cold Chain Near Checkpoint"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Conditions</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Match:</span>
                {['AND', 'OR'].map(l => (
                  <button
                    key={l}
                    onClick={() => setForm({ ...form, logic: l })}
                    className={`text-xs px-2 py-0.5 rounded font-semibold ${form.logic === l ? LOGIC_COLOURS[l] : 'bg-gray-100 text-gray-500'}`}
                  >{l}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {form.conditions.map((c, i) => (
                <ConditionRow key={i} condition={c} fields={fields} index={i} onChange={updateCondition} onRemove={removeCondition} />
              ))}
            </div>
            <button
              onClick={addCondition}
              className="mt-2 flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 font-medium"
            >
              <Plus size={12} /> Add condition
            </button>
          </div>

          {/* TTL + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cache TTL (minutes)</label>
              <input
                type="number" min="1"
                value={form.ttlMinutes}
                onChange={e => setForm({ ...form, ttlMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                {['HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => valid && onSave(form)}
            disabled={!valid}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={14} /> Save Policy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Policy card ──────────────────────────────────────────────────────────────
function PolicyCard({ policy, onToggle, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${policy.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="px-5 py-4 flex items-center gap-3">
        {/* Toggle */}
        <button onClick={() => onToggle(policy.id, !policy.enabled)} className="text-gray-400 hover:text-cyan-600 shrink-0">
          {policy.enabled ? <ToggleRight size={22} className="text-cyan-600" /> : <ToggleLeft size={22} />}
        </button>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{policy.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLOURS[policy.priority] || PRIORITY_COLOURS.MEDIUM}`}>
              {policy.priority}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${LOGIC_COLOURS[policy.logic]}`}>
              {policy.logic}
            </span>
            <span className="text-xs text-gray-400">TTL: {policy.ttlMinutes}min</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{policy.conditions.length} condition{policy.conditions.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button onClick={() => onEdit(policy)} className="p-1.5 text-gray-400 hover:text-cyan-600">
            <Settings2 size={15} />
          </button>
          <button onClick={() => onDelete(policy.id)} className="p-1.5 text-gray-400 hover:text-red-400">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Expanded conditions */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-50">
          <div className="mt-3 space-y-1.5">
            {policy.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {i > 0 && (
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${LOGIC_COLOURS[policy.logic]}`}>{policy.logic}</span>
                )}
                <span className="font-mono bg-gray-50 border border-gray-100 px-2 py-1 rounded text-gray-700">
                  {c.field} <span className="text-cyan-600">{c.operator}</span> <span className="font-semibold">{c.value}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PolicyStudioPage() {
  const [policies, setPolicies] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | { ...policy }
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.getPolicies();
      setPolicies(res.policies || []);
      setFields(res.fields || []);
    } catch { /* backend offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = text => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  const handleSave = async (form) => {
    try {
      if (modal?.id) {
        await api.updatePolicy(modal.id, form);
      } else {
        await api.addPolicy(form);
      }
      setModal(null);
      await load();
      flash(modal?.id ? 'Policy updated.' : 'Policy added.');
    } catch { flash('Failed to save policy.'); }
  };

  const handleToggle = async (id, enabled) => {
    try {
      await api.updatePolicy(id, { enabled });
      await load();
    } catch { flash('Failed to toggle policy.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await api.deletePolicy(id);
      await load();
      flash('Policy deleted.');
    } catch { flash('Failed to delete.'); }
  };

  const handleReset = async () => {
    if (!confirm('Reset all policies to defaults?')) return;
    try {
      await api.resetPolicies();
      await load();
      flash('Reset to defaults.');
    } catch { flash('Reset failed.'); }
  };

  if (loading) return <div className="p-6 text-gray-400">Loading policies…</div>;

  return (
    <>
      {modal !== null && (
        <PolicyModal
          initial={modal === 'add' ? null : modal}
          fields={fields}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Policy Studio</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Define when shipments get pre-cached — based on live shipment properties
            </p>
          </div>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-green-600 font-medium">{msg}</span>}
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              <RotateCcw size={14} /> Reset Defaults
            </button>
            <button
              onClick={() => setModal('add')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700"
            >
              <Plus size={15} /> New Policy
            </button>
          </div>
        </div>

        {/* Available fields reference */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Available Shipment Fields</p>
          <div className="flex flex-wrap gap-2">
            {fields.map(f => (
              <span key={f.field} className="flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                <span className="font-mono text-gray-700">{f.field}</span>
                <span className={`text-xs px-1 py-0.5 rounded font-medium ${f.type === 'number' ? 'bg-cyan-50 text-cyan-600' : 'bg-purple-50 text-purple-600'}`}>
                  {f.type}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Policy list */}
        <div className="space-y-3">
          {policies.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
              No policies defined. Click <strong>New Policy</strong> to add one.
            </div>
          ) : (
            policies.map(p => (
              <PolicyCard
                key={p.id}
                policy={p}
                onToggle={handleToggle}
                onEdit={p => setModal(p)}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
