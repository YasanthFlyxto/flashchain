// middleware/cache.js - Policy-Based Pre-Caching System
//
// Pre-caching policy design is grounded in supply chain operations research.
// Key references:
//   [W22]  Wang, G. et al. (2022) "Smart contract-based caching and data transaction optimization
//          in mobile edge computing." Knowledge-Based Systems, 252, p.109344.
//          → Establishes that context-aware selective caching outperforms indiscriminate caching
//            in distributed ledger environments; motivates the policy engine approach.
//   [B24]  Bozkaya-Aras, E. (2024) "Blockchain-Based Secure Content Caching and Computation
//          for Edge Computing." IEEE Access, 12, pp.47619–47629.
//          → Demonstrates resource efficiency of selective pre-caching over naive caching
//            for blockchain edge nodes; underpins Rule 4 (mid-journey exclusion).
//   [A21]  Agrawal, T.K. et al. (2021) "Blockchain-based framework for supply chain traceability."
//          Computers & Industrial Engineering, 154, p.107130.
//          → Documents multi-stakeholder concurrent access patterns during dispute and audit
//            phases; directly motivates Rule 2 and Rule 3 threshold selection.
//   [G23]  Gruchmann, T., Elgazzar, S. and Ali, A.H. (2023) "Blockchain technology in
//          pharmaceutical supply chains: a transaction cost perspective."
//          Modern Supply Chain Research and Applications, 5(2), pp.115–133.
//          → Identifies documentation pre-availability as a transaction cost driver in
//            pharmaceutical supply chains; motivates the Pharmaceutical preset wider windows.
//   [C21]  Casino, F. et al. (2021) "Blockchain-based food supply chain traceability: a case
//          study in the dairy sector." International Journal of Production Research,
//          59(19), pp.5758–5770.
//          → Shows perishable-goods chains require tighter time-critical documentation windows
//            than general logistics; motivates the Food & Beverage preset shorter TTLs.
//   [T23]  Tang, W. et al. (2023) "Strategic Latency Reduction in Blockchain Peer-to-Peer
//          Networks." Proc. ACM Meas. Anal. Comput. Syst., 7(2), pp.1–33.
//          → Quantifies blockchain query latency; establishes that pre-fetching before
//            predictable high-demand windows is the primary strategy for latency reduction.
//   [J25]  Javed, F. & Mangues-Bafalluy, J. (2025) "An Empirical Smart Contracts Latency
//          Analysis on Ethereum Blockchain." arXiv:2503.01397.
//          → Confirms that smart contract read latency under concurrent multi-org load is
//            the dominant bottleneck; reinforces the case for pre-caching before demand peaks.

const redis = require('redis');

// ========================================
// DEFAULT RULE CONFIGURATION
// ========================================
//
// Default thresholds represent a balanced General Logistics profile.
// Each parameter is independently configurable by supply chain managers
// to reflect their industry, geography, and compliance requirements [W22][A21].
//
// Rule 1 - Checkpoint Proximity (20 km / 60 min)
//   The WCO SAFE Framework (2005, rev. 2021) and the EU Import Control System (ICS2)
//   mandate advance electronic cargo declarations before vessel/vehicle arrival at
//   the border. At typical road freight speeds (~80 km/h), a 20 km window provides
//   ~15 minutes of lead time - sufficient for a Redis pre-cache write to complete and
//   be served before the customs query arrives [T23][J25].
//
// Rule 2 - Multi-Stakeholder Access (>3 accesses, ≥2 orgs, 1-hour window)
//   Agrawal et al. (2021) [A21] identify that simultaneous cross-organisation access
//   to the same blockchain record is a reliable indicator of an active dispute,
//   compliance audit, or regulatory investigation. The 3-access / 2-org threshold
//   filters out routine single-party queries and targets only coordinated multi-party
//   patterns, consistent with the Hyperledger Fabric multi-MSP query model [S20].
//   [S20] Shalaby, S. et al. (2020) "Performance Evaluation of Hyperledger Fabric."
//         IEEE ICIoT, Doha, pp.608–613.
//
// Rule 3 - High-Value Near Destination ($50 k / 50 km)
//   TAPA Freight Security Requirements (FSR 2020) classify the last-mile delivery zone
//   as the highest-risk segment for cargo theft and documentation disputes. At $50 k+
//   appraised value, delivery inspection involves customs valuation, insurance sign-off,
//   and receiver verification - all of which trigger concurrent blockchain reads [A21].
//   The 50 km threshold covers typical metropolitan last-mile delivery zones.
//
// Rule 4 - Mid-Journey Exclusion (>200 km from checkpoint AND destination, ≤3 accesses)
//   Wang et al. (2022) [W22] demonstrate that indiscriminate pre-caching wastes edge
//   compute and memory resources without latency benefit when assets are far from
//   predictable access events. Bozkaya-Aras (2024) [B24] confirms that selective
//   caching policies reduce cache pollution by up to 40% versus naive pre-fetch.
//   This rule is an explicit negative policy - it prevents wasting Redis capacity on
//   shipments that are mid-transit with no imminent checkpoint or delivery event.

