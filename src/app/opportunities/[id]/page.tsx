import Link from "next/link";
import { notFound } from "next/navigation";
import { db, ensureProposalSections } from "@/lib/db";
import { STAGES, QUAL_CRITERIA, qualTotal, fmtMoney, daysUntil, deadlineColor } from "@/lib/stages";
import {
  updateOpportunity, setStage, deleteOpportunity, saveQualScores,
  saveNofoText, toggleTask, addTask,
} from "@/lib/actions";
import AiPanel from "@/components/AiPanel";

export const dynamic = "force-dynamic";

type Opp = {
  id: number; name: string; funder_name: string; type: string; stage: string;
  amount: number; deadline: string; loi_deadline: string; report_due: string;
  renewal: number; url: string; grants_gov_number: string; eligibility_notes: string;
  notes: string; nofo_text: string; qual_scores: string; awarded_amount: number;
};
type Task = { id: number; title: string; due: string; done: number };

export default async function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const d = db();
  const opp = d.prepare(`SELECT * FROM opportunities WHERE id=?`).get(id) as Opp | undefined;
  if (!opp) notFound();
  ensureProposalSections(id);
  const tasks = d.prepare(`SELECT * FROM tasks WHERE opportunity_id=? ORDER BY done, id`).all(id) as Task[];
  const screenRow = d
    .prepare(`SELECT verdict FROM eligibility_screens WHERE opportunity_id=?`)
    .get(id) as { verdict: string } | undefined;
  const screenVerdict: string | null = screenRow?.verdict
    ? (JSON.parse(screenRow.verdict).verdict as string)
    : null;
  const scores: Record<string, number> = JSON.parse(opp.qual_scores || "{}");
  const total = qualTotal(scores);
  const days = daysUntil(opp.deadline);

  const update = updateOpportunity.bind(null, id);
  const remove = deleteOpportunity.bind(null, id);
  const saveScores = saveQualScores.bind(null, id);
  const saveNofo = saveNofoText.bind(null, id);
  const addT = addTask.bind(null, id);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{opp.name}</h1>
          <p className="text-sm text-gray-500">
            {opp.funder_name} · {opp.type}
            {opp.grants_gov_number ? ` · ${opp.grants_gov_number}` : ""}
            {opp.renewal ? " · ♻ renewal" : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/opportunities/${id}/eligibility`} className="btn-secondary">Eligibility screen</Link>
          <Link href={`/opportunities/${id}/proposal`} className="btn">Proposal workspace →</Link>
          <Link href={`/opportunities/${id}/export`} className="btn-secondary">Export / PDF</Link>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">Stage:</span>
        <form className="flex flex-wrap gap-1">
          {STAGES.map((s) => {
            const move = setStage.bind(null, id, s.key);
            return (
              <button
                key={s.key}
                formAction={move}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  opp.stage === s.key
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </form>
        {days !== null && (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${deadlineColor(days)}`}>
            {days < 0 ? `${-days}d overdue` : `due in ${days}d`}
          </span>
        )}
        {screenVerdict && (
          <Link
            href={`/opportunities/${id}/eligibility`}
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              screenVerdict === "eligible"
                ? "bg-green-100 text-green-800"
                : screenVerdict === "not_eligible"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {screenVerdict === "eligible" ? "✅ screened eligible" : screenVerdict === "not_eligible" ? "⛔ screened not eligible" : "⚠️ conditional"}
          </Link>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Details */}
        <form action={update} className="card p-4 space-y-3">
          <h2 className="font-semibold">Details</h2>
          <div>
            <label className="label">Name</label>
            <input name="name" defaultValue={opp.name} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Funder</label>
              <input name="funder_name" defaultValue={opp.funder_name} className="input" />
            </div>
            <div>
              <label className="label">Type</label>
              <select name="type" defaultValue={opp.type} className="input">
                {["federal", "state", "foundation", "corporate", "healthcare", "tribal", "other"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Amount ($)</label>
              <input name="amount" type="number" defaultValue={opp.amount || ""} className="input" />
            </div>
            <div>
              <label className="label">Deadline</label>
              <input name="deadline" type="date" defaultValue={opp.deadline} className="input" />
            </div>
            <div>
              <label className="label">LOI deadline</label>
              <input name="loi_deadline" type="date" defaultValue={opp.loi_deadline} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Report due (post-award)</label>
              <input name="report_due" type="date" defaultValue={opp.report_due} className="input" />
            </div>
            <div>
              <label className="label">Awarded amount ($)</label>
              <input name="awarded_amount" type="number" defaultValue={opp.awarded_amount || ""} className="input" />
            </div>
          </div>
          <div>
            <label className="label">URL</label>
            <input name="url" defaultValue={opp.url} className="input" />
          </div>
          <div>
            <label className="label">Eligibility notes</label>
            <input name="eligibility_notes" defaultValue={opp.eligibility_notes} className="input" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea name="notes" rows={2} defaultValue={opp.notes} className="input" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="renewal" defaultChecked={opp.renewal === 1} /> Renewal
          </label>
          <div className="flex justify-between">
            <button className="btn">Save details</button>
            <button formAction={remove} className="btn-secondary text-red-600">Delete</button>
          </div>
        </form>

        {/* Qualification scorecard */}
        <form action={saveScores} className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Qualification scorecard</h2>
            <span
              className={`rounded px-2 py-0.5 text-sm font-bold ${
                total >= 75 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {total}/100 {total >= 75 ? "— proceed" : "— below the 75 bar"}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Score each 0–10. The playbook&apos;s rule: don&apos;t spend writing hours on anything under 75.
          </p>
          {QUAL_CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center gap-3 text-sm">
              <span className="w-52 shrink-0">{c.label} <span className="text-gray-400">({c.weight}%)</span></span>
              <input
                type="range" min={0} max={10} name={c.key}
                defaultValue={scores[c.key] ?? 0}
                className="flex-1 accent-emerald-700"
              />
              <span className="w-6 text-right text-gray-500">{scores[c.key] ?? 0}</span>
            </div>
          ))}
          <button className="btn">Save scores</button>
        </form>
      </div>

      {/* NOFO + AI */}
      <div className="grid lg:grid-cols-2 gap-5">
        <form action={saveNofo} className="card p-4 space-y-2">
          <h2 className="font-semibold">NOFO / guidelines text</h2>
          <p className="text-xs text-gray-500">
            Paste the funding notice text here — the AI agents read it for the analysis, drafting, red-team, and compliance checks.
          </p>
          <textarea
            name="nofo_text"
            rows={10}
            defaultValue={opp.nofo_text}
            className="input font-mono text-xs"
            placeholder="Paste the NOFO / RFP / guidelines text…"
          />
          <button className="btn">Save NOFO text</button>
        </form>

        <AiPanel
          opportunityId={id}
          actions={[
            { action: "analyze_nofo", label: "Analyze NOFO", hint: "Eligibility, requirements, scoring criteria, probability" },
            { action: "red_team", label: "Red-team review", hint: "Score the draft like a skeptical reviewer" },
            { action: "compliance_check", label: "Compliance check", hint: "Requirements checklist vs. the draft" },
          ]}
        />
      </div>

      {/* Tasks */}
      <div className="card p-4">
        <h2 className="font-semibold mb-2">
          Tasks ({tasks.filter((t) => t.done).length}/{tasks.length})
        </h2>
        <ul className="space-y-1">
          {tasks.map((t) => {
            const toggle = toggleTask.bind(null, t.id, id);
            return (
              <li key={t.id}>
                <form className="flex items-center gap-2 text-sm">
                  <button
                    formAction={toggle}
                    className={`w-4 h-4 rounded border shrink-0 ${t.done ? "bg-emerald-600 border-emerald-600" : "border-gray-300"}`}
                    aria-label="toggle"
                  />
                  <span className={t.done ? "line-through text-gray-400" : ""}>{t.title}</span>
                  {t.due && <span className="text-xs text-gray-400">({t.due})</span>}
                </form>
              </li>
            );
          })}
        </ul>
        <form action={addT} className="flex gap-2 mt-3">
          <input name="title" className="input flex-1" placeholder="Add a task…" />
          <input name="due" type="date" className="input w-40" />
          <button className="btn-secondary">Add</button>
        </form>
      </div>
    </div>
  );
}
