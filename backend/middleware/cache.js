// middleware/cache.js
const redis = require('redis');
const crypto = require('crypto');

class SmartCache {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.mode = 'adaptive';
        this.stats = {
            manufacturer: { hits: 0, misses: 0, totalTTL: 0 },
            distributor: { hits: 0, misses: 0, totalTTL: 0 },
            retailer: { hits: 0, misses: 0, totalTTL: 0 },
            default: { hits: 0, misses: 0, totalTTL: 0 }
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

        const { stakeholderType = 'default' } = context;
        const ttl = this.calculateAdaptiveTTL(data, stakeholderType);
        const dataHash = this.generateHash(data);

        const cacheEntry = {
            data: data,
            hash: dataHash,
            stakeholderType: stakeholderType,
            cachedAt: Date.now(),
            ttl: ttl,
            mode: this.mode
        };

        try {
            await this.client.setEx(key, ttl, JSON.stringify(cacheEntry));
            console.log(`📦 CACHED: ${key} | TTL: ${ttl}s | Mode: ${this.mode} | Type: ${stakeholderType} | Hash: ${dataHash.substring(0, 8)}...`);
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
                console.log(`✅ CACHE HIT: ${key} (Age: ${age}s, Mode: ${cacheEntry.mode || 'unknown'})`);
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
            this.stats[key] = { hits: 0, misses: 0, totalTTL: 0 };
        });
        console.log('📊 Statistics reset');
    }

    /**
     * Get detailed stats summary
     */
    getDetailedStats() {
        let totalHits = 0;
        let totalMisses = 0;

        Object.values(this.stats).forEach(s => {
            totalHits += s.hits;
            totalMisses += s.misses;
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
            cacheHitRate: `${cacheHitRate}%`,
            byStakeholder: this.stats
        };
    }
}

module.exports = new SmartCache();
