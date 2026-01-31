// middleware/cache.js
const redis = require('redis');
const crypto = require('crypto');

class SmartCache {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.mode = 'adaptive';
        this.stats = {
            manufacturer: { hits: 0, misses: 0, totalTTL: 0, preCached: 0 },
            distributor: { hits: 0, misses: 0, totalTTL: 0, preCached: 0 },
            retailer: { hits: 0, misses: 0, totalTTL: 0, preCached: 0 },
            default: { hits: 0, misses: 0, totalTTL: 0, preCached: 0 }
        };
    }

    /**
     * Set caching mode for benchmarking
     */
    setMode(mode) {
        this.mode = mode;
        console.log(`🔄 SmartCache mode: ${mode}`);
    }

    /**
     * Get current caching mode
     */
    getMode() {
        return this.mode;
    }

    /**
     * Connect to Redis
     */
    async connect() {
        this.client = redis.createClient({
            socket: { host: 'localhost', port: 6379 }
        });

        this.client.on('error', (err) => console.error('❌ Redis Error:', err));
        this.client.on('ready', () => {
            console.log('✅ Redis cache connected');
            this.isReady = true;
        });

        await this.client.connect();
    }

    /**
     * Calculate adaptive TTL based on supply chain context
     * NOVELTY: Context-aware intelligent caching
     */
    calculateAdaptiveTTL(assetData, stakeholderType) {
        if (this.mode === 'simple') {
            return 600;
        }

        const baseTTLMap = {
            'manufacturer': 3600,
            'distributor': 1800,
            'retailer': 900,
            'default': 600
        };

        let ttl = baseTTLMap[stakeholderType] || baseTTLMap.default;

        const owner = assetData.Owner?.toLowerCase() || '';

        if (owner.includes('transit') || owner.includes('shipping') || owner.includes('customs')) {
            ttl = Math.floor(ttl * 0.5);
            console.log(`🔄 Adaptive TTL: Asset in transit, reduced to ${ttl}s`);
        } else if (owner.includes('delivered') || owner.includes('warehouse') || owner.includes('completed')) {
            ttl = Math.floor(ttl * 1.5);
            console.log(`📦 Adaptive TTL: Asset stable, extended to ${ttl}s`);
        }

        if (assetData.AppraisedValue && assetData.AppraisedValue > 500) {
            ttl = Math.floor(ttl * 0.9);
            console.log(`💎 Adaptive TTL: High-value asset, reduced to ${ttl}s`);
        }

        return ttl;
    }

    /**
     * Generate cryptographic hash for data integrity verification
     * Addresses: Security-speed balance
     */
    generateHash(data) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    /**
     * Cache data with context-aware TTL
     */
    async cacheWithContext(key, data, context = {}) {
        if (!this.isReady) return;

        const { stakeholderType = 'default', preCached = false } = context;
        const ttl = this.calculateAdaptiveTTL(data, stakeholderType);
        const dataHash = this.generateHash(data);

        const cacheEntry = {
            data: data,
            hash: dataHash,
            stakeholderType: stakeholderType,
            cachedAt: Date.now(),
            ttl: ttl,
            mode: this.mode,
            preCached: preCached
        };

        try {
            await this.client.setEx(key, ttl, JSON.stringify(cacheEntry));
            const preCacheLabel = preCached ? ' [PRE-CACHED]' : '';
            console.log(`📦 CACHED: ${key} | TTL: ${ttl}s | Mode: ${this.mode} | Type: ${stakeholderType}${preCacheLabel} | Hash: ${dataHash.substring(0, 8)}...`);

            // Track pre-caching stats
            if (preCached && this.stats[stakeholderType]) {
                this.stats[stakeholderType].preCached++;
            }
        } catch (error) {
            console.error('Cache write error:', error);
        }
    }

    /**
     * Get cached data with integrity verification
     */
    async get(key) {
        if (!this.isReady) return null;

        try {
            const cached = await this.client.get(key);

            if (cached) {
                const cacheEntry = JSON.parse(cached);

                // Verify data integrity
                const currentHash = this.generateHash(cacheEntry.data);
                if (currentHash !== cacheEntry.hash) {
                    console.log(`⚠️ HASH MISMATCH: ${key} - Cache corrupted, invalidating`);
                    await this.invalidate(key);

                    // Track as miss when hash fails
                    const type = cacheEntry.stakeholderType || 'default';
                    if (this.stats[type]) {
                        this.stats[type].misses++;
                    }
                    return null;
                }

                // Track hit
                const type = cacheEntry.stakeholderType || 'default';
                if (this.stats[type]) {
                    this.stats[type].hits++;
                }

                const age = Math.floor((Date.now() - cacheEntry.cachedAt) / 1000);
                const preCacheLabel = cacheEntry.preCached ? ' [WAS PRE-CACHED]' : '';
                console.log(`✅ CACHE HIT: ${key} (Age: ${age}s, Mode: ${cacheEntry.mode || 'unknown'}${preCacheLabel})`);
                return cacheEntry;
            }

            // Cache miss - no data found
            console.log(`❌ CACHE MISS: ${key}`);
            return null;

        } catch (error) {
            console.error('Cache read error:', error);
            return null;
        }
    }

    /**
     * Track cache miss for statistics
     * Called from app.js when cache returns null
     */
    trackMiss(stakeholderType = 'default') {
        if (this.stats[stakeholderType]) {
            this.stats[stakeholderType].misses++;
            console.log(`📊 Tracked MISS for: ${stakeholderType}`);
        }
    }

    /**
     * Invalidate cache entry
     */
    async invalidate(key) {
        if (!this.isReady) return;

        try {
            await this.client.del(key);
            console.log(`🗑️ INVALIDATED: ${key}`);
        } catch (error) {
            console.error('Cache invalidation error:', error);
        }
    }

    /**
     * Flush all cache entries
     */
    async flushAll() {
        if (!this.isReady) return;

        try {
            await this.client.flushAll();
            console.log('🗑️ ALL CACHE FLUSHED');
        } catch (error) {
            console.error('Cache flush error:', error);
        }
    }

    /**
     * Get caching statistics by stakeholder type
     */
    getStats() {
        return this.stats;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        Object.keys(this.stats).forEach(key => {
            this.stats[key] = { hits: 0, misses: 0, totalTTL: 0, preCached: 0 };
        });
        console.log('📊 Statistics reset');
    }

    /**
     * Get detailed stats summary
     */
    getDetailedStats() {
        let totalHits = 0;
        let totalMisses = 0;
        let totalPreCached = 0;

        Object.values(this.stats).forEach(s => {
            totalHits += s.hits;
            totalMisses += s.misses;
            totalPreCached += s.preCached || 0;
        });

        const totalQueries = totalHits + totalMisses;
        const cacheHitRate = totalQueries > 0
            ? ((totalHits / totalQueries) * 100).toFixed(2)
            : 0;

        return {
            mode: this.mode,
            totalQueries,
            totalHits,
            totalMisses,
            totalPreCached,
            cacheHitRate: `${cacheHitRate}%`,
            byStakeholder: this.stats
        };
    }
}

