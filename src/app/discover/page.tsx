"use client";

import { useState } from "react";
import Link from "next/link";

type Result = {
  id: string | number;
  number: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  status: string;
  url: string;
};

const SUGGESTED = [
  "community health",
  "early childhood education",
  "rural health",
  "behavioral health",
  "diabetes prevention",
  "family services Oklahoma",
  "youth wellness",
  "childcare facilities",
];

export default function Discover() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(kw: string) {
    setLoading(true);
    setError("");
    setKeyword(kw);
    try {
      const res = await fetch("/api/grantsgov", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Discover — Grants.gov</h1>
      <p className="text-sm text-gray-500">
        Live search of the free federal Grants.gov database (posted + forecasted). Foundation opportunities aren&apos;t
        here — use the Funder database and each foundation&apos;s site for those.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (keyword.trim()) search(keyword.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="input flex-1"
          placeholder="e.g. community health workers"
        />
        <button className="btn" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button key={s} onClick={() => search(s)} className="btn-secondary text-xs" disabled={loading}>
            {s}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {results && (
        <div className="card divide-y">
          {results.length === 0 && <p className="p-4 text-sm text-gray-500">No results for “{keyword}”.</p>}
          {results.map((r) => (
            <div key={String(r.id) + r.number} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <a href={r.url} target="_blank" className="text-sm font-medium hover:underline block truncate">
                  {r.title}
                </a>
                <div className="text-xs text-gray-500">
                  {r.agency} · {r.number} · {r.status}
                  {r.closeDate ? ` · closes ${r.closeDate}` : ""}
                </div>
              </div>
              <Link
                href={`/opportunities/new?title=${encodeURIComponent(r.title)}&agency=${encodeURIComponent(r.agency)}&number=${encodeURIComponent(r.number)}&url=${encodeURIComponent(r.url)}&deadline=${encodeURIComponent(toISO(r.closeDate))}`}
                className="btn-secondary text-xs shrink-0"
              >
                + Add to pipeline
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toISO(d: string): string {
  // Grants.gov returns MM/DD/YYYY
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}