const DEFAULT_CONFIG = {
  rule1: {
    enabled: true,
    checkpointDistanceKm: 20,  // km - WCO SAFE Framework advance-filing lead time [T23]
    etaMinutes: 60,             // min - covers query arrival before customs scan window [J25]
    ttlMinutes: 30              // min - covers the checkpoint crossing duration
  },
  rule2: {
    enabled: true,
    accessCountThreshold: 3,   // accesses - filters routine queries; targets dispute patterns [A21]
    minOrganizations: 2,       // orgs - requires cross-MSP access to confirm multi-party event [S20]
    windowHours: 1,            // h - aligns with typical dispute investigation burst window [A21]
    ttlHours: 24               // h - dispute investigations typically resolve within 24h
  },
  rule3: {
    enabled: true,
    valueThresholdUsd: 50000,  // USD - TAPA FSR 2020 high-value cargo classification boundary
    destDistanceKm: 50,        // km - metropolitan last-mile delivery zone radius [A21]
    ttlMinutes: 45             // min - covers delivery inspection and sign-off window
  },
  rule4: {
    enabled: true,
    minCheckpointDistanceKm: 200, // km - below this = approaching; exclusion applies above [W22][B24]
    minDestDistanceKm: 200,       // km - below this = near delivery; exclusion applies above [W22]
    maxNormalAccesses: 3          // accesses/h - above this triggers Rule 2 instead [A21]
  }
};

// ========================================
// SMART CACHE
// ========================================

class SmartCache {
  constructor() {
    this.client = null;
    this.stats = {
      hits: 0,
      misses: 0,
      preCachedWrites: 0
    };
  }

  async getAllAssetKeys() {
    try {
      return await this.client.keys('asset:*');
    } catch (error) {
      console.error('[Redis] Error getting keys:', error.message);
      return [];
    }
  }

  async connect() {
    if (this.client) return;

    this.client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => console.error('[Redis] Connection error:', err));
    this.client.on('connect', () => console.log('[Redis] Connected successfully'));

