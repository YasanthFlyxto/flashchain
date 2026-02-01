// middleware/cache.js - COMPLETE SYNCHRONIZED VERSION
const redis = require('redis');
const crypto = require('crypto');

class SmartCache {
  constructor() {
    this.client = null;
    this.mode = 'adaptive';
    this.stats = {};
  }

  async connect() {
    this.client = redis.createClient({
      url: 'redis://localhost:6379'
    });

    this.client.on('error', (err) => console.error('Redis Error:', err));
    this.client.on('connect', () => console.log('✅ Connected to Redis'));

    await this.client.connect();
  }

  setMode(mode) {
    this.mode = mode;
    console.log(`🔄 Cache mode set to: ${mode}`);
  }

  generateHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  calculateAdaptiveTTL(asset, stakeholderType = 'default') {
    if (this.mode === 'simple') {
      return 300; // Fixed 5 minutes for simple mode
    }

    if (this.mode === 'disabled') {
      return 0;
    }

    // Adaptive TTL based on stakeholder needs
    const ownerLower = asset.Owner?.toLowerCase() || '';
    let baseTTL = 600; // 10 minutes default

    // Stakeholder-specific TTL
    if (stakeholderType === 'manufacturer') {
      baseTTL = 1800; // 30 minutes (less frequent updates at origin)
    } else if (stakeholderType === 'distributor') {
      baseTTL = 900; // 15 minutes (moderate updates)
    } else if (stakeholderType === 'retailer') {
      baseTTL = 300; // 5 minutes (frequent updates at delivery)
    }

    // Asset status adjustments
    if (ownerLower.includes('transit') || ownerLower.includes('shipping')) {
      baseTTL = Math.floor(baseTTL * 0.5); // Shorter TTL for in-transit
    } else if (ownerLower.includes('warehouse') || ownerLower.includes('manufacturer')) {
      baseTTL = Math.floor(baseTTL * 1.5); // Longer TTL for static assets
    }

    // High-value assets get shorter TTL (more critical tracking)
    if (asset.AppraisedValue > 50000) {
      baseTTL = Math.floor(baseTTL * 0.8);
    }

    return baseTTL;
  }

  async cacheWithContext(key, data, context = {}) {
    if (this.mode === 'disabled') {
      return;
    }

    const { stakeholderType = 'default', preCached = false, ttl = null } = context;
    
    const dataHash = this.generateHash(data);
    const calculatedTTL = ttl || this.calculateAdaptiveTTL(data, stakeholderType);

    const cacheEntry = {
      data,
      hash: dataHash,
      ttl: calculatedTTL,
      cachedAt: Date.now(),
      stakeholder: stakeholderType,
      preCached: preCached,
      mode: this.mode
    };

    await this.client.setEx(key, calculatedTTL, JSON.stringify(cacheEntry));

    // Track cache hit for pre-cached items
    if (preCached) {
      if (!this.stats[stakeholderType]) {
        this.stats[stakeholderType] = { hits: 0, misses: 0, preCached: 0 };
      }
      this.stats[stakeholderType].preCached = (this.stats[stakeholderType].preCached || 0) + 1;
    }
  }