// ========================================
// PRE-CACHING RULES ENGINE
// ========================================

class PreCachingRulesEngine {

    /**
     * Rule 1: Checkpoint Proximity Rule
     * Pre-cache when shipment is near a checkpoint (< 20km and ETA < 1h)
     */
    shouldPreCacheCheckpoint(assetData) {
        const distanceToCheckpoint = assetData.CheckpointDistance || 9999;
        const etaHours = this.calculateETAHours(assetData.ETA);
        const hasCheckpoint = assetData.NextCheckpoint && assetData.NextCheckpoint !== '';

        if (distanceToCheckpoint < 20 && etaHours < 1 && hasCheckpoint) {
            console.log(`🎯 RULE 1 TRIGGERED: Checkpoint proximity - ${assetData.ID}`);
            return {
                trigger: true,
                rule: 'checkpoint-proximity',
                priority: 'HIGH',
                stakeholders: ['customs', 'distributor', 'default'],
                reason: `${assetData.NextCheckpoint} checkpoint in ${etaHours.toFixed(1)}h (${distanceToCheckpoint}km away)`
            };
        }
        return { trigger: false };
    }

    /**
     * Rule 2: Access Pattern Detection
     * Pre-cache when asset accessed > 3 times in last hour by multiple orgs
     */
    shouldPreCacheAccessPattern(assetId, accessLog) {
        const lastHour = Date.now() - 3600000;
        const recentAccesses = accessLog.filter(a => a.timestamp > lastHour);
        const uniqueOrgs = new Set(recentAccesses.map(a => a.stakeholder)).size;

        if (recentAccesses.length > 3 && uniqueOrgs > 2) {
            console.log(`🎯 RULE 2 TRIGGERED: Unusual access pattern - ${assetId}`);
            return {
                trigger: true,
                rule: 'access-pattern',
                priority: 'MEDIUM',
                stakeholders: ['manufacturer', 'distributor', 'retailer', 'default'],
                reason: `${recentAccesses.length} accesses by ${uniqueOrgs} different organizations in 1h (potential dispute)`
            };
        }
        return { trigger: false };
    }

