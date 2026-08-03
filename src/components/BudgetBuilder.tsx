"use client";

import { useMemo, useState } from "react";
import {
  BUDGET_CATEGORIES,
  computeTotals,
  type Budget,
  type BudgetLine,
  type BudgetCategory,
} from "@/lib/budget-core";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

let nextId = 1;
const newId = () => `l${Date.now().toString(36)}${nextId++}`;

export default function BudgetBuilder({
  opportunityId,
  initialBudget,
}: {
  opportunityId: number;
  initialBudget: Budget;
}) {
  const [budget, setBudget] = useState<Budget>(initialBudget);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"" | "suggest" | "narrative">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [narrative, setNarrative] = useState("");

  const totals = useMemo(() => computeTotals(budget), [budget]);

  const update = (mut: (b: Budget) => Budget) => {
    setBudget(mut);
    setDirty(true);
    setMessage("");
  };

  const updateLine = (id: string, patch: Partial<BudgetLine>) =>
    update((b) => ({
      ...b,
      lines: b.lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // When qty and rate are set they define the line's full cost, and the
        // requested column auto-fills as qty × rate − match (still editable).
        if (("qty" in patch || "rate" in patch || "match" in patch) && next.qty > 0 && next.rate > 0) {
          next.requested = Math.max(0, Math.round(next.qty * next.rate) - (next.match || 0));
        }
        return next;
      }),
    }));

  const addLine = (category: BudgetCategory) =>
    update((b) => ({
      ...b,
      lines: [...b.lines, { id: newId(), category, description: "", qty: 0, rate: 0, requested: 0, match: 0, note: "" }],
    }));

  const removeLine = (id: string) => update((b) => ({ ...b, lines: b.lines.filter((l) => l.id !== id) }));

  async function save(syncTotals = false) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, budget, syncTotals }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDirty(false);
      setMessage(
        syncTotals
          ? `Saved — request ${fmt(data.totals.totalRequested)} and match ${fmt(data.totals.totalMatch)} pushed to the opportunity + SF-424 item 18.`
          : "Saved."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runAi(mode: "suggest" | "narrative") {
    setBusy(mode);
    setError("");
    setMessage("");
    try {
      if (dirty) await save(false);
      const res = await fetch("/api/budget/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      if (mode === "suggest") {
        const items = (data.items ?? []) as { category: BudgetCategory; description: string; note: string }[];
        update((b) => ({
          ...b,
          lines: [
            ...b.lines,
            ...items.map((i) => ({
              id: newId(),
              category: i.category,
              description: i.description,
              qty: 0,
              rate: 0,
              requested: 0,
              match: 0,
              note: i.note,
            })),
          ],
        }));
        setMessage(`${items.length} suggested line items added (amounts left at $0 — fill in your real numbers). ${data.summary ?? ""}`);
      } else {
        setNarrative(data.narrative ?? "");
        setMessage("Budget narrative written and saved into the proposal's Budget Narrative section.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setBusy("");
    }
  }

  const numCell = (line: BudgetLine, field: "qty" | "rate" | "requested" | "match", step?: string) => (
    <input
      type="number"
      min={0}
      step={step ?? "1"}
      value={line[field] || ""}
      placeholder="0"
      onChange={(e) => updateLine(line.id, { [field]: Number(e.target.value) || 0 })}
      className="input text-xs text-right font-mono px-1.5 py-1"
    />
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="no-print flex items-center gap-2 flex-wrap">
        <button className="btn" onClick={() => save(false)} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save budget" : "Saved ✓"}
        </button>
        <button
          className="btn-secondary"
          onClick={() => save(true)}
          disabled={saving}
          title="Save, then set the opportunity's request amount and SF-424 item 18 from these totals"
        >
          Save + push totals to SF-424
        </button>
        <span className="mx-1 text-gray-300">|</span>
        <button className="btn-secondary" onClick={() => runAi("suggest")} disabled={busy !== ""}>
          {busy === "suggest" ? "Reading the NOFO…" : "✨ Suggest line items from NOFO"}
        </button>
        <button className="btn-secondary" onClick={() => runAi("narrative")} disabled={busy !== "" || budget.lines.length === 0}>
          {busy === "narrative" ? "Writing…" : "✨ Write budget narrative"}
        </button>
      </div>
      {message && <p className="no-print text-sm text-emerald-700">{message}</p>}
      {error && <p className="no-print text-sm text-red-600">{error}</p>}

      {/* Totals bar */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Direct request</div>
          <div className="text-lg font-bold">{fmt(totals.directRequested)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Indirect ({budget.indirectRatePct}%)
          </div>
          <div className="text-lg font-bold">{fmt(totals.indirect)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Total request</div>
          <div className="text-lg font-bold text-emerald-700">{fmt(totals.totalRequested)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Match / cost share</div>
          <div className="text-lg font-bold">{fmt(totals.totalMatch)}</div>
          <div className="text-[10px] text-gray-400">{totals.matchPct}% of project</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Total project</div>
          <div className="text-lg font-bold">{fmt(totals.grandTotal)}</div>
        </div>
      </div>

      {/* Category tables */}
      {BUDGET_CATEGORIES.map((cat) => {
        const lines = budget.lines.filter((l) => l.category === cat.key);
        const sub = totals.byCategory[cat.key];
        return (
          <div key={cat.key} className="card">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <div>
                <span className="font-semibold text-sm">{cat.label}</span>
                <span className="text-xs text-gray-400 ml-2 hidden md:inline">{cat.hint}</span>
              </div>
              <div className="flex items-center gap-3">
                {(sub.requested > 0 || sub.match > 0) && (
                  <span className="text-xs text-gray-500 font-mono">
                    {fmt(sub.requested)}{sub.match > 0 ? ` + ${fmt(sub.match)} match` : ""}
                  </span>
                )}
                <button className="no-print btn-secondary text-xs" onClick={() => addLine(cat.key)}>
                  + line
                </button>
              </div>
            </div>
            {lines.length > 0 && (
              <div className="px-3 pb-3">
                <div className="grid grid-cols-[1fr_4.5rem_6rem_6rem_6rem_auto] gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold px-1 pb-1">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Requested</span>
                  <span className="text-right">Match</span>
                  <span />
                </div>
                <div className="space-y-1.5">
                  {lines.map((line) => (
                    <div key={line.id}>
                      <div className="grid grid-cols-[1fr_4.5rem_6rem_6rem_6rem_auto] gap-1.5 items-center">
                        <input
                          value={line.description}
                          placeholder={cat.key === "personnel" ? "Title — e.g. Program Director" : "Description"}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          className="input text-xs px-1.5 py-1"
                        />
                        {numCell(line, "qty", "0.05")}
                        {numCell(line, "rate")}
                        {numCell(line, "requested")}
                        {numCell(line, "match")}
                        <button
                          onClick={() => removeLine(line.id)}
                          className="no-print shrink-0 rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-400 hover:text-red-600 hover:border-red-300"
                          title="Remove line"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        value={line.note}
                        placeholder="Justification / where the number comes from"
                        onChange={(e) => updateLine(line.id, { note: e.target.value })}
                        className={`mt-1 w-full rounded border px-1.5 py-0.5 text-[11px] ${line.note.includes("[VERIFY") ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-100 text-gray-500"}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Indirect */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <span className="font-semibold text-sm">Indirect costs</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          rate
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={budget.indirectRatePct || ""}
            placeholder="0"
            onChange={(e) => update((b) => ({ ...b, indirectRatePct: Number(e.target.value) || 0 }))}
            className="input text-xs w-16 text-right font-mono px-1.5 py-1"
          />
          %
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={budget.indirectExcludeEquipment}
            onChange={(e) => update((b) => ({ ...b, indirectExcludeEquipment: e.target.checked }))}
          />
          exclude equipment from the base
        </label>
        <input
          value={budget.indirectNote}
          onChange={(e) => update((b) => ({ ...b, indirectNote: e.target.value }))}
          placeholder="Basis — e.g. 10% de minimis rate (2 CFR 200.414(f)) or negotiated rate agreement"
          className="input text-xs flex-1 min-w-48"
        />
        <span className="text-sm font-mono font-semibold">{fmt(totals.indirect)}</span>
      </div>

      {/* SF-424A style category summary (prints well) */}
      <div className="card p-4">
        <h3 className="font-semibold text-sm mb-2">Category summary (SF-424A Section B object classes)</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1">Object class</th>
              <th className="py-1 text-right">Requested</th>
              <th className="py-1 text-right">Match</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {BUDGET_CATEGORIES.map((cat, i) => {
              const c = totals.byCategory[cat.key];
              if (c.requested === 0 && c.match === 0) return null;
              return (
                <tr key={cat.key} className="border-t border-gray-100">
                  <td className="py-1">{String.fromCharCode(97 + i)}. {cat.label}</td>
                  <td className="py-1 text-right font-mono">{fmt(c.requested)}</td>
                  <td className="py-1 text-right font-mono">{fmt(c.match)}</td>
                  <td className="py-1 text-right font-mono">{fmt(c.requested + c.match)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-200 font-semibold">
              <td className="py-1">i. Total direct charges</td>
              <td className="py-1 text-right font-mono">{fmt(totals.directRequested)}</td>
              <td className="py-1 text-right font-mono">{fmt(totals.directMatch)}</td>
              <td className="py-1 text-right font-mono">{fmt(totals.directRequested + totals.directMatch)}</td>
            </tr>
            <tr>
              <td className="py-1">j. Indirect charges ({budget.indirectRatePct}%)</td>
              <td className="py-1 text-right font-mono">{fmt(totals.indirect)}</td>
              <td className="py-1 text-right font-mono">—</td>
              <td className="py-1 text-right font-mono">{fmt(totals.indirect)}</td>
            </tr>
            <tr className="border-t-2 border-gray-800 font-bold">
              <td className="py-1">k. TOTALS</td>
              <td className="py-1 text-right font-mono">{fmt(totals.totalRequested)}</td>
              <td className="py-1 text-right font-mono">{fmt(totals.totalMatch)}</td>
              <td className="py-1 text-right font-mono">{fmt(totals.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {narrative && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-2">Budget narrative (saved to the proposal)</h3>
          <div className="prose-output text-sm whitespace-pre-wrap">{narrative}</div>
        </div>
      )}
    </div>
  );
}
