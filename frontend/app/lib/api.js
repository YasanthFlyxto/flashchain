// lib/api.js
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = {
  // Get all shipments from blockchain
  async getAllShipments() {
    const response = await axios.get(`${API_URL}/api/assets`);
    return response.data;
  },

  // Get single shipment (cache-first)
  async getShipment(id, stakeholder = 'default') {
    const response = await axios.get(`${API_URL}/api/asset/${id}?stakeholder=${stakeholder}`);
    return response.data;
  },

  // Compare cache vs blockchain latency for a single asset
  async compareLatency(id) {
    const response = await axios.get(`${API_URL}/api/asset/${id}/compare`);
    return response.data;
  },

  // Get asset counts (hot vs cold)
  async getAssetCounts() {
    const response = await axios.get(`${API_URL}/api/assets/count`);
    return response.data;
  },

  // Create shipment
  async createShipment(data) {
    const response = await axios.post(`${API_URL}/api/shipment/create`, data);
    return response.data;
  },

  // Transfer shipment ownership (also invalidates cache)
  async transferShipment(shipmentId, newOwner) {
    const response = await axios.post(`${API_URL}/api/shipment/transfer`, {
      shipmentId,
      newOwner
    });
    return response.data;
  },

  // Delete a single asset
  async deleteAsset(id) {
    const response = await axios.delete(`${API_URL}/api/asset/${id}`);
    return response.data;
  },

  // Get cache statistics
  async getStats() {
    const response = await axios.get(`${API_URL}/api/stats`);
    return response.data;
  },

  // Reset statistics and flush cache
  async resetStats() {
    const response = await axios.post(`${API_URL}/api/stats/reset`);
    return response.data;
  },

  // Get pre-caching activity log
  async getPreCacheActivity() {
    const response = await axios.get(`${API_URL}/api/precache/activity`);
    return response.data;
  },

  // Manually trigger one pre-cache worker run
  async runWorkerOnce() {
    const response = await axios.post(`${API_URL}/api/precache/run-worker-once`);
    return response.data;
  },

  // Toggle background worker on/off
  async toggleWorker(enabled) {
    const response = await axios.post(`${API_URL}/api/worker/toggle`, { enabled });
    return response.data;
  },

  // Get background worker status
  async getWorkerStatus() {
    const response = await axios.get(`${API_URL}/api/worker/status`);
    return response.data;
  },

  // Get all assets with pre-caching evaluation (test-lab view)
  async getTestlabAssets() {
    const response = await axios.get(`${API_URL}/api/testlab/assets`);
    return response.data;
  },

  // Full system reset (clears cache, stats, access logs)
  async resetSystem() {
    const response = await axios.post(`${API_URL}/api/system/reset`);
    return response.data;
  },

  // Delete test/benchmark assets from blockchain
  async clearTestAssets() {
    const response = await axios.post(`${API_URL}/api/system/clear-test-assets`);
    return response.data;
  },

  // Delete all assets from blockchain
  async clearAllAssets() {
    const response = await axios.post(`${API_URL}/api/system/clear-all-assets`);
    return response.data;
  },

  // Health check
  async healthCheck() {
    const response = await axios.get(`${API_URL}/health`);
    return response.data;
  },

  // Get current rule configuration and available industry presets
  async getRules() {
    const response = await axios.get(`${API_URL}/api/rules`);
    return response.data;
  },

  // Apply a named industry preset (e.g. 'pharmaceutical', 'food-beverage', 'general-logistics')
  async applyRulePreset(preset) {
    const response = await axios.post(`${API_URL}/api/rules`, { preset });
    return response.data;
  },

  // Apply a custom rule configuration object
  async updateRules(config) {
    const response = await axios.post(`${API_URL}/api/rules`, { config });
    return response.data;
  },

  // Reset all rules to system defaults
  async resetRules() {
    const response = await axios.post(`${API_URL}/api/rules/reset`);
    return response.data;
  },

  // Single random asset query — measures one blockchain vs one cache fetch
  async runSingleQuery() {
    const response = await axios.post(`${API_URL}/api/benchmark/single`);
    return response.data;
  },

  // Run concurrent load benchmark — fires N parallel queries to cache and blockchain
  // 2000 queries uses batched execution on the backend (~40 batches × 50) so allow 120s
  async runBenchmark(concurrency) {
    const response = await axios.post(`${API_URL}/api/benchmark/run`, { concurrency }, { timeout: 120000 });
    return response.data;
  },

  // Map raw blockchain asset fields to SCM display terminology (UI only)
  mapAsset(asset) {
    return {
      ...asset,
      CargoType: asset.Color,
      WeightKg:  asset.Size,
      Custodian: asset.Owner,
      ValueUSD:  asset.AppraisedValue,
    };
  },

  mapAssets(assets) {
    return assets.map(a => this.mapAsset(a));
  }
};