    await this.client.connect();
  }

  /**
   * Cache an asset with TTL and metadata
   * @param {string} key
   * @param {object} data
   * @param {object} context - { preCached, ttl, triggeredRule, ruleName, reason, priority }
   */
  async cacheWithContext(key, data, context = {}) {
    if (!this.client) {
      throw new Error('[SmartCache] Redis client not connected');
    }

    const { preCached = false, ttl, triggeredRule, ruleName, reason, priority } = context;

    if (!ttl || ttl <= 0) {
      console.warn('[SmartCache] Invalid TTL, skipping cache write for key:', key);
      return;
    }

    const entry = {
      data,
      cachedAt: Date.now(),
      preCached,
      ttl,
      triggeredRule,
      ruleName,
      reason,
      priority
    };

    await this.client.setEx(key, ttl, JSON.stringify(entry));

    if (preCached) {
      this.stats.preCachedWrites++;
      console.log(`[SmartCache] Pre-cached: ${key} (TTL: ${ttl}s)`);
    }
  }

  async get(key) {
    if (!this.client) {
      throw new Error('[SmartCache] Redis client not connected');
    }

    const raw = await this.client.get(key);

    if (!raw) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return JSON.parse(raw);
  }

  async invalidate(key) {
    if (!this.client) return;
    await this.client.del(key);
    console.log(`[SmartCache] Invalidated: ${key}`);
  }

  async flushAll() {
    if (!this.client) return;
    await this.client.flushAll();
    console.log('[SmartCache] All cache cleared');
  }

  getStats() {
    return this.stats;
  }

  resetStats() {
    this.stats = { hits: 0, misses: 0, preCachedWrites: 0 };
    console.log('[SmartCache] Statistics reset');
  }

  getClient() {
    return this.client;
  }
}

// ========================================
// PRE-CACHING RULES ENGINE (CONFIGURABLE)
// ========================================

/**
 * Policy-based pre-caching engine.
 *
 * Design rationale: Wang et al. (2022) [W22] establish that context-aware caching in
 * distributed ledger systems must be driven by operational state rather than recency
 * alone. This engine evaluates four rules derived from real supply chain event patterns
 * documented in the literature. All thresholds are fully configurable at runtime,
 * enabling supply chain managers to adapt policies to their industry without code changes.
 *
 * The three positive rules (1–3) each target a distinct, research-evidenced event type
 * where blockchain read demand is predictably high and latency is operationally critical.
 * Rule 4 is an explicit negative guard that prevents cache pollution for assets with
 * no imminent high-demand event, consistent with selective-caching efficiency findings
 * in Bozkaya-Aras (2024) [B24] and Wang et al. (2022) [W22].
 *
 * Rule 1: Checkpoint Proximity      - WCO SAFE Framework advance-filing requirement [T23][J25]
 * Rule 2: Multi-Stakeholder Access  - Dispute/audit access pattern documented in [A21][S20]
 * Rule 3: High-Value Near Dest      - Last-mile high-risk zone per TAPA FSR 2020 [A21]
 * Rule 4: Mid-Journey Exclusion     - Selective caching efficiency guard [W22][B24]
 *
 * Industry presets (General Logistics, Pharmaceutical, Food & Beverage) adjust thresholds
 * based on sector-specific compliance frameworks: EU GDP guidelines for pharma [G23],
 * EU Food Regulation 178/2002 and Casino et al. (2021) for food chains [C21].
 */
class PreCachingRulesEngine {
  constructor(config = {}) {
    this.config = {
      rule1: { ...DEFAULT_CONFIG.rule1, ...config.rule1 },
      rule2: { ...DEFAULT_CONFIG.rule2, ...config.rule2 },
      rule3: { ...DEFAULT_CONFIG.rule3, ...config.rule3 },
      rule4: { ...DEFAULT_CONFIG.rule4, ...config.rule4 }
    };
  }

  /**
   * Update one or more rule configurations at runtime.
   * Supply chain managers call this via the API to tune policies.
   */
  updateConfig(newConfig) {
    if (newConfig.rule1) this.config.rule1 = { ...this.config.rule1, ...newConfig.rule1 };
    if (newConfig.rule2) this.config.rule2 = { ...this.config.rule2, ...newConfig.rule2 };
    if (newConfig.rule3) this.config.rule3 = { ...this.config.rule3, ...newConfig.rule3 };
    if (newConfig.rule4) this.config.rule4 = { ...this.config.rule4, ...newConfig.rule4 };
    console.log('[RulesEngine] Configuration updated');
  }

  /**
   * Reset all rule parameters to the default values.
   */
  resetConfig() {
    this.config = {
      rule1: { ...DEFAULT_CONFIG.rule1 },
      rule2: { ...DEFAULT_CONFIG.rule2 },
      rule3: { ...DEFAULT_CONFIG.rule3 },
      rule4: { ...DEFAULT_CONFIG.rule4 }
    };
    console.log('[RulesEngine] Configuration reset to defaults');
  }

