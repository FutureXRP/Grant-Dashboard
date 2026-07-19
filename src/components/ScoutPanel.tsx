"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { ScoutReport, ScoutHit, WatchSource, ScoutProgress } from "@/lib/scout";

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

const KIND_LABEL: Record<string, string> = {
  state: "Oklahoma state",
  foundation: "Foundation",
  native: "Native funders",
};

export default function ScoutPanel({
  initialReport,
  initialKeywords,
  sources,
  saveKeywords,
  addSource,
  editSource,
  deleteSource,
  toggleSource,
}: {
  initialReport: ScoutReport | null;
  initialKeywords: string;
  sources: WatchSource[];
  saveKeywords: (formData: FormData) => Promise<void>;
  addSource: (formData: FormData) => Promise<void>;
  editSource: (formData: FormData) => Promise<void>;
  deleteSource: (formData: FormData) => Promise<void>;
  toggleSource: (formData: FormData) => Promise<void>;
}) {
  const [report, setReport] = useState<ScoutReport | null>(initialReport);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScoutProgress | null>(null);
  const [error, setError] = useState("");
  const [hideUnlikely, setHideUnlikely] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function run() {
    setRunning(true);
    setError("");
    setProgress(null);
    // Poll live progress while the run is in flight.
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/scout/progress");
        const data = await res.json();
        if (data.progress?.active) setProgress(data.progress);
      } catch {
        /* polling is best-effort */
      }
    }, 1200);
    try {
      const res = await fetch("/api/scout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scout run failed");
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scout run failed");
    } finally {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setProgress(null);
      setRunning(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0;

  const visible: ScoutHit[] = (report?.hits ?? []).filter(
    (h) => !hideUnlikely || !h.grade || h.grade === "strong_fit" || h.grade === "possible_fit"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn" onClick={run} disabled={running}>
          {running && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {running ? "Scouting…" : "Run scout now"}
        </button>
        {!running && report && (
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
      {running && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-3">
            <span className="inline-block w-5 h-5 border-[3px] border-emerald-200 border-t-emerald-700 rounded-full animate-spin shrink-0" />
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">
                  {progress?.label ?? "Starting the sweep…"}
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  {progress ? `${pct}%` : ""}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-2.5 rounded-full bg-emerald-600 transition-all duration-700 ease-out"
                  style={{ width: progress ? `${Math.max(3, pct)}%` : "3%" }}
                />
              </div>
              {progress && (
                <p className="text-xs text-gray-400 mt-1">
                  Step {progress.step} of {progress.total} — federal sweep, page watch, then AI grading
                </p>
              )}
            </div>
          </div>
        </div>
      )}
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

      {/* State / foundation / Native watch results */}
      {report?.watch && (
        <div className="space-y-3">
          <h2 className="font-bold text-lg">State, foundation & Native funder watch</h2>
          {report.watch.summary && (
            <div className="card p-4 bg-blue-50 border-blue-200">
              <p className="text-sm">{report.watch.summary}</p>
            </div>
          )}
          {report.watch.findings.length > 0 && (
            <div className="card divide-y">
              {report.watch.findings
                .filter((f) => !hideUnlikely || !f.grade || f.grade === "strong_fit" || f.grade === "possible_fit")
                .map((f, i) => (
                  <div key={i} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {f.isNew && (
                          <span className="shrink-0 rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-bold">NEW</span>
                        )}
                        <a href={f.url || f.source_url} target="_blank" className="text-sm font-medium hover:underline truncate">
                          {f.title}
                        </a>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {f.source}
                        {f.deadline ? ` · deadline ${f.deadline}` : ""}
                      </div>
                      {f.details && <div className="text-xs text-gray-600 mt-0.5">{f.details}</div>}
                      {f.reason && <div className="text-xs text-gray-600 mt-0.5 italic">{f.reason}</div>}
                    </div>
                    {f.grade && (
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLE[f.grade]}`}>
                        {GRADE_LABEL[f.grade]}
                      </span>
                    )}
                    <Link
                      href={`/opportunities/new?title=${encodeURIComponent(f.title)}&agency=${encodeURIComponent(f.source)}&url=${encodeURIComponent(f.url || f.source_url)}`}
                      className="btn-secondary text-xs shrink-0"
                    >
                      + Pipeline
                    </Link>
                  </div>
                ))}
            </div>
          )}
          <details className="card">
            <summary className="cursor-pointer p-3 text-sm font-medium">
              Watched pages status ({report.watch.sources.filter((s) => s.status === "ok").length}/{report.watch.sources.length} ok)
            </summary>
            <div className="px-4 pb-3 divide-y">
              {report.watch.sources.map((s, i) => (
                <div key={i} className="py-2 flex items-center gap-2 text-xs">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${s.status === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {s.status === "ok" ? (s.changed ? "changed" : "ok") : "error"}
                  </span>
                  <span className="font-medium">{s.name}</span>
                  {s.status !== "ok" && <span className="text-red-600">{s.status} — fix the URL below</span>}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Watched sources manager */}
      <details className="card">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          Watched pages ({sources.filter((s) => s.enabled).length} active)
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">
            The scout fetches each page every run, detects changes, and extracts + grades any funding opportunities on
            it. The starter list covers Oklahoma agencies, the playbook&apos;s foundations, and Native funders — sites
            reorganize, so re-point any source that errors. Add any grants page you want watched.
          </p>
          <div className="divide-y">
            {sources.map((s) => (
              <div key={s.id} className="py-2 flex items-center gap-2 text-sm">
                <span className="text-[10px] text-gray-400 w-20 shrink-0">{KIND_LABEL[s.kind] ?? s.kind}</span>
                <form action={editSource} className="flex-1 flex items-center gap-2 min-w-0">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    name="name"
                    defaultValue={s.name}
                    className={`input w-56 shrink-0 text-xs ${s.enabled ? "" : "text-gray-400 line-through"}`}
                  />
                  <input name="url" defaultValue={s.url} className="input flex-1 min-w-0 text-xs font-mono" />
                  <a href={s.url} target="_blank" className="text-gray-400 hover:underline text-xs shrink-0" title="Open page">
                    ↗
                  </a>
                  <button className="btn-secondary text-xs shrink-0" title="Save name/URL changes">save</button>
                </form>
                <form action={toggleSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-secondary text-xs">{s.enabled ? "disable" : "enable"}</button>
                </form>
                <form action={deleteSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-secondary text-xs text-red-600">remove</button>
                </form>
              </div>
            ))}
          </div>
          <form action={addSource} className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-end">
            <div>
              <label className="label">Name</label>
              <input name="name" required className="input" placeholder="Funder — grants page" />
            </div>
            <div>
              <label className="label">URL</label>
              <input name="url" required type="url" className="input" placeholder="https://…" />
            </div>
            <div>
              <label className="label">Type</label>
              <select name="kind" className="input">
                <option value="state">state</option>
                <option value="foundation">foundation</option>
                <option value="native">native</option>
              </select>
            </div>
            <button className="btn">Add</button>
          </form>
        </div>
      </details>

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
