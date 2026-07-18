"use client";

import { useState } from "react";
import Link from "next/link";
import type { ScoutReport, ScoutHit } from "@/lib/scout";

const GRADE_STYLE: Record<string, string> = {
  strong_fit: "bg-green-100 text-green-800",
  possible_fit: "bg-blue-100 text-blue-800",
  unlikely: "bg-gray-100 text-gray-600",
  not_eligible: "bg-red-100 text-red-700",
};
const GRADE_LABEL: Record<string, string> = {
  strong_fit: "strong fit",
  possible_fit: "possible fit",
  unlikely: "unlikely",
  not_eligible: "not eligible",
};

export default function ScoutPanel({
  initialReport,
  initialKeywords,
  saveKeywords,
}: {
  initialReport: ScoutReport | null;
  initialKeywords: string;
  saveKeywords: (formData: FormData) => Promise<void>;
}) {
  const [report, setReport] = useState<ScoutReport | null>(initialReport);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [hideUnlikely, setHideUnlikely] = useState(true);

  async function run() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/scout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scout run failed");
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scout run failed");
    } finally {
      setRunning(false);
    }
  }

  const visible: ScoutHit[] = (report?.hits ?? []).filter(
    (h) => !hideUnlikely || !h.grade || h.grade === "strong_fit" || h.grade === "possible_fit"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn" onClick={run} disabled={running}>
          {running ? "Sweeping Grants.gov…" : "Run scout now"}
        </button>
        {report && (
          <span className="text-xs text-gray-500">
            Last run {new Date(report.ranAt).toLocaleString()} — {report.totalFound} open opportunities,{" "}
            {report.newCount} new since last sweep
          </span>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={hideUnlikely} onChange={(e) => setHideUnlikely(e.target.checked)} />
          hide unlikely / not-eligible
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {report?.errors && report.errors.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 space-y-0.5">
          {report.errors.map((e, i) => (
            <p key={i}>⚠ {e}</p>
          ))}
        </div>
      )}

      {report?.summary && (
        <div className="card p-4 bg-emerald-50 border-emerald-200">
          <h3 className="text-sm font-bold mb-1">Morning summary</h3>
          <p className="text-sm">{report.summary}</p>
        </div>
      )}

      {report && (
        <div className="card divide-y">
          {visible.length === 0 && (
            <p className="p-4 text-sm text-gray-500">Nothing to show{hideUnlikely ? " (unlikely/not-eligible hidden)" : ""}.</p>
          )}
          {visible.map((h) => (
            <div key={h.number} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {h.isNew && (
                    <span className="shrink-0 rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">NEW</span>
                  )}
                  <a href={h.url} target="_blank" className="text-sm font-medium hover:underline truncate">
                    {h.title}
                  </a>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {h.agency} · {h.number} · {h.status}
                  {h.closeDate ? ` · closes ${h.closeDate}` : ""} · matched “{h.keyword}”
                </div>
                {h.reason && <div className="text-xs text-gray-600 mt-0.5 italic">{h.reason}</div>}
              </div>
              {h.grade && (
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLE[h.grade]}`}>
                  {GRADE_LABEL[h.grade]}
                </span>
              )}
              <Link
                href={`/opportunities/new?title=${encodeURIComponent(h.title)}&agency=${encodeURIComponent(h.agency)}&number=${encodeURIComponent(h.number)}&url=${encodeURIComponent(h.url)}&deadline=${encodeURIComponent(toISO(h.closeDate))}`}
                className="btn-secondary text-xs shrink-0"
              >
                + Pipeline
              </Link>
            </div>
          ))}
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer p-3 text-sm font-medium">Search keywords ({initialKeywords.split("\n").filter(Boolean).length})</summary>
        <form action={saveKeywords} className="px-4 pb-4 space-y-2">
          <p className="text-xs text-gray-500">One keyword phrase per line. The scout runs every phrase against Grants.gov and merges the results.</p>
          <textarea name="keywords" rows={8} defaultValue={initialKeywords} className="input font-mono text-xs" />
          <button className="btn-secondary">Save keywords</button>
        </form>
      </details>
    </div>
  );
}

function toISO(d: string): string {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}
