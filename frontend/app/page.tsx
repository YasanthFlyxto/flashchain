'use client';
import { useState } from 'react';

export default function Home() {
  const [assetId, setAssetId] = useState('asset1');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const queryAsset = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3000/api/asset/${assetId}`);
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">🚀 FlashChain Dashboard</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Query Asset</h2>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="border px-4 py-2 rounded flex-1"
              placeholder="Enter asset ID (e.g., asset1)"
            />
            <button
              onClick={queryAsset}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Query'}
            </button>
          </div>
          
          {result && (
            <div className="mt-4">
              <div className="flex gap-4 mb-2">
                <span className="font-semibold">Source:</span>
                <span className={result.source === 'cache' ? 'text-green-600' : 'text-blue-600'}>
                  {result.source === 'cache' ? '⚡ Cache Hit' : '🔗 Blockchain'}
                </span>
              </div>
              <div className="flex gap-4 mb-2">
                <span className="font-semibold">Latency:</span>
                <span>{result.latency}</span>
              </div>
              <pre className="bg-gray-100 p-4 rounded mt-4 overflow-x-auto text-sm">
                {JSON.stringify(result.data || result.error, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">📊 Performance Metrics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded p-4">
              <div className="text-3xl font-bold text-green-600">99.93%</div>
              <div className="text-gray-600">Cache Hit Rate</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-3xl font-bold text-blue-600">96%</div>
              <div className="text-gray-600">Latency Reduction</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-3xl font-bold text-purple-600">2ms</div>
              <div className="text-gray-600">Avg Cache Latency</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-3xl font-bold text-orange-600">50/s</div>
              <div className="text-gray-600">Throughput</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
