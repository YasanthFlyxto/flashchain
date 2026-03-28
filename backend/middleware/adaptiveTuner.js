// middleware/adaptiveTuner.js
//
// Adaptive Policy Tuner for the Pre-Caching Rules Engine
//
// What this does:
//   After each observation round, measures two signals per rule:
//     - Precision: of assets pre-cached by this rule, how many were actually queried?
//                  Low precision = caching too aggressively, wasting Redis memory.
//     - Recall:    of all assets queried this round, how many were already cached?
//                  Low recall = cache missed demand, queries hit blockchain cold.
//
//   Based on these signals, it nudges rule thresholds toward better performance:
//     - Low precision only  → tighten rule (reduce distance / raise value threshold)
//     - Low recall only     → loosen rule (expand distance / lower value threshold)
//     - Both low            → recall takes priority (missing a query is worse than waste)
//     - Both acceptable     → no change, hold steady
//
//   Additionally, per-asset EMA frequency tracking detects access spikes and
//   extends Redis TTL for assets under unexpected high demand — preventing cache
//   expiry during active query bursts (e.g. customs hold, dispute investigation).
//
// References:
//   Precision/recall as cache policy evaluation metrics: standard in CDN and
//   edge caching literature. Godard et al. (2019) "Demand-driven caching strategies"
//   use this exact formulation for adaptive TTL selection.
//
//   EMA frequency tracking for spike detection: used in TCP congestion control
//   (RFC 6298), Redis LFU eviction policy internals, and CDN origin shield logic.

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.3;          // Smoothing factor — reacts to spikes but ignores noise
const SPIKE_MULTIPLIER = 2.0;   // current > 2× EMA → spike detected
const COOLING_MULTIPLIER = 0.5; // current < 0.5× EMA → cooling detected

const PRECISION_LOW_THRESHOLD  = 0.55; // below this = too much waste
const RECALL_LOW_THRESHOLD     = 0.60; // below this = too many cold queries

const NUDGE_DISTANCE_KM        = 2;    // km step for Rule 1 checkpoint distance
const NUDGE_DEST_DISTANCE_KM   = 5;    // km step for Rule 3 destination distance
const NUDGE_VALUE_USD          = 5000; // USD step for Rule 3 value threshold
const NUDGE_ACCESS_COUNT       = 1;    // count step for Rule 2 access threshold

const TTL_SPIKE_MULTIPLIER     = 1.5;  // extend TTL by 50% on spike
const TTL_COOLING_MULTIPLIER   = 0.75; // shrink TTL by 25% on cooling
const TTL_SPIKE_MAX_SECONDS    = 7200; // never extend beyond 2 hours
const TTL_COOLING_MIN_SECONDS  = 120;  // never shrink below 2 minutes

