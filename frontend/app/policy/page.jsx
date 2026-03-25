'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Settings2, Package, FlaskConical, Truck, Save, RotateCcw, AlertCircle, CheckCircle } from 'lucide-react';

// ─── Slider sub-component ───────────────────────────────────────────────────
function RuleSlider({ label, value, min, max, step = 1, unit, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {typeof value === 'number' && unit === '$'
            ? `$${value.toLocaleString()}`
            : `${value} ${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{unit === '$' ? `$${min.toLocaleString()}` : `${min} ${unit}`}</span>
        <span>{unit === '$' ? `$${max.toLocaleString()}` : `${max} ${unit}`}</span>
      </div>
    </div>
  );
}

// ─── Rule card wrapper ───────────────────────────────────────────────────────
function RuleCard({ num, title, accent, children }) {
  const ACCENTS = {
    blue:   { dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-100' },
    purple: { dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-100' },
    green:  { dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-100' },
    red:    { dot: 'bg-red-400',    badge: 'bg-red-50 text-red-700 border-red-100' },
  };
  const a = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${a.dot}`} />
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${a.badge}`}>Rule {num}</span>
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ─── Live plain-English description ─────────────────────────────────────────
function generateDescription(config) {
  if (!config) return [];
  const { rule1, rule2, rule3, rule4 } = config;
  return [
    {
      rule: 'Rule 1 - Checkpoint Proximity',
      text: `Pre-cache any in-transit shipment that is within ${rule1.checkpointDistanceKm} km of a ` +
            `customs checkpoint and has an ETA of under ${rule1.etaMinutes} minutes. ` +
            `Cached data will remain valid for ${rule1.ttlMinutes} minutes, ensuring that border agents ` +
            `and logistics coordinators can query shipment records without hitting the blockchain at peak load.`,
      colour: 'blue',
    },
    {
      rule: 'Rule 2 - Multi-Stakeholder Access',
      text: `When ${rule2.accessCountThreshold} or more distinct stakeholders from at least ` +
            `${rule2.minOrganizations} organisations query the same shipment within a ${rule2.windowHours}-hour ` +
            `window, the system treats this as a dispute or coordinated audit event. The shipment is ` +
            `pre-cached for ${rule2.ttlHours} hours to absorb the elevated query load.`,
      colour: 'purple',
    },
    {
      rule: 'Rule 3 - High-Value Near Destination',
      text: `Shipments valued above $${rule3.valueThresholdUsd.toLocaleString()} that are within ` +
            `${rule3.destDistanceKm} km of their final delivery point will be pre-cached for ` +
            `${rule3.ttlMinutes} minutes. This protects last-mile verification workflows for ` +
            `high-risk, high-value cargo.`,
      colour: 'green',
    },
    {
      rule: 'Rule 4 - Mid-Journey Exclusion (Guard)',
      text: `Shipments more than ${rule4.minCheckpointDistanceKm} km from their next checkpoint AND ` +
            `more than ${rule4.minDestDistanceKm} km from their destination will NOT be pre-cached, ` +
            `even if other rules partially match. This prevents cache pollution for cargo in the middle ` +
            `of long-haul transit where low-urgency queries do not justify pre-loading.`,
      colour: 'red',
    },
  ];
}

const PRESET_CARDS = [
  {
    key: 'general-logistics',
    label: 'General Logistics',
    desc: 'Balanced thresholds for most supply chains',
    icon: Package,
    colour: 'border-blue-200 bg-blue-50',
    activeBorder: 'border-blue-500',
    iconCls: 'text-blue-500',
  },
  {
    key: 'pharmaceutical',
    label: 'Pharmaceutical',
    desc: 'High-compliance, temperature-sensitive cargo',
    icon: FlaskConical,
    colour: 'border-purple-200 bg-purple-50',
    activeBorder: 'border-purple-500',
    iconCls: 'text-purple-500',
  },
  {
    key: 'food-beverage',
    label: 'Food & Beverage',
    desc: 'Perishable goods - tight time windows',
    icon: Truck,
    colour: 'border-green-200 bg-green-50',
    activeBorder: 'border-green-500',
    iconCls: 'text-green-500',
  },
];

const COLOUR_TEXT = {
  blue:   'text-blue-700',
  purple: 'text-purple-700',
  green:  'text-green-700',
  red:    'text-red-600',
};
const COLOUR_BG = {
  blue:   'bg-blue-50 border-blue-100',
  purple: 'bg-purple-50 border-purple-100',
  green:  'bg-green-50 border-green-100',
  red:    'bg-red-50 border-red-100',
};

export default function PolicyStudioPage() {
  const [localConfig, setLocalConfig]   = useState(null);
  const [savedConfig, setSavedConfig]   = useState(null);
  const [activePreset, setActivePreset] = useState(null);
  const [dirty, setDirty]               = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getRules();
      setLocalConfig(res.config);
      setSavedConfig(res.config);
      setDirty(false);
    } catch { /* backend offline */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Detect which preset matches current localConfig
  useEffect(() => {
    if (!localConfig) return;
    const PRESET_KEYS = ['general-logistics', 'pharmaceutical', 'food-beverage'];
    // We can't reverse-match exactly without knowing preset values, so activePreset
    // is only set when a preset card is explicitly clicked.
  }, [localConfig]);

  const updateRule = (ruleKey, paramKey, value) => {
    setLocalConfig(prev => ({
      ...prev,
      [ruleKey]: { ...prev[ruleKey], [paramKey]: value }
    }));
    setDirty(true);
    setSaveMsg('');
  };

  const handlePreset = async (presetKey) => {
    try {
      const res = await api.applyRulePreset(presetKey);
      setLocalConfig(res.config);
      setSavedConfig(res.config);
      setActivePreset(presetKey);
      setDirty(false);
      setSaveMsg('Preset applied.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Failed to apply preset.'); }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await api.updateRules(localConfig);
      setSavedConfig(res.config || localConfig);
      setDirty(false);
      setSaveMsg('Policy saved successfully.');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch { setSaveMsg('Save failed. Check backend connection.'); }
    finally { setSaving(false); }
  };

  const handleReset = async () => {
    try {
      const res = await api.resetRules();
      setLocalConfig(res.config);
      setSavedConfig(res.config);
      setActivePreset('general-logistics');
      setDirty(false);
      setSaveMsg('Reset to defaults.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Reset failed.'); }
  };

  const descriptions = generateDescription(localConfig);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading policy configuration…</div>;
  }

  if (!localConfig) {
    return (
      <div className="p-6 text-gray-500">
        Could not load rules. Make sure the backend is running.
      </div>
    );
  }

  const { rule1, rule2, rule3, rule4 } = localConfig;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Studio</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure pre-caching rules - changes apply to the live FlashChain engine</p>
        </div>
        <Settings2 size={22} className="text-gray-400" />
      </div>

      {/* Preset Cards */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Industry Presets</p>
        <div className="grid grid-cols-3 gap-4">
          {PRESET_CARDS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className={`text-left p-4 rounded-xl border-2 transition-all
                ${activePreset === p.key
                  ? `${p.activeBorder} bg-white shadow-sm`
                  : `border-gray-200 bg-white hover:${p.colour}`}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <p.icon size={18} className={activePreset === p.key ? p.iconCls : 'text-gray-400'} />
                <span className={`font-semibold text-sm ${activePreset === p.key ? 'text-gray-900' : 'text-gray-700'}`}>
                  {p.label}
                </span>
              </div>
              <p className="text-xs text-gray-500">{p.desc}</p>
              {activePreset === p.key && (
                <p className="text-xs font-medium mt-2" style={{ color: '#0e7490' }}>✓ Active preset</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column: sliders + description */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Rule sliders */}
        <div className="space-y-4">
          <RuleCard num={1} title="Checkpoint Proximity" accent="blue">
            <RuleSlider label="Checkpoint Distance" value={rule1.checkpointDistanceKm} min={5} max={100} step={5} unit="km"
              onChange={v => updateRule('rule1', 'checkpointDistanceKm', v)} />
            <RuleSlider label="ETA Window" value={rule1.etaMinutes} min={15} max={180} step={15} unit="min"
              onChange={v => updateRule('rule1', 'etaMinutes', v)} />
            <RuleSlider label="Cache TTL" value={rule1.ttlMinutes} min={10} max={120} step={5} unit="min"
              onChange={v => updateRule('rule1', 'ttlMinutes', v)} />
          </RuleCard>

          <RuleCard num={2} title="Multi-Stakeholder Access" accent="purple">
            <RuleSlider label="Access Count Threshold" value={rule2.accessCountThreshold} min={1} max={10} step={1} unit="accesses"
              onChange={v => updateRule('rule2', 'accessCountThreshold', v)} />
            <RuleSlider label="Time Window" value={rule2.windowHours} min={1} max={24} step={1} unit="hours"
              onChange={v => updateRule('rule2', 'windowHours', v)} />
            <RuleSlider label="Cache Duration" value={rule2.ttlHours} min={1} max={72} step={1} unit="hours"
              onChange={v => updateRule('rule2', 'ttlHours', v)} />
          </RuleCard>

          <RuleCard num={3} title="High-Value Near Destination" accent="green">
            <RuleSlider label="Value Threshold" value={rule3.valueThresholdUsd} min={10000} max={500000} step={10000} unit="$"
              onChange={v => updateRule('rule3', 'valueThresholdUsd', v)} />
            <RuleSlider label="Distance to Destination" value={rule3.destDistanceKm} min={10} max={200} step={10} unit="km"
              onChange={v => updateRule('rule3', 'destDistanceKm', v)} />
            <RuleSlider label="Cache TTL" value={rule3.ttlMinutes} min={15} max={120} step={15} unit="min"
              onChange={v => updateRule('rule3', 'ttlMinutes', v)} />
          </RuleCard>

          <RuleCard num={4} title="Mid-Journey Exclusion (Guard)" accent="red">
            <p className="text-xs text-gray-500 -mt-1">
              Shipments meeting both conditions below are <span className="font-semibold text-red-600">excluded</span> from caching.
            </p>
            <RuleSlider label="Min Distance from Checkpoint" value={rule4.minCheckpointDistanceKm} min={50} max={500} step={25} unit="km"
              onChange={v => updateRule('rule4', 'minCheckpointDistanceKm', v)} />
            <RuleSlider label="Min Distance from Destination" value={rule4.minDestDistanceKm} min={50} max={500} step={25} unit="km"
              onChange={v => updateRule('rule4', 'minDestDistanceKm', v)} />
          </RuleCard>

          {/* Save / Reset */}
          <div className="flex items-center gap-3 pt-2">
            {dirty && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle size={12} /> Unsaved changes
              </span>
            )}
            {saveMsg && !dirty && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle size={12} /> {saveMsg}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RotateCcw size={14} /> Reset Defaults
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={14} /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Live plain-English descriptions */}
        <div className="space-y-4">
          <div className="sticky top-6">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              What these rules mean in plain English
            </p>
            {descriptions.map(d => (
              <div key={d.rule} className={`mb-3 p-4 rounded-xl border ${COLOUR_BG[d.colour]}`}>
                <p className={`text-xs font-semibold mb-1.5 ${COLOUR_TEXT[d.colour]}`}>{d.rule}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{d.text}</p>
              </div>
            ))}
            <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-1">How to use Policy Studio</p>
              <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                <li>Select an industry preset or customise sliders above</li>
                <li>Watch the descriptions update in real-time</li>
                <li>Click <strong>Save Changes</strong> to push to the live engine</li>
                <li>Go to <strong>Cache Intelligence</strong> and run the worker to see the effect</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
