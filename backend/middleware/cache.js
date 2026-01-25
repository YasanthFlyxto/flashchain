const redis = require('redis');
const crypto = require('crypto');

class SmartCache {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.mode = 'adaptive'; // default mode: 'adaptive' | 'simple' | 'disabled'
        this.stats = {
            manufacturer: { hits: 0, misses: 0, totalTTL: 0 },
            distributor: { hits: 0, misses: 0, totalTTL: 0 },
            retailer: { hits: 0, misses: 0, totalTTL: 0 },
            default: { hits: 0, misses: 0, totalTTL: 0 }
        };
    }

    /**
     * Set caching mode for benchmarking
     * @param {string} mode - 'adaptive', 'simple', or 'disabled'
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
     * This is the NOVELTY: Context-aware intelligent caching
     */
    calculateAdaptiveTTL(assetData, stakeholderType) {
        // SIMPLE MODE: Fixed TTL for everyone
        if (this.mode === 'simple') {
            return 600; // 10 minutes fixed
        }

        // ADAPTIVE MODE: Original logic
        const baseTTLMap = {
            'manufacturer': 3600,  // 1 hour - historical data focus
            'distributor': 1800,   // 30 min - moderate freshness
            'retailer': 900,       // 15 min - real-time needs
            'default': 600         // 10 min - general purpose
        };

        let ttl = baseTTLMap[stakeholderType] || baseTTLMap.default;

        // ADAPTIVE LOGIC: Adjust based on asset state
        const owner = assetData.Owner?.toLowerCase() || '';

        // If asset is in transit or active state, reduce TTL (needs fresher data)
        if (owner.includes('transit') || owner.includes('shipping') || owner.includes('customs')) {
            ttl = Math.floor(ttl * 0.5); // 50% shorter cache for moving items
            console.log(`🔄 Adaptive TTL: Asset in transit, reduced to ${ttl}s`);
        }
        // If asset is delivered/completed, increase TTL (stable data)
        else if (owner.includes('delivered') || owner.includes('warehouse') || owner.includes('completed')) {
            ttl = Math.floor(ttl * 1.5); // 50% longer cache for stable items
            console.log(`📦 Adaptive TTL: Asset stable, extended to ${ttl}s`);
        }

        // If asset value is high, slightly reduce TTL (more monitoring)
        if (assetData.AppraisedValue && assetData.AppraisedValue > 500) {
            ttl = Math.floor(ttl * 0.9); // 10% shorter for high-value items
            console.log(`💎 Adaptive TTL: High-value asset, reduced to ${ttl}s`);
        }

        return ttl;
    }

    /**
     * Generate cryptographic hash for data integrity verification
     * This addresses: Security-speed balance in your research
     */
    generateHash(data) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    async cacheWithContext(key, data, context = {}) {
        if (!this.isReady) return;

        const { stakeholderType = 'default' } = context;

        // Calculate adaptive TTL (NOVELTY FEATURE)
        const ttl = this.calculateAdaptiveTTL(data, stakeholderType);

        // Generate integrity hash
        const dataHash = this.generateHash(data);

        // Store data with metadata
        const cacheEntry = {
            data: data,
            hash: dataHash,
            stakeholderType: stakeholderType,
            cachedAt: Date.now(),
            ttl: ttl,
            mode: this.mode // Track which mode was used
        };

        try {
            await this.client.setEx(key, ttl, JSON.stringify(cacheEntry));
            console.log(`📦 CACHED: ${key} | TTL: ${ttl}s | Mode: ${this.mode} | Type: ${stakeholderType} | Hash: ${dataHash.substring(0, 8)}...`);
        } catch (error) {
            console.error('Cache write error:', error);
        }
    }

    async get(key) {
        if (!this.isReady) return null;

        try {
            const cached = await this.client.get(key);
            if (cached) {
                const cacheEntry = JSON.parse(cached);

                // Verify data integrity
                const currentHash = this.generateHash(cacheEntry.data);
                if (currentHash !== cacheEntry.hash) {
                    console.log(`⚠️  HASH MISMATCH: ${key} - Cache corrupted, invalidating`);
                    await this.invalidate(key);
                    return null;
                }

                // Update stats
                const type = cacheEntry.stakeholderType || 'default';
                if (this.stats[type]) {
                    this.stats[type].hits++;
                }

                const age = Math.floor((Date.now() - cacheEntry.cachedAt) / 1000);
                console.log(`✅ CACHE HIT: ${key} (Age: ${age}s, Mode: ${cacheEntry.mode || 'unknown'})`);
                return cacheEntry; // Return full entry to access TTL and metadata
            }

            console.log(`❌ CACHE MISS: ${key}`);
            return null;
        } catch (error) {
            console.error('Cache read error:', error);
            return null;
        }
    }

    async invalidate(key) {
        if (!this.isReady) return;
        try {
            await this.client.del(key);
            console.log(`🗑️  INVALIDATED: ${key}`);
        } catch (error) {
            console.error('Cache invalidation error:', error);
        }
    }

    /**
     * Flush all cache entries (for testing)
     */
    async flushAll() {
        if (!this.isReady) return;
        try {
            await this.client.flushAll();
            console.log('🗑️  ALL CACHE FLUSHED');
        } catch (error) {
            console.error('Cache flush error:', error);
        }
    }

    /**
     * Get caching statistics by stakeholder type
     * For evaluation and thesis evidence
     */
    getStats() {
        return this.stats;
    }

    /**
     * Reset statistics (for testing)
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

// Export singleton instance
module.exports = new SmartCache();
