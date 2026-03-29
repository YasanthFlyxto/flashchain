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

  // Single random asset query - measures one blockchain vs one cache fetch
  async runSingleQuery() {
    const response = await axios.post(`${API_URL}/api/benchmark/single`);
    return response.data;
  },

  // Run concurrent load benchmark - fires N parallel queries to cache and blockchain
  async runBenchmark(concurrency) {
    const response = await axios.post(`${API_URL}/api/benchmark/run`, { concurrency }, { timeout: 120000 });
    return response.data;
  },

  // Caliper-like sustained rate benchmark - runs fabric, cache, or both separately
  async runSustainedBenchmark(tps, durationSeconds, target = 'both') {
    const timeout = (durationSeconds * 2 + 60) * 1000;
    const response = await axios.post(`${API_URL}/api/benchmark/sustained`, { tps, durationSeconds, target }, { timeout });
    return response.data;
  },

  // ── Adaptive tuner demo ─────────────────────────────────────────────────────
  async tunerDemoReset() { return (await axios.post(`${API_URL}/api/tuner-demo/reset`)).data; },
  async tunerDemoMeasure() { return (await axios.post(`${API_URL}/api/tuner-demo/measure`)).data; },
  async tunerDemoTune() { return (await axios.post(`${API_URL}/api/tuner-demo/tune`)).data; },

  // ── Benchmark simulation ────────────────────────────────────────────────────

  // Create 6 controlled pharma shipments on the ledger
  async setupPharma() {
    const response = await axios.post(`${API_URL}/api/benchmark/setup-pharma`);
    return response.data;
  },

  // Trigger disruption - PHARMA_03 moves to checkpoint proximity at round 4
  async triggerDisruption() {
    const response = await axios.post(`${API_URL}/api/benchmark/trigger-disruption`);
    return response.data;
  },

  // Run full simulation: 3-way comparison + 10-round adaptive vs static
  // Long-running - allow up to 3 minutes
  async runSimulation() {
    const response = await axios.post(`${API_URL}/api/benchmark/simulate`, {}, { timeout: 180000 });
    return response.data;
  },

  // ── Formal evaluation ───────────────────────────────────────────────────────

  // Run multi-trial evaluation (3-way comparison × N trials with mean +/- stddev)
  async runEvaluation(trials = 5) {
    const timeout = trials * 60000 + 30000;
    const response = await axios.post(`${API_URL}/api/benchmark/evaluate`, { trials }, { timeout });
    return response.data;
  },

  // Export evaluation results as CSV (triggers browser download)
  exportResultsCsv() {
    window.open(`${API_URL}/api/benchmark/export?format=csv`, '_blank');
  },

  // Export evaluation results as JSON (triggers browser download)
  exportResultsJson() {
    window.open(`${API_URL}/api/benchmark/export?format=json`, '_blank');
  },

  // ── Adaptive tuner ──────────────────────────────────────────────────────────

  // Get full tuner history - per-round precision/recall, threshold drift
  async getAdaptiveHistory() {
    const response = await axios.get(`${API_URL}/api/adaptive/history`);
    return response.data;
  },

  // Reset tuner and rules to defaults
  async resetAdaptiveTuner() {
    const response = await axios.post(`${API_URL}/api/adaptive/reset`);
    return response.data;
  },

  // Map raw blockchain asset fields to SCM display terminology (UI only)
  mapAsset(asset) {
    return {
      ...asset,
      CargoType: asset.Color,
      WeightKg: asset.Size,
      Custodian: asset.Owner,
      ValueUSD: asset.AppraisedValue,
    };
  },

  mapAssets(assets) {
    return assets.map(a => this.mapAsset(a));
  }
};
