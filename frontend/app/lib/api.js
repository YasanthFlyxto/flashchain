// lib/api.js
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = {
  // Get all shipments
  async getAllShipments(stakeholder = 'default') {
    const response = await axios.get(`${API_URL}/api/assets?stakeholder=${stakeholder}`);
    return response.data;
  },

  // Get single shipment
  async getShipment(id, stakeholder = 'default') {
    const response = await axios.get(`${API_URL}/api/asset/${id}?stakeholder=${stakeholder}`);
    return response.data;
  },

  // Create shipment
  async createShipment(data) {
    const response = await axios.post(`${API_URL}/api/shipment/create`, data);
    return response.data;
  },

  // Run benchmark simulation
  async runBenchmark(numQueries, mode) {
    const response = await axios.post(`${API_URL}/api/benchmark/simulate`, {
      numQueries,
      mode
    });
    return response.data;
  },

  // Get benchmark status
  async getBenchmarkStatus() {
    const response = await axios.get(`${API_URL}/api/benchmark/status`);
    return response.data;
  },

  // Get last benchmark results
  async getBenchmarkResults() {
    const response = await axios.get(`${API_URL}/api/benchmark/results`);
    return response.data;
  },

  // Transfer shipment
  async transferShipment(shipmentId, newOwner) {
    const response = await axios.post(`${API_URL}/api/shipment/transfer`, {
      shipmentId,
      newOwner
    });
    return response.data;
  },

  // Get statistics
  async getStats() {
    const response = await axios.get(`${API_URL}/api/stats`);
    return response.data;
  },

  // Add this to your api.js exports
  async resetSystem() {
    const response = await axios.post(`${API_URL}/api/system/reset`);
    return response.data;
  },

  // Set cache mode
  async setCacheMode(mode) {
    const response = await axios.post(`${API_URL}/api/cache/mode`, { mode });
    return response.data;
  },

  // Reset stats
  async resetStats() {
    const response = await axios.post(`${API_URL}/api/stats/reset`);
    return response.data;
  }
};