  /**
   * Return the current configuration (for API exposure).
   */
  getConfig() {
    return this.config;
  }

  /**
   * Evaluate all pre-caching rules for an asset.
   * @param {object} asset - Enriched asset (must include CheckpointDistance, DestinationDistance,
   *                         CheckpointRequiresDocs, Status, AppraisedValue, ETA)
   * @param {array}  accessLog - [{ stakeholder, timestamp }] entries
   * @returns {object} { shouldPreCache, triggeredRule, ruleName, ttl, reason, policyTag, priority }
   */
  evaluatePreCachingRules(asset, accessLog = []) {
    const now = Date.now();
    const { rule1, rule2, rule3, rule4 } = this.config;

    const checkpointDistance = asset.CheckpointDistance ?? 9999;
    const destDistance = asset.DestinationDistance ?? 9999;
    const value = parseInt(asset.AppraisedValue || '0', 10);
    const status = (asset.Status || '').toLowerCase();
    const owner = (asset.Owner || '').toLowerCase();

    const isInTransit = status.includes('transit') || owner.includes('transit');

    let etaMinutes = 9999;
    if (asset.ETA) {
      const etaTime = new Date(asset.ETA).getTime();
      etaMinutes = Math.max(0, (etaTime - now) / 60000);
    }

    // Access pattern analysis within the configured time window
    const windowMs = rule2.windowHours * 60 * 60 * 1000;
    const recentAccesses = accessLog.filter(log => log.timestamp >= now - windowMs);
    const recentCount = recentAccesses.length;
    const uniqueOrgs = new Set(recentAccesses.map(log => log.stakeholder));
    const uniqueOrgCount = uniqueOrgs.size;

    // ----------------------------------------
    // RULE 4: MID-JOURNEY EXCLUSION
    // Evaluated first - explicit negative policy
    //
    // Wang et al. (2022) [W22] show that pre-caching assets far from any predictable
    // high-demand event inflates cache size without reducing user-facing latency.
    // Bozkaya-Aras (2024) [B24] reports selective caching reduces cache pollution by
    // up to 40% vs naive pre-fetch strategies. This rule prevents that waste.
    // ----------------------------------------
    if (rule4.enabled) {
      const isFarFromCheckpoint = checkpointDistance > rule4.minCheckpointDistanceKm;
      const isFarFromDestination = destDistance > rule4.minDestDistanceKm;
      const normalAccessPattern = recentCount <= rule4.maxNormalAccesses;

      if (isInTransit && isFarFromCheckpoint && isFarFromDestination && normalAccessPattern) {
        return {
          shouldPreCache: false,
          triggeredRule: 'Rule 4',
          ruleName: 'Mid-Journey Exclusion',
          ttl: 0,
          reason: `Mid-journey shipment - checkpoint ${checkpointDistance}km away (threshold: >${rule4.minCheckpointDistanceKm}km), destination ${destDistance}km away (threshold: >${rule4.minDestDistanceKm}km), only ${recentCount} accesses/hour (threshold: ≤${rule4.maxNormalAccesses}). Pre-caching would waste resources.`,
          policyTag: 'IN_TRANSIT',
          priority: 'N/A'
        };
      }
    }

    // ----------------------------------------
    // RULE 1: CHECKPOINT PROXIMITY
    // Uses CheckpointRequiresDocs from asset enrichment layer
    //
    // The WCO SAFE Framework (2005, rev. 2021) and EU ICS2 mandate advance electronic
    // cargo declarations before border/checkpoint arrival. Tang et al. (2023) [T23]
    // identify pre-fetching before predictable high-demand windows as the primary
    // blockchain latency reduction strategy. Javed & Mangues-Bafalluy (2025) [J25]
    // confirm smart contract read latency under concurrent multi-org load can exceed
    // 2 seconds - pre-caching before the checkpoint query arrives eliminates this delay.
    // ----------------------------------------
    if (rule1.enabled) {
      const checkpointRequiresDocs = asset.CheckpointRequiresDocs === true;

      if (isInTransit && checkpointDistance < rule1.checkpointDistanceKm && etaMinutes < rule1.etaMinutes && checkpointRequiresDocs) {
        return {
          shouldPreCache: true,
          triggeredRule: 'Rule 1',
          ruleName: 'Checkpoint Proximity',
          ttl: rule1.ttlMinutes * 60,
          reason: `Shipment ${checkpointDistance}km from checkpoint (threshold: <${rule1.checkpointDistanceKm}km), ETA ${Math.round(etaMinutes)} min (threshold: <${rule1.etaMinutes}min). Documents pre-cached before customs query arrives.`,
          policyTag: 'IN_TRANSIT',
          priority: checkpointDistance < rule1.checkpointDistanceKm / 2 ? 'HIGH' : 'MEDIUM'
        };
      }
    }

    // ----------------------------------------
    // RULE 2: MULTI-STAKEHOLDER ACCESS
    //
    // Agrawal et al. (2021) [A21] document that simultaneous cross-organisation access
    // to the same blockchain traceability record is a reliable indicator of an active
    // dispute, compliance audit, or regulatory investigation - events that generate
    // burst blockchain query load. Shalaby et al. (2020) [S20] show that repeated
    // multi-MSP queries create measurable throughput degradation on Hyperledger Fabric.
    // Pre-caching for the duration of the investigation window (24h default) absorbs
    // this burst load and keeps all parties' queries sub-millisecond.
    // ----------------------------------------
    if (rule2.enabled && recentCount > rule2.accessCountThreshold && uniqueOrgCount >= rule2.minOrganizations) {
      return {
        shouldPreCache: true,
        triggeredRule: 'Rule 2',
        ruleName: 'Multi-Stakeholder Access',
        ttl: rule2.ttlHours * 60 * 60,
        reason: `${recentCount} accesses (threshold: >${rule2.accessCountThreshold}) from ${uniqueOrgCount} organizations (threshold: ≥${rule2.minOrganizations}) in last ${rule2.windowHours}h. High-frequency cross-org pattern indicates active investigation or dispute.`,
        policyTag: 'DISPUTED',
        priority: 'HIGH'
      };
    }

    // ----------------------------------------
    // RULE 3: HIGH-VALUE NEAR DESTINATION
    //
    // TAPA Freight Security Requirements (FSR 2020) classify the last-mile delivery
    // zone as the highest-risk segment for cargo theft and documentation disputes.
    // Agrawal et al. (2021) [A21] observe that high-value shipment delivery triggers
    // simultaneous queries from customs valuation, insurance, and receiving parties.
    // Pre-caching when the shipment enters the last-mile zone ensures all parties
    // receive instant responses during the delivery inspection window.
    // ----------------------------------------
    if (rule3.enabled && value > rule3.valueThresholdUsd && destDistance < rule3.destDistanceKm) {
      return {
        shouldPreCache: true,
        triggeredRule: 'Rule 3',
        ruleName: 'High-Value Near Destination',
        ttl: rule3.ttlMinutes * 60,
        reason: `$${value.toLocaleString()} shipment (threshold: >$${rule3.valueThresholdUsd.toLocaleString()}) is ${destDistance}km from destination (threshold: <${rule3.destDistanceKm}km). Pre-cached for delivery inspection readiness.`,
        policyTag: 'IN_TRANSIT',
        priority: 'HIGH'
      };
    }

    // No rule matched
    return {
      shouldPreCache: false,
      triggeredRule: null,
      ruleName: null,
      ttl: 0,
      reason: 'No pre-caching policy conditions met.',
      policyTag: null,
      priority: 'N/A'
    };
  }
}

// Export singleton instance
const smartCache = new SmartCache();

module.exports = smartCache;
module.exports.PreCachingRulesEngine = PreCachingRulesEngine;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
