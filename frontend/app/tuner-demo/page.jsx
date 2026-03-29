'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { AlertTriangle, CheckCircle, ChevronRight, RefreshCw } from 'lucide-react';

function StepBadge({ number, active, done }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
      ${done ? 'bg-green-500 text-white' : active ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
      {done ? <CheckCircle size={16} /> : number}
    </div>
  );
}

function ThresholdTable({ thresholds, prev }) {
  const rows = [
    { label: 'Rule 1 - Checkpoint Distance', key: 'rule1_checkpointDistanceKm', unit: 'km' },
    { label: 'Rule 2 - Access Count', key: 'rule2_accessCountThreshold', unit: 'accesses' },
    { label: 'Rule 3 - Value Threshold', key: 'rule3_valueThresholdUsd', unit: 'USD' },
    { label: 'Rule 3 - Dest Distance', key: 'rule3_destDistanceKm', unit: 'km' },
  ];
  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden text-sm">
      <div className="grid grid-cols-3 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <span>Rule</span><span>Value</span>{prev && <span>Change</span>}
      </div>
      {rows.map(r => {
        const val = thresholds?.[r.key];
        const pval = prev?.[r.key];
        const changed = prev && val !== pval;
        return (
          <div key={r.key} className={`grid grid-cols-3 px-4 py-2 border-t border-gray-50 ${changed ? 'bg-cyan-50' : ''}`}>
            <span className="text-gray-600">{r.label}</span>
            <span className="font-semibold text-gray-800">{val} {r.unit}</span>
            {prev && (
              <span className={changed ? 'text-cyan-600 font-semibold' : 'text-gray-400'}>
                {changed ? `${pval} → ${val} ↑` : '-'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HitRateBar({ pct, label, colour }) {
  const colours = {
    red: 'bg-red-400',
    cyan: 'bg-cyan-500',
    green: 'bg-green-500',
  };
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-bold text-gray-800">{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-4">
        <div className={`${colours[colour]} h-4 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TunerDemoPage() {
  const [step, setStep] = useState(0); // 0=idle, 1=reset done, 2=measured, 3=tuned
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [resetData, setResetData] = useState(null);
  const [measureData, setMeasureData] = useState(null);
  const [tuneData, setTuneData] = useState(null);

  const run = async (fn, onSuccess) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fn();
      onSuccess(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => run(api.tunerDemoReset, data => {
    setResetData(data);
    setMeasureData(null);
    setTuneData(null);
    setStep(1);
  });

  const handleMeasure = () => run(api.tunerDemoMeasure, data => {
    setMeasureData(data);
    setStep(2);
  });

  const handleTune = () => run(api.tunerDemoTune, data => {
    setTuneData(data);
    setStep(3);
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Adaptive Tuner Demo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Three steps showing how the adaptive tuner detects misconfigured thresholds and self-corrects.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── STEP 1 ── */}
      <div className={`bg-white rounded-2xl border p-6 space-y-4 ${step >= 1 ? 'border-green-200' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <StepBadge number={1} active={step === 0} done={step >= 1} />
          <div>
            <h2 className="font-semibold text-gray-900">Set Misconfigured Thresholds</h2>
            <p className="text-xs text-gray-500">Rule 1 = 5km, Rule 3 dest = 8km - assets sit at 10-15km, so nothing will be cached.</p>
          </div>
        </div>

        <button
          onClick={handleReset}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading && step === 0 ? <RefreshCw size={14} className="animate-spin" /> : null}
          Reset to Tight Thresholds
        </button>

        {resetData && (
          <div className="space-y-2">
            <p className="text-xs text-green-600 font-semibold">Cache cleared. Thresholds set:</p>
            <ThresholdTable thresholds={resetData.thresholds} />
          </div>
        )}
      </div>

      {/* ── STEP 2 ── */}
      <div className={`bg-white rounded-2xl border p-6 space-y-4 ${step >= 2 ? 'border-green-200' : step === 1 ? 'border-cyan-200' : 'border-gray-100 opacity-60'}`}>
        <div className="flex items-center gap-3">
          <StepBadge number={2} active={step === 1} done={step >= 2} />
          <div>
            <h2 className="font-semibold text-gray-900">Measure Hit Rate (Before Tuning)</h2>
            <p className="text-xs text-gray-500">Worker pre-caches based on current thresholds. Agents query. Measure what was served from cache.</p>
          </div>
        </div>

        <button
          onClick={handleMeasure}
          disabled={loading || step < 1}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading && step === 1 ? <RefreshCw size={14} className="animate-spin" /> : null}
          Run Worker + Measure
        </button>

        {measureData && (
          <div className="space-y-3">
            <HitRateBar pct={measureData.hitRatePct} label="Cache Hit Rate (before)" colour={measureData.hitRatePct > 30 ? 'cyan' : 'red'} />
            <p className="text-xs text-gray-500">
              {measureData.hits} cache hits, {measureData.misses} blockchain calls out of {measureData.totalQueries} queries
            </p>
            <div className="rounded-lg border border-gray-100 overflow-hidden text-xs">
              <div className="grid grid-cols-3 px-3 py-1.5 bg-gray-50 font-semibold text-gray-500 uppercase tracking-wide">
                <span>Asset</span><span>Served From</span><span>Pre-cached?</span>
              </div>
              {measureData.assetDetails.map(d => (
                <div key={d.id} className={`grid grid-cols-3 px-3 py-1.5 border-t border-gray-50 ${d.source === 'cache' ? 'bg-cyan-50' : ''}`}>
                  <span className="font-mono text-gray-700">{d.id}</span>
                  <span className={d.source === 'cache' ? 'text-cyan-600 font-semibold' : 'text-gray-400'}>
                    {d.source === 'cache' ? 'Redis cache' : 'Blockchain'}
                  </span>
                  <span>{d.preCached ? '✓' : '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── STEP 3 ── */}
      <div className={`bg-white rounded-2xl border p-6 space-y-4 ${step >= 3 ? 'border-green-200' : step === 2 ? 'border-cyan-200' : 'border-gray-100 opacity-60'}`}>
        <div className="flex items-center gap-3">
          <StepBadge number={3} active={step === 2} done={step >= 3} />
          <div>
            <h2 className="font-semibold text-gray-900">Run Adaptive Tuner</h2>
            <p className="text-xs text-gray-500">Tuner detects low recall, widens thresholds automatically. Then measures again.</p>
          </div>
        </div>

        <button
          onClick={handleTune}
          disabled={loading || step < 2}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 transition-colors"
        >
          {loading && step === 2 ? <RefreshCw size={14} className="animate-spin" /> : null}
          Run Adaptive Tuner
        </button>

        {tuneData && (
          <div className="space-y-4">

            {/* Adjustments made */}
            {tuneData.adjustments.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Tuner Adjustments</p>
                <div className="space-y-2">
                  {tuneData.adjustments.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-cyan-50 border border-cyan-100 text-sm">
                      <ChevronRight size={14} className="text-cyan-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold text-cyan-700">{a.rule} - {a.param}</span>
                        <span className="text-cyan-600 ml-2">{a.from} → {a.to}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{a.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No adjustments made - thresholds already optimal.</p>
            )}

            {/* New thresholds */}
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Updated Thresholds</p>
              <ThresholdTable thresholds={tuneData.newThresholds} prev={resetData?.thresholds} />
            </div>

            {/* Before vs After hit rate */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Hit Rate Comparison</p>
              <HitRateBar pct={measureData?.hitRatePct ?? 0} label="Before tuning" colour="red" />
              <HitRateBar pct={tuneData.afterHitRatePct} label="After tuning" colour="green" />
            </div>

            {tuneData.afterHitRatePct > (measureData?.hitRatePct ?? 0) && (
              <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700 font-semibold">
                Hit rate improved from {measureData?.hitRatePct ?? 0}% → {tuneData.afterHitRatePct}% - no manual intervention required.
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
