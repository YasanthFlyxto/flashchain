'use client';

import { useState, useEffect } from 'react';

export default function PolicyDemoPage() {
  const [sessionState, setSessionState] = useState('idle');
  const [sessionData, setSessionData] = useState(null);
  const [workerResult, setWorkerResult] = useState(null);
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [error, setError] = useState(null);

  // Real-time monitoring
  const [blockchainAssets, setBlockchainAssets] = useState([]);
  const [cacheAssets, setCacheAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Pagination
  const [blockchainPage, setBlockchainPage] = useState(1);
  const [cachePage, setCachePage] = useState(1);
  const itemsPerPage = 20;

  // Single asset benchmark
  const [singleAssetResult, setSingleAssetResult] = useState(null);
  const [queryingAsset, setQueryingAsset] = useState(false);

  // Benchmark running state
  const [runningWorker, setRunningWorker] = useState(false);
  const [runningBenchmark, setRunningBenchmark] = useState(false);

  // Worker control
  const [workerEnabled, setWorkerEnabled] = useState(true);

  // Asset counts
  const [assetCounts, setAssetCounts] = useState({ total: 0, hot: 0, cold: 0 });

  // Custom shipment creation
  const [customShipment, setCustomShipment] = useState({
    status: 'transit',
    owner: '',
    value: '50000'
  });
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customResult, setCustomResult] = useState(null);

  const API_BASE = 'http://localhost:4000/api';

  // Fetch blockchain assets
  const fetchBlockchainAssets = async () => {
    try {
      const resp = await fetch(`${API_BASE}/testlab/assets`);
      const data = await resp.json();
      if (data.success) {
        setBlockchainAssets(data.assets || []);
      }
    } catch (err) {
      console.error('Error fetching blockchain assets:', err);
    }
  };

  // Fetch cache contents
  const fetchCacheAssets = async () => {
    try {
      const resp = await fetch(`${API_BASE}/precache/activity`);
      const data = await resp.json();
      if (data.success) {
        setCacheAssets(data.activity || []);
      }
    } catch (err) {
      console.error('Error fetching cache assets:', err);
    }
  };

  // Fetch asset counts
  const fetchAssetCounts = async () => {
    try {
      const resp = await fetch(`${API_BASE}/assets/count`);
      const data = await resp.json();
      if (data.success) {
        setAssetCounts({
          total: data.total,
          hot: data.hot,
          cold: data.cold
        });
      }
    } catch (err) {
      console.error('Error fetching asset counts:', err);
    }
  };

  // Refresh all data
  const refreshTables = async () => {
    setLoadingAssets(true);
    await Promise.all([
      fetchBlockchainAssets(),
      fetchCacheAssets(),
      fetchAssetCounts()
    ]);
    setLoadingAssets(false);
  };

  // Fetch worker status
  const fetchWorkerStatus = async () => {
    try {
      const resp = await fetch(`${API_BASE}/worker/status`);
      const data = await resp.json();
      if (data.success) {
        setWorkerEnabled(data.workerEnabled);
      }
    } catch (err) {
      console.error('Error fetching worker status:', err);
    }
  };

  // Toggle worker
  const toggleWorker = async () => {
    try {
      const newState = !workerEnabled;
      const resp = await fetch(`${API_BASE}/worker/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState })
      });

      const data = await resp.json();
      if (data.success) {
        setWorkerEnabled(newState);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    refreshTables();
    fetchWorkerStatus();
    const interval = setInterval(() => {
      refreshTables();
      fetchWorkerStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset everything
  const resetEverything = async () => {
    if (!confirm('This will delete all test assets. Continue?')) {
      return;
    }

    try {
      setLoadingAssets(true);
      await fetch(`${API_BASE}/system/clear-test-assets`, { method: 'POST' });
      alert('Blockchain cleared successfully');
      resetDemo();
      setBlockchainPage(1);
      setCachePage(1);
      await refreshTables();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAssets(false);
    }
  };

  // Reset Cache
  const resetCache = async () => {
    if (!confirm('This will clear cache. Continue?')) {
      return;
    }

    try {
      setLoadingAssets(true);
      await fetch(`${API_BASE}/system/reset`, { method: 'POST' });
      alert('Cache cleared successfully');
      resetDemo();
      setBlockchainPage(1);
      setCachePage(1);
      await refreshTables();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAssets(false);
    }
  };

  // Step 1: Create test shipments
  const createTestShipments = async () => {
    setSessionState('creating');
    setError(null);

    try {
      const totalShipments = 30;
      const transitCount = 20;
      const disputedCount = 5;
      const deliveredCount = 5;

      console.log(`Creating ${totalShipments} test shipments...`);

      const createdAssets = [];
      const timestamp = Date.now();

      // Create 20 IN-TRANSIT shipments
      for (let i = 0; i < transitCount; i++) {
        const id = `BENCH_TRANSIT_${timestamp}_${i}`;
        const isHighValue = i % 2 === 0;

        const owner =
          i % 3 === 0
            ? 'Customs-Transit-Approaching'
            : 'Distributor-Transit-NearDestination';

        const value = isHighValue ? '75000' : '30000';

        await fetch(`${API_BASE}/shipment/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipmentId: id,
            color: 'BenchmarkProduct',
            size: '100',
            owner,
            value
          })
        });

        createdAssets.push({ id, expected: 'hot', type: 'transit', owner, value });

        if ((i + 1) % 10 === 0) {
          console.log(`Created ${i + 1}/${transitCount} transit shipments`);
          await refreshTables();
        }
      }

      // Create 5 DISPUTED shipments
      for (let i = 0; i < disputedCount; i++) {
        const id = `BENCH_DISPUTED_${timestamp}_${i}`;

        await fetch(`${API_BASE}/shipment/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipmentId: id,
            color: 'BenchmarkProduct',
            size: '100',
            owner: 'Customs-Disputed-QualityIssue',
            value: '65000'
          })
        });

        createdAssets.push({ id, expected: 'hot', type: 'disputed', owner: 'Customs-Disputed-QualityIssue', value: '65000' });
      }
      console.log(`Created ${disputedCount} disputed shipments`);
      await refreshTables();

      // Create 5 DELIVERED shipments
      for (let i = 0; i < deliveredCount; i++) {
        const id = `BENCH_DELIVERED_${timestamp}_${i}`;
        const owner =
          i % 2 === 0
            ? 'Warehouse-Final-Delivered'
            : 'RetailStore-Delivered';

        await fetch(`${API_BASE}/shipment/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shipmentId: id,
            color: 'BenchmarkProduct',
            size: '100',
            owner,
            value: '15000'
          })
        });

        createdAssets.push({ id, expected: 'cold', type: 'delivered', owner, value: '15000' });
      }
      console.log(`Created ${deliveredCount} delivered shipments`);
      await refreshTables();

      setSessionData({
        totalShipments,
        transitCount,
        disputedCount,
        deliveredCount,
        assets: createdAssets
      });

      setSessionState('idle');
      await refreshTables();
      console.log('All shipments created successfully');

    } catch (err) {
      setError(err.message);
      setSessionState('idle');
      console.error('Error creating shipments:', err);
    }
  };

  // Run background worker only
  const runWorkerOnly = async () => {
    setRunningWorker(true);
    setError(null);

    try {
      console.log('Triggering background worker...');

      const resp = await fetch(`${API_BASE}/precache/run-worker-once`, {
        method: 'POST'
      });

      const data = await resp.json();

      if (!data.success) {
        throw new Error(data.error || 'Worker failed');
      }

      setWorkerResult(data.result);
      await refreshTables();
      console.log('Worker completed:', data.result);

    } catch (err) {
      setError(err.message);
      console.error('Error running worker:', err);
    } finally {
      setRunningWorker(false);
    }
  };

  // Run benchmark only
  const runBenchmark = async () => {
    setRunningBenchmark(true);
    setError(null);

    try {
      console.log('Running benchmark queries...');

      const countResp = await fetch(`${API_BASE}/assets/count`);
      const countData = await countResp.json();

      if (!countData.success || countData.hot === 0) {
        throw new Error('No hot assets found. Create test shipments first.');
      }

      const assetsResp = await fetch(`${API_BASE}/testlab/assets`);
      const assetsData = await assetsResp.json();

      const hotAssets = assetsData.assets.filter(a =>
        a.Status === 'In-Transit' || a.Status === 'DISPUTED'
      );

      const cacheLatencies = [];
      const blockchainLatencies = [];
      let cacheHits = 0;
      let cacheMisses = 0;

      for (const asset of hotAssets) {
        const compareResp = await fetch(`${API_BASE}/asset/${asset.ID}/compare`);
        const compareData = await compareResp.json();

        const cacheLatency = compareData.comparison?.cached?.latency || 0;
        const bcLatency = compareData.comparison?.blockchain?.latency || 0;
        const isCached = compareData.comparison?.cached?.available || false;

        if (isCached) {
          cacheLatencies.push(cacheLatency);
          cacheHits++;
        } else {
          cacheMisses++;
        }

        blockchainLatencies.push(bcLatency);

        if ((hotAssets.indexOf(asset) + 1) % 10 === 0) {
          console.log(`Benchmarked ${hotAssets.indexOf(asset) + 1}/${hotAssets.length} assets`);
        }
      }

      const avgCacheLatency =
        cacheLatencies.length > 0
          ? cacheLatencies.reduce((a, b) => a + b, 0) / cacheLatencies.length
          : null;

      const avgBlockchainLatency =
        blockchainLatencies.length > 0
          ? blockchainLatencies.reduce((a, b) => a + b, 0) / blockchainLatencies.length
          : null;

      const speedup =
        avgCacheLatency && avgBlockchainLatency
          ? (avgBlockchainLatency / avgCacheLatency).toFixed(1)
          : null;

      setBenchmarkResult({
        cacheHits,
        cacheMisses,
        avgCacheLatency,
        avgBlockchainLatency,
        speedup,
        totalTested: hotAssets.length
      });

      console.log('Benchmark complete');

    } catch (err) {
      setError(err.message);
      console.error('Error running benchmark:', err);
    } finally {
      setRunningBenchmark(false);
    }
  };

  // Query single random asset
  const querySingleAsset = async () => {
    setQueryingAsset(true);
    setError(null);

    try {
      const assetsResp = await fetch(`${API_BASE}/testlab/assets`);
      const assetsData = await assetsResp.json();

      const hotAssets = assetsData.assets.filter(a =>
        a.Status === 'In-Transit' || a.Status === 'DISPUTED'
      );

      if (hotAssets.length === 0) {
        throw new Error('No hot assets found. Create test shipments first.');
      }

      const randomAsset = hotAssets[Math.floor(Math.random() * hotAssets.length)];
      const assetId = randomAsset.ID;

      console.log(`Querying asset: ${assetId}`);

      const compareResp = await fetch(`${API_BASE}/asset/${assetId}/compare`);
      const compareData = await compareResp.json();

      const cacheLatency = compareData.comparison?.cached?.latency || 0;
      const bcLatency = compareData.comparison?.blockchain?.latency || 0;
      const source = compareData.comparison?.cached?.available ? 'cache' : 'blockchain';
      const preCached = compareData.comparison?.cached?.preCached || false;
      const cacheAge = compareData.comparison?.cached?.age || null;

      const improvement = source === 'cache' && bcLatency > 0
        ? ((bcLatency - cacheLatency) / bcLatency * 100).toFixed(1)
        : 0;

      const speedup = source === 'cache' && cacheLatency > 0
        ? (bcLatency / cacheLatency).toFixed(1)
        : 0;

      setSingleAssetResult({
        assetId,
        assetType: randomAsset.Status,
        source,
        cacheLatency,
        blockchainLatency: bcLatency,
        improvement,
        speedup,
        preCached,
        cacheAge
      });

      console.log('Single asset query complete:', {
        assetId,
        cache: cacheLatency,
        blockchain: bcLatency,
        speedup
      });

    } catch (err) {
      setError(err.message);
      console.error('Error querying single asset:', err);
    } finally {
      setQueryingAsset(false);
    }
  };

  // Create custom shipment
  const createCustomShipment = async () => {
    setCreatingCustom(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const id = `CUSTOM_${customShipment.status.toUpperCase()}_${timestamp}`;

      let owner = customShipment.owner;
      if (!owner) {
        if (customShipment.status === 'transit') {
          owner = 'Customs-Transit-Approaching';
        } else if (customShipment.status === 'disputed') {
          owner = 'Customs-Disputed-QualityIssue';
        } else {
          owner = 'Warehouse-Final-Delivered';
        }
      }

      await fetch(`${API_BASE}/shipment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: id,
          color: 'CustomProduct',
          size: '100',
          owner,
          value: customShipment.value
        })
      });

      const isHot = customShipment.status === 'transit' || customShipment.status === 'disputed';
      const isHighValue = parseInt(customShipment.value) >= 50000;
      const isApproachingCheckpoint = owner.includes('Approaching') || owner.includes('Disputed');

      setCustomResult({
        id,
        owner,
        value: customShipment.value,
        status: customShipment.status,
        expectedCache: isHot,
        reason: isHot
          ? customShipment.status === 'disputed'
            ? 'DISPUTED status (Policy 01 - always cache)'
            : isApproachingCheckpoint && isHighValue
              ? 'In-Transit + High Value ($50k+) + Near Checkpoint (Rule 02)'
              : isApproachingCheckpoint
                ? 'In-Transit + Near Checkpoint (Rule 02)'
                : isHighValue
                  ? 'In-Transit + High Value (Rule 03)'
                  : 'In-Transit (basic caching)'
          : 'Delivered status (cold data - no pre-cache)'
      });

      await refreshTables();
      console.log('Custom shipment created:', id);

    } catch (err) {
      setError(err.message);
      console.error('Error creating custom shipment:', err);
    } finally {
      setCreatingCustom(false);
    }
  };

  const resetDemo = () => {
    setSessionState('idle');
    setSessionData(null);
    setWorkerResult(null);
    setBenchmarkResult(null);
    setSingleAssetResult(null);
    setError(null);
  };

  // Pagination helpers
  const getPaginatedData = (data, page) => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems) => {
    return Math.ceil(totalItems / itemsPerPage);
  };

  // Pagination component
  const Pagination = ({ currentPage, totalItems, onPageChange }) => {
    const totalPages = getTotalPages(totalItems);

    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between mt-4 text-sm border-t border-slate-200 pt-4">
        <div className="text-slate-600 font-medium">
          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Previous
          </button>
          <div className="px-4 py-2 text-slate-700 font-medium">
            Page {currentPage} of {totalPages}
          </div>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  const canRunWorker = assetCounts.hot > 0;
  const canRunBenchmark = cacheAssets.length > 0 && assetCounts.hot > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8 bg-white shadow-sm rounded-2xl p-8 border border-slate-200">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            Policy-Based Pre-Caching System
          </h1>
          <p className="text-slate-600 text-lg">
            Intelligent blockchain supply chain caching: 20 In-Transit · 5 Disputed · 5 Delivered
          </p>
        </div>

        {/* Control Panel */}
        <div className="flex gap-3 mb-6 items-center bg-white shadow-sm rounded-2xl p-5 border border-slate-200">
          <button
            onClick={resetEverything}
            className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold shadow-sm hover:shadow transition-all"
          >
            Reset Blockchain
          </button>
          <button
            onClick={resetCache}
            className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold shadow-sm hover:shadow transition-all"
          >
            Reset Cache
          </button>
          <button
            onClick={refreshTables}
            disabled={loadingAssets}
            className="px-5 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white font-semibold shadow-sm hover:shadow transition-all"
          >
            {loadingAssets ? 'Refreshing...' : 'Refresh Tables'}
          </button>

          {/* Worker Toggle */}
          <div className="flex items-center gap-3 ml-auto border-l border-slate-300 pl-5">
            <span className="text-slate-700 text-sm font-semibold">Background Worker</span>
            <button
              onClick={toggleWorker}
              className={`px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-all ${
                workerEnabled
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-slate-300 hover:bg-slate-400 text-slate-700'
              }`}
            >
              {workerEnabled ? 'ACTIVE' : 'PAUSED'}
            </button>
          </div>
        </div>

        {/* Asset Count Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white shadow-sm rounded-2xl p-6 border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Total Assets</div>
            <div className="text-4xl font-bold text-slate-900">{assetCounts.total}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 shadow-sm rounded-2xl p-6 border border-emerald-200">
            <div className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-2">Hot Assets</div>
            <div className="text-4xl font-bold text-emerald-700">{assetCounts.hot}</div>
            <div className="text-xs text-emerald-600 mt-1">Cacheable</div>
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 shadow-sm rounded-2xl p-6 border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Cold Assets</div>
            <div className="text-4xl font-bold text-slate-700">{assetCounts.cold}</div>
            <div className="text-xs text-slate-600 mt-1">On-Chain Only</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 shadow-sm rounded-2xl p-6 border border-blue-200">
            <div className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2">Cached Items</div>
            <div className="text-4xl font-bold text-blue-700">{cacheAssets.length}</div>
            <div className="text-xs text-blue-600 mt-1">In Redis</div>
          </div>
        </div>

        {/* Single Asset Query Benchmark */}
        <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Single Asset Query Benchmark
          </h2>
          <p className="text-slate-600 mb-5">
            Query a random hot asset and compare cache vs blockchain latency
          </p>

          <button
            onClick={querySingleAsset}
            disabled={queryingAsset || assetCounts.hot === 0}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            {queryingAsset ? 'Querying...' : 'Query Random Hot Asset'}
          </button>

          {assetCounts.hot === 0 && (
            <div className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-xl p-4 font-medium">
              ⚠️ No hot assets found. Create test shipments first.
            </div>
          )}

          {singleAssetResult && (
            <div className="mt-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Asset ID</div>
                <div className="text-sm font-mono font-semibold text-slate-900 mb-4">{singleAssetResult.assetId}</div>
                <div className="flex gap-3 text-sm">
                  <div>
                    <span className="text-slate-600 font-medium">Status: </span>
                    <span className="px-3 py-1.5 bg-white border-2 border-slate-300 rounded-lg font-semibold text-slate-800">
                      {singleAssetResult.assetType}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 font-medium">Source: </span>
                    <span className={`px-3 py-1.5 border-2 rounded-lg font-semibold ${
                      singleAssetResult.source === 'cache' 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                        : 'bg-amber-50 border-amber-500 text-amber-700'
                    }`}>
                      {singleAssetResult.source}
                    </span>
                  </div>
                  {singleAssetResult.preCached && (
                    <div>
                      <span className="px-3 py-1.5 bg-blue-50 border-2 border-blue-500 text-blue-700 rounded-lg font-semibold">
                        Pre-Cached {singleAssetResult.cacheAge}s ago
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-5">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-2xl p-6 shadow-sm">
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Redis Cache</div>
                  <div className="text-4xl font-bold text-emerald-700">
                    {singleAssetResult.cacheLatency !== null
                      ? `${singleAssetResult.cacheLatency.toFixed(2)}`
                      : 'N/A'}
                  </div>
                  <div className="text-sm text-emerald-600 font-medium mt-1">milliseconds</div>
                  <div className="mt-3 text-sm font-semibold text-emerald-800">
                    {singleAssetResult.source === 'cache' ? '✓ Cache Hit' : '✗ Cache Miss'}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-2xl p-6 shadow-sm">
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Blockchain</div>
                  <div className="text-4xl font-bold text-blue-700">
                    {singleAssetResult.blockchainLatency.toFixed(2)}
                  </div>
                  <div className="text-sm text-blue-600 font-medium mt-1">milliseconds</div>
                  <div className="mt-3 text-sm font-semibold text-blue-800">Fabric SDK Call</div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-2xl p-6 shadow-sm">
                  <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Speed Gain</div>
                  <div className="text-4xl font-bold text-purple-700">
                    {singleAssetResult.source === 'cache' && singleAssetResult.improvement > 0
                      ? `${singleAssetResult.improvement}%`
                      : 'N/A'}
                  </div>
                  <div className="text-sm text-purple-600 font-medium mt-1">faster</div>
                  <div className="mt-3 text-sm font-semibold text-purple-800">
                    {singleAssetResult.source === 'cache' && singleAssetResult.speedup > 0
                      ? `${singleAssetResult.speedup}x Speedup`
                      : 'No Benefit'}
                  </div>
                </div>
              </div>

              {singleAssetResult.source !== 'cache' && (
                <div className="mt-5 bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                  <p className="text-sm text-amber-800 font-medium">
                    ⚠️ Asset not in cache. Run worker to pre-cache eligible assets.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Custom Shipment Creator */}
        <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Custom Shipment Creator
          </h2>
          <p className="text-slate-600 mb-5">
            Create a shipment with custom parameters to test pre-caching rules
          </p>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-sm text-slate-700 mb-2 font-semibold">Status</label>
              <select
                value={customShipment.status}
                onChange={(e) => setCustomShipment({ ...customShipment, status: e.target.value, owner: '' })}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 bg-white font-medium transition-all"
              >
                <option value="transit">In-Transit (Hot)</option>
                <option value="disputed">Disputed (Hot)</option>
                <option value="delivered">Delivered (Cold)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-700 mb-2 font-semibold">Owner Pattern</label>
              <select
                value={customShipment.owner}
                onChange={(e) => setCustomShipment({ ...customShipment, owner: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 bg-white font-medium transition-all"
              >
                {customShipment.status === 'transit' && (
                  <>
                    <option value="">Auto-select</option>
                    <option value="Customs-Transit-Approaching">Near Checkpoint</option>
                    <option value="Distributor-Transit-Highway">On Highway</option>
                    <option value="Warehouse-Transit-Loading">Loading</option>
                  </>
                )}
                {customShipment.status === 'disputed' && (
                  <>
                    <option value="">Auto-select</option>
                    <option value="Customs-Disputed-QualityIssue">Quality Issue</option>
                    <option value="Customs-Disputed-Documentation">Documentation</option>
                    <option value="Legal-Disputed-Ownership">Ownership Dispute</option>
                  </>
                )}
                {customShipment.status === 'delivered' && (
                  <>
                    <option value="">Auto-select</option>
                    <option value="Warehouse-Final-Delivered">Warehouse</option>
                    <option value="RetailStore-Delivered">Retail Store</option>
                    <option value="Customer-Delivered">Customer</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-700 mb-2 font-semibold">Value ($)</label>
              <input
                type="number"
                value={customShipment.value}
                onChange={(e) => setCustomShipment({ ...customShipment, value: e.target.value })}
                min="1000"
                max="1000000"
                step="1000"
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 bg-white font-medium transition-all"
              />
              <div className="text-xs text-slate-600 mt-2 font-medium">
                {parseInt(customShipment.value) >= 50000 ? '✓ High value (≥$50k)' : 'Standard value'}
              </div>
            </div>
          </div>

          <button
            onClick={createCustomShipment}
            disabled={creatingCustom}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            {creatingCustom ? 'Creating...' : 'Create Custom Shipment'}
          </button>

          {customResult && (
            <div className="mt-6 border-2 border-slate-200 rounded-2xl p-5 bg-slate-50">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Asset ID</div>
                  <div className="text-sm font-mono font-bold text-slate-900">{customResult.id}</div>
                </div>
                <span className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm ${
                  customResult.expectedCache
                    ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300'
                    : 'bg-slate-200 text-slate-700 border-2 border-slate-300'
                }`}>
                  {customResult.expectedCache ? '🔥 HOT - Will Cache' : '❄️ COLD - No Cache'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</div>
                  <div className="text-slate-900 font-semibold mt-1">{customResult.owner}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</div>
                  <div className="text-slate-900 font-semibold mt-1">${customResult.value}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</div>
                  <div className="text-slate-900 font-semibold mt-1 capitalize">{customResult.status}</div>
                </div>
              </div>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Cache Prediction</div>
                <div className="text-sm text-blue-900 font-medium">{customResult.reason}</div>
              </div>

              {customResult.expectedCache && (
                <div className="mt-4 text-sm text-slate-700 bg-slate-100 border border-slate-300 rounded-xl p-3 font-medium">
                  💡 Run worker to pre-cache this asset, then check Cache Contents table
                </div>
              )}
            </div>
          )}

          {/* Rule Reference */}
          <div className="mt-5 bg-slate-100 border-2 border-slate-200 rounded-xl p-5">
            <div className="text-sm text-slate-900 font-bold mb-3">Pre-Caching Rules</div>
            <div className="text-sm text-slate-700 space-y-2 font-medium">
              <div>• <strong className="text-red-600">Policy 01:</strong> DISPUTED status → Always cache (highest priority)</div>
              <div>• <strong className="text-amber-600">Rule 02:</strong> In-Transit + Near Checkpoint + High Value → Cache 900s</div>
              <div>• <strong className="text-blue-600">Rule 03:</strong> In-Transit + High Value → Cache 600s</div>
              <div>• <strong className="text-emerald-600">Rule 04:</strong> In-Transit → Cache 300s</div>
              <div>• <strong className="text-slate-600">Delivered:</strong> Cold data → No pre-cache</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-2xl p-5 shadow-sm">
            <p className="text-red-800 font-semibold">Error: {error}</p>
          </div>
        )}

        {/* Asset Tables */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Blockchain Assets */}
          <div className="bg-white shadow-sm rounded-2xl p-6 border border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Blockchain Assets ({blockchainAssets.length})
            </h2>
            <div className="overflow-auto max-h-96 border-2 border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr className="text-left border-b-2 border-slate-200">
                    <th className="p-4 text-slate-700 font-bold">Asset ID</th>
                    <th className="p-4 text-slate-700 font-bold">Owner</th>
                    <th className="p-4 text-slate-700 font-bold">Value</th>
                    <th className="p-4 text-slate-700 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {getPaginatedData(blockchainAssets, blockchainPage).map((asset) => (
                    <tr key={asset.ID} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono text-xs font-semibold text-slate-800">{asset.ID}</td>
                      <td className="p-4 text-xs text-slate-700 font-medium">{asset.Owner}</td>
                      <td className="p-4 text-slate-900 font-semibold">${asset.AppraisedValue}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1.5 text-xs font-bold rounded-lg ${
                          asset.Status === 'In-Transit' ? 'bg-emerald-100 text-emerald-700' :
                          asset.Status === 'DISPUTED' ? 'bg-red-100 text-red-700' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {asset.Status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={blockchainPage}
              totalItems={blockchainAssets.length}
              onPageChange={setBlockchainPage}
            />
          </div>

          {/* Cache Contents */}
          <div className="bg-white shadow-sm rounded-2xl p-6 border border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Cache Contents ({cacheAssets.length})
            </h2>
            <div className="overflow-auto max-h-96 border-2 border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr className="text-left border-b-2 border-slate-200">
                    <th className="p-4 text-slate-700 font-bold">Asset ID</th>
                    <th className="p-4 text-slate-700 font-bold">Rule</th>
                    <th className="p-4 text-slate-700 font-bold">TTL</th>
                    <th className="p-4 text-slate-700 font-bold">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {getPaginatedData(cacheAssets, cachePage).map((item, idx) => {
                    const ageSeconds = Math.floor((Date.now() - item.timestamp) / 1000);
                    return (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-mono text-xs font-semibold text-slate-800">{item.assetId}</td>
                        <td className="p-4 text-xs text-slate-700 font-medium">{item.rule}</td>
                        <td className="p-4 text-slate-900 font-semibold">{item.ttl}s</td>
                        <td className="p-4 text-xs text-slate-600 font-medium">{ageSeconds}s ago</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={cachePage}
              totalItems={cacheAssets.length}
              onPageChange={setCachePage}
            />
          </div>
        </div>

        {/* Step 1: Create Shipments */}
        <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Step 1: Generate Test Shipments
          </h2>
          <p className="text-slate-600 mb-5">
            Create 30 blockchain shipments: 20 in-transit, 5 disputed, 5 delivered
          </p>

          <button
            onClick={createTestShipments}
            disabled={sessionState === 'creating'}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            {sessionState === 'creating' ? 'Creating Shipments...' : 'Create 30 Test Shipments'}
          </button>

          {sessionData && (
            <div className="mt-5 grid grid-cols-4 gap-4">
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total</div>
                <div className="text-3xl font-bold text-slate-900">{sessionData.totalShipments}</div>
              </div>
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">In-Transit</div>
                <div className="text-3xl font-bold text-emerald-700">{sessionData.transitCount}</div>
              </div>
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Disputed</div>
                <div className="text-3xl font-bold text-red-700">{sessionData.disputedCount}</div>
              </div>
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Delivered</div>
                <div className="text-3xl font-bold text-slate-700">{sessionData.deliveredCount}</div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Worker & Benchmark */}
        <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Step 2: Execute Worker & Benchmark
          </h2>
          <p className="text-slate-600 mb-5">
            Run worker to pre-cache eligible assets, then benchmark performance
          </p>

          <div className="flex gap-4">
            <button
              onClick={runWorkerOnly}
              disabled={runningWorker || !canRunWorker}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              {runningWorker ? 'Running Worker...' : 'Run Worker'}
            </button>

            <button
              onClick={runBenchmark}
              disabled={runningBenchmark || !canRunBenchmark}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              {runningBenchmark ? 'Running Benchmark...' : 'Run Batch Benchmark'}
            </button>
          </div>

          {!canRunWorker && (
            <div className="mt-4 text-sm text-amber-800 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 font-medium">
              ⚠️ No hot assets on blockchain. Create test shipments first.
            </div>
          )}

          {canRunWorker && !canRunBenchmark && !workerResult && (
            <div className="mt-4 text-sm text-blue-800 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 font-medium">
              ℹ️ Run worker first to pre-cache assets before benchmarking
            </div>
          )}

          {workerResult && (
            <div className="mt-5 grid grid-cols-4 gap-4">
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">In-Transit Found</div>
                <div className="text-2xl font-bold text-emerald-700">{workerResult.inTransitCount}</div>
              </div>
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Disputed Found</div>
                <div className="text-2xl font-bold text-red-700">{workerResult.disputedCount}</div>
              </div>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Pre-Cached</div>
                <div className="text-2xl font-bold text-blue-700">{workerResult.preCached}</div>
              </div>
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Skipped</div>
                <div className="text-2xl font-bold text-slate-700">{workerResult.skipped}</div>
              </div>
            </div>
          )}
        </div>

        {/* Benchmark Results */}
        {benchmarkResult && (
          <div className="bg-white shadow-sm rounded-2xl p-6 mb-6 border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Batch Benchmark Results
            </h2>
            <p className="text-slate-600 mb-5">
              Performance analysis of {benchmarkResult.totalTested} hot assets
            </p>

            <div className="grid grid-cols-3 gap-5">
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-2xl p-6 shadow-sm">
                <div className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-3">Avg Redis Lookup</div>
                <div className="text-5xl font-bold text-emerald-700 mb-1">
                  {benchmarkResult.avgCacheLatency !== null
                    ? `${benchmarkResult.avgCacheLatency.toFixed(2)}`
                    : 'N/A'}
                </div>
                <div className="text-sm text-emerald-600 font-semibold">milliseconds</div>
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-2xl p-6 shadow-sm">
                <div className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-3">Avg Blockchain Query</div>
                <div className="text-5xl font-bold text-blue-700 mb-1">
                  {benchmarkResult.avgBlockchainLatency !== null
                    ? `${benchmarkResult.avgBlockchainLatency.toFixed(2)}`
                    : 'N/A'}
                </div>
                <div className="text-sm text-blue-600 font-semibold">milliseconds</div>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-2xl p-6 shadow-sm">
                <div className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-3">Performance Gain</div>
                <div className="text-5xl font-bold text-purple-700 mb-1">
                  {benchmarkResult.speedup && benchmarkResult.avgCacheLatency && benchmarkResult.avgBlockchainLatency
                    ? `${(((benchmarkResult.avgBlockchainLatency - benchmarkResult.avgCacheLatency) / benchmarkResult.avgBlockchainLatency) * 100).toFixed(1)}%`
                    : 'N/A'}
                </div>
                <div className="text-sm text-purple-600 font-semibold">
                  {benchmarkResult.speedup ? `${benchmarkResult.speedup}x faster` : 'No data'}
                </div>
              </div>
            </div>

            <div className="mt-5 text-sm text-slate-700 bg-slate-100 border-2 border-slate-200 rounded-xl p-4 font-semibold">
              Cache Hits: {benchmarkResult.cacheHits} | Cache Misses: {benchmarkResult.cacheMisses}
            </div>
          </div>
        )}

        {(workerResult || benchmarkResult || singleAssetResult) && (
          <div className="text-center">
            <button
              onClick={resetDemo}
              className="px-6 py-3 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold shadow-sm hover:shadow transition-all"
            >
              Clear Results (Keep Assets)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