// Hard bounds on thresholds — prevents runaway nudging
const BOUNDS = {
  rule1: {
    checkpointDistanceKm: { min: 5,      max: 60    }
  },
  rule2: {
    accessCountThreshold: { min: 1,      max: 10    }
  },
  rule3: {
    valueThresholdUsd:    { min: 10000,  max: 200000 },
    destDistanceKm:       { min: 10,     max: 150    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTIVE TUNER CLASS
// ─────────────────────────────────────────────────────────────────────────────

class AdaptiveTuner {
  /**
   * @param {PreCachingRulesEngine} rulesEngine — will have its thresholds nudged
   * @param {SmartCache}            smartCache  — needed to update TTLs in Redis
   */
  constructor(rulesEngine, smartCache) {
    this.rulesEngine = rulesEngine;
    this.smartCache  = smartCache;

    // Per-asset exponential moving average of query frequency (queries/round)
    this.frequencyEMA = {};

    // Current round observation window
    this._round = this._emptyRound();

    // Full history — returned to frontend for charts
    this.history = [];

    // Running round counter
    this.roundNumber = 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ROUND LIFECYCLE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Call at the start of each simulation round.
   * Resets per-round observation window.
   */
  startRound() {
    this._round = this._emptyRound();
    this._round.startedAt = Date.now();
    this.roundNumber++;
  }

  /**
   * Call when the worker pre-caches an asset.
   * @param {string} assetId
   * @param {string} rule    — e.g. 'Rule 1', 'Rule 2', 'Policy 01'
   * @param {number} ttl     — TTL in seconds the worker assigned
   */
  recordPreCache(assetId, rule, ttl) {
    this._round.preCached[assetId] = {
      rule,
      ttl,
      cachedAt: Date.now(),
      queried: false
    };
  }

  /**
   * Call every time an asset is queried (hit or miss).
   * Updates access frequency EMA and marks pre-cached assets as queried.
   * @param {string} assetId
   */
  recordQuery(assetId) {
    if (!this._round.queried[assetId]) {
      this._round.queried[assetId] = { count: 0, firstAt: Date.now() };
    }
    this._round.queried[assetId].count++;
    this._round.queried[assetId].lastAt = Date.now();

    // Mark in pre-cache map so we know this pre-cache was useful
    if (this._round.preCached[assetId]) {
      this._round.preCached[assetId].queried = true;
    }

    // Update EMA — use query count so far this round as the signal
    const currentCount = this._round.queried[assetId].count;
    if (this.frequencyEMA[assetId] === undefined) {
      this.frequencyEMA[assetId] = currentCount;
    } else {
      this.frequencyEMA[assetId] =
        EMA_ALPHA * currentCount + (1 - EMA_ALPHA) * this.frequencyEMA[assetId];
    }
  }

  /**
   * Call at the end of each simulation round.
   * Calculates precision/recall, nudges thresholds, adjusts TTLs.
   * Returns a round summary object that gets pushed to history.
   */
  async endRound() {
    const preCached = this._round.preCached;
    const queried   = this._round.queried;

    // ── Per-rule precision ────────────────────────────────────────────────────
    // Precision[rule] = queried pre-caches / total pre-caches for that rule
    const byRule = {};
    for (const [assetId, info] of Object.entries(preCached)) {
      if (!byRule[info.rule]) byRule[info.rule] = { total: 0, queried: 0, wasted: 0 };
      byRule[info.rule].total++;
      if (info.queried) {
        byRule[info.rule].queried++;
      } else {
        byRule[info.rule].wasted++;
      }
    }

    const rulePrecision = {};
    for (const [rule, stats] of Object.entries(byRule)) {
      rulePrecision[rule] = stats.total > 0
        ? parseFloat((stats.queried / stats.total).toFixed(3))
        : null; // null = rule didn't fire this round, no signal
    }

    // ── Overall recall ────────────────────────────────────────────────────────
    // Recall = queries served from cache / total queries this round
    const totalQueried    = Object.keys(queried).length;
    const coveredByCache  = Object.keys(queried).filter(id => preCached[id]).length;
    const overallRecall   = totalQueried > 0
      ? parseFloat((coveredByCache / totalQueried).toFixed(3))
      : 1.0;

    // ── Threshold nudging ─────────────────────────────────────────────────────
    const adjustments = [];

    // Rule 1 — checkpoint distance
    const r1Precision = rulePrecision['Rule 1'];
    if (r1Precision != null) {
      const current = this.rulesEngine.config.rule1.checkpointDistanceKm;

      if (r1Precision < PRECISION_LOW_THRESHOLD && overallRecall >= RECALL_LOW_THRESHOLD) {
        // Precision low, recall OK → tighten (reduce distance)
        const next = Math.max(BOUNDS.rule1.checkpointDistanceKm.min, current - NUDGE_DISTANCE_KM);
        if (next !== current) {
          this.rulesEngine.updateConfig({ rule1: { checkpointDistanceKm: next } });
          adjustments.push(this._adj('Rule 1', 'checkpointDistanceKm', current, next,
            `Precision ${(r1Precision * 100).toFixed(0)}% — pre-caching too early, tightening window`));
        }

      } else if (overallRecall < RECALL_LOW_THRESHOLD && r1Precision >= PRECISION_LOW_THRESHOLD) {
        // Recall low, precision OK → loosen (increase distance)
        const next = Math.min(BOUNDS.rule1.checkpointDistanceKm.max, current + NUDGE_DISTANCE_KM);
        if (next !== current) {
          this.rulesEngine.updateConfig({ rule1: { checkpointDistanceKm: next } });
          adjustments.push(this._adj('Rule 1', 'checkpointDistanceKm', current, next,
            `Recall ${(overallRecall * 100).toFixed(0)}% — missing queries, expanding window`));
        }

      } else if (overallRecall < RECALL_LOW_THRESHOLD && r1Precision < PRECISION_LOW_THRESHOLD) {
        // Both low — recall takes priority, loosen
        const next = Math.min(BOUNDS.rule1.checkpointDistanceKm.max, current + NUDGE_DISTANCE_KM);
        if (next !== current) {
          this.rulesEngine.updateConfig({ rule1: { checkpointDistanceKm: next } });
          adjustments.push(this._adj('Rule 1', 'checkpointDistanceKm', current, next,
            `Both precision and recall low — recall priority, expanding window`));
        }
      }

    } else if (overallRecall < RECALL_LOW_THRESHOLD) {
      // Rule 1 didn't fire at all — if recall is low, widen it (explore)
      // An idle rule may be too tight to catch any assets; expanding lets it contribute.
      const current = this.rulesEngine.config.rule1.checkpointDistanceKm;
      const next = Math.min(BOUNDS.rule1.checkpointDistanceKm.max, current + NUDGE_DISTANCE_KM);
      if (next !== current) {
        this.rulesEngine.updateConfig({ rule1: { checkpointDistanceKm: next } });
        adjustments.push(this._adj('Rule 1', 'checkpointDistanceKm', current, next,
          `Recall ${(overallRecall * 100).toFixed(0)}% — Rule 1 idle, expanding checkpoint window`));
      }
    }

    // Rule 2 — access count threshold
    const r2Precision = rulePrecision['Rule 2'];
    if (r2Precision != null) {
      const current = this.rulesEngine.config.rule2.accessCountThreshold;

      if (r2Precision < PRECISION_LOW_THRESHOLD && overallRecall >= RECALL_LOW_THRESHOLD) {
        const next = Math.min(BOUNDS.rule2.accessCountThreshold.max, current + NUDGE_ACCESS_COUNT);
        if (next !== current) {
          this.rulesEngine.updateConfig({ rule2: { accessCountThreshold: next } });
          adjustments.push(this._adj('Rule 2', 'accessCountThreshold', current, next,
            `Precision ${(r2Precision * 100).toFixed(0)}% — threshold too low, raising access count`));
        }

      } else if (overallRecall < RECALL_LOW_THRESHOLD) {
        const next = Math.max(BOUNDS.rule2.accessCountThreshold.min, current - NUDGE_ACCESS_COUNT);
        if (next !== current) {
          this.rulesEngine.updateConfig({ rule2: { accessCountThreshold: next } });
          adjustments.push(this._adj('Rule 2', 'accessCountThreshold', current, next,
            `Recall ${(overallRecall * 100).toFixed(0)}% — lowering access threshold to catch more`));
        }
      }
    }

    // Rule 3 — value threshold and destination distance
    const r3Precision = rulePrecision['Rule 3'];
    if (r3Precision != null) {
      const currentValue = this.rulesEngine.config.rule3.valueThresholdUsd;
      const currentDist  = this.rulesEngine.config.rule3.destDistanceKm;

      if (r3Precision < PRECISION_LOW_THRESHOLD && overallRecall >= RECALL_LOW_THRESHOLD) {
        // Tighten — raise value threshold (cache fewer, higher-value assets)
        const next = Math.min(BOUNDS.rule3.valueThresholdUsd.max, currentValue + NUDGE_VALUE_USD);
        if (next !== currentValue) {
          this.rulesEngine.updateConfig({ rule3: { valueThresholdUsd: next } });
          adjustments.push(this._adj('Rule 3', 'valueThresholdUsd', currentValue, next,
            `Precision ${(r3Precision * 100).toFixed(0)}% — too many low-value caches, raising threshold`));
        }

      } else if (overallRecall < RECALL_LOW_THRESHOLD) {
        // Loosen — expand destination distance window
        const next = Math.min(BOUNDS.rule3.destDistanceKm.max, currentDist + NUDGE_DEST_DISTANCE_KM);
        if (next !== currentDist) {
          this.rulesEngine.updateConfig({ rule3: { destDistanceKm: next } });
          adjustments.push(this._adj('Rule 3', 'destDistanceKm', currentDist, next,
            `Recall ${(overallRecall * 100).toFixed(0)}% — expanding last-mile window`));
        }
      }

    } else if (overallRecall < RECALL_LOW_THRESHOLD) {
      // Rule 3 didn't fire at all — if recall is low, widen destination window (explore)
      const currentDist = this.rulesEngine.config.rule3.destDistanceKm;
      const next = Math.min(BOUNDS.rule3.destDistanceKm.max, currentDist + NUDGE_DEST_DISTANCE_KM);
      if (next !== currentDist) {
        this.rulesEngine.updateConfig({ rule3: { destDistanceKm: next } });
        adjustments.push(this._adj('Rule 3', 'destDistanceKm', currentDist, next,
          `Recall ${(overallRecall * 100).toFixed(0)}% — Rule 3 idle, expanding last-mile window`));
      }
    }

    // ── EMA-based TTL adjustment ───────────────────────────────────────────────
    // For each queried asset, compare current round frequency to EMA.
    // Spike → extend TTL in Redis. Cooling → reduce TTL.
    const ttlAdjustments = [];

    for (const [assetId, info] of Object.entries(queried)) {
      const ema = this.frequencyEMA[assetId] || 1;
      const current = info.count;

      // Only adjust TTL for assets that are currently in cache
      const cacheKey = `asset:${assetId}`;
      const cached = await this.smartCache.get(cacheKey);
      if (!cached) continue;

      const originalTTL = cached.ttl || 300;

      if (current > SPIKE_MULTIPLIER * ema) {
        // Spike detected — extend TTL
        const newTTL = Math.min(
          TTL_SPIKE_MAX_SECONDS,
          Math.round(originalTTL * TTL_SPIKE_MULTIPLIER)
        );
        if (newTTL > originalTTL) {
          await this.smartCache.cacheWithContext(cacheKey, cached.data, {
            preCached: cached.preCached,
            ttl: newTTL,
            triggeredRule: cached.triggeredRule,
            ruleName: cached.ruleName,
            reason: `[Adaptive] TTL extended ${originalTTL}s→${newTTL}s — access spike (${current} queries vs EMA ${ema.toFixed(1)})`,
            priority: 'HIGH'
          });
          ttlAdjustments.push({
            assetId,
            from: originalTTL,
            to: newTTL,
            signal: 'spike',
            detail: `${current} queries vs EMA ${ema.toFixed(1)}`
          });
        }

      } else if (current < COOLING_MULTIPLIER * ema && ema > 2) {
        // Cooling detected — shrink TTL
        const newTTL = Math.max(
          TTL_COOLING_MIN_SECONDS,
          Math.round(originalTTL * TTL_COOLING_MULTIPLIER)
        );
        if (newTTL < originalTTL) {
          await this.smartCache.cacheWithContext(cacheKey, cached.data, {
            preCached: cached.preCached,
            ttl: newTTL,
            triggeredRule: cached.triggeredRule,
            ruleName: cached.ruleName,
            reason: `[Adaptive] TTL reduced ${originalTTL}s→${newTTL}s — cooling (${current} queries vs EMA ${ema.toFixed(1)})`,
            priority: cached.priority || 'MEDIUM'
          });
          ttlAdjustments.push({
            assetId,
            from: originalTTL,
            to: newTTL,
            signal: 'cooling',
            detail: `${current} queries vs EMA ${ema.toFixed(1)}`
          });
        }
      }
    }

    // ── Build round summary ───────────────────────────────────────────────────
    const summary = {
      round:            this.roundNumber,
      timestamp:        Date.now(),
      totalPreCached:   Object.keys(preCached).length,
      totalQueried:     totalQueried,
      coveredByCache:   coveredByCache,
      wastedPreCaches:  Object.values(preCached).filter(p => !p.queried).length,
      hitRate:          totalQueried > 0
                          ? parseFloat((coveredByCache / totalQueried).toFixed(3))
                          : 0,
      recall:           overallRecall,
      rulePrecision,
      thresholdAdjustments: adjustments,
      ttlAdjustments,
      currentThresholds: {
        rule1_checkpointDistanceKm: this.rulesEngine.config.rule1.checkpointDistanceKm,
        rule2_accessCountThreshold: this.rulesEngine.config.rule2.accessCountThreshold,
        rule3_valueThresholdUsd:    this.rulesEngine.config.rule3.valueThresholdUsd,
        rule3_destDistanceKm:       this.rulesEngine.config.rule3.destDistanceKm
      },
      frequencyEMA: { ...this.frequencyEMA }
    };

    this.history.push(summary);
    return summary;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ACCESSORS
  // ───────────────────────────────────────────────────────────────────────────

  getHistory() {
    return this.history;
  }

  getCurrentThresholds() {
    return {
      rule1_checkpointDistanceKm: this.rulesEngine.config.rule1.checkpointDistanceKm,
      rule2_accessCountThreshold: this.rulesEngine.config.rule2.accessCountThreshold,
      rule3_valueThresholdUsd:    this.rulesEngine.config.rule3.valueThresholdUsd,
      rule3_destDistanceKm:       this.rulesEngine.config.rule3.destDistanceKm
    };
  }

  getFrequencyEMA() {
    return { ...this.frequencyEMA };
  }

  reset() {
    this.frequencyEMA = {};
    this._round       = this._emptyRound();
    this.history      = [];
    this.roundNumber  = 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  _emptyRound() {
    return {
      preCached:  {}, // { assetId: { rule, ttl, cachedAt, queried } }
      queried:    {}, // { assetId: { count, firstAt, lastAt } }
      startedAt:  null
    };
  }

  _adj(rule, param, from, to, reason) {
    return {
      rule,
      param,
      from,
      to,
      direction: to > from ? 'increased' : 'decreased',
      reason,
      timestamp: Date.now()
    };
  }
}

module.exports = AdaptiveTuner;
