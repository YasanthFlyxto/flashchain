// middleware/cache.js - Simple Policy-Based Pre-Caching

const redis = require('redis');

class SmartCache {
  constructor() {
    this.client = null;
    this.stats = {
      hits: 0,
      misses: 0,
      preCachedWrites: 0
    };
  }

  // ✅ Get all asset keys from Redis
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
   * @param {string} key - Cache key (e.g., 'asset:PROD-123')
   * @param {object} data - Asset data to cache
   * @param {object} context - { preCached: boolean, ttl: number (seconds), triggeredRule, ruleName, reason, priority }
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

    // Store entry with metadata
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

  /**
   * Get cached asset
   * @param {string} key - Cache key
   * @returns {object|null} Cached entry or null
   */
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

  // ✅ Expose the redis client for direct access
  getClient() {
    return this.client;
  }
}

/**
 * Pre-Caching Rules Engine
 * Implements the 4 rules from FYP architecture diagram:
 *  - Rule 1: Checkpoint Proximity
 *  - Rule 2: Access Pattern Detection (multi-stakeholder)
 *  - Rule 3: High-Value Shipment Near Destination
 *  - Rule 4: Counter-example (DO NOT pre-cache)
 */
class PreCachingRulesEngine {
  constructor() {
    this.ruleDefinitions = [
      {
        id: 'Rule 1',
        name: 'Checkpoint Proximity',
        description: 'Pre-cache shipments approaching checkpoints within 20km and ETA < 1 hour'
      },
      {
        id: 'Rule 2',
        name: 'Access Pattern Detection',
        description: 'Pre-cache shipments accessed by multiple organizations (>3 accesses/hour)'
      },
      {
        id: 'Rule 3',
        name: 'High-Value Near Destination',
        description: 'Pre-cache high-value shipments (>$50k) within 50km of destination'
      },
      {
        id: 'Rule 4',
        name: 'Counter-example (DO NOT Pre-cache)',
        description: 'Explicitly skip pre-caching for mid-journey, normal-access shipments'
      }
    ];
  }

  /**
   * Evaluate all pre-caching rules for an asset
   * @param {object} asset - Enriched asset with CheckpointDistance, DestinationDistance, Status, etc.
   * @param {array} accessLog - Array of { stakeholder, timestamp } entries
   * @returns {object} { shouldPreCache, triggeredRule, ruleName, ttl, reason, policyTag }
   */
  evaluatePreCachingRules(asset, accessLog = []) {
    const now = Date.now();

    // Extract asset properties
    const checkpointDistance = asset.CheckpointDistance ?? 9999;
    const destDistance = asset.DestinationDistance ?? 9999;
    const value = parseInt(asset.AppraisedValue || '0', 10);
    const status = (asset.Status || '').toLowerCase();
    const owner = (asset.Owner || '').toLowerCase();

    // Determine if in transit
    const isInTransit = status.includes('transit') || owner.includes('transit');

    // ETA calculation (if provided)
    let etaMinutes = 9999;
    if (asset.ETA) {
      const etaTime = new Date(asset.ETA).getTime();
      etaMinutes = Math.max(0, (etaTime - now) / 60000);
    }

    // Access pattern analysis (last 1 hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentAccesses = accessLog.filter(log => log.timestamp >= oneHourAgo);
    const recentCount = recentAccesses.length;
    const uniqueOrgs = new Set(recentAccesses.map(log => log.stakeholder));
    const uniqueOrgCount = uniqueOrgs.size;

    // ------------------------
    // RULE 4: DO NOT PRE-CACHE (evaluated first as negative rule)
    // ------------------------
    // Condition: middle of long journey, far from checkpoints, normal access pattern
    const isFarFromCheckpoint = checkpointDistance > 200;
    const isFarFromDestination = destDistance > 200;
    const normalAccessPattern = recentCount <= 3;

    if (isInTransit && isFarFromCheckpoint && isFarFromDestination && normalAccessPattern) {
      return {
        shouldPreCache: false,
        triggeredRule: 'Rule 4',
        ruleName: "DO NOT Pre-cache (Counter-example)",
        ttl: 0,
        reason: `Mid-journey (checkpoint: ${checkpointDistance}km, dest: ${destDistance}km), normal access (${recentCount} requests/hour). Pre-caching would waste bandwidth.`,
        policyTag: 'IN_TRANSIT',
        priority: 'N/A'
      };
    }

    // ------------------------
    // RULE 1: CHECKPOINT PROXIMITY
    // ------------------------
    // Condition: distance < 20km AND ETA < 1 hour AND checkpoint requires docs
    const checkpointRequiresDocs =
      owner.includes('customs') ||
      owner.includes('checkpoint') ||
      owner.includes('approaching');

    if (isInTransit && checkpointDistance < 20 && etaMinutes < 60 && checkpointRequiresDocs) {
      return {
        shouldPreCache: true,
        triggeredRule: 'Rule 1',
        ruleName: 'Checkpoint Proximity',
        ttl: 30 * 60, // 30 minutes
        reason: `Shipment approaching checkpoint (${checkpointDistance}km away, ETA ${Math.round(etaMinutes)} min). Customs officer will need documents soon.`,
        policyTag: 'IN_TRANSIT',
        priority: checkpointDistance < 10 ? 'HIGH' : 'MEDIUM'
      };
    }

    // ------------------------
    // RULE 2: ACCESS PATTERN DETECTION
    // ------------------------
    // Condition: >3 accesses in last hour AND accessed by multiple organizations
    if (recentCount > 3 && uniqueOrgCount >= 2) {
      return {
        shouldPreCache: true,
        triggeredRule: 'Rule 2',
        ruleName: 'Access Pattern Detection',
        ttl: 24 * 60 * 60, // 24 hours (dispute scenario)
        reason: `Unusual access pattern (${recentCount} requests from ${uniqueOrgCount} organizations in last hour). Likely dispute or investigation forming.`,
        policyTag: 'DISPUTED',
        priority: 'HIGH'
      };
    }

    // ------------------------
    // RULE 3: HIGH-VALUE NEAR DESTINATION
    // ------------------------
    // Condition: value > $50,000 AND distance to destination < 50km
    if (value > 50000 && destDistance < 50) {
      return {
        shouldPreCache: true,
        triggeredRule: 'Rule 3',
        ruleName: 'High-Value Near Destination',
        ttl: 45 * 60, // 45 minutes
        reason: `High-value shipment ($${value.toLocaleString()}) within ${destDistance}km of destination. Pre-cache inspection documents for delivery.`,
        policyTag: 'IN_TRANSIT',
        priority: 'HIGH'
      };
    }

    // ------------------------
    // NO RULE MATCHED
    // ------------------------
    return {
      shouldPreCache: false,
      triggeredRule: null,
      ruleName: null,
      ttl: 0,
      reason: 'No pre-caching rule conditions met.',
      policyTag: null,
      priority: 'N/A'
    };
  }

  /**
   * Get rule definitions for UI display
   */
  getRules() {
    return this.ruleDefinitions;
  }
}

// Export singleton instance
const smartCache = new SmartCache();

module.exports = smartCache;
module.exports.PreCachingRulesEngine = PreCachingRulesEngine;