  async get(key) {
    if (this.mode === 'disabled') {
      return null;
    }

    try {
      const cached = await this.client.get(key);
      if (cached) {
        const entry = JSON.parse(cached);
        
        // Track hit
        const stakeholder = entry.stakeholder || 'default';
        if (!this.stats[stakeholder]) {
          this.stats[stakeholder] = { hits: 0, misses: 0, preCached: 0 };
        }
        this.stats[stakeholder].hits++;

        return entry;
      }
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  trackMiss(stakeholderType = 'default') {
    if (!this.stats[stakeholderType]) {
      this.stats[stakeholderType] = { hits: 0, misses: 0, preCached: 0 };
    }
    this.stats[stakeholderType].misses++;
  }

  async invalidate(key) {
    try {
      await this.client.del(key);
      console.log(`🗑️  Cache invalidated: ${key}`);
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  async flushAll() {
    try {
      await this.client.flushAll();
      console.log('🧹 All cache cleared');
    } catch (error) {
      console.error('Cache flush error:', error);
    }
  }

  getStats() {
    return this.stats;
  }

  resetStats() {
    this.stats = {};
    console.log('📊 Statistics reset');
  }
}

// ========================================
// PRE-CACHING RULES ENGINE (SYNCHRONIZED)
// ========================================

class PreCachingRulesEngine {
  constructor() {
    this.rules = [
      {
        id: 'Rule 1',
        name: 'Checkpoint Proximity',
        description: 'Pre-cache assets approaching checkpoints within 20km',
        evaluate: (asset, accessLog) => {
          const checkpointDistance = asset.CheckpointDistance || 9999;
          const isInTransit = asset.Status?.toLowerCase().includes('transit');
          
          if (isInTransit && checkpointDistance < 20) {
            return {
              shouldCache: true,
              ttl: 1800, // 30 minutes
              reason: `Asset approaching checkpoint (${checkpointDistance}km away)`,
              priority: checkpointDistance < 10 ? 'high' : 'medium',
              stakeholders: ['customs', 'logistics', 'distributor']
            };
          }
          return { shouldCache: false };
        }
      },
      {
        id: 'Rule 2',
        name: 'Multi-Stakeholder Access',
        description: 'Pre-cache assets accessed by 3+ different stakeholders in last 24h',
        evaluate: (asset, accessLog) => {
          if (!accessLog || accessLog.length === 0) {
            return { shouldCache: false };
          }

          const uniqueStakeholders = new Set(accessLog.map(log => log.stakeholder));
          const uniqueCount = uniqueStakeholders.size;

          if (uniqueCount >= 3) {
            return {
              shouldCache: true,
              ttl: 3600, // 1 hour
              reason: `High collaboration asset (${uniqueCount} stakeholders)`,
              priority: 'medium',
              stakeholders: Array.from(uniqueStakeholders)
            };
          }
          return { shouldCache: false };
        }
      },
      {
        id: 'Rule 3',
        name: 'High-Value Near Destination',
        description: 'Pre-cache high-value assets (>$50k) within 50km of destination',
        evaluate: (asset, accessLog) => {
          const value = parseInt(asset.AppraisedValue) || 0;
          const destDistance = asset.DestinationDistance || 9999;
          
          if (value > 50000 && destDistance < 50) {
            return {
              shouldCache: true,
              ttl: 2700, // 45 minutes
              reason: `High-value asset ($${(value / 1000).toFixed(0)}k) near destination (${destDistance}km)`,
              priority: 'high',
              stakeholders: ['retailer', 'distributor', 'customs', 'insurance']
            };
          }
          return { shouldCache: false };
        }
      },
      {
        id: 'Rule 4',
        name: 'Optimization Mode',
        description: 'Pre-cache all transit assets during off-peak hours',
        evaluate: (asset, accessLog) => {
          const hour = new Date().getHours();
          const isOffPeak = hour >= 22 || hour <= 6; // 10 PM to 6 AM
          const isInTransit = asset.Status?.toLowerCase().includes('transit');

          if (isOffPeak && isInTransit) {
            return {
              shouldCache: true,
              ttl: 7200, // 2 hours
              reason: 'Off-peak optimization pre-cache',
              priority: 'low',
              stakeholders: ['system']
            };
          }
          return { shouldCache: false };
        }
      }
    ];
  }

  evaluatePreCachingRules(asset, accessLog = []) {
    // Evaluate all rules and return first match
    for (const rule of this.rules) {
      const result = rule.evaluate(asset, accessLog);
      
      if (result.shouldCache) {
        return {
          shouldPreCache: true,
          triggeredRule: rule.id,
          ruleName: rule.name,
          ttl: result.ttl,
          reason: result.reason,
          priority: result.priority,
          stakeholders: result.stakeholders
        };
      }
    }

    return {
      shouldPreCache: false,
      reason: 'No pre-caching rule triggered'
    };
  }

  getRules() {
    return this.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description
    }));
  }
}

const smartCache = new SmartCache();

module.exports = smartCache;
module.exports.PreCachingRulesEngine = PreCachingRulesEngine;
