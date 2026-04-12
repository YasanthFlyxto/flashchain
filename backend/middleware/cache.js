// middleware/cache.js - Policy-Based Pre-Caching System

const redis = require('redis');

// ========================================
// DEFAULT RULE CONFIGURATION
// ========================================

const DEFAULT_CONFIG = {
  rule1: {
    enabled: true,
    checkpointDistanceKm: 20,
    etaMinutes: 60,
    ttlMinutes: 30
  },
  rule2: {
    enabled: true,
    accessCountThreshold: 3,
    minOrganizations: 2,
    windowHours: 1,
    ttlHours: 24
  },
  rule3: {
    enabled: true,
    valueThresholdUsd: 50000,
    destDistanceKm: 50,
    ttlMinutes: 45
  },
  rule4: {
    enabled: true,
    minCheckpointDistanceKm: 200,
    minDestDistanceKm: 200,
    maxNormalAccesses: 3
  }
};

// ========================================
// DEFAULT POLICIES
// (user-configurable JSON policy engine)
// ========================================

const DEFAULT_POLICIES = [
  {
    id: 'policy_mid_journey_exclusion',
    name: 'Mid-Journey Exclusion',
    enabled: true,
    type: 'exclusion',
    conditions: [
      { field: 'status',                   operator: 'equals',      value: 'In-Transit' },
      { field: 'distanceToCheckpointKm',   operator: 'greaterThan', value: 200 },
      { field: 'distanceToDestinationKm',  operator: 'greaterThan', value: 200 },
      { field: 'accessCount',              operator: 'lessThanOrEqual', value: 3 },
    ],
    logic: 'AND',
    ttlMinutes: 0,
    priority: 'LOW',
  },
  {
    id: 'policy_checkpoint_proximity',
    name: 'Checkpoint Proximity',
    enabled: true,
    conditions: [
      { field: 'status',                 operator: 'equals',              value: 'In-Transit' },
      { field: 'distanceToCheckpointKm', operator: 'lessThan',            value: 20 },
      { field: 'etaMinutes',             operator: 'lessThan',            value: 60 },
    ],
    logic: 'AND',
    ttlMinutes: 30,
    priority: 'HIGH',
  },
  {
    id: 'policy_multi_stakeholder',
    name: 'Multi-Stakeholder Access',
    enabled: true,
    conditions: [
      { field: 'accessCount', operator: 'greaterThan',        value: 3 },
      { field: 'orgCount',    operator: 'greaterThanOrEqual', value: 2 },
    ],
    logic: 'AND',
    ttlMinutes: 1440,
    priority: 'HIGH',
  },
  {
    id: 'policy_highval_near_dest',
    name: 'High-Value Near Destination',
    enabled: true,
    conditions: [
      { field: 'valueUsd',                operator: 'greaterThan', value: 50000 },
      { field: 'distanceToDestinationKm', operator: 'lessThan',    value: 50 },
    ],
    logic: 'AND',
    ttlMinutes: 45,
    priority: 'HIGH',
  },
];

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
 * Evaluates four rules against an asset's operational context to decide whether
 * it should be pre-cached. All thresholds are fully configurable at runtime,
 * enabling supply chain managers to adapt policies without code changes.
 *
 * Rule 1: Checkpoint Proximity      - Pre-cache assets approaching regulatory checkpoints
 * Rule 2: Multi-Stakeholder Access  - Pre-cache assets under active dispute or audit
 * Rule 3: High-Value Near Dest      - Pre-cache high-value assets in the last-mile zone
 * Rule 4: Mid-Journey Exclusion     - Skip assets far from any high-demand event
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
   *                         CheckpointRequiresDocs, Status, ValueUSD, ETA)
   * @param {array}  accessLog - [{ stakeholder, timestamp }] entries
   * @returns {object} { shouldPreCache, triggeredRule, ruleName, ttl, reason, policyTag, priority }
   */
  evaluatePreCachingRules(asset, accessLog = []) {
    const now = Date.now();
    const { rule1, rule2, rule3, rule4 } = this.config;

    const checkpointDistance = asset.CheckpointDistance ?? 9999;
    const destDistance = asset.DestinationDistance ?? 9999;
    const value = parseInt(asset.ValueUSD || '0', 10);
    const status = (asset.Status || '').toLowerCase();
    const owner = (asset.Custodian || '').toLowerCase();

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
    // Evaluated first - explicit negative policy to prevent cache pollution
    // for assets far from any predictable high-demand event.
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
    // Pre-cache before the checkpoint query arrives to eliminate read latency
    // during advance declaration windows.
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
    // Cross-org burst access indicates an active dispute or audit.
    // Pre-caching absorbs the burst load for the investigation window.
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

// ========================================
// JSON POLICY ENGINE
// ========================================

const FIELD_TYPES = {
  status:                 'string',
  cargoType:              'string',
  custodian:              'string',
  distanceToCheckpointKm: 'number',
  distanceToDestinationKm:'number',
  etaMinutes:             'number',
  valueUsd:               'number',
  weightKg:               'number',
  accessCount:            'number',
  orgCount:               'number',
};

class PolicyEngine {
  constructor(policies) {
    this.policies = (policies || DEFAULT_POLICIES).map(p => ({ ...p }));
  }

  getPolicies() {
    return this.policies;
  }

  addPolicy(policy) {
    this.policies.push({ ...policy });
  }

  updatePolicy(id, updates) {
    const idx = this.policies.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.policies[idx] = { ...this.policies[idx], ...updates };
    return true;
  }

  removePolicy(id) {
    const before = this.policies.length;
    this.policies = this.policies.filter(p => p.id !== id);
    return this.policies.length < before;
  }

  togglePolicy(id, enabled) {
    return this.updatePolicy(id, { enabled });
  }

  resetToDefaults() {
    this.policies = DEFAULT_POLICIES.map(p => ({ ...p }));
  }

  evaluate(asset, accessLog = []) {
    const now = Date.now();
    const ctx = this._buildContext(asset, accessLog, now);

    for (const policy of this.policies) {
      if (!policy.enabled) continue;
      if (this._matches(policy, ctx)) {
        if (policy.type === 'exclusion') {
          return {
            shouldPreCache: false,
            triggeredRule: policy.id,
            ruleName: policy.name,
            ttl: 0,
            reason: this._buildReason(policy, ctx),
            priority: 'N/A',
          };
        }
        return {
          shouldPreCache: true,
          triggeredRule: policy.id,
          ruleName: policy.name,
          ttl: policy.ttlMinutes * 60,
          reason: this._buildReason(policy, ctx),
          priority: policy.priority || 'MEDIUM',
        };
      }
    }

    return {
      shouldPreCache: false,
      triggeredRule: null,
      ruleName: null,
      ttl: 0,
      reason: 'No policy conditions matched.',
      priority: 'N/A',
    };
  }

  _buildContext(asset, accessLog, now) {
    const windowMs = 60 * 60 * 1000;
    const recentAccesses = accessLog.filter(l => l.timestamp >= now - windowMs);
    const uniqueOrgs = new Set(recentAccesses.map(l => l.stakeholder));
    const custodianRaw = (asset.Custodian || '').toLowerCase();
    const statusRaw = (asset.Status || '').toLowerCase();
    let status = 'Delivered';
    if (statusRaw.includes('transit') || custodianRaw.includes('transit')) status = 'In-Transit';
    else if (statusRaw.includes('disputed') || custodianRaw.includes('disputed')) status = 'DISPUTED';

    let etaMinutes = 9999;
    if (asset.ETA) etaMinutes = Math.max(0, (new Date(asset.ETA).getTime() - now) / 60000);
    
    return {
      status,
      cargoType:              asset.CargoType || '',
      custodian:              asset.Custodian || '',
      distanceToCheckpointKm: asset.CheckpointDistance ?? 9999,
      distanceToDestinationKm:asset.DestinationDistance ?? 9999,
      etaMinutes,
      valueUsd:               parseInt(asset.ValueUSD || '0', 10),
      weightKg:               parseInt(asset.WeightKg || '0', 10),
      accessCount:            recentAccesses.length,
      orgCount:               uniqueOrgs.size,
    };
  }

  _matches(policy, ctx) {
    const results = policy.conditions.map(c => this._evalCondition(c, ctx));
    return policy.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }

  _evalCondition({ field, operator, value }, ctx) {
    const actual = ctx[field];
    if (actual === undefined) return false;
    switch (operator) {
      case 'equals':             return String(actual).toLowerCase() === String(value).toLowerCase();
      case 'notEquals':          return String(actual).toLowerCase() !== String(value).toLowerCase();
      case 'contains':           return String(actual).toLowerCase().includes(String(value).toLowerCase());
      case 'lessThan':           return Number(actual) < Number(value);
      case 'lessThanOrEqual':    return Number(actual) <= Number(value);
      case 'greaterThan':        return Number(actual) > Number(value);
      case 'greaterThanOrEqual': return Number(actual) >= Number(value);
      default: return false;
    }
  }

  _buildReason(policy, ctx) {
    const parts = policy.conditions.map(c => `${c.field} ${c.operator} ${c.value} (actual: ${ctx[c.field]})`);
    return `Policy "${policy.name}": ${parts.join(` ${policy.logic} `)}`;
  }
}

// Expose field metadata for the frontend form
PolicyEngine.FIELD_TYPES = FIELD_TYPES;

// Export singleton instance
const smartCache = new SmartCache();

module.exports = smartCache;
module.exports.PreCachingRulesEngine = PreCachingRulesEngine;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
module.exports.PolicyEngine = PolicyEngine;
module.exports.DEFAULT_POLICIES = DEFAULT_POLICIES;
