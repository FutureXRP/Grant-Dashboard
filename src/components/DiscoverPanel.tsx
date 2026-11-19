"use client";

import { useState, useRef, useEffect } from "react";
import type { DiscoveryReport, DiscoveryItem, DiscoveryProgress } from "@/lib/discover";

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
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // The poll loop is the source of truth for completion — hosted gateways
  // (Vercel, proxies) can cut the long-running POST even while the run
  // continues server-side, which used to leave this spinner stuck forever.
  async function run() {
    setRunning(true);
    setError("");
    setProgressLabel("");
    const startedAt = Date.now();
    const prevRanAt = report?.ranAt ?? null;
    let sawActive = false;
    let lastActiveAt = Date.now();
    let finished = false;

    const finish = (r: DiscoveryReport | null, errMsg?: string) => {
      if (finished) return;
      finished = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (r) setReport(r);
      if (errMsg) setError(errMsg);
      setProgressLabel("");
      setRunning(false);
    };

    pollRef.current = setInterval(async () => {
      if (finished) return;
      try {
        const res = await fetch("/api/scout/discover");
        const data = (await res.json()) as { report?: DiscoveryReport | null; progress?: DiscoveryProgress | null };
        const p = data.progress ?? null;
        if (p?.active) {
          sawActive = true;
          lastActiveAt = Date.now();
          setProgressLabel(p.label);
          return;
        }
        // Not active: if a fresh report exists, the run finished.
        if (data.report && data.report.ranAt !== prevRanAt) {
          finish(data.report);
          return;
        }
        // Progress went quiet with no new report — the host likely killed the
        // run. Give it a grace period, then say so instead of spinning forever.
        if (sawActive && Date.now() - lastActiveAt > 120000) {
          finish(null, "The run was cut off before finishing (hosting time limit). Run it again — results land here when a run completes.");
        }
      } catch {
        /* transient poll error — keep going */
      }
      if (!finished && Date.now() - startedAt > 7 * 60 * 1000) {
        finish(null, "Timed out waiting for the sweep to finish. Run it again in a minute.");
      }
    }, 2500);

    // Drive the run as a series of SHORT server steps (one bounded model call
    // each) — a single long request used to outlive Vercel's function cap and
    // die mid-research. The poll loop above stays as a safety net if a step's
    // response is lost.
    try {
      let reset = true;
      for (let i = 0; i < 8 && !finished; i++) {
        const res = await fetch("/api/scout/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step", reset }),
        });
        reset = false;
        const text = await res.text();
        let data: { done?: boolean; round?: number; searchesUsed?: number; report?: DiscoveryReport; error?: string } = {};
        try {
          data = JSON.parse(text);
        } catch {
          /* gateway page, not JSON — let the poll loop decide */
          return;
        }
        if (!res.ok) {
          finish(null, data.error || "Discovery step failed");
          return;
        }
        if (data.done && data.report) {
          finish(data.report);
          return;
        }
        setProgressLabel(`Research round ${data.round ?? i + 1} done (${data.searchesUsed ?? "…"} searches) — continuing…`);
      }
      if (!finished) finish(null, "Research did not converge — run the sweep again.");
    } catch {
      /* connection cut mid-step — poll loop takes over */
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
          {running && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {running ? progressLabel || "Starting the sweep…" : "🔎 Run discovery sweep"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!report && !running && (
        <p className="text-sm text-gray-500">No sweep run yet.</p>
      )}
      {report && (
        <>
          <p className="text-xs text-gray-400" suppressHydrationWarning>
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
