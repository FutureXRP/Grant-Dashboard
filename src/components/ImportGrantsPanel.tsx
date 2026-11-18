"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Summary = {
  rows: number;
  fundersCreated: number;
  fundersExisting: number;
  opportunitiesCreated: number;
  skippedNoFit: number;
  skippedNoFunder: number;
};

export default function ImportGrantsPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [addToPipeline, setAddToPipeline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("addStrongToPipeline", addToPipeline ? "on" : "off");
      const res = await fetch("/api/funders/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSummary(data.summary);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-60">
          <h2 className="font-semibold text-sm">Import a grant list (CSV)</h2>
          <p className="text-xs text-gray-500">
            Any researched list with headers — an Instrumentl export, a consultant&apos;s spreadsheet. Funders are
            created with your fit ratings and notes (existing ones are never overwritten); rows rated &quot;not a
            fit&quot; are skipped.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
          <input type="checkbox" checked={addToPipeline} onChange={(e) => setAddToPipeline(e.target.checked)} />
          add strong fits to the pipeline
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <button className="btn shrink-0" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Importing…" : "📥 Import CSV"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && (
        <p className="text-sm text-emerald-700">
          Imported {summary.rows} rows: {summary.fundersCreated} new funders ({summary.fundersExisting} already
          known{summary.opportunitiesCreated > 0 ? `, ${summary.opportunitiesCreated} strong fits added to the pipeline` : ""}
          ); skipped {summary.skippedNoFit} &quot;not a fit&quot; rows
          {summary.skippedNoFunder > 0 ? ` and ${summary.skippedNoFunder} rows without a funder` : ""}.
        </p>
      )}
    </div>
  );
}
