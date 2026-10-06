"use client";

import { useState } from "react";
import type { DiscoveryReport, DiscoveryItem } from "@/lib/discover";

const GRADE_STYLE: Record<string, string> = {
  strong_fit: "bg-green-100 text-green-800",
  possible_fit: "bg-blue-100 text-blue-800",
};

export default function DiscoverPanel({
  initialReport,
  aiReady,
}: {
  initialReport: DiscoveryReport | null;
  aiReady: boolean;
}) {
  const [report, setReport] = useState<DiscoveryReport | null>(initialReport);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [watched, setWatched] = useState<Set<string>>(new Set());

  async function run() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/scout/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Discovery failed");
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  async function dismiss(item: DiscoveryItem) {
    setReport((r) => (r ? { ...r, items: r.items.filter((i) => i.key !== item.key) } : r));
    await fetch("/api/scout/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: item.key, title: `${item.funder} — ${item.program}` }),
    });
  }

  async function watch(item: DiscoveryItem) {
    const res = await fetch("/api/scout/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "watch", name: `${item.funder} — opportunities`, url: item.watch_url, kind: item.kind === "corporate" ? "corporate" : item.kind === "state" ? "state" : "foundation" }),
    });
    if (res.ok) setWatched((w) => new Set(w).add(item.key));
  }

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold">Deep discovery — AI web research</h2>
          <p className="text-xs text-gray-500 max-w-2xl">
            Hunts the open web the way your team does by hand: corporate giving (Walmart, Lowe&apos;s, utilities…),
            TSET-style quasi-public funders, and foundation cycles the watch list doesn&apos;t cover. On-demand only —
            each sweep makes one AI research run (roughly $0.50–$1.50) and never repeats dismissed leads.
          </p>
        </div>
        <button className="btn" onClick={run} disabled={running || !aiReady} title={aiReady ? "" : "Set ANTHROPIC_API_KEY to enable"}>
          {running ? "Researching the web… (1–3 min)" : "🔎 Run discovery sweep"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!report && !running && (
        <p className="text-sm text-gray-500">No sweep run yet.</p>
      )}
      {report && (
        <>
          <p className="text-xs text-gray-400">
            Last sweep {new Date(report.ranAt).toLocaleString()} · {report.searchesUsed} web searches ·{" "}
            {report.items.length} leads
          </p>
          {report.summary && <p className="text-sm bg-gray-50 border border-gray-100 rounded p-2">{report.summary}</p>}
          <ul className="space-y-2">
            {report.items.map((item) => (
              <li key={item.key} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${GRADE_STYLE[item.grade] ?? "bg-gray-100 text-gray-700"}`}>
                        {item.grade === "strong_fit" ? "strong fit" : "possible fit"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-400">{item.kind}</span>
                      <span className="font-semibold text-sm">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {item.funder} — {item.program}
                          </a>
                        ) : (
                          `${item.funder} — ${item.program}`
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{item.reason}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Deadline: {item.deadline || "not stated"} · Amount: {item.amount || "not stated"} ·{" "}
                      <span className="text-emerald-700">{item.next_step}</span>
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {item.watch_url && (
                      <button
                        onClick={() => watch(item)}
                        disabled={watched.has(item.key)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:text-emerald-700"
                        title="Add this funder's page to the automatic watch list"
                      >
                        {watched.has(item.key) ? "✓ watching" : "+ watch"}
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(item)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-400 hover:text-red-600 hover:border-red-300"
                      title="Dismiss forever"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
