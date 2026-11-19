"use client";

import { useState } from "react";
import Link from "next/link";
import { deadlineColor } from "@/lib/stages";
import { daysFromText, ROW_GRID } from "@/components/GrantDetail";
import type { SearchRow } from "@/lib/grantsearch";

const SUGGESTED = [
  "early childhood education",
  "food pantry food insecurity",
  "community health clinic",
  "playground outdoor recreation",
  "youth sports facilities",
  "general operating support",
  "underserved children families",
  "diabetes prevention",
];

const SOURCE_LABEL: Record<string, string> = {
  federal: "Grants.gov",
  kindora: "Kindora",
  granted: "Granted",
};
const SOURCE_STYLE: Record<string, string> = {
  federal: "bg-blue-100 text-blue-800",
  kindora: "bg-purple-100 text-purple-800",
  granted: "bg-amber-100 text-amber-800",
};

function toISO(d: string): string {
  let m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  m = d.match(/^\d{4}-\d{2}-\d{2}$/);
  return m ? d : "";
}

export default function Discover() {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [useFederal, setUseFederal] = useState(true);
  const [useKindora, setUseKindora] = useState(true);
  const [useGranted, setUseGranted] = useState(true);

  async function search(kw: string) {
    setLoading(true);
    setError("");
    setErrors([]);
    setKeyword(kw);
    const sources = [
      ...(useFederal ? ["federal"] : []),
      ...(useKindora ? ["kindora"] : []),
      ...(useGranted ? ["granted"] : []),
    ];
    try {
      const res = await fetch("/api/discover-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, sources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setRows(data.rows);
      setErrors(data.errors ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Discover — live grant search</h1>
      <p className="text-sm text-gray-500 max-w-3xl">
        One search across three live databases: <strong>Grants.gov</strong> (federal), <strong>Kindora</strong>{" "}
        (foundation programs + state grants, Tulsa-County-aware), and <strong>Granted</strong> (140K federal, state &
        foundation grants). All free — no AI spend. Funders already in your system get a{" "}
        <span className="rounded bg-emerald-100 text-emerald-800 px-1 text-[10px] font-bold">tracked</span> badge.
        Verify deadlines on the funder&apos;s page before planning around them.
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
          placeholder="e.g. food pantry, early childhood, playground"
        />
        <button className="btn" disabled={loading}>
          {loading && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" />
          )}
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-600">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={useFederal} onChange={(e) => setUseFederal(e.target.checked)} />
          Grants.gov (federal)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={useKindora} onChange={(e) => setUseKindora(e.target.checked)} />
          Kindora (foundations + state)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={useGranted} onChange={(e) => setUseGranted(e.target.checked)} />
          Granted (grant database)
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button key={s} onClick={() => search(s)} className="btn-secondary text-xs" disabled={loading}>
            {s}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {errors.map((e, i) => (
        <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠ {e}</p>
      ))}
      {rows && (
        <div className="card divide-y">
          <div className={`sticky top-0 z-10 ${ROW_GRID} px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-xl text-[10px] font-semibold uppercase tracking-wide text-gray-500`}>
            <span>Opportunity</span>
            <span>Source</span>
            <span className="text-right">Deadline</span>
            <span className="text-center">Amount</span>
            <span />
          </div>
          {rows.length === 0 && <p className="p-4 text-sm text-gray-500">No results for “{keyword}”.</p>}
          {rows.map((r, i) => {
            const days = daysFromText(r.deadline);
            return (
              <div key={i} className={`${ROW_GRID} px-3 py-2.5`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline truncate">
                        {r.title}
                      </a>
                    ) : (
                      <span className="text-sm font-medium truncate">{r.title}</span>
                    )}
                    {r.tracked && (
                      <span className="shrink-0 rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-bold" title="This funder is already in your Funders list">
                        tracked
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {r.funder}
                    {r.description ? <span className="italic"> — {r.description}</span> : null}
                  </div>
                </div>
                <span>
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${SOURCE_STYLE[r.source]}`}>
                    {SOURCE_LABEL[r.source]}
                  </span>
                  {r.kind !== "federal" && (
                    <span className="ml-1 text-[10px] text-gray-400">{r.kind}</span>
                  )}
                </span>
                <span className="text-right">
                  {days !== null ? (
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${deadlineColor(days)}`}>
                      {days < 0 ? "passed" : `${days}d left`}
                    </span>
                  ) : (
                    <span className="inline-block max-w-full truncate text-[10px] text-gray-400">{r.deadline || "not stated"}</span>
                  )}
                </span>
                <span className="text-center text-xs text-gray-600 truncate">{r.amount || ""}</span>
                <div className="flex justify-end">
                  <Link
                    href={`/opportunities/new?title=${encodeURIComponent(r.title)}&agency=${encodeURIComponent(r.funder)}&url=${encodeURIComponent(r.url)}&deadline=${encodeURIComponent(toISO(r.deadline))}`}
                    className="btn-secondary text-xs shrink-0"
                  >
                    + Pipeline
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows && rows.length > 0 && (
        <p className="text-[10px] text-gray-400">
          Results from Grants.gov, Kindora (kindora.co), and Granted (grantedai.com). Candid research runs through the
          team&apos;s Claude connectors.
        </p>
      )}
    </div>
  );
}
