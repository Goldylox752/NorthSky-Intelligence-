import { useState } from "react";

export default function NorthSkyDashboard() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const API_BASE = "https://northsky-ai.onrender.com";
  const API_KEY = "YOUR_REAL_API_KEY";

  async function handleRip() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `${API_BASE}/rip?url=${encodeURIComponent(url)}`,
        {
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-sky-400 mb-2">
          NorthSky AI Engine
        </h1>
        <p className="text-slate-400 mb-6">
          Enter a URL to extract metadata or media
        </p>

        <div className="flex gap-2">
          <input
            className="w-full p-3 rounded bg-slate-800 border border-slate-700"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={handleRip}
            className="px-5 py-3 bg-sky-500 hover:bg-sky-600 rounded font-semibold"
          >
            {loading ? "Ripping..." : "Rip"}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/40 border border-red-500 rounded">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 bg-slate-900 border border-slate-700 rounded">
            <h2 className="text-xl font-semibold mb-2">Result</h2>
            <pre className="text-xs overflow-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