    /**
     * Rule 3: High-Value Near Destination
     * Pre-cache high-value shipments (> $50k) within 50km of destination
     */
    shouldPreCacheHighValue(assetData) {
        const isHighValue = assetData.AppraisedValue > 50000;
        const distanceToDest = assetData.DestinationDistance || 9999;

        if (isHighValue && distanceToDest < 50) {
            console.log(`🎯 RULE 3 TRIGGERED: High-value near destination - ${assetData.ID}`);
            return {
                trigger: true,
                rule: 'high-value-destination',
                priority: 'HIGH',
                stakeholders: ['retailer', 'default'],
                reason: `$${assetData.AppraisedValue} shipment only ${distanceToDest}km from destination (inspection imminent)`
            };
        }
        return { trigger: false };
    }

    /**
     * Rule 4: DON'T Pre-Cache (Optimization)
     * Skip pre-caching for mid-journey shipments with low access
     */
    shouldNotPreCache(assetData, accessLog) {
        const lastHour = Date.now() - 3600000;
        const recentAccesses = accessLog.filter(a => a.timestamp > lastHour);
        const distanceToAny = Math.min(
            assetData.CheckpointDistance || 9999,
            assetData.DestinationDistance || 9999
        );

        if (distanceToAny > 500 && recentAccesses.length <= 1) {
            console.log(`❌ RULE 4: Skip pre-cache - ${assetData.ID} (mid-journey ${distanceToAny}km from any checkpoint, only ${recentAccesses.length} access)`);
            return true;
        }
        return false;
    }

    /**
     * Helper: Calculate ETA in hours
     */
    calculateETAHours(etaString) {
        if (!etaString) return 999;
        try {
            const eta = new Date(etaString);
            const now = new Date();
            return (eta - now) / (1000 * 60 * 60); // milliseconds to hours
        } catch (error) {
            return 999;
        }
    }

    /**
     * Main Rule Evaluation
     * Returns decision on whether to pre-cache and why
     */
    evaluatePreCachingRules(assetData, accessLog = []) {
        // Rule 4: Check if should NOT pre-cache first (optimization)
        if (this.shouldNotPreCache(assetData, accessLog)) {
            return {
                shouldPreCache: false,
                reason: 'Mid-journey, low priority - conserve bandwidth',
                rule: 'dont-precache'
            };
        }

        // Check all trigger rules
        const rules = [
            this.shouldPreCacheCheckpoint(assetData),
            this.shouldPreCacheAccessPattern(assetData.ID, accessLog),
            this.shouldPreCacheHighValue(assetData)
        ];

        const triggeredRule = rules.find(r => r.trigger);

        if (triggeredRule) {
            return {
                shouldPreCache: true,
                ...triggeredRule
            };
        }

        return {
            shouldPreCache: false,
            reason: 'No pre-caching rules triggered',
            rule: 'none'
        };
    }
}

// Export both classes
const smartCacheInstance = new SmartCache();
module.exports = smartCacheInstance;
module.exports.PreCachingRulesEngine = PreCachingRulesEngine;
