"use client";

import { useState, useRef, useEffect } from "react";
import type { DiscoveryReport, DiscoveryItem, DiscoveryProgress } from "@/lib/discover";
import { LANE_LABEL } from "@/lib/targeting";
import { deadlineColor } from "@/lib/stages";
import {
  GRADE_STYLE,
  GRADE_LABEL,
  ROW_GRID,
  daysFromText,
  DetailPanel,
  type Detail,
} from "@/components/GrantDetail";

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
  const [detail, setDetail] = useState<Detail | null>(null);
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

  async function dismiss(item: { key: string; title: string; received?: boolean; funder?: string; url?: string }) {
    setReport((r) => (r ? { ...r, items: r.items.filter((i) => i.key !== item.key) } : r));
    await fetch("/api/scout/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
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

  const itemDetail = (item: DiscoveryItem): Detail => ({
    id: item.key,
    title: item.program,
    sub: `${item.funder} · ${item.kind}`,
    url: item.url,
    deadlineText: item.deadline || "not stated",
    days: daysFromText(item.deadline),
    grade: item.grade,
    reason: item.reason,
    lane: item.lane,
    amount: item.amount || undefined,
    nextStep: item.next_step || undefined,
    isNew: false,
    pipelineHref: `/opportunities/new?title=${encodeURIComponent(item.program)}&agency=${encodeURIComponent(item.funder)}&url=${encodeURIComponent(item.url)}`,
    dismissPayload: { key: item.key, title: `${item.funder} — ${item.program}` },
    watchUrl: item.watch_url || undefined,
  });

  return (
    <section className={"card p-4 space-y-3 transition-[margin] " + (detail ? "lg:mr-[460px]" : "")}>
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
          {report.items.length > 0 && (
            <div className="rounded-xl border border-gray-200 divide-y">
              <div className={`sticky top-0 z-10 ${ROW_GRID} px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-xl text-[10px] font-semibold uppercase tracking-wide text-gray-500`}>
                <span>Lead</span>
                <span>Lane</span>
                <span className="text-right">Deadline</span>
                <span className="text-center">Fit</span>
                <span />
              </div>
              {report.items.map((item) => (
                <div
                  key={item.key}
                  onClick={() => setDetail(itemDetail(item))}
                  className={`${ROW_GRID} px-3 py-2.5 cursor-pointer hover:bg-gray-50 ` + (detail?.id === item.key ? "bg-emerald-50" : "")}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.program}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {item.funder} · {item.kind}
                      {item.reason ? <span className="italic"> — {item.reason}</span> : null}
                    </div>
                  </div>
                  <span className="min-w-0">
                    {item.lane && item.lane !== "other" && (
                      <span className="inline-block max-w-full truncate rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px] font-semibold">
                        {LANE_LABEL[item.lane] ?? item.lane}
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    {daysFromText(item.deadline) !== null ? (
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${deadlineColor(daysFromText(item.deadline))}`}>
                        {daysFromText(item.deadline)}d left
                      </span>
                    ) : (
                      <span className="inline-block max-w-full truncate text-[10px] text-gray-400">{item.deadline || "no deadline"}</span>
                    )}
                  </span>
                  <span className="text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLE[item.grade] ?? "bg-gray-100 text-gray-700"}`}>
                      {GRADE_LABEL[item.grade] ?? item.grade}
                    </span>
                  </span>
                  <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    {item.watch_url && (
                      <button
                        onClick={() => watch(item)}
                        disabled={watched.has(item.key)}
                        className="shrink-0 rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:text-emerald-700"
                        title="Add this funder's page to the automatic watch list"
                      >
                        {watched.has(item.key) ? "✓" : "+ watch"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        dismiss({ key: item.key, title: `${item.funder} — ${item.program}` });
                        if (detail?.id === item.key) setDetail(null);
                      }}
                      className="shrink-0 rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-400 hover:text-red-600 hover:border-red-300"
                      title="Dismiss forever"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Lead detail panel — same right-docked panel as the scout lists */}
      <DetailPanel
        detail={detail}
        onClose={() => setDetail(null)}
        onDismiss={(d) => {
          dismiss({ key: d.dismissPayload.key ?? d.id, title: d.dismissPayload.title });
          setDetail(null);
        }}
        onReceived={(d) => {
          dismiss({ key: d.dismissPayload.key ?? d.id, title: d.dismissPayload.title, received: true, funder: d.sub, url: d.url });
          setDetail(null);
        }}
        onWatch={(d) => {
          const item = report?.items.find((i) => i.key === d.id);
          if (item) watch(item);
        }}
        watched={detail ? watched.has(detail.id) : false}
      />
    </section>
  );
}
